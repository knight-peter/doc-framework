#!/usr/bin/env node
/**
 * doc-framework CLI
 * 用法：
 *   doc-framework sync                    —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework check                   —— 校验文档体系完整性（骨架 + 应用清单 + 计划体检 + 占位符残留）
 *   doc-framework diff-check <计划路径>    —— 提交前对账：git 变更 vs 计划白名单
 *   doc-framework list                    —— 列出在途计划（状态/涉及应用/任务进度）
 *   doc-framework show <计划路径>          —— 查看单个计划的结构化视图
 *   doc-framework --help                  —— 帮助
 *
 * 设计纪律：
 *   1. 除 sync 外所有命令**只读**，可安全用于 CI / pre-commit；
 *   2. 解析器降级不崩溃（计划模板可能被本地定制）：缺章节 → 缺省/提示，不抛异常；
 *   3. 路径一律从档案「应用清单」派生，禁止写死目录名；
 *   4. 归档计划（计划/archive/）不参与 glob 清单，需路径直达；
 *   5. `--json` 是机器消费接口，当前标记 experimental（格式可能变动）。
 *
 * check 逻辑（文档根支持中英文模式：doc-framework/ 或 docs-framework/）：
 *   1. 骨架完整性：必需文件/目录是否存在
 *   2. 应用清单校验（档案含「应用清单」时启用；否则回退旧版前后端规范校验）
 *   3. 计划体检：表态应用已登记、清单路径落在对应应用代码根下、状态与任务进度一致
 *   4. 占位符残留 / 引导残留
 *   5. 退出码：0=通过，1=有硬问题（提示项不影响退出码）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const install = require('./install');
const plan = require('./lib/plan');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readMarker(targetDir) {
  const p = path.join(targetDir, install.MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// ── sync ─────────────────────────────────────────────────────

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
    // 标记缺少逐文件 hash（旧版 install.sh 写的 marker，或无 marker）→ 无法判定本地定制，
    // 按"未定制"覆盖并明确告警（否则会把所有官方 skill 误判为已定制而全部跳过，升级静默失效）。
    const canDetectCustomization = Object.keys(oldHashes).length > 0;
    if (!canDetectCustomization) {
      console.warn(marker
        ? `  ! 版本标记缺少逐文件 hash（旧版安装脚本），本次按未定制处理并覆盖`
        : `  ! 未找到版本标记，本次按未定制处理并覆盖`);
    }

    const newFiles = [];
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(targetDir, name);
      const srcFiles = install.walkFiles(from, from)
        .map(f => ({ file: path.join(name, f.file), hash: f.hash }));

      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        changed = true;
      } else {
        const untouched = !canDetectCustomization || srcFiles.every(f => oldHashes[f.file] !== undefined
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

// ── check ────────────────────────────────────────────────────

function check() {
  const root = install.PROJECT_ROOT;
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  const issues = [];   // 硬问题：退出码 1
  const notes = [];    // 提示项：不影响退出码

  // 0. 前置：当前目录是否已接入（框架仓库自身或未初始化项目给清晰提示，而不是一串缺文件）
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根（doc-framework/ 或 docs-framework/）。');
    console.log('   请在已接入 doc-framework 的项目根目录运行，或先对 AI 说"初始化项目"。');
    return 1;
  }

  // 1. 骨架完整性（中/英模式按文档语言映射文件名，见 README「文档语言与命名」）
  const IS_EN = docLabel === 'docs-framework';
  const N = IS_EN
    ? { profile: 'profile.md', contract: 'contract.md', testSpec: 'testing-guide.md', apiSpec: 'api-guide.md', dirs: ['modules', 'boundaries', 'standards', 'plans'] }
    : { profile: '项目档案.md', contract: '总契约.md', testSpec: '测试规范.md', apiSpec: '接口规范.md', dirs: ['模块', '边界', '规范', '计划'] };
  const requiredFiles = [N.profile, N.contract, N.testSpec, N.apiSpec];
  const requiredDirs = N.dirs;

  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少文件：${docLabel}/${f}`);
  }
  for (const d of requiredDirs) {
    if (!fs.existsSync(path.join(docRoot, d))) issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
  }

  // 2. 规范完整性：档案含「应用清单」→ 按清单逐应用校验；否则回退旧版固定两份
  const registry = fs.existsSync(docRoot) ? plan.parseAppRegistry(docRoot) : null;
  if (registry) {
    if (!IS_EN) {
      const needTypeFront = registry.some(a => a.type.includes('前端'));
      const needTypeBack = registry.some(a => a.type.includes('后端') || a.type.includes('聚合'));
      if (needTypeFront && !fs.existsSync(path.join(docRoot, '规范/类型-前端.md'))) {
        issues.push(`❌ 缺少规范文档：${docLabel}/规范/类型-前端.md（存在前端端应用，应从官方模板渲染）`);
      }
      if (needTypeBack && !fs.existsSync(path.join(docRoot, '规范/类型-后端.md'))) {
        issues.push(`❌ 缺少规范文档：${docLabel}/规范/类型-后端.md（存在服务端应用，应从官方模板渲染）`);
      }
    } else {
      notes.push('ℹ️ 英文模式：类型层规范命名未标准化，仅按应用清单登记的「规范文件」逐应用校验');
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
          && app.root.startsWith(other.root + '/')) {
          issues.push(`❌ 应用代码根互相嵌套：「${app.id}」${app.root} 在「${other.id}」${other.root} 之内（最长前缀优先解析，建议拆平）`);
        }
      }
    }
  } else {
    const requiredStdFiles = IS_EN
      ? ['standards/frontend.md', 'standards/backend.md']
      : ['规范/前端开发规范.md', '规范/后端开发规范.md'];
    for (const f of requiredStdFiles) {
      if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少规范文档：${docLabel}/${f}（应从官方模板渲染，见《接入指南》「模板来源」）`);
    }
  }

  // 3. 计划体检（在途计划；归档计划不参与）
  if (fs.existsSync(docRoot)) {
    const planPaths = plan.collectPlanPaths(docRoot);
    const plans = [];
    for (const pp of planPaths) {
      try {
        plans.push(plan.parsePlan(root, pp));
      } catch (e) {
        // 解析失败不崩溃，但必须显式报出（否则坏计划会被静默忽略）
        issues.push(`❌ 计划无法解析：${path.relative(root, pp)}（${e.message}）`);
      }
    }
    if (plans.length && !registry) {
      notes.push(`ℹ️ 档案无「应用清单」，计划体检跳过应用归属校验（${plans.length} 份在途计划）`);
    }
    const docExempt = (file) => file.startsWith(docLabel + '/') || file === 'AGENTS.md';
    for (const p of plans) {
      if (p.state === '已废弃') continue; // 终态：不再体检
      if (!p.state) {
        issues.push(`❌ 计划缺状态字段：${p.rel}`);
        continue;
      }

      if (registry) {
        const stanceApps = Object.keys(p.stances);
        if (!stanceApps.length) {
          notes.push(`ℹ️ 计划无「逐应用表态」表（v2.0 前的旧格式）：${p.rel}`);
        }
        for (const appId of stanceApps) {
          if (!registry.some(a => a.id === appId)) {
            issues.push(`❌ 计划表态了未登记应用「${appId}」：${p.rel}（先回填档案应用清单）`);
          }
        }
        for (const file of p.fileList) {
          if (docExempt(file)) continue; // 文档/说明性路径不参与代码归属校验
          const owner = plan.matchApp(registry, file);
          if (!owner) {
            // 集中式 SQL 目录（不属于任何应用）是常见合法布局：提示而非硬报错
            if (/\.sql$/i.test(file) || file.includes('/sql/change/')) {
              notes.push(`ℹ️ SQL 文件未归属任何已登记应用（集中式 SQL 目录？）：${file}（${p.rel}）`);
            } else {
              issues.push(`❌ 清单文件不在任何已登记应用代码根下：${file}（${p.rel}）`);
            }
            continue;
          }
          const st = p.stances[owner.id];
          if (st === 'skip') {
            issues.push(`❌ 清单文件落在表态「本次不改」的应用「${owner.id}」下：${file}（${p.rel}）`);
          } else if (st !== 'change') {
            notes.push(`ℹ️ 清单文件所属应用「${owner.id}」未在计划中表态：${file}（${p.rel}）`);
          }
        }
      }

      if (p.tasks.total > 0) {
        if (p.state === '已完成' && p.tasks.open.length) {
          issues.push(`❌ 计划状态「已完成」但存在未勾选任务 ${p.tasks.open.join(', ')}：${p.rel}`);
        }
        if (p.state === '实施中' && p.tasks.done === p.tasks.total) {
          notes.push(`ℹ️ 任务已全部勾选但状态仍是「实施中」，可登记「已完成」：${p.rel}`);
        }
      }
      if (p.state === '已完成' && p.writeback.total > 0 && p.writeback.done < p.writeback.total) {
        notes.push(`ℹ️ 计划「已完成」但回写清单未勾完（${p.writeback.done}/${p.writeback.total}）：${p.rel}`);
      }
    }
  }

  // 4. 占位符残留（扫描文档根下所有 .md；剥离代码围栏与行内代码后只报含中文者）
  //    豁免：探索/（探索记录是单次决策记录，允许保留 {待验证} 之类的开放标记，不参与硬校验）
  if (fs.existsSync(docRoot)) {
    const mdFiles = [];
    const exploreDir = path.join(docRoot, '探索');
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) {
          if (p === exploreDir) continue;
          walk(p);
        } else if (name.endsWith('.md')) mdFiles.push(p);
      }
    })(docRoot);
    for (const f of mdFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      const noFence = content.replace(/```[\s\S]*?```/g, '');
      const noInline = noFence.replace(/`[^`\n]*`/g, '');
      const placeholders = noInline.match(/\{[^{}\n]+\}/g);
      if (placeholders) {
        const unique = [...new Set(placeholders)].filter(x => /[一-龥]/.test(x));
        if (unique.length) {
          issues.push(`⚠️ 占位符未渲染：${path.relative(root, f)} → ${unique.join(' ')}`);
        }
      }
    }
  }

  // 5. 引导残留
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

  if (notes.length) {
    console.log('ℹ️ 提示项（不影响退出码）：');
    notes.forEach(n => console.log(`  ${n}`));
  }
  if (issues.length === 0) {
    console.log(notes.length
      ? '✅ doc-framework check 通过（有提示项，见上）'
      : '✅ doc-framework check 通过：骨架完整，应用清单健康，计划体检通过，无占位符残留，引导已清理');
    return 0;
  }
  console.log('❌ doc-framework check 发现问题：');
  issues.forEach(i => console.log(`  ${i}`));
  return 1;
}

// ── 参数解析（统一：命名选项可任意顺序，值不会挤占位置参数）────

/** 解析 argv → {flags, positionals, missingValue}；valueFlags 为需要取值的选项名 */
function parseArgs(argv, valueFlags = []) {
  const flags = {};
  const positionals = [];
  const missingValue = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (valueFlags.includes(a)) {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) { flags[a] = null; missingValue.push(a); }
        else { flags[a] = v; i++; }
      } else {
        flags[a] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals, missingValue };
}

