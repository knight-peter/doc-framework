'use strict';
/**
 * `doc-framework doctor`：安装 / 升级健康检查（**只读**，不替代 `check` 的文档审计）。
 *
 * 覆盖：
 *   - skill 安装：目标目录、marker、per-skill 版本、幽灵/缺失 skill；
 *   - AGENTS.md：永久段标记、核心纪律、接入引导残留；
 *   - 文档体系：文档根 / 四份全局文档、结构版本哨兵、中文数字章号、契约 §9 旧表、
 *     `archive/` 旧归档目录、英文根残留、无「计划形态」行的旧计划。
 *
 * 级别：error 影响退出码；warn/note 只报告。`--json` 输出 {ok, version, root, docRoot, checks}。
 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const installer = require('../lib/installer');
const plan = require('../lib/plan');
const { parseArgs } = require('../lib/util');

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
}

function versionParts(v) {
  return String(v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function behind(docV, fwV) {
  const [dMa, dMi] = versionParts(docV);
  const [fMa, fMi] = versionParts(fwV);
  return dMa < fMa || (dMa === fMa && dMi < fMi);
}

/** 收集报告项：{area, level, message} */
function collect(root) {
  const checks = [];
  const add = (area, level, message) => checks.push({ area, level, message });
  const current = `v${env.VERSION}`;
  const { docRoot } = plan.resolveDocRoot(root);

  // ── skill 安装 ──────────────────────────────────────────────
  const srcSkills = listDirs(path.join(env.PKG_ROOT, 'skills'));
  for (const dir of installer.resolveTargetDirs(root)) {
    const target = path.join(root, dir);
    if (!fs.existsSync(target)) {
      add('install', 'warn', `skill 目标目录不存在：${dir}（先跑 doc-framework install）`);
      continue;
    }
    const marker = installer.readMarker(target);
    if (!marker) {
      add('install', 'warn', `缺少版本标记：${dir}/${installer.MARKER_FILE}（先跑 doc-framework install）`);
    } else {
      if (marker.version !== current) {
        add('install', 'note', `marker 总版本 ${marker.version || '未知'} ≠ 当前 ${current}（旧版安装器可能只写总版本）`);
      }
      if (marker.skills && typeof marker.skills === 'object' && !Array.isArray(marker.skills)) {
        for (const [name, s] of Object.entries(marker.skills)) {
          if (!s || typeof s !== 'object') {
            add('install', 'note', `marker 的 skill「${name}」记录格式异常（跑一次 sync 会重写）`);
            continue;
          }
          if (!srcSkills.includes(name)) add('install', 'warn', `幽灵技能：${name}（当前发布源已不存在；跑 sync 清理）`);
          else if (s.version && s.version !== current) {
            add('install', 'note', `skill「${name}」版本 ${s.version}（当前 ${current}；本地定制或未升级）`);
          }
        }
      } else {
        add('install', 'note', 'marker 无 per-skill 版本信息（旧格式；跑一次 sync 会重写）');
      }
      for (const name of srcSkills) {
        if (!fs.existsSync(path.join(target, name))) add('install', 'warn', `缺少 skill：${name}（跑 install / sync 补）`);
      }
    }
  }

  // ── AGENTS.md 永久段 ───────────────────────────────────────
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsExists = fs.existsSync(agentsPath);
  const agents = agentsExists ? safeRead(agentsPath) : null;
  if (!agentsExists) {
    add('agents', 'warn', '未找到 AGENTS.md：doc-framework 永久段缺失（新会话不会自动加载框架规则）');
  } else if (agents === null) {
    add('agents', 'warn', 'AGENTS.md 无法读取：无法确认永久段是否存在');
  } else {
    if (agents.includes('接入引导段') && agents.includes('移除')) {
      add('agents', 'warn', 'AGENTS.md 仍含接入引导段（初始化完成后应移除）');
    }
    const hasMarkers = agents.includes('CONTRACT-FRAMEWORK-BEGIN') && agents.includes('CONTRACT-FRAMEWORK-END');
    const hasCore = agents.includes('语义先于代码') && agents.includes('记录后于代码');
    if (!hasMarkers) add('agents', 'warn', 'AGENTS.md 缺永久段标记（CONTRACT-FRAMEWORK-BEGIN/END）');
    else if (!hasCore) add('agents', 'note', 'AGENTS.md 永久段缺核心纪律（语义先于代码 / 记录后于代码）');
  }

  // ── 文档体系 / 升级勘察 ───────────────────────────────────
  if (!fs.existsSync(docRoot)) {
    add('docs', 'error', '未找到文档根 doc-framework/（先在项目根跑初始化）');
    return checks;
  }
  const globals = [plan.NAMES.zh.profile, plan.NAMES.zh.rootContract, plan.NAMES.zh.testingGuide, plan.NAMES.zh.apiGuide];
  for (const rel of globals) {
    const abs = path.join(docRoot, rel);
    if (!fs.existsSync(abs)) {
      add('docs', 'warn', `缺少全局文档：${rel}（从官方模板渲染）`);
      continue;
    }
    const content = safeRead(abs);
    if (content === null) continue;
    const sentinel = plan.parseDocstructVersion(content);
    if (sentinel && sentinel.version && behind(sentinel.version, env.VERSION)) {
      add('upgrade', 'note', `结构版本落后：${rel}（${sentinel.version} < ${current}）——按设计文档 §9.3 人工对齐`);
    }
    if (/^##\s*[一二三四五六七八九十]+、/m.test(content)) {
      add('upgrade', 'note', `一级章号仍是中文数字：${rel}（应改为 ## N. 标题）`);
    }
  }

  // 模块契约：中文章号 / §9 旧表
  const modulesDir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  for (const mod of listDirs(modulesDir)) {
    const contractPath = path.join(modulesDir, mod, plan.NAMES.zh.moduleContract);
    if (!fs.existsSync(contractPath)) continue;
    const content = safeRead(contractPath);
    if (content === null) continue;
    if (/^##\s*[一二三四五六七八九十]+、/m.test(content)) {
      add('upgrade', 'note', `模块契约一级章号仍是中文数字：${mod}`);
    }
    const sec9 = plan.mdSection(content, '变更记录');
    if (sec9 && /\|\s*(日期|来源)\s*\|/.test(sec9)) {
      add('upgrade', 'note', `契约 §9 仍是旧变更记录表：${mod}（历史归 git，按 §9.3 P0-2 删表）`);
    }
    if (fs.existsSync(path.join(modulesDir, mod, plan.NAMES.zh.legacyTest))) {
      add('upgrade', 'note', `模块仍是旧测试资产：${mod}/测试.md（4.0.0 迁 测试/验收.md + 方案.md + _测试.md）`);
    }
    if (fs.existsSync(path.join(modulesDir, mod, plan.NAMES.zh.legacyTestReports))) {
      add('upgrade', 'note', `模块仍是旧报告目录：${mod}/测试报告/（4.0.0 迁 测试/报告/）`);
    }
    if (fs.existsSync(path.join(modulesDir, mod, plan.NAMES.zh.testScript))) {
      add('upgrade', 'note', `模块根仍有 test.sh：${mod}（4.0.0 迁 测试/test.sh）`);
    }
  }

  // 旧归档目录 / 英文根
  const legacyArchive = [
    path.join(docRoot, plan.NAMES.zh.dirs.plans, 'archive'),
    ...listDirs(modulesDir).map(m => path.join(modulesDir, m, plan.NAMES.zh.modulePlanDir, 'archive')),
  ].filter(p => fs.existsSync(p));
  if (legacyArchive.length) add('upgrade', 'note', `发现英文归档目录 archive/（应 git mv 到 归档/）：${legacyArchive.map(p => path.relative(root, p)).join('、')}`);
  for (const oldRoot of ['doc-framework-en', 'docs-framework']) {
    if (fs.existsSync(path.join(root, oldRoot))) add('upgrade', 'warn', `发现旧英文文档根 ${oldRoot}/（应人工迁移到 doc-framework/）`);
  }

  // 无「计划形态」行的旧计划（v2.9 及更早）
  let noShape = 0;
  for (const pp of plan.collectPlanPaths(docRoot)) {
    try {
      if (!plan.parsePlan(root, pp).hasShapeLine) noShape++;
    } catch { /* 解析失败由 check 报 */ }
  }
  if (noShape) add('upgrade', 'note', `${noShape} 份在途计划没有「计划形态」行（v2.9 及更早；新计划请补，旧计划不拦）`);

  return checks;
}

