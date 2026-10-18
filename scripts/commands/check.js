'use strict';
/** check 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const { resolvePlanArg } = require('../lib/util');
const { stageSkeleton } = require('../checks/skeleton');
const { stageRegistry } = require('../checks/registry');
const { stageStandards } = require('../checks/standards');
const { stagePlanHealth } = require('../checks/plan-health');
const { stageDocSync } = require('../checks/doc-sync');
const { stagePlaceholders } = require('../checks/placeholders');
const { stageOnboarding } = require('../checks/onboarding');
const fs = require('fs');
const path = require('path');
const install = require('../install');
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
  const root = install.PROJECT_ROOT;
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  // --strict：提示类判据（文档落后、规范层归属）由 ℹ️ 升为 ⚠️ 进退出码（PR / pre-push 最终门禁用）
  const strict = argv.includes('--strict');
  const restArgv = argv.filter(a => a !== '--strict');
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
  if (restArgv[0] === '--draft-contract') return draftContractReport(root, restArgv[1]);
  // 0. 前置：当前目录是否已接入（框架仓库自身或未初始化项目给清晰提示，而不是一串缺文件）
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根 doc-framework/。');
    console.log('   请在已接入 doc-framework 的项目根目录运行，或先对 AI 说"初始化项目"。');
    return 1;
  }

  const { issues, notes } = auditPlan({ root, docRoot, docLabel, unreadable, readText, listDir, listDirEnts, strict });

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
    if (/总契约|root contract/i.test(s)) return '总契约（§3 应用拓扑 / §4 模块索引表 / §5 依赖矩阵之一）';
    if (/(接口|api)\.md|api-guide/i.test(s)) return '接口.md';
    if (/contract\.md/i.test(s)) return '总契约';
    const m = s.match(/(?:契约|contract)\s*§\s*(\d+)/i);
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
    console.log(`  ${r.id} ${kind} → ${chapterOf(r.target || '')}｜${r.object || ''}${detailTxt}${r.leadPlan ? `（拆分计划，主计划=${r.leadPlan}）` : ''}`);
  }
  console.log('\n合并/建档九步：① 确认门 ② 读五类输入 ③ 渲染骨架 ④ 按 §2.4 映射表填契约 §2/§3/§4/§5/§8'
    + ' ⑤ 以代码校正（偏离写提交信息，不写契约） ⑥ 填导航区 ⑦ 归属判定（跨应用约定 → 边界/{能力}边界.md） ⑧ 生成 接口.md'
    + ' ⑨ 回写总契约三处 → 翻「已合并」→ 自检 check + /module-review');
  return 0;
}

/** check 主体审计（阶段 1-6）。**阶段调用顺序即 issues/notes 的汇总顺序、即输出顺序**：
 *  每阶段的 push 只发生在其函数体内的原位置——拆分/搬运不得改变任何输出行的先后。
 *
 *  形状约定：每个阶段返回 `{ issues, notes }`（`stageRegistry` 另带 `registry`），
 *  **不接受共享可变数组**——ctx 只承载只读输入与访问日志（root/docRoot/docLabel/strict/readText/listDir/unreadable）。
 *
 *  @returns {{issues: string[], notes: string[]}} */
function auditPlan(ctx) {
  const issues = [];
  const notes = [];
  const collect = (r) => { issues.push(...r.issues); notes.push(...r.notes); return r; };

  collect(stageSkeleton(ctx));
  const registry = collect(stageRegistry(ctx)).registry;
  collect(stageStandards(ctx, registry));
  collect(stagePlanHealth(ctx, registry));
  collect(stageDocSync(ctx, registry));
  collect(stagePlaceholders(ctx));
  collect(stageOnboarding(ctx));
  // 读取失败的路径统一报一条（否则用户只看到"某几项没报错"，不知道为什么）
  if (ctx.unreadable.length) {
    // 同一路径可能被多个阶段探到（skeleton / registry / placeholders / doc-sync）：去重后只报一次
    const uniq = [...new Set(ctx.unreadable)];
    issues.push(`❌ 以下路径无法读取，相关校验已跳过（权限/路径类型问题）：${uniq.join('、')}`);
  }
  return { issues, notes };
}

module.exports = { check, draftContractReport, auditPlan };