// ── diff-check ───────────────────────────────────────────────

function gitChangedFiles(base, staged) {
  // core.quotepath=false：中文路径不转义，保证 doc-framework/ 等前缀排除生效
  const run = args => execSync(`git -c core.quotepath=false ${args}`, { encoding: 'utf-8' }).split('\n').map(s => s.trim()).filter(Boolean);
  let files;
  if (staged) files = run('diff --cached --name-only');
  else if (base) files = run(`diff --name-only ${base}`);
  else files = run('diff --name-only HEAD');
  const untracked = run('ls-files --others --exclude-standard');
  return [...new Set([...files, ...untracked])];
}

function diffCheck(argv) {
  const root = install.PROJECT_ROOT;
  const { flags, positionals, missingValue } = parseArgs(argv, ['--base']);
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework diff-check <计划路径> [--base <ref>] [--staged] [--strict]）`);
    return 1;
  }
  const planArg = positionals[0];
  if (!planArg) {
    console.log('用法：doc-framework diff-check <计划路径> [--base <ref>] [--staged] [--strict]');
    return 1;
  }
  const planPath = path.isAbsolute(planArg) ? planArg : path.join(root, planArg);
  if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
    console.log(`❌ 计划文件不存在或不是文件：${planArg}`);
    return 1;
  }
  const base = flags['--base'] || null;
  const staged = !!flags['--staged'];
  const strict = !!flags['--strict'];

  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  const registry = plan.parseAppRegistry(docRoot);
  if (!registry) {
    console.log(`❌ 档案缺少「应用清单」（${docLabel}/项目档案.md），diff-check 需要应用清单提供代码根`);
    return 1;
  }

  const p = plan.parsePlan(root, planPath);
  const errors = [];
  const warnings = [];

  if (!p.state) {
    warnings.push(`⚠️ 计划未解析到状态字段：${planArg}`);
  } else if (p.state !== '已批准' && p.state !== '实施中') {
    errors.push(`❌ 计划状态为「${p.state}」，不是可执行状态（已批准/实施中）：${planArg}`);
  }

  for (const appId of Object.keys(p.stances)) {
    if (!registry.some(a => a.id === appId)) {
      errors.push(`❌ 计划表态了未登记应用「${appId}」（先回填档案应用清单）`);
    }
  }

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
    const owner = plan.matchApp(registry, file);
    if (!owner) {
      warnings.push(`⚠️ 不在任何已登记应用代码根下：${file}`);
      continue;
    }
    const st = p.stances[owner.id];
    if (st === 'skip') {
      errors.push(`❌ 越界：${file} 属于表态「本次不改/不适用」的应用「${owner.id}」`);
      continue;
    }
    if (st === undefined) {
      warnings.push(`⚠️ 应用「${owner.id}」未在计划中表态，变更文件：${file}（漏表态 = 漏改红线）`);
      continue;
    }
    if (!plan.inFileList(p.fileList, file)) {
      if (owner.root === '.') {
        errors.push(`❌ 越界：${file} 不在计划变更文件清单内（应用「${owner.id}」代码根为 ./，白名单已退化为文件级）`);
      } else {
        warnings.push(`⚠️ 清单外文件：${file}（应用「${owner.id}」表态=改动，但该文件未列入计划变更文件清单，建议回 /module-plan 补登记）`);
      }
    }
  }

  const scope = staged ? 'staged' : base ? `vs ${base}` : 'vs HEAD（含未跟踪）';
  console.log(`[diff-check] 计划：${p.rel}（状态=${p.state || '未知'}）｜范围：${scope}｜变更文件 ${changed.length} 个`);
  for (const e of errors) console.log(`  ${e}`);
  for (const w of warnings) console.log(`  ${w}`);
  if (errors.length || (strict && warnings.length)) {
    console.log(`❌ diff-check 未通过：${errors.length} 个越界，${warnings.length} 个警告${strict ? '（--strict 警告即失败）' : ''}`);
    return 1;
  }
  console.log(`✅ diff-check 通过：${errors.length} 个越界，${warnings.length} 个警告`);
  return 0;
}

// ── list / show（只读查询；--json 标记 experimental）─────────

// 中文按 2 列宽估算（表格对齐）
function strWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}
function pad(s, width) {
  return String(s) + ' '.repeat(Math.max(0, width - strWidth(s)));
}

function list(argv) {
  const root = install.PROJECT_ROOT;
  const { docRoot } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根（doc-framework/ 或 docs-framework/）');
    return 1;
  }
  const { flags, missingValue } = parseArgs(argv, ['--module', '--app', '--state']);
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}`);
    return 1;
  }
  const moduleFilter = flags['--module'] || null;
  const appFilter = flags['--app'] || null;
  const stateFilter = flags['--state'] || null;
  const json = !!flags['--json'];
  const all = !!flags['--all'];

  const VALID_STATES = ['待审核', '修订中', '已批准', '实施中', '已完成', '已废弃'];
  if (stateFilter && !VALID_STATES.includes(stateFilter)) {
    console.log(`❌ 未识别的状态「${stateFilter}」；可用：${VALID_STATES.join(' / ')}`);
    return 1;
  }

  let plans = plan.listPlans(root, docRoot);
  if (!all) plans = plans.filter(p => p.state !== '已完成' && p.state !== '已废弃');
  if (moduleFilter) plans = plans.filter(p => p.module === moduleFilter);
  if (stateFilter) plans = plans.filter(p => p.state === stateFilter);
  if (appFilter) plans = plans.filter(p => p.stances[appFilter] === 'change');

  const rows = plans.map(p => ({
    module: p.module,
    subject: p.subject,
    state: p.state || '未知',
    apps: Object.entries(p.stances).filter(([, v]) => v === 'change').map(([k]) => k),
    tasks: { done: p.tasks.done, total: p.tasks.total },
    path: p.rel,
  }));

  if (json) {
    console.log(JSON.stringify({ experimental: true, count: rows.length, plans: rows }, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log('没有匹配的在途计划。');
    console.log('提示：`doc-framework list --all` 可包含已完成/已废弃（归档计划需路径直达）。');
    return 0;
  }
  const head = ['模块', '计划（日期-主题）', '状态', '涉及应用（表态=改动）', '任务'];
  const data = rows.map(r => [r.module, r.subject, r.state, r.apps.join(', ') || '—', r.tasks.total ? `${r.tasks.done}/${r.tasks.total}` : '—']);
  const widths = head.map((h, i) => Math.max(strWidth(h), ...data.map(r => strWidth(r[i]))));
  const line = cells => cells.map((c, i) => pad(c, widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const r of data) console.log(line(r));
  console.log(all ? `\n共 ${rows.length} 份计划（含已完成/已废弃）。` : `\n共 ${rows.length} 份在途计划。`);
  const next = rows.find(r => r.state !== '已完成' && r.state !== '已废弃') || rows[0];
  console.log(`Next: doc-framework show ${next.path}`);
  return 0;
}

function show(argv) {
  const root = install.PROJECT_ROOT;
  const { flags, positionals } = parseArgs(argv, []);
  const arg = positionals[0];
  if (!arg) {
    console.log('用法：doc-framework show <计划路径> [--json]');
    return 1;
  }
  const planPath = path.isAbsolute(arg) ? arg : path.join(root, arg);
  if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
    console.log(`❌ 计划文件不存在或不是文件：${arg}`);
    return 1;
  }
  const p = plan.parsePlan(root, planPath);
  const { docRoot } = plan.resolveDocRoot(root);
  const registry = plan.parseAppRegistry(docRoot);

  const stances = Object.entries(p.stances).map(([appId, st]) => {
    const reg = registry ? registry.find(a => a.id === appId) : null;
    return {
      app: appId,
      stance: st === 'change' ? '改动' : st === 'skip' ? '本次不改/不适用' : '未识别',
      root: reg ? reg.root : null,
      registered: !!reg,
    };
  });
  const whitelist = stances
    .filter(s => s.stance === '改动' && s.root)
    .map(s => (s.root === '.' ? './（退化为文件级清单）' : s.root + '/**'));

  const out = {
    experimental: true,
    path: p.rel,
    module: p.module,
    subject: p.subject,
    archived: p.archived,
    state: p.state,
    contracts: p.contracts,
    stances,
    whitelist,
    fileList: [...p.fileList],
    tasks: p.tasks,
    writeback: p.writeback,
    compat: p.compat,
  };

  if (flags['--json']) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`计划：${p.rel}`);
  console.log(`模块：${p.module}${p.archived ? '（已归档）' : ''}｜状态：${p.state || '未知'}`);
  if (p.contracts.length) console.log(`依据契约：${p.contracts.join('、')}`);
  if (p.compat) console.log(`接口兼容性：${p.compat}`);

  console.log('\n逐应用表态（白名单来源）：');
  if (!stances.length) console.log('  （未解析到表态表——旧格式计划或模板被本地定制）');
  for (const s of stances) {
    console.log(`  ${s.app}  ${s.stance}${s.registered ? '' : '  ⚠️ 未登记在应用清单'}`);
  }
  if (whitelist.length) console.log(`  允许改动路径：${whitelist.join('  ')}`);

  console.log(`\n变更文件清单（${p.fileList.size} 项）${p.fileList.size ? '：' : ''}`);
  for (const f of p.fileList) console.log(`  ${f}`);

  console.log(`\n任务进度：${p.tasks.total ? `${p.tasks.done}/${p.tasks.total}` : '（无任务清单）'}`);
  if (p.tasks.open.length) console.log(`  未完成：${p.tasks.open.join(', ')}`);
  console.log(`回写清单：${p.writeback.total ? `${p.writeback.done}/${p.writeback.total}` : '（未解析到）'}`);

  if (p.state === '已批准' || p.state === '实施中') {
    console.log(`\nNext: doc-framework diff-check ${p.rel}`);
  } else if (p.state === '已完成' && !p.archived && p.writeback.total > 0 && p.writeback.done === p.writeback.total) {
    // 一律用路径形式：跨模块计划没有「模块名」形式可用；已归档计划无需再提示归档
    console.log(`\nNext: /module-plan ${p.rel} 归档`);
  }
  return 0;
}

