'use strict';
/** check 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const { parseArgs, resolvePlanArg } = require('../lib/util');
const { stageSkeleton } = require('../checks/skeleton');
const { stageRegistry } = require('../checks/registry');
const { stageContractHealth } = require('../checks/contract-health');
const { stageContractContent } = require('../checks/contract-content');
const { stageBoundaryContent } = require('../checks/boundary-content');
const { stageStandards } = require('../checks/standards');
const { stagePlanHealth } = require('../checks/plan-health');
const { stageDocSync } = require('../checks/doc-sync');
const { stagePlaceholders } = require('../checks/placeholders');
const { stageOnboarding } = require('../checks/onboarding');
const rules = require('../checks/rules');
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');

/**
 * `doc-framework check`：文档体系完整性校验（本 CLI 的核心）。
 *
 * 子模式：`check --draft-contract <计划路径>` 只读打印「增量条目 → 目标契约章节」清单
 * （供 /module-doc 合并时当 checklist），走完即 return，不进入下面的全量校验。
 *
 * 结果分两级（**这是本函数的输出契约**）：
 *   - `issues` —— 硬问题，退出码 1。判定口径见 docs/设计文档.md §6.3；
 *   - `notes`  —— 提示项，退出码仍为 0（例如"哨兵缺失/建议精简"这类不该拦住用户的信息）。
 * 两级都会打印，`✅/❌` 汇总行按 `issues` 是否为空决定。
 *
 * 稳健性要求：**解析器降级不崩溃**（设计文档 §7.5）。不可读路径不抛栈，而是记进 `unreadable`
 * 并统一报一条 ❌——否则中途一个异常会丢掉**已经收集到的全部问题**，表现为"改了权限反而全绿"。
 *
 * @param {string[]} argv 命令参数（`check` 之后的那些）
 * @returns {number} 0 = 通过（可能带提示项）；1 = 有硬问题
 */
