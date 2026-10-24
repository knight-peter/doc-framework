'use strict';
/** list 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const { parseArgs, renderTable } = require('../lib/util');
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');

const DAY_MS = 86400000; // list --stale：天数 → 毫秒

/**
 * `doc-framework list`：列出在途计划（只读）。
 *
 * 过滤链（顺序即语义）：`--all` 决定是否含终态 → `--module` → `--state` → `--app` → `--stale`。
 * 默认**排除已完成/已废弃**（它们是终态，留在活跃目录里只说明还没归档）。
 *
 * 两个易混点：
 *   - `--stale N` 是"归档候选"入口：按**计划文件名里的日期前缀**算停滞天数。因为它在上面
 *     已被默认过滤掉终态，所以想批量归档（对象是"已完成"）必须 `--stale N --all` 一起给；
 *   - `--orphans` 用**未过滤**的集合判断"有没有在途计划"（见 allParsed），否则 `--all`
 *     与否会改变孤立模块的判定结果。
 *
 * @returns {number} 0 = 正常（含"没有匹配计划"）；1 = 用法错误（未知状态、--stale 取值非法）
 */
function list(argv) {
  const { flags, missingValue, unknownFlags } = parseArgs(argv, ['--module', '--app', '--state', '--stale', '--root'], ['--json', '--all', '--orphans', '--explore']);
  if (unknownFlags.length) {
    console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework list [选项]）`);
    return 1;
  }
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework list [选项]）`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根 doc-framework/');
    return 1;
  }
  const moduleFilter = flags['--module'] || null;
  const appFilter = flags['--app'] || null;
  const stateFilter = flags['--state'] || null;
  const staleArg = flags['--stale'];
  const json = !!flags['--json'];
  const all = !!flags['--all'];
  const orphans = !!flags['--orphans'];

  // `--explore`：独立视图——聚合探索记录（探索/ = 进行中含待消费，探索/归档/ = 已归档），
  // 与计划过滤链互斥（语义完全不同，混用只会困惑）。
  if (flags['--explore']) {
    const planOnly = ['--module', '--app', '--stale', '--orphans', '--all'].filter(f => flags[f] !== undefined);
    if (planOnly.length) {
      console.log(`❌ --explore 是独立视图，不能与计划选项同用：${planOnly.join(', ')}`);
      console.log('   可用组合：--state <探索中|已定案|已使用|已作废>、--json');
      return 1;
    }
    return listExplore(root, docRoot, flags);
  }

// 状态过滤：只认中文枚举（normalizeState 只匹配中文词表）
  const VALID_STATES = ['待审核', '修订中', '已批准', '实施中', '已完成', '已废弃'];
  let stateWanted = stateFilter;
  if (stateFilter) {
    stateWanted = VALID_STATES.includes(stateFilter) ? stateFilter : plan.normalizeState(stateFilter);
    if (!stateWanted) {
    console.log(`❌ 未识别的状态「${stateFilter}」；可用：${VALID_STATES.join(' / ')}`);
      return 1;
    }
  }
  let staleDays = null;
  if (staleArg) {
    staleDays = Number(staleArg);
    if (!Number.isFinite(staleDays) || staleDays <= 0) {
      console.log(`❌ --stale 需要正整数天数（如 --stale 14）：${staleArg}`);
      return 1;
    }
  }

  let plans = plan.listPlans(root, docRoot);
  const allParsed = plans.slice(); // --orphans 用未过滤集合判"在途计划"（否则 --all 与否会影响结果）
  if (!all) plans = plans.filter(p => p.state !== '已完成' && p.state !== '已废弃');
  if (moduleFilter) plans = plans.filter(p => p.module === moduleFilter);
  if (stateWanted) plans = plans.filter(p => p.state === stateWanted);
  if (appFilter) plans = plans.filter(p => p.stances[appFilter] === 'change');
  if (staleDays) {
    // 计划文件名带日期前缀：日期早于 N 天前的在途计划 = 归档候选（批量归档入口）
    const d0 = new Date(Date.now() - staleDays * DAY_MS);
    const cutoff = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    plans = plans.filter(p => {
      const d = (p.subject.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
      return d && d < cutoff;
    });
  }

  const rows = plans.map(p => ({
    module: p.module,
    subject: p.subject,
    shape: p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : null,
    state: p.state || '未知',
    mergeState: p.mergeState,
    delta: p.delta ? p.delta.total : 0,
    deltaSkipped: p.delta ? p.delta.skipped : 0,
    firstBuild: !!p.isFirstBuild,
    apps: Object.entries(p.stances).filter(([, v]) => v === 'change').map(([k]) => k),
    tasks: {
      done: p.tasks.done, total: p.tasks.total,
      // 登记行（人工步骤，无勾选框）单独成组：它不进进度，但必须看得见
      humanTotal: p.tasks.humanRows.length,
    },
    path: p.rel,
  }));

  // --orphans：无契约且无在途计划的模块（"代码是否存在"需人工确认——本仓库不扫描代码）
  // 「在途」口径与 /module-review 一致：未归档 ∧ 状态 ∈ {已批准, 实施中, 已完成}
  // （已完成但未归档仍算在途——它的增量为空说明没建档，由 check 的"建档兜底"负责报错，
  //  这里不列它：列出来会给出"代码对账"这条错误的路由建议）
  if (orphans) {
    const inflight = new Set(allParsed
      .filter(p => p.state === '已批准' || p.state === '实施中' || p.state === '已完成')
      .map(p => p.module));
    const missing = [];
    for (const modulesDir of plan.docDirs(docRoot, 'modules')) {
      let ents = [];
      try { ents = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { ents = []; }
      for (const ent of ents) {
        if (!ent.isDirectory()) continue;
        const mod = ent.name;
        if (plan.hasContract(docRoot, mod)) continue;
        if (inflight.has(mod)) continue;
        if (missing.includes(mod)) continue;
        missing.push(mod);
      }
    }
    if (json) {
      console.log(JSON.stringify({ experimental: true, count: missing.length, orphans: missing }, null, 2));
      return 0;
    }
    if (!missing.length) {
      console.log('没有"缺契约且在途计划为空"的模块。');
      return 0;
    }
    console.log('缺契约且无在途计划的模块（需人工确认代码是否存在）：');
    for (const m of missing) console.log(`  ${m}  → 有代码：/module-doc ${m} 代码对账补建；零实现：/module-plan ${m} 建首次建模计划`);
    return 0;
  }

  if (json) {
    console.log(JSON.stringify({ experimental: true, count: rows.length, plans: rows }, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log(staleDays ? `没有停滞计划（日期早于 ${staleDays} 天前的在途计划）。` : '没有匹配的在途计划。');
    console.log(staleDays && !all
      ? '提示：批量归档的对象是「已完成/已废弃」计划，需加 --all：`doc-framework list --stale N --all`。'
      : '提示：`doc-framework list --all` 可包含已完成/已废弃（归档计划需路径直达）。');
    return 0;
  }
  const head = ['模块', '计划（日期-主题）', '状态', '涉及应用（表态=改动）', '任务'];
  const data = rows.map(r => {
    let tag = r.shape === '轻量' ? '（轻量）' : '';
    if (r.state === '已完成' && r.mergeState === '待合并') tag += '（待合并）';
    else if (r.mergeState === '已合并') tag += '（已合并）';
    if (r.delta) tag += `［增量 ${r.delta} 项］`;
    // 人工步骤单独标出：它**不阻塞**「已完成」（登记行无勾选框），但必须看得见——
    // 否则"最容易被忘的步骤"正好落在默认视图之外。
    const taskCell = r.tasks.total
      ? `${r.tasks.done}/${r.tasks.total}${r.tasks.humanTotal ? `（人工步骤 ${r.tasks.humanTotal}）` : ''}`
      : r.tasks.humanTotal ? `—（人工步骤 ${r.tasks.humanTotal}）` : '—';
    return [r.module, r.subject + tag, r.state, r.apps.join(', ') || '—', taskCell];
  });
  renderTable(head, data);
  console.log(all ? `\n共 ${rows.length} 份计划（含已完成/已废弃）。`
    : staleDays ? `\n共 ${rows.length} 份停滞计划（日期早于 ${staleDays} 天前）——完成则 /module-plan {模块名} 归档，不做了则废弃`
      : `\n共 ${rows.length} 份在途计划。`);
  const next = rows.find(r => r.state !== '已完成' && r.state !== '已废弃') || rows[0];
  console.log(staleDays && next.state === '已完成'
    ? `Next: /module-plan ${next.module} 归档`
    : `Next: doc-framework show ${next.path}`);
  return 0;
}

/**
 * `doc-framework list --explore`：聚合探索记录（只读，位置本身即生命周期信号）。
 *
 * 扫描 `{文档根}/探索/`（探索中 + 已定案待消费）与 `{文档根}/探索/归档/`（已使用 + 已作废
 * + 定案即归档的"不做"结论），解析头部 `> 状态：` / `> 结论去向：` / `> 已被：` 三行出表。
 * 探索记录不参与 check 硬校验，本视图同样**只呈现、不判定**（状态缺失/未识别显示"未知"）。
 *
 * @returns {number} 0 = 正常（含"没有匹配记录"）；1 = 用法错误（未知状态）
 */
function listExplore(root, docRoot, flags) {
  const json = !!flags['--json'];
  const VALID = ['探索中', '已定案', '已使用', '已作废'];
  let wanted = flags['--state'] || null;
  if (wanted) {
    wanted = VALID.includes(wanted) ? wanted : null;
    if (!wanted) {
      console.log(`❌ 未识别的探索状态「${flags['--state']}」；可用：${VALID.join(' / ')}`);
      return 1;
    }
  }
  let recs = plan.listExplorations(docRoot);
  if (wanted) recs = recs.filter(r => r.state === wanted);
  const rows = recs.map(r => ({
    subject: r.subject,
    state: r.state,
    outcome: r.outcome,
    supersededBy: r.supersededBy,
    archived: r.archived,
    path: path.relative(root, r.path),
  }));
  if (json) {
    console.log(JSON.stringify({ experimental: true, count: rows.length, explorations: rows }, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log(wanted ? `没有状态为「${wanted}」的探索记录。` : '没有探索记录。');
    console.log('提示：`/module-explore {主题} 落盘` 产出首份探索记录；已定案待吸收 → /module-plan {模块名} 立项，或 /module-doc 并入能力契约。');
    return 0;
  }
  const head = ['探索记录（日期-主题）', '状态', '结论去向 / 已被', '位置'];
  const data = rows.map(r => {
    const dest = r.state === '已作废' && r.supersededBy ? `已被 ${r.supersededBy}` : (r.outcome || '—');
    return [r.subject, r.state, dest, r.archived ? '已归档' : '进行中'];
  });
  renderTable(head, data);
  const active = rows.filter(r => !r.archived).length;
  console.log(`\n共 ${rows.length} 份探索记录（进行中 ${active} / 已归档 ${rows.length - active}）。`);
  const next = rows.find(r => !r.archived && r.state === '探索中')
    || rows.find(r => !r.archived && r.state === '已定案');
  if (next) {
    console.log(next.state === '探索中'
      ? `Next: /module-explore ${next.subject}（继续探索）`
      : `Next: ${next.subject} 已定案待吸收 → /module-plan {模块名} 立项，或 /module-doc 并入能力契约（消费后记录转「已使用」归档）`);
  }
  return 0;
}

module.exports = { list, listExplore };
