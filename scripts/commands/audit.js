'use strict';
/** `doc-framework audit`：只读健康报告（契约体量/§7/历史/SC/所有权/能力索引）。
 *  与 `check` 的分工：check 是门禁（issues/notes），audit 是“先清哪个”的报告；两者共用 lib/contract.js。 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');
const contract = require('../lib/contract');
const { parseArgs, resolvePlanArg } = require('../lib/util');
const { execFileSync } = require('child_process');

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

function analyzeModule(docRoot, mod) {
  const file = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
  let text;
  try { text = fs.readFileSync(file, 'utf-8'); } catch { return null; }
  const a = contract.analyzeContract(text, { docRoot, moduleName: mod });
  const refs = (text.match(/§7-\d+/g) || []).length;
  const findings = [];
  // schema4：SC 在 测试/验收.md；schema2：仍在契约 §8.2
  let scTable = a.scTable;
  let scBodies = a.scBodies;
  let scMissingTable = a.sc.missingTable;
  let scMismatch = a.scMismatch;
  let scSetMismatch = a.scSetMismatch;
  let scDup = a.scDup;
  const testDir = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.dirs.tests);
  const testPath = path.join(testDir, plan.NAMES.zh.testAcceptance);
  let testTopics = 0;
  let testReports = 0;
  let testReportBytes = 0;
  let testBytes = 0;
  if (a.schema4) {
    let testText = null;
    try { testText = fs.readFileSync(testPath, 'utf-8'); } catch { /* missing */ }
    if (testText === null) {
      findings.push('schema4 缺 测试/验收.md');
      scTable = 0; scBodies = 0; scMissingTable = false; scMismatch = false; scDup = false;
    } else {
      const t = contract.analyzeAcceptance(testText, { moduleName: mod });
      scTable = t.scTable; scBodies = t.scBodies;
      scMissingTable = t.sc.missingTable; scMismatch = t.scMismatch; scSetMismatch = t.scSetMismatch; scDup = t.scDup;
      if (t.empty) findings.push('测试/验收.md 缺 SC');
      testBytes += t.totalBytes;
    }
    if (a.scInContract) findings.push('schema4 契约 §8 残留 SC');
    try {
      const topicNames = fs.readdirSync(testDir).filter(f => /_测试\.md$/.test(f));
      testTopics = topicNames.length;
      for (const f of topicNames) testBytes += fs.statSync(path.join(testDir, f)).size;
      const planPath = path.join(testDir, plan.NAMES.zh.testPlan);
      if (fs.existsSync(planPath)) testBytes += fs.statSync(planPath).size;
      const reportDir = path.join(testDir, plan.NAMES.zh.testReports);
      if (fs.existsSync(reportDir) && fs.statSync(reportDir).isDirectory()) {
        const reports = fs.readdirSync(reportDir).filter(f => f.endsWith('.md'));
        testReports = reports.length;
        for (const f of reports) testReportBytes += fs.statSync(path.join(reportDir, f)).size;
      }
    } catch { /* missing */ }
  }
  if (a.legacy) findings.push(`旧章节结构/缺 SQL 章（${a.chapterCount} 章）`);
  if (!a.ownership.present) findings.push('缺所有权声明');
  for (const d of a.ownership.delegates) if (d.exists === false) findings.push(`委托文件不存在：${d.rel}`);
  if (a.historyHits.length) findings.push(`${a.historyHits.length} 处历史痕迹`);
  if (a.inv.invariants.length > 20) findings.push(`不变量 ${a.inv.invariants.length} >20`);
  if (a.inv.traps.length) findings.push(`TRAP ${a.inv.traps.length} 条（${a.newSchema ? '新契约禁止' : '迁移期，按 D9 转 INV/移出'}）`);
  if (a.inv.maxItemBytes > 800) findings.push(`单条 ${a.inv.maxItemBytes}B >800`);
  if (a.s7Bytes > 15 * 1024) findings.push(`§7 ${(a.s7Bytes / 1024).toFixed(1)}KB >15KB`);
  if (a.totalBytes > 50 * 1024) findings.push(`总量 ${(a.totalBytes / 1024).toFixed(1)}KB >50KB`);
  if (scMissingTable) findings.push('SC 有正文无索引表');
  if (scMismatch) findings.push(`SC 表/正文 ${scTable}/${scBodies}`);
  if (scSetMismatch && !scMismatch) findings.push('SC 表/正文 ID 集合不一致');
  if (scDup) findings.push('SC ID 重复');
  if (refs) findings.push(`§7-n 引用 ${refs} 处`);
  if (a.isPlatform && !/消费者|消费方/.test(text)) findings.push('平台能力缺消费者表');
  return {
    module: mod,
    rel: path.relative(path.dirname(docRoot), file),
    totalBytes: a.totalBytes,
    s7Bytes: a.s7Bytes,
    s7Share: a.s7Share,
    inv: a.inv.invariants.length,
    traps: a.inv.traps.length,
    maxItem: a.inv.maxItemBytes,
    history: a.historyHits.length,
    scTable,
    scBodies,
    scMismatch: scMismatch || scSetMismatch,
    testTopics,
    testReports,
    testReportBytes,
    testBytes,
    ownership: a.ownership.present,
    legacy: a.legacy,
    refs,
    findings,
  };
}

