'use strict';
/** `doc-framework audit`：只读健康报告（契约体量/§7/历史/SC/所有权/能力索引）。
 *  与 `check` 的分工：check 是门禁（issues/notes），audit 是“先清哪个”的报告；两者共用 lib/contract.js。 */
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

function analyzeModule(docRoot, mod) {
  const file = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
  let text;
  try { text = fs.readFileSync(file, 'utf-8'); } catch { return null; }
  const a = contract.analyzeContract(text, { docRoot, moduleName: mod });
  const refs = (text.match(/§7-\d+/g) || []).length;
  const findings = [];
  if (a.legacy) findings.push('旧章节结构（非 10 章）');
  if (!a.ownership.present) findings.push('缺所有权声明');
  for (const d of a.ownership.delegates) if (d.exists === false) findings.push(`委托文件不存在：${d.rel}`);
  if (a.historyHits.length) findings.push(`${a.historyHits.length} 处历史痕迹`);
  if (a.inv.invariants.length > 20) findings.push(`不变量 ${a.inv.invariants.length} >20`);
  if (a.inv.traps.length > 10) findings.push(`陷阱 ${a.inv.traps.length} >10`);
  if (a.inv.maxItemBytes > 800) findings.push(`单条 ${a.inv.maxItemBytes}B >800`);
  if (a.s7Bytes > 15 * 1024) findings.push(`§7 ${(a.s7Bytes / 1024).toFixed(1)}KB >15KB`);
  if (a.totalBytes > 50 * 1024) findings.push(`总量 ${(a.totalBytes / 1024).toFixed(1)}KB >50KB`);
  if (a.sc.missingTable) findings.push('SC 有正文无索引表');
  if (a.scMismatch) findings.push(`SC 表/正文 ${a.scTable}/${a.scBodies}`);
  if (a.scDup) findings.push('SC ID 重复');
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
    scTable: a.scTable,
    scBodies: a.scBodies,
    ownership: a.ownership.present,
    legacy: a.legacy,
    refs,
    findings,
  };
}

function pad(s, n) {
  const str = String(s);
  const width = [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  return str + ' '.repeat(Math.max(0, n - width));
}

function printTable(rows) {
  const head = ['模块', '总量KB', '§7KB', '§7%', 'INV/TRAP', '最长条', '历史', 'SC表/正文', '所有权', '结构'];
  const W = [14, 8, 7, 6, 9, 8, 6, 11, 7, 6];
  console.log(head.map((h, i) => pad(h, W[i])).join(' '));
  for (const r of rows) {
    const cells = [
      r.module, (r.totalBytes / 1024).toFixed(1), (r.s7Bytes / 1024).toFixed(1), `${r.s7Share.toFixed(1)}%`,
      `${r.inv}/${r.traps}`, r.maxItem, r.history, `${r.scTable}/${r.scBodies}`, r.ownership ? '有' : '无', r.legacy ? '旧' : '标准',
    ];
    console.log(cells.map((c, i) => pad(c, W[i])).join(' '));
  }
}

function audit(argv = []) {
  const { flags, unknownFlags, missingValue } = parseArgs(argv, ['--root', '--module'], ['--all', '--json']);
  if (unknownFlags.length) { console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework audit [--module <名>] [--all] [--json] [--root <项目根>]）`); return 1; }
  if (missingValue.length) { console.log(`❌ 选项缺少取值：${missingValue.join(', ')}`); return 1; }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) { console.log(`❌ 未找到文档根 ${docLabel}/`); return 1; }
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
    + `历史痕迹 ${rows.filter(r => r.history > 0).length} 份；SC 失配 ${rows.filter(r => r.scTable && r.scTable !== r.scBodies).length} 份`);
  console.log('提示：audit 只读，不阻断；门禁以 doc-framework check --strict 为准。');
  return 0;
}

module.exports = { audit };
