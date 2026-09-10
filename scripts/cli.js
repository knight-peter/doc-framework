#!/usr/bin/env node
/**
 * doc-framework CLI
 * 用法：
 *   doc-framework sync        —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework check       —— 校验文档体系完整性（骨架 + 应用清单 + 占位符残留）
 *   doc-framework diff-check  —— 提交前对账：git 变更 vs 实施计划白名单
 *   doc-framework --help      —— 帮助
 *
 * sync 逻辑（防漂移）：
 *   1. 读版本标记 {目标目录}/.doc-framework.json（含逐文件 sha256）
 *   2. 对比当前包版本：不落后则提示已最新
 *   3. 落后则逐文件对比：
 *      - 目标不存在 → 复制新版本
 *      - 目标 hash == 标记中旧 hash → 未定制 → 覆盖为新版本
 *      - 目标 hash != 标记中旧 hash → 本地定制 → 跳过并提示
 *   4. 更新后重写版本标记（新版本 + 新 hash）
 *
 * check 逻辑（文档根支持中英文模式：doc-framework/ 或 docs-framework/）：
 *   1. 骨架完整性：必需文件/目录是否存在
 *   2. 应用清单校验（档案含「应用清单」时启用；否则回退旧版前后端规范校验）：
 *      每个应用有规范文件、代码根存在、代码根互不嵌套；按应用类型要求类型层规范
 *   3. 占位符残留：扫描文档根下所有 .md，检测未渲染的 {xxx} 占位符
 *   4. 引导残留：接入指南.md / 骨架 README 是否未删除、AGENTS.md 引导段是否未移除
 *   5. 退出码：0=通过，1=发现问题
 *
 * diff-check 逻辑（多应用对账前置到提交前，零 prompt 依赖）：
 *   doc-framework diff-check <计划路径> [--base <ref>] [--staged] [--strict]
 *   1. 解析计划：状态（须 已批准/实施中）、逐应用表态、变更文件清单
 *   2. 读档案应用清单（应用 → 代码根），git 变更文件（含未跟踪）逐个归属：
 *      - 落在表态「本次不改/不适用」应用的代码根下 → 错误
 *      - 落在表态「改动」应用下但不在文件清单内 → 警告（--strict 时报错）
 *      - 应用代码根为 ./ 时退化为纯文件级清单（清单外即错误）
 *   3. 退出码：0=通过，1=有越界
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const install = require('./install');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readMarker(targetDir) {
  const p = path.join(targetDir, install.MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function sync() {
  const dirs = install.resolveTargetDirs();
  const src = path.join(install.PKG_ROOT, 'skills');
  let changed = false;

  for (const dir of dirs) {
    const targetDir = path.join(install.PROJECT_ROOT, dir);
    if (!fs.existsSync(targetDir)) {
      console.warn(`[doc-framework] 目标目录不存在，请重新安装：${targetDir}`);
      continue;
    }
    const marker = readMarker(targetDir);
    if (marker && marker.version === `v${install.VERSION}`) {
      console.log(`[doc-framework] ${dir} 已是最新版本 v${install.VERSION}，无需同步`);
      continue;
    }

    console.log(`[doc-framework] ${dir} 版本 ${marker ? marker.version : '未知'} → v${install.VERSION}，开始同步`);
    const oldHashes = {};
    if (marker && Array.isArray(marker.files)) {
      for (const f of marker.files) oldHashes[f.file] = f.hash;
    }

    const newFiles = [];
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(targetDir, name);
      // 逐文件记录（skill 是目录：递归到每个文件，相对路径如 module-code/SKILL.md）
      const srcFiles = install.walkFiles(from, from)
        .map(f => ({ file: path.join(name, f.file), hash: f.hash }));

      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        changed = true;
      } else {
        // 全部源文件在标记中都有旧 hash 且目标内容与旧 hash 一致 → 未定制 → 覆盖
        const untouched = srcFiles.every(f => oldHashes[f.file] !== undefined
          && fs.existsSync(path.join(targetDir, f.file))
          && hashFile(path.join(targetDir, f.file)) === oldHashes[f.file]);
        if (untouched) {
          fs.rmSync(to, { recursive: true, force: true });
          fs.cpSync(from, to, { recursive: true });
          console.log(`  ~ 更新：${name}`);
          changed = true;
        } else {
          console.warn(`  ! 跳过（本地已定制）：${name}`);
        }
      }
      // 标记统一记录【源文件】hash（官方版本），供下次对比判断是否被本地定制
      newFiles.push(...srcFiles);
    }

    const newMarker = {
      source: `git+https://github.com/knight-peter/doc-framework.git`,
      version: `v${install.VERSION}`,
      installedAt: new Date().toISOString().slice(0, 10),
      files: newFiles,
    };
    fs.writeFileSync(path.join(targetDir, install.MARKER_FILE), JSON.stringify(newMarker, null, 2), 'utf-8');
  }

  if (!changed) console.log('[doc-framework] 同步完成（无变更）');
  console.log('[doc-framework] 已初始化项目不会复活接入引导（见 install.js 已初始化检测）');
}

// ── 文档根与应用清单解析（check 与 diff-check 共用）────────────

function resolveDocRoot(root) {
  const cnRoot = path.join(root, 'doc-framework');
  const enRoot = path.join(root, 'docs-framework');
  const docRoot = fs.existsSync(cnRoot) ? cnRoot : enRoot;
  return { docRoot, docLabel: docRoot === enRoot ? 'docs-framework' : 'doc-framework' };
}

/** 提取 markdown 中标题含 keyword 的章节正文（到下一个 ## 或文末） */
function mdSection(content, keyword) {
  const re = new RegExp(`^##[^\\n]*${keyword}[^\\n]*\\n`, 'm');
  const m = content.match(re);
  if (!m) return null;
  const rest = content.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** 解析档案「应用清单」表 → [{id, type, root, spec}]；无此节或无有效行返回 null（旧版档案回退） */
function parseAppRegistry(docRoot) {
  const profilePath = ['项目档案.md', 'profile.md']
    .map(f => path.join(docRoot, f)).find(p => fs.existsSync(p));
  if (!profilePath) return null;
  const content = fs.readFileSync(profilePath, 'utf-8');
  const sec = mdSection(content, '应用清单');
  if (!sec) return null;
  const lines = sec.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null; // 表头 + 分隔 + 至少一行
  const header = lines[0].split('|').map(c => c.trim());
  const col = (...names) => header.findIndex(h => names.some(n => h.includes(n)));
  const iId = col('应用标识', '应用');
  const iType = col('类型');
  const iRoot = col('代码根');
  const iSpec = col('规范文件');
  if (iId < 0 || iRoot < 0) return null;
  const strip = s => s.replace(/`/g, '').trim();
  const apps = [];
  for (const l of lines.slice(2)) {
    const cells = l.split('|').map(c => strip(c));
    const id = cells[iId];
    if (!id || id.includes('{')) continue; // 跳过未渲染占位行
    apps.push({
      id,
      type: iType >= 0 ? cells[iType] : '',
      root: (cells[iRoot] || '').replace(/\/+$/, '') || '.',
      spec: iSpec >= 0 ? cells[iSpec] : '',
    });
  }
  return apps.length ? apps : null;
}

/** 按最长前缀优先把文件归属到应用（root 为 '.' 时匹配一切） */
function matchApp(apps, file) {
  let best = null;
  for (const app of apps) {
    const hit = app.root === '.' || file === app.root || file.startsWith(app.root + '/');
    if (hit && (!best || app.root.length > best.root.length)) best = app;
  }
  return best;
}

// ── check ────────────────────────────────────────────────────

function check() {
  const root = install.PROJECT_ROOT;
  const { docRoot, docLabel } = resolveDocRoot(root);
  const issues = [];

  // 1. 骨架完整性
  const requiredFiles = ['项目档案.md', '总契约.md', '测试规范.md', '接口规范.md'];
  const requiredDirs = ['模块', '边界', '规范', '计划'];

  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少文件：${docLabel}/${f}`);
  }
  for (const d of requiredDirs) {
    if (!fs.existsSync(path.join(docRoot, d))) issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
  }

  // 2. 规范完整性：档案含「应用清单」→ 按清单逐应用校验；否则回退旧版固定两份
  const registry = fs.existsSync(docRoot) ? parseAppRegistry(docRoot) : null;
  if (registry) {
    const needTypeFront = registry.some(a => a.type.includes('前端'));
    const needTypeBack = registry.some(a => a.type.includes('后端') || a.type.includes('聚合'));
    if (needTypeFront && !fs.existsSync(path.join(docRoot, '规范/类型-前端.md'))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/规范/类型-前端.md（存在前端端应用，应从官方模板渲染）`);
    }
    if (needTypeBack && !fs.existsSync(path.join(docRoot, '规范/类型-后端.md'))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/规范/类型-后端.md（存在服务端应用，应从官方模板渲染）`);
    }
    for (const app of registry) {
      if (app.spec && !fs.existsSync(path.join(docRoot, app.spec))) {
        issues.push(`❌ 应用「${app.id}」缺少规范文件：${docLabel}/${app.spec}`);
      }
      if (app.root !== '.' && !fs.existsSync(path.join(root, app.root))) {
        issues.push(`❌ 应用「${app.id}」代码根不存在：${app.root}（按现状登记任意路径，但必须是会话内可见路径）`);
      }
      for (const other of registry) {
        if (other !== app && other.root !== '.' && app.root !== '.'
          && (app.root.startsWith(other.root + '/') )) {
          issues.push(`❌ 应用代码根互相嵌套：「${app.id}」${app.root} 在「${other.id}」${other.root} 之内（最长前缀优先解析，建议拆平）`);
        }
      }
    }
  } else {
    const requiredStdFiles = ['规范/前端开发规范.md', '规范/后端开发规范.md'];
    for (const f of requiredStdFiles) {
      if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少规范文档：${docLabel}/${f}（应从官方模板渲染，见《接入指南.md》「模板来源」）`);
    }
  }

  // 3. 占位符残留（扫描文档根下所有 .md）
  // 过滤策略：剥离代码围栏与行内代码后，只报告"含中文"的 {占位符}
  if (fs.existsSync(docRoot)) {
    const mdFiles = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.md')) mdFiles.push(p);
      }
    })(docRoot);
    for (const f of mdFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      const noFence = content.replace(/```[\s\S]*?```/g, '');
      const noInline = noFence.replace(/`[^`\n]*`/g, '');
      const placeholders = noInline.match(/\{[^{}\n]+\}/g);
      if (placeholders) {
        const unique = [...new Set(placeholders)].filter(p => /[一-龥]/.test(p));
        if (unique.length) {
          issues.push(`⚠️ 占位符未渲染：${path.relative(root, f)} → ${unique.join(' ')}`);
        }
      }
    }
  }

  // 4. 引导残留
  if (fs.existsSync(path.join(root, '接入指南.md'))) {
    issues.push(`⚠️ 未清理：项目根/接入指南.md（初始化完成后应删除）`);
  }
  const skeletonReadme = path.join(docRoot, 'README.md');
  if (fs.existsSync(skeletonReadme) && fs.readFileSync(skeletonReadme, 'utf-8').includes('待初始化')) {
    issues.push(`⚠️ 未清理：${docLabel}/README.md（安装预置的骨架引导文件，初始化完成后应删除）`);
  }
  const agentsPath = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    if (content.includes('接入引导段') && content.includes('移除')) {
      issues.push(`⚠️ 未清理：AGENTS.md 仍包含接入引导段（初始化完成后应移除）`);
    }
  }

  if (issues.length === 0) {
    console.log('✅ doc-framework check 通过：骨架完整，应用清单健康，无占位符残留，引导已清理');
    return 0;
  }
  console.log('❌ doc-framework check 发现问题：');
  issues.forEach(i => console.log(`  ${i}`));
  return 1;
}

