'use strict';
/** `doc-framework migrate v4|v5|v6`：只读迁移报告（v4 语义层 / v5 测试目录化 + 九章 / v6 能力契约单命名 + schema3）。
 *  设计：迁移涉及“哪条规则属于能力契约/模块契约”的语义判断，**不做自动写入**；
 *  本命令只输出逐模块/逐能力契约动作清单，避免批量改错。 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');
const contract = require('../lib/contract');
const { parseArgs } = require('../lib/util');

function listModules(docRoot) {
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => fs.existsSync(path.join(dir, name, plan.NAMES.zh.moduleContract)));
  } catch { return []; }
}

/** v6：能力契约目录（旧 边界/ 与新 能力/ 都扫，仅用于生成动作清单）。 */
function listCapabilityFiles(docRoot) {
  const out = [];
  for (const [dirName, legacy] of [[plan.NAMES.zh.dirs.capabilities, false], ['边界', true]]) {
    const dir = path.join(docRoot, dirName);
    if (!fs.existsSync(dir)) continue;
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) out.push({ dirName, legacy, file: f, abs: path.join(dir, f) });
  }
  return out;
}

/** v6：单份能力契约的迁移动作。 */
function capabilityActionsFor(entry) {
  let text = '';
  try { text = fs.readFileSync(entry.abs, 'utf-8'); } catch { return []; }
  const actions = [];
  const marker = /<!--\s*(?:capability|boundary)-schema:\s*(\d+)\b/.exec(text);
  if (entry.legacy) actions.push(`目录更名：git mv 边界 能力（本文件 → 能力/${entry.file.replace(/边界\.md$/, '契约.md')}）`);
  else if (/边界\.md$/.test(entry.file)) actions.push(`文件更名：${entry.file} → ${entry.file.replace(/边界\.md$/, '契约.md')}`);
  if (!/<!--\s*capability-schema:\s*3\b/.test(text)) actions.push('标记改为 <!-- capability-schema: 3 -->');
  if (/^##\s*6\.\s*验收归属/m.test(text)) actions.push('删除 §6 验收归属：验收改走主责契约 §8 → 测试/验收.md');
  if (/^##\s*7\.\s*关联代码/m.test(text)) actions.push('§7 关联代码 → §6');
  if (/^\|\s*消费者\s*\|/m.test(text)) actions.push('§1 删消费者表：清单回写 总契约 §7，§1 改为「谁在用」指针 + 人读层');
  const hasHuman = /不做什么/.test(text);
  if (!hasHuman) actions.push('§1 补人读层：是什么 / 为什么需要 / 不做什么 / 谁在用（≤800B）');
  if (!/^##\s*6\.\s*关联代码/m.test(text) && !/^##\s*7\.\s*关联代码/m.test(text)) actions.push('补 §6 关联代码（路径 + 职责）');
  const legacyRefs = (text.match(/边界\//g) || []).length;
  if (legacyRefs) actions.push(`正文含 ${legacyRefs} 处「边界/」路径 → 改为「能力/」`);
  return actions.map(a => (marker ? a : `（未迁移标记）${a}`));
}

/** v6：模块契约、总契约、计划与应用规范中的旧路径引用。 */
function legacyRefActions(docRoot) {
  const out = [];
  const scan = (file, label) => {
    let text = '';
    try { text = fs.readFileSync(file, 'utf-8'); } catch { return; }
    const n = (text.match(/边界\//g) || []).length;
    if (n) out.push(`${label}：${n} 处「边界/」引用 → 能力/`);
  };
  for (const mod of listModules(docRoot)) {
    scan(path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract), `模块/${mod}/契约.md`);
    const planDir = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.modulePlanDir);
    let plans = [];
    try { plans = fs.readdirSync(planDir).filter(f => f.endsWith('.md') && !fs.statSync(path.join(planDir, f)).isDirectory()); } catch { /* 无计划目录 */ }
    for (const f of plans) scan(path.join(planDir, f), `模块/${mod}/计划/${f}`);
  }
  scan(path.join(docRoot, plan.NAMES.zh.rootContract), '总契约.md');
  const rootPlanDir = path.join(docRoot, plan.NAMES.zh.dirs.plans);
  let rootPlans = [];
  try { rootPlans = fs.readdirSync(rootPlanDir).filter(f => f.endsWith('.md') && !fs.statSync(path.join(rootPlanDir, f)).isDirectory()); } catch { /* 无全局计划 */ }
  for (const f of rootPlans) scan(path.join(rootPlanDir, f), `计划/${f}`);
  const standardsDir = path.join(docRoot, plan.NAMES.zh.dirs.standards);
  let specs = [];
  try { specs = fs.readdirSync(standardsDir).filter(f => f.endsWith('.md')); } catch { /* 无规范 */ }
  for (const f of specs) scan(path.join(standardsDir, f), `规范/${f}`);
  return out;
}

function actionsFor(a, mod, docRoot, ver) {
  const out = [];
  const moduleDir = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod);
  const testDir = path.join(moduleDir, plan.NAMES.zh.dirs.tests);
  const acceptance = path.join(testDir, plan.NAMES.zh.testAcceptance);
  const testPlan = path.join(testDir, plan.NAMES.zh.testPlan);
  const legacyTest = path.join(moduleDir, plan.NAMES.zh.legacyTest);
  const legacyReports = path.join(moduleDir, plan.NAMES.zh.legacyTestReports);
  const rootScript = path.join(moduleDir, plan.NAMES.zh.testScript);
  let testEntries = [];
  try {
    if (fs.existsSync(testDir) && fs.statSync(testDir).isDirectory()) testEntries = fs.readdirSync(testDir);
  } catch { /* unreadable: check 会报 */ }

  // v5 = 4.0.0 测试目录化 + 九章；v4 保持原有“v4 语义层”动作，不混入 4.0.0 迁移。
  if (ver === 'v5') {
    if (!a.schema4) out.push('升 4.0.0：契约 9 章；SC 迁 测试/验收.md；§8 换指针；删 §9；§10→§9');
    if (a.schema4 && !fs.existsSync(acceptance)) out.push('补 测试/验收.md（SC 唯一事实源）');
    if (fs.existsSync(legacyTest)) out.push('迁旧 测试.md：SC → 测试/验收.md；方案/用例 → 测试/方案.md、测试/{主题}_测试.md');
    if (fs.existsSync(legacyReports)) out.push('迁旧 测试报告/ → 测试/报告/');
    if (fs.existsSync(rootScript)) out.push('迁根 test.sh → 测试/test.sh');
    if (testEntries.length && !fs.existsSync(testPlan) && testEntries.some(f => /_测试\.md$/.test(f))) {
      out.push('补 测试/方案.md（主题测试的索引）');
    }
    if (a.legacy) out.push('先对齐 9/10 章结构（当前非标准章节）');
  } else if (a.legacy) {
    out.push('先对齐 10 章结构（当前非标准章节）');
  }

  if (!a.ownership.present) out.push('加所有权声明：本契约拥有 / 委托给 / 本契约不拥有');
  if (a.ownership.delegates.some(d => d.exists === false)) out.push('修正不存在的“委托给”路径');
  if (a.inv.numbered.length && !a.inv.invariants.length && !a.inv.traps.length) out.push('把 §7 编号条目迁为 7.1 INV 表');
  if (a.inv.invariants.some(x => !new RegExp(`^INV-${mod}-\\d{2}$`).test(x.id))) out.push(`§7 不变量 ID → INV-${mod}-NN`);
  if (a.inv.traps.length) out.push(`§7.2/TRAP 退场（${a.inv.traps.length} 条）：能写“不得/必须+违反症状”的转 INV，否则移应用规范/代码或删`);
  if (a.historyHits.length) out.push(`清历史痕迹（${a.historyHits.length} 处）→ git/探索`);
  if (a.sc.tableIds.some(id => /^#/.test(id)) || a.sc.bodyIds.some(id => !new RegExp(`^SC-${mod}-\\d{2}$`).test(id))) {
    out.push(`§8.2 ID → SC-${mod}-NN，索引表与正文 1:1`);
  }
  if (a.sc.missingTable) out.push('补 §8.2 索引表（当前只有正文）');
  if (a.scMismatch) out.push(`修 §8.2 表/正文失配（${a.scTable}/${a.scBodies}）`);
  if (a.scSetMismatch && !a.scMismatch) out.push('修 §8.2 表/正文 ID 集合不一致');
  if (a.s7Bytes > 15 * 1024) out.push(`§7 ${(a.s7Bytes / 1024).toFixed(1)}KB >15KB：上移能力契约/应用规范或压缩`);
  if (a.totalBytes > 50 * 1024) out.push(`契约 ${(a.totalBytes / 1024).toFixed(1)}KB >50KB：先 audit 排序`);
  return out;
}
function migrate(argv = []) {
  const { flags, positionals, unknownFlags } = parseArgs(argv, ['--root'], ['--dry-run', '--write', '--json']);
  if (unknownFlags.length) { console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework migrate v4|v5|v6 [--dry-run] [--json] [--root <项目根>]）`); return 1; }
  const ver = positionals[0];
  if (!['v4', 'v5', 'v6'].includes(ver)) { console.log('❌ 只支持：doc-framework migrate v4|v5|v6（只读迁移报告）'); return 1; }
  if (flags['--write']) {
    console.log(`❌ ${ver} 迁移不做自动写入：规则归属/SC 语义需要判断；`);
    console.log(`   请用 migrate ${ver} --dry-run 生成动作清单，按模块人工迁移，再用 check --strict + audit 验收。`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) { console.log(`❌ 未找到文档根 ${docLabel}/`); return 1; }

  if (ver === 'v6') {
    const entries = listCapabilityFiles(docRoot);
    const capabilities = [];
    for (const e of entries) {
      const actions = capabilityActionsFor(e);
      if (!actions.length) continue;
      let bytes = 0;
      let schema = 0;
      try {
        const text = fs.readFileSync(e.abs, 'utf-8');
        bytes = Buffer.byteLength(text, 'utf8');
        const m = /<!--\s*(?:capability|boundary)-schema:\s*(\d+)\b/.exec(text);
        schema = m ? Number(m[1]) : 0;
      } catch { /* 不可读由 check 报 */ }
      capabilities.push({ file: `${e.dirName}/${e.file}`, bytes, schema, actions });
    }
    const references = legacyRefActions(docRoot);
    if (flags['--json']) { console.log(JSON.stringify({ version: ver, docRoot: docLabel, capabilities, references }, null, 2)); return 0; }
    console.log(`[migrate ${ver}] ${docLabel}｜${capabilities.length} 份能力契约需要迁移动作，${references.length} 份文档含旧路径引用（只读报告）`);
    for (const b of capabilities) {
      console.log(`\n- ${b.file}`);
      for (const a of b.actions) console.log(`  · ${a}`);
    }
    if (references.length) {
      console.log('\n引用回写（人工）：');
      for (const r of references) console.log(`  · ${r}`);
    }
    console.log('\n提示：先 `git mv 边界 能力` 并重命名文件，再改内容；完成后跑 check --strict + audit。');
    return 0;
  }

  const modules = listModules(docRoot);
  const rows = [];
  for (const mod of modules) {
    const file = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const a = contract.analyzeContract(text, { docRoot, moduleName: mod });
    const actions = actionsFor(a, mod, docRoot, ver);
    if (actions.length) rows.push({ module: mod, bytes: a.totalBytes, actions });
  }
  if (flags['--json']) { console.log(JSON.stringify({ version: ver, docRoot: docLabel, modules: rows }, null, 2)); return 0; }
  console.log(`[migrate ${ver}] ${docLabel}｜${rows.length} 份契约需要迁移动作（只读报告）`);
  for (const r of rows) {
    console.log(`\n- ${r.module}（${(r.bytes / 1024).toFixed(1)}KB）`);
    for (const a of r.actions) console.log(`  · ${a}`);
  }
  console.log('\n提示：按 audit 排序逐模块迁移；不要全场批量改 §7-n 引用。');
  return 0;
}

module.exports = { migrate };