/** `doc-framework doctor [--root] [--json]` */
function doctor(argv = []) {
  const { flags, missingValue, unknownFlags } = parseArgs(argv, ['--root'], ['--json']);
  if (unknownFlags.length) {
    console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework doctor [--root <项目根>] [--json]）`);
    return 1;
  }
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework doctor [--root <项目根>] [--json]）`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const checks = collect(root);
  const errors = checks.filter(c => c.level === 'error').length;
  if (flags['--json']) {
    const { docRoot } = plan.resolveDocRoot(root);
    console.log(JSON.stringify({
      ok: errors === 0,
      version: env.VERSION,
      root,
      docRoot: path.relative(root, docRoot) || docRoot,
      checks,
    }, null, 2));
    return errors ? 1 : 0;
  }
  const groups = [['install', '安装'], ['agents', 'AGENTS'], ['docs', '文档'], ['upgrade', '升级勘察']];
  for (const [area, label] of groups) {
    const items = checks.filter(c => c.area === area);
    if (!items.length) continue;
    console.log(`\n${label}：`);
    for (const c of items) {
      const mark = c.level === 'error' ? '❌' : c.level === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`  ${mark} ${c.message}`);
    }
  }
  if (!checks.length) console.log('✅ 未发现安装 / 升级健康问题');
  else if (errors === 0) console.log('\n✅ doctor 完成（无 error；按提示决定是否迁移）');
  else console.log(`\n❌ doctor 发现 ${errors} 个 error`);
  console.log('Next: doc-framework check（文档体系审计；doctor 不替代 check）');
  return errors ? 1 : 0;
}

module.exports = { doctor, collect };