// ── diff-check ───────────────────────────────────────────────

function gitChangedFiles(base, staged) {
  // core.quotepath=false：中文路径不转义，保证 doc-framework/ 等前缀排除生效
  const run = args => execSync(`git -c core.quotepath=false ${args}`, { encoding: 'utf-8' }).split('\n').map(s => s.trim()).filter(Boolean);
  let files;
  if (staged) files = run('diff --cached --name-only');
  else if (base) files = run(`diff --name-only ${base}`);
  else files = run('diff --name-only HEAD');
  // 未跟踪的新文件同样是越界风险，并入
  const untracked = run('ls-files --others --exclude-standard');
  return [...new Set([...files, ...untracked])];
}

/** 解析实施计划：状态 / 逐应用表态 / 变更文件清单 */
function parsePlan(planPath) {
  const content = fs.readFileSync(planPath, 'utf-8');
  const stateM = content.match(/状态[：:]\s*(待审核|修订中|已批准|实施中|已完成|已废弃)/);
  const state = stateM ? stateM[1] : null;

  // 表态表：## …逐应用表态… 节内的表格行 | 应用 | 表态 | … |
  const stance = {};
  const stanceSec = mdSection(content, '逐应用表态');
  if (stanceSec) {
    for (const l of stanceSec.split('\n')) {
      if (!l.trim().startsWith('|')) continue;
      const cells = l.split('|').map(c => c.replace(/`/g, '').trim());
      if (cells.length < 3 || cells[1].includes('应用') || cells[1].includes('---') || cells[1].includes('{')) continue;
      const v = cells[2] || '';
      stance[cells[1]] = v.includes('不改') ? 'skip' : v.includes('不适用') ? 'skip' : v.includes('改动') ? 'change' : 'unknown';
    }
  }

  // 文件清单：## …变更文件清单… 节内表格单元格与反引号中包含 '/' 的 token
  const fileList = new Set();
  const listSec = mdSection(content, '变更文件清单');
  if (listSec) {
    for (const l of listSec.split('\n')) {
      if (l.trim().startsWith('|') && (l.includes('---') || l.includes('文件'))) continue;
      const tokens = l.match(/`[^`\n]+`|[^\s|`，。；]+/g) || [];
      for (const t of tokens) {
        const clean = t.replace(/`/g, '').trim();
        if (clean.includes('/') && !clean.includes('{') && !/^https?:/.test(clean) && !/^(YYYY|placeholder)/i.test(clean)) {
          fileList.add(clean.replace(/\/+$/, ''));
        }
      }
    }
  }
  return { state, stance, fileList };
}

function inFileList(fileList, file) {
  for (const f of fileList) {
    if (file === f || file.startsWith(f + '/')) return true;
  }
  return false;
}

function diffCheck(argv) {
  const root = install.PROJECT_ROOT;
  const planArg = argv.find(a => !a.startsWith('--'));
  if (!planArg) {
    console.log('用法：doc-framework diff-check <计划路径> [--base <ref>] [--staged] [--strict]');
    return 1;
  }
  const planPath = path.isAbsolute(planArg) ? planArg : path.join(root, planArg);
  if (!fs.existsSync(planPath)) {
    console.log(`❌ 计划文件不存在：${planArg}`);
    return 1;
  }
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : null;
  const staged = argv.includes('--staged');
  const strict = argv.includes('--strict');

  const { docRoot, docLabel } = resolveDocRoot(root);
  const registry = parseAppRegistry(docRoot);
  if (!registry) {
    console.log(`❌ 档案缺少「应用清单」（${docLabel}/项目档案.md），diff-check 需要应用清单提供代码根`);
    return 1;
  }

  const plan = parsePlan(planPath);
  const errors = [];
  const warnings = [];

  // 1. 计划状态
  if (!plan.state) {
    warnings.push(`⚠️ 计划未解析到状态字段：${planArg}`);
  } else if (plan.state !== '已批准' && plan.state !== '实施中') {
    errors.push(`❌ 计划状态为「${plan.state}」，不是可执行状态（已批准/实施中）：${planArg}`);
  }

  // 2. 表态中的应用必须已登记
  for (const appId of Object.keys(plan.stance)) {
    if (!registry.some(a => a.id === appId)) {
      errors.push(`❌ 计划表态了未登记应用「${appId}」（先回填档案应用清单）`);
    }
  }

  // 3. 变更文件逐个归属对账
  let changed;
  try {
    changed = gitChangedFiles(base, staged);
  } catch (e) {
    console.log(`❌ 读取 git 变更失败：${e.message}`);
    return 1;
  }
  const docPrefix = docLabel + '/';
  for (const file of changed) {
    if (file.startsWith(docPrefix) || file === 'AGENTS.md') continue; // 文档回写不受白名单约束
    const owner = matchApp(registry, file);
    if (!owner) {
      warnings.push(`⚠️ 不在任何已登记应用代码根下：${file}`);
      continue;
    }
    const stance = plan.stance[owner.id];
    if (stance === 'skip') {
      errors.push(`❌ 越界：${file} 属于表态「本次不改/不适用」的应用「${owner.id}」`);
      continue;
    }
    if (stance === undefined) {
      warnings.push(`⚠️ 应用「${owner.id}」未在计划中表态，变更文件：${file}（漏表态 = 漏改红线）`);
      continue;
    }
    // 表态=改动：代码根为 ./ 时退化为纯文件级清单；否则清单外仅警告
    if (!inFileList(plan.fileList, file)) {
      if (owner.root === '.') {
        errors.push(`❌ 越界：${file} 不在计划变更文件清单内（应用「${owner.id}」代码根为 ./，白名单已退化为文件级）`);
      } else {
        warnings.push(`⚠️ 清单外文件：${file}（应用「${owner.id}」表态=改动，但该文件未列入计划变更文件清单，建议回 /module-plan 补登记）`);
      }
    }
  }

  // 4. 输出
  const scope = staged ? 'staged' : base ? `vs ${base}` : 'vs HEAD（含未跟踪）';
  console.log(`[diff-check] 计划：${path.relative(root, planPath)}（状态=${plan.state || '未知'}）｜范围：${scope}｜变更文件 ${changed.length} 个`);
  for (const e of errors) console.log(`  ${e}`);
  for (const w of warnings) console.log(`  ${w}`);
  if (errors.length || (strict && warnings.length)) {
    console.log(`❌ diff-check 未通过：${errors.length} 个越界，${warnings.length} 个警告${strict ? '（--strict 警告即失败）' : ''}`);
    return 1;
  }
  console.log(`✅ diff-check 通过：${errors.length} 个越界，${warnings.length} 个警告`);
  return 0;
}

function help() {
  console.log(`doc-framework v${install.VERSION}
用法：
  doc-framework sync                          同步 skill 到最新（本地定制自动跳过）
  doc-framework check                         校验文档体系完整性（骨架 + 应用清单 + 占位符残留 + 引导清理）
  doc-framework diff-check <计划路径> [选项]   提交前对账：git 变更 vs 计划白名单
      --base <ref>   与指定 ref 比较（默认 HEAD，含未跟踪文件）
      --staged       只检查已暂存文件（pre-commit 场景）
      --strict       警告也算失败
  doc-framework --help                        显示帮助`);
}

const arg = process.argv[2];
if (arg === 'sync') sync();
else if (arg === 'check') process.exit(check());
else if (arg === 'diff-check') process.exit(diffCheck(process.argv.slice(3)));
else help();
