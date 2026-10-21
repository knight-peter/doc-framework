'use strict';
/** `doc-framework migrate v4`：只读迁移报告（v4 契约语义层）。
 *  设计：v4 迁移涉及“哪条规则属于能力契约/模块契约”的语义判断，**不做自动写入**；
 *  本命令只输出逐模块动作清单，避免 290 处 §7-n 引用被批量改错。 */
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

function actionsFor(a, mod) {
  const out = [];
  if (a.legacy) out.push('先对齐 10 章结构（当前非标准章节）');
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
  if (a.s7Bytes > 15 * 1024) out.push(`§7 ${(a.s7Bytes / 1024).toFixed(1)}KB >15KB：上移能力契约/应用规范或压缩`);
  if (a.totalBytes > 50 * 1024) out.push(`契约 ${(a.totalBytes / 1024).toFixed(1)}KB >50KB：先 audit 排序`);
  return out;
}

function migrate(argv = []) {
  const { flags, positionals, unknownFlags } = parseArgs(argv, ['--root'], ['--dry-run', '--write', '--json']);
  if (unknownFlags.length) { console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework migrate v4 [--dry-run] [--json] [--root <项目根>]）`); return 1; }
  const ver = positionals[0];
  if (ver !== 'v4') { console.log('❌ 只支持：doc-framework migrate v4（当前只有 v4 迁移报告）'); return 1; }
  if (flags['--write']) {
    console.log('❌ v4 迁移不做自动写入：规则归入模块契约/能力契约/接口/应用规范需要语义判断；');
    console.log('   请用 migrate v4 --dry-run 生成动作清单，按模块人工迁移，再用 check --strict + audit 验收。');
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) { console.log(`❌ 未找到文档根 ${docLabel}/`); return 1; }
  const modules = listModules(docRoot);
  const rows = [];
  for (const mod of modules) {
    const file = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const a = contract.analyzeContract(text, { docRoot, moduleName: mod });
    const actions = actionsFor(a, mod);
    if (actions.length) rows.push({ module: mod, bytes: a.totalBytes, actions });
  }
  if (flags['--json']) { console.log(JSON.stringify({ version: 'v4', docRoot: docLabel, modules: rows }, null, 2)); return 0; }
  console.log(`[migrate v4] ${docLabel}｜${rows.length} 份契约需要迁移动作（只读报告）`);
  for (const r of rows) {
    console.log(`\n- ${r.module}（${(r.bytes / 1024).toFixed(1)}KB）`);
    for (const a of r.actions) console.log(`  · ${a}`);
  }
  console.log('\n提示：按 audit 排序逐模块迁移；不要全场批量改 §7-n 引用。');
  return 0;
}

module.exports = { migrate };