function boundaryStats(docRoot) {
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.boundaries);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf-8');
    return {
      name: f,
      kb: (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1),
      sc: (text.match(/SC-[^\s|]+/g) || []).length,
      scenario: /^####\s+Scenario:/m.test(text),
      marker: /<!--\s*boundary-schema:\s*2\b/.test(text),
    };
  }).sort((a, b) => Number(b.kb) - Number(a.kb));
}

/** `audit --plan <路径>`：按计划归因净增长（近似：计划首次提交的父提交 → HEAD）。 */
function auditPlanGrowth(root, planArg) {
  const pp = resolvePlanArg(root, planArg);
  if (!pp) return 1;
  let parsed;
  try { parsed = plan.parsePlan(root, pp); } catch (e) { console.log(`❌ 计划无法解析：${e.message}`); return 1; }
  const { docRoot } = plan.resolveDocRoot(root);
  const targets = new Set();
  const contractRel = path.relative(root, path.join(docRoot, plan.NAMES.zh.dirs.modules, parsed.module, plan.NAMES.zh.moduleContract));
  targets.add(contractRel);
  for (const r of [...parsed.delta.added, ...parsed.delta.modified, ...parsed.delta.removed]) {
    for (const m of String(r.target || '').matchAll(/(边界\/[^\s，、；|`]+\.md)/g)) targets.add(path.relative(root, path.join(docRoot, m[1])));
  }
  let first = '';
  try {
    first = execFileSync('git', ['-C', root, 'log', '--format=%H', '--reverse', '--', parsed.rel], { encoding: 'utf8' }).trim().split('\n')[0];
  } catch { /* no git */ }
  if (!first) {
    console.log(`[audit --plan] ${parsed.rel}\nℹ️ 计划尚未提交，无法按提交归因；请先提交计划再跑。`);
    return 0;
  }
  let out = '';
  try {
    out = execFileSync('git', ['-C', root, 'diff', '--numstat', `${first}^..HEAD`, '--', ...targets], { encoding: 'utf8' });
  } catch { console.log('❌ git diff 失败（仓库/基线不可用）'); return 1; }
  let add = 0, del = 0;
  for (const line of out.trim().split('\n').filter(Boolean)) {
    const [a, d] = line.split('\t').map(Number);
    if (Number.isFinite(a)) add += a;
    if (Number.isFinite(d)) del += d;
  }
  console.log(`[audit --plan] ${parsed.rel}`);
  console.log(`目标：${[...targets].join('、')}`);
  console.log(`新增 ${add} 行 / 删除 ${del} 行 / 净增长 ${add - del} 行（按计划首次提交父提交 → HEAD 近似）`);
  if (add > 0 && del === 0) console.log('⚠️ 只增不删：复核是否缺少“替换/删除旧条目”。');
  return 0;
}

function pad(s, n) {
  const str = String(s);
  const width = [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  return str + ' '.repeat(Math.max(0, n - width));
}

function printTable(rows) {
  const head = ['模块', '总量KB', '§7KB', '§7%', 'INV', '最长条', '历史', 'SC表/正文', '所有权', '结构'];
  const W = [14, 8, 7, 6, 9, 8, 6, 11, 7, 6];
  console.log(head.map((h, i) => pad(h, W[i])).join(' '));
  for (const r of rows) {
    const cells = [
      r.module, (r.totalBytes / 1024).toFixed(1), (r.s7Bytes / 1024).toFixed(1), `${r.s7Share.toFixed(1)}%`,
      `${r.inv}`, r.maxItem, r.history, `${r.scTable}/${r.scBodies}`, r.ownership ? '有' : '无', r.legacy ? '旧' : '标准',
    ];
    console.log(cells.map((c, i) => pad(c, W[i])).join(' '));
  }
}

function audit(argv = []) {
  const { flags, unknownFlags, missingValue } = parseArgs(argv, ['--root', '--module', '--plan'], ['--all', '--json']);
  if (unknownFlags.length) { console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework audit [--module <名>] [--all] [--json] [--plan <计划>] [--root <项目根>]）`); return 1; }
  if (missingValue.length) { console.log(`❌ 选项缺少取值：${missingValue.join(', ')}`); return 1; }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) { console.log(`❌ 未找到文档根 ${docLabel}/`); return 1; }
  if (flags['--plan']) return auditPlanGrowth(root, flags['--plan']);
  let modules = listModules(docRoot);
  if (flags['--module']) {
    const only = String(flags['--module']);
    modules = modules.filter(m => m === only);
    if (!modules.length) { console.log(`❌ 未找到模块契约：${docLabel}/模块/${only}/契约.md`); return 1; }
  }
  const rows = modules.map(m => analyzeModule(docRoot, m)).filter(Boolean);
  rows.sort((a, b) => b.totalBytes - a.totalBytes);
  if (flags['--json']) {
    console.log(JSON.stringify({ docRoot: docLabel, modules: rows }, null, 2));
    return 0;
  }
  console.log(`[audit] ${docLabel}｜${rows.length} 份契约｜按总量降序`);
  printTable(rows);
  const flagged = rows.filter(r => r.findings.length);
  if (flagged.length) {
    console.log('\n建议先处理：');
    for (const r of flagged.slice(0, 10)) console.log(`  - ${r.module}：${r.findings.join('；')}`);
  }
  const s7Total = rows.reduce((s, r) => s + r.s7Bytes, 0);
  const total = rows.reduce((s, r) => s + r.totalBytes, 0);
  console.log(`\n合计：${(total / 1024).toFixed(1)}KB；§7 ${(s7Total / 1024).toFixed(1)}KB（${total ? (s7Total / total * 100).toFixed(1) : '0'}%）；`
    + `>50KB ${rows.filter(r => r.totalBytes > 50 * 1024).length} 份；无所有权 ${rows.filter(r => !r.ownership).length} 份；`
    + `历史痕迹 ${rows.filter(r => r.history > 0).length} 份；SC 失配 ${rows.filter(r => r.scMismatch).length} 份`);
  const tTopics = rows.reduce((n, r) => n + (r.testTopics || 0), 0);
  const tReports = rows.reduce((n, r) => n + (r.testReports || 0), 0);
  const tBytes = rows.reduce((n, r) => n + (r.testBytes || 0), 0);
  const tReportBytes = rows.reduce((n, r) => n + (r.testReportBytes || 0), 0);
  console.log(`测试资产：主题测试 ${tTopics} 份 / 报告 ${tReports} 份（${(tReportBytes / 1024).toFixed(1)}KB）/ 体量 ${(tBytes / 1024).toFixed(1)}KB（验收+方案+主题，不含报告）`);
  const bs = boundaryStats(docRoot);
  if (bs.length) {
    console.log('\n边界文档：');
    for (const b of bs) console.log(`  - ${b.name}：${b.kb}KB｜SC ${b.sc}｜Scenario ${b.scenario ? '有' : '无'}｜schema2 ${b.marker ? '是' : '否'}`);
  }
  console.log('提示：audit 只读，不阻断；门禁以 doc-framework check --strict 为准。');
  return 0;
}

module.exports = { audit };