function check(argv = []) {
  const { flags, missingValue, unknownFlags } = parseArgs(argv, ['--root', '--draft-contract'], ['--strict', '--json', '--rules']);
  if (unknownFlags.length) {
    console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework check [--strict] [--json] [--rules] [--root <项目根>]）`);
    return 1;
  }
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework check [--strict] [--json] [--rules] [--root <项目根>]）`);
    return 1;
  }
  if (flags['--json'] && flags['--draft-contract']) {
    console.log('❌ --json 与 --draft-contract 不能同时使用（前者是全量校验的机器接口，后者是人工建档清单）');
    return 1;
  }
  // `check --rules` 不需要项目（打印规则目录）；`--json` 输出可序列化清单
  if (flags['--rules']) return printRules(!!flags['--json']);
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  // --strict：提示类判据（文档落后、规范层归属、契约 §5 落点）由 ℹ️ 升为 ⚠️ 进退出码（PR / pre-push 最终门禁用）
  const strict = !!flags['--strict'];
  // 读取失败不抛栈（体系纪律"解析器降级不崩溃"）：EACCES / EISDIR / ENOENT 也是输入。
  // 裸调 fs 会吐 Node 栈，而且**已收集的 issues 全部丢失**（真正的问题反而看不见）——
  // 那正是"改了权限就报不出问题"的假绿来源，所以读取失败一律降级为"不可读"。
  //
  // 探针（readText/listDir/unreadable）是**只读输入 + 访问日志**，随 ctx 传给各阶段；
  // 问题清单（issues/notes）**不走 ctx**——每个阶段各自返回，由 auditPlan 按阶段顺序汇总，
  // 这样"漏解构一个字段"不会再变成静默的 ReferenceError（历史缺陷，见 selftest 类目 26）。
  const unreadable = [];
  const readText = (file) => {
    try { return fs.readFileSync(file, 'utf-8'); }
    catch (e) { unreadable.push(`${path.relative(root, file)}（${e.code || e.message}）`); return null; }
  };
  const listDir = (dir) => {
    try { return fs.readdirSync(dir); }
    catch (e) { unreadable.push(`${path.relative(root, dir)}/（${e.code || e.message}）`); return []; }
  };
  // 需要区分目录 / 文件的递归（占位符扫描）：用 Dirent 版本，读取失败同样记入 unreadable。
  const listDirEnts = (dir) => {
    try { return fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { unreadable.push(`${path.relative(root, dir)}/（${e.code || e.message}）`); return []; }
  };

  // check --draft-contract <计划路径>：只读输出建档清单（供 AI 当 checklist，不写文件）
  if (flags['--draft-contract']) return draftContractReport(root, flags['--draft-contract']);
  // 0. 前置：当前目录是否已接入（框架仓库自身或未初始化项目给清晰提示，而不是一串缺文件）
  if (!fs.existsSync(docRoot)) {
    const message = '❌ 未找到文档根 doc-framework/。';
    if (flags['--json']) return printJsonError(root, docRoot);
    console.log(message);
    console.log('   请在已接入 doc-framework 的项目根目录运行，或先对 AI 说"初始化项目"。');
    return 1;
  }

  const audit = auditPlan({ root, docRoot, docLabel, unreadable, readText, listDir, listDirEnts, strict });
  const { issues, notes } = audit;
  if (flags['--json']) return printJson(root, docRoot, audit);

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

/** `check --rules`：打印规则目录（默认文本；`--json` 输出可序列化清单）。 */
function printRules(json) {
  const list = rules.describeRules();
  if (json) {
    console.log(JSON.stringify({ rules: list }, null, 2));
    return 0;
  }
  console.log('规则码\t阶段\t默认级别\t摘要');
  for (const r of list) console.log(`${r.id}\t${r.stage}\t${r.level}\t${r.summary}`);
  return 0;
}

/** `check --json` 的前置失败（无文档根）：保持与成功输出同形的字段，CI 不需要特判。 */
function printJsonError(root, docRoot) {
  const message = '❌ 未找到文档根 doc-framework/。';
  console.log(JSON.stringify({
    ok: false,
    version: env.VERSION,
    docRoot: path.relative(root, docRoot) || docRoot,
    counts: { error: 1, warn: 0, note: 0 },
    issues: [{ stage: 'pre', level: 'error', rule: 'DF-PRE-001', summary: '未找到文档根', message }],
    notes: [],
  }, null, 2));
  return 1;
}

/** `check --json`：机器可读输出（规则码 + 分级 + 消息），退出码仍由硬问题决定。 */
function printJson(root, docRoot, audit) {
  const entries = audit.entries || [];
  const counts = { error: 0, warn: 0, note: 0 };
  for (const e of entries) counts[e.level] = (counts[e.level] || 0) + 1;
  const issues = entries.filter(e => e.level !== 'note');
  const notes = entries.filter(e => e.level === 'note');
  const out = {
    ok: audit.issues.length === 0,
    version: env.VERSION,
    docRoot: path.relative(root, docRoot) || docRoot,
    counts,
    issues,
    notes,
  };
  console.log(JSON.stringify(out, null, 2));
  return audit.issues.length ? 1 : 0;
}

/** check --draft-contract <计划路径>：只读输出「增量条目 → 契约章节」建档清单（供 AI 当 checklist，不写文件）。 */
function draftContractReport(root, arg) {
  if (!arg) { console.log('用法：doc-framework check --draft-contract <计划路径>'); return 1; }
  const dp = resolvePlanArg(root, arg);
  if (!dp) return 1;
  let pp;
  try { pp = plan.parsePlan(root, dp); } catch (e) { console.log(`❌ 计划无法解析：${e.message}`); return 1; }
  // 目标位置可能写成"契约 §3.1 …"（中）或"contract §3.1 …"（英），两种都识别。
  // ★ 「总契约 §N」必须**先判**：`(契约|contract)\s*§\d` 是不加锚点的子串匹配，
  //   "总契约 §4 模块索引表" 会被它命中并误判成**模块契约** §4（模块索引表/应用拓扑都是总契约的章）。
  // ★ 章节号 → 展示名取自 plan.CONTRACT_CHAPTERS（§2.4 映射表的机器侧单一来源）。
  //   改这一处即可覆盖全十章（§1–§10）；新增章节的同步纪律见设计文档 §4.2。
  const chapterOf = t => {
    const s = String(t || '');
    if (/总契约|root contract/i.test(s)) return '总契约（§3 应用拓扑 / §4 模块索引表（含依赖列）/ §5 依赖全景图）';
    if (/(接口|api)\.md|api-guide/i.test(s)) return '接口.md';
    if (/contract\.md/i.test(s)) return '总契约';
    // 容忍「契约.md §4」这种写法人：去掉 `.md` 再匹配章节号（人写目标位置时常带文件名）。
    const noMd = s.replace(/\.md\b/gi, '');
    const m = noMd.match(/(?:契约|contract)\s*§\s*(\d+)/i);
    return m && plan.CONTRACT_CHAPTERS[Number(m[1])] ? plan.CONTRACT_CHAPTERS[Number(m[1])] : '（未识别 → 人工定位）';
  };
  console.log(`[draft-contract] ${pp.rel}`);
  console.log(`模块：${pp.module}｜状态：${pp.state || '未知'}${pp.isFirstBuild ? '｜首次建模计划（合并增量的 create 分支）' : ''}`);
  console.log(`合并状态：${pp.mergeState || '（缺标记）'}｜增量 ${pp.delta.total} 项（新增 ${pp.delta.added.length} / 修改 ${pp.delta.modified.length} / 删除 ${pp.delta.removed.length}）`);
  if (pp.delta.skipped) {
    console.log(`⚠️ 另有 ${pp.delta.skipped} 行未计入增量：含未渲染占位符「{{…}}」被跳过——`
      + '渲染模板后重跑；若是合法内容误用了双花括号，改成单花括号记法（如 `{penaltyId}`）。');
  }
  console.log(`建模补充：${pp.modelingNotes ? '有（M1–M2）' : '缺——create 分支建档会丢依赖与验收场景，先补计划'}`);
  const rows = [
    ...pp.delta.added.map(r => ['ADDED', r]),
    ...pp.delta.modified.map(r => ['MODIFIED', r]),
    ...pp.delta.removed.map(r => ['REMOVED', r]),
  ];
  console.log('\n增量条目 → 目标章节：');
  if (!rows.length) console.log('  （无增量条目：纯实现改动 → 合并状态应为「无需合并」）');
  for (const [kind, r] of rows) {
    const detailTxt = r.detail ? `：${r.detail}` : '';
    const ownTxt = r.ownership ? `｜归属=${r.ownership}` : '｜归属=未声明（合并前人工判定）';
    console.log(`  ${r.id} ${kind} → ${chapterOf(r.target || '')}${ownTxt}｜${r.object || ''}${detailTxt}${r.leadPlan ? `（拆分计划，主计划=${r.leadPlan}）` : ''}`);
  }
  console.log('\n合并/建档九步：① 确认门 ② 读五类输入 ③ 渲染骨架 ④ 按 §2.4 映射表填契约 §2/§3/§4/§5/§8'
    + ' ⑤ 以代码校正（偏离写提交信息，不写契约） ⑥ 填导航区 ⑦ 归属判定（跨应用约定 → 边界/{能力}边界.md） ⑧ 生成 接口.md'
    + ' ⑨ 回写总契约三处 → 翻「已合并」→ 自检 check + /module-review');
  return 0;
}

/** check 主体审计（阶段 1-8）。**阶段调用顺序即 issues/notes 的汇总顺序、即输出顺序**：
 *  每阶段的 push 只发生在其函数体内的原位置——拆分/搬运不得改变任何输出行的先后。
 *
 *  形状约定：每个阶段返回 `{ issues, notes }`（`stageRegistry` 另带 `registry`），
 *  **不接受共享可变数组**——ctx 只承载只读输入与访问日志（root/docRoot/docLabel/strict/readText/listDir/listDirEnts/unreadable）。
 *
 *  `entries` 是给 `check --json` 的结构化视图：每条 {stage, level, rule, summary, message}；
 *  文本输出仍用 issues/notes（保持历史输出逐字不变）。
 *
 *  @returns {{issues: string[], notes: string[], entries: Array<Object>}} */
function auditPlan(ctx) {
  const issues = [];
  const notes = [];
  const entries = [];
  const collect = (stage, r) => {
    for (const m of r.issues) {
      const hit = rules.ruleFor(stage, m);
      issues.push(m);
      entries.push({ stage, level: rules.levelOf(m), rule: hit.id, summary: hit.summary, message: m });
    }
    for (const m of r.notes) {
      const hit = rules.ruleFor(stage, m);
      notes.push(m);
      entries.push({ stage, level: rules.levelOf(m), rule: hit.id, summary: hit.summary, message: m });
    }
    return r;
  };

  collect('skeleton', stageSkeleton(ctx));
  const registry = collect('registry', stageRegistry(ctx)).registry;
  collect('contract-health', stageContractHealth(ctx, registry));
  collect('contract-content', stageContractContent(ctx, registry));
  collect('boundary-content', stageBoundaryContent(ctx, registry));
  collect('standards', stageStandards(ctx, registry));
  collect('plan-health', stagePlanHealth(ctx, registry));
  collect('doc-sync', stageDocSync(ctx, registry));
  collect('placeholders', stagePlaceholders(ctx));
  collect('onboarding', stageOnboarding(ctx));
  // 读取失败的路径统一报一条（否则用户只看到"某几项没报错"，不知道为什么）
  if (ctx.unreadable.length) {
    // 同一路径可能被多个阶段探到（skeleton / registry / placeholders / doc-sync）：去重后只报一次
    const uniq = [...new Set(ctx.unreadable)];
    const msg = `❌ 以下路径无法读取，相关校验已跳过（权限/路径类型问题）：${uniq.join('、')}`;
    issues.push(msg);
    entries.push({ stage: 'unreadable', level: 'error', rule: 'DF-IO-001', summary: '路径无法读取', message: msg });
  }
  return { issues, notes, entries };
}

module.exports = { check, draftContractReport, auditPlan };
