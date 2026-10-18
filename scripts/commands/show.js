'use strict';
/** show 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const { parseArgs, resolvePlanArg } = require('../lib/util');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');

/**
 * `doc-framework show <计划路径>`：单份计划的结构化视图（只读，归档计划需路径直达）。
 *
 * 输出是"给 AI 与人和解用的"：状态/形态/依据/语义增量与合并状态/表态（附应用是否已登记）/
 * 推导出的白名单/变更文件清单/任务进度/接口兼容性声明。`--json` 是机器消费接口，
 * 带 `experimental: true` 字段（格式可能变，见设计文档 §6.5）。
 *
 * 与 check 的分工：check 判"有没有问题"，show 只**呈现事实**，不做合规判定。
 *
 * @returns {number} 0 = 输出成功；1 = 缺参数 / 路径不存在或不是文件 / 计划无法解析
 */
function show(argv) {
  const { flags, positionals, missingValue, unknownFlags } = parseArgs(argv, ['--root'], ['--json']);
  if (unknownFlags.length) {
    console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework show <计划路径> [--json] [--root <项目根>]）`);
    return 1;
  }
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework show <计划路径> [--root <项目根>] [--json]）`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const arg = positionals[0];
  if (!arg) {
    console.log('用法：doc-framework show <计划路径> [--json]');
    return 1;
  }
  const planPath = resolvePlanArg(root, arg);
  if (!planPath) return 1;
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  let p;
  try {
    p = plan.parsePlan(root, planPath);
  } catch (e) {
    console.log(`❌ 计划无法解析：${arg}（${e.message}）`);
    return 1;
  }
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
    crossModule: p.crossModule,
    state: p.state,
    shape: p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : null,
    hasShapeLine: !!p.hasShapeLine,
    contracts: p.contracts,
    contractRefs: p.contractRefs,
    firstBuild: !!p.isFirstBuild,
    evidence: p.evidence,
    delta: p.delta,
    mergeState: p.mergeState,
    hasModelingNotes: !!p.modelingNotes,
    stances,
    whitelist,
    fileList: [...p.fileList],
    tasks: p.tasks,
    compat: p.compat,
  };

  if (flags['--json']) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`计划：${p.rel}`);
  console.log(`模块：${p.module}${p.archived ? '（已归档）' : ''}｜状态：${p.state || '未知'}｜形态：${p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : '未标注'}`);
  if (p.contracts.length) console.log(`依据契约：${p.contracts.join('、')}`);
  if (p.contractRefs.length && p.contractRefs.length !== p.contracts.length) {
    console.log(`依据（含未建档模块的计划）：${p.contractRefs.join('、')}`);
  }
  if (p.isFirstBuild) {
    console.log(`计划类型：首次建模（待实现模块）｜依据探索记录：${p.evidence.sentinel ? '无（自述，人工降级）' : (p.evidence.path || '（缺失）')}｜建模补充：${p.modelingNotes ? '有' : '（缺失）'}`);
  }
  if (p.delta && p.delta.hasSection) {
    console.log(`语义增量：${p.delta.total} 项（新增 ${p.delta.added.length} / 修改 ${p.delta.modified.length} / 删除 ${p.delta.removed.length}）｜合并状态：${p.mergeState || '（缺标记）'}`);
    if (p.delta.skipped) console.log(`⚠️ 另有 ${p.delta.skipped} 行含未渲染占位符「{{…}}」被跳过（未计入增量）`);
  }
  if (p.compat) console.log(`接口兼容性：${p.compat}`);

  console.log('\n逐应用表态（白名单来源）：');
  if (!stances.length) console.log('  （未解析到表态表——旧格式计划或模板被本地定制）');
  for (const s of stances) {
    console.log(`  ${s.app}  ${s.stance}${s.registered ? '' : '  ⚠️ 未登记在应用清单'}`);
  }
  if (whitelist.length) console.log(`  允许改动路径：${whitelist.join('  ')}`);

  console.log(`\n变更文件清单（${p.fileList.size} 项）${p.fileList.size ? '：' : ''}`);
  for (const f of p.fileList) console.log(`  ${f}`);

  console.log(`\n任务进度：${p.tasks.total ? `${p.tasks.done}/${p.tasks.total}` : '（无勾选任务）'}`
    + (p.tasks.humanRows.length ? `｜人工步骤 ${p.tasks.humanRows.length}（只登记、不打勾、不阻塞「已完成」）` : ''));
  if (p.tasks.open.length) console.log(`  未完成：${p.tasks.open.join(', ')}`);
  if (p.tasks.humanRows.length) {
    console.log(`  人工步骤（登记行）：${p.tasks.humanRows.map(h => h.text).join('、')}`);
  }
  if (p.tasks.misplacedHuman.length) {
    console.log(`  ⚠️ 勾选行带人工标记（应改成登记行）：${p.tasks.misplacedHuman.join(', ')}`);
  }

  if (p.archived) {
    console.log('\n（已归档：不再参与在途清单，如需重做请新建计划）');
  } else if (p.state === '已完成' && p.delta && p.delta.nonEmpty && p.mergeState !== '已合并') {
    console.log(`\nNext: /module-doc ${p.module}${p.isFirstBuild ? '（合并增量的 create 分支：建档 + 回写总契约）' : '（合并增量 → 翻 已合并）'}`);
  } else if (p.state === '已批准' || p.state === '实施中') {
    console.log(`\nNext: doc-framework diff-check ${p.rel}`);
  } else if (p.state === '已完成') {
    // 增量已落账（前面那个分支已放行）⇒ 剩下的只是时机：归档是独立动作，由人决定
    // 一律用路径形式：跨模块计划没有「模块名」形式可用；已归档计划无需再提示归档
    console.log(`\nNext: /module-plan ${p.rel} 归档`);
  }
  return 0;
}

module.exports = { show };