function help() {
  console.log(`doc-framework v${install.VERSION}
用法：
  doc-framework sync                          同步 skill 到最新（本地定制自动跳过）
  doc-framework check                         校验体系完整性（骨架 + 应用清单 + 计划体检 + 占位符 + 引导清理）
  doc-framework diff-check <计划路径> [选项]   提交前对账：git 变更 vs 计划白名单
      --base <ref>   与指定 ref 比较（默认 HEAD，含未跟踪文件）
      --staged       只检查已暂存文件（pre-commit 场景）
      --strict       警告也算失败
  doc-framework list [选项]                    列出在途计划（状态 / 涉及应用 / 任务进度）
      --module <名>  只列某模块      --app <标识>  只列会改动该应用的计划
      --state <状态> 按状态过滤      --all         包含已完成/已废弃（归档计划需路径直达）
      --json         机器可读输出（experimental）
  doc-framework show <计划路径> [--json]        查看单个计划：状态/表态/白名单/文件清单/任务进度/回写进度
  doc-framework --help                        显示帮助`);
}

const arg = process.argv[2];
if (arg === 'sync') sync();
else if (arg === 'check') process.exit(check());
else if (arg === 'diff-check') process.exit(diffCheck(process.argv.slice(3)));
else if (arg === 'list') process.exit(list(process.argv.slice(3)));
else if (arg === 'show') process.exit(show(process.argv.slice(3)));
else help();
