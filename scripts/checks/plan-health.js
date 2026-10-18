'use strict';
/** check 阶段 3：计划体检（在途计划；归档兜底在尾部）。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。
 *
 *  本文件内部结构（**编排 + 7 个纯判据子函数**；子函数各自返回 { issues, notes }，由 stagePlanHealth 按
 *  原来 push 的先后顺序 collect——拆函数不得改变任何输出行的先后）：
 *    checkShape          轻量形态必备项 / 轻量不得带非空增量
 *    checkContractModel  首次建模分档与依据校验 / 存量契约引用 / 存量软判据
 *    checkMergeState     I2 合并状态 / 建档兜底 / 合并状态行提示 / 占位跳过 / 完整形态增量节
 *    checkOwnership      表态应用归属（清单文件落在哪个应用） / SQL 执行环境
 *    checkTasks          任务清单两类行（勾选行 = AI 任务 / 登记行 = 人工步骤）
 *    checkLedger         I3 同模块多份无主增量
 *    checkArchivedPlans  I2 归档兜底
 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 阶段 3：计划体检（编排：解析在途计划 → 逐份跑子判据 → 全量 I3 与归档兜底）。
 *  @returns {{issues: string[], notes: string[]}} */
function stagePlanHealth(ctx, registry) {
  const { root, docRoot, docLabel } = ctx;
  const issues = [];
  const notes = [];
  const collect = (r) => { issues.push(...r.issues); notes.push(...r.notes); return r; };
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
      const docExempt = (file) => plan.isDocPath(docLabel, file);
    for (const p of plans) {
        if (p.state === '已废弃') {
        // 终态：不再体检。但 I4 的「废弃出口」要提示——增量的出口只有两个（合并 / 废弃），
        // 废弃计划归档前应把 `合并状态` 标成 `无需合并`，否则它永远挂在"待合并"（回归 14.x 钉着）
          if (p.delta.nonEmpty && p.mergeState !== '无需合并') {
            notes.push(`ℹ️ 已废弃计划建议把「合并状态」标为 无需合并（废弃是增量的第二条出口）：${p.rel}`);
          }
          continue;
        }
        if (!p.state) {
          issues.push(`❌ 计划缺状态字段：${p.rel}`);
          continue;
        }
      collect(checkShape(p));
      const proxy = plan.moduleImplementationProxy(root, p, docRoot);
      collect(checkContractModel(ctx, p, proxy));
      collect(checkMergeState(p, proxy));
      collect(checkOwnership(p, registry, docExempt));
      collect(checkTasks(p));
    }
    collect(checkLedger(plans));
    collect(checkArchivedPlans(ctx));
  }

  return { issues, notes };
}

/** 判据：轻量形态必备项（表态 + 变更文件清单）+ 轻量不得承载非空语义增量。
 *  @returns {{issues: string[], notes: string[]}} */
function checkShape(p) {
  const issues = [];
  const notes = [];
  // 轻量计划（小改动通道）：表态 + 变更文件清单是它的全部价值（= /module-code 白名单），缺一不可
  if (p.shape === 'light') {
    if (!Object.keys(p.stances).length) {
      issues.push(`❌ 轻量计划缺「逐应用表态」表（表态即边界，不能省）：${p.rel}`);
          }
    if (!p.fileList.size) {
      issues.push(`❌ 轻量计划缺「变更文件清单」（白名单不能空）：${p.rel}`);
          }
        }

  // ── 契约模型校验：首次建模判定式 = 无「依据模块契约」∧ 有「依据探索记录」（不新增字段）──
        const isLight = p.shape === 'light';
  // 轻量计划不承载语义：带**非空**增量说明形态判错（空节/纯实现说明不算）
  if (isLight && p.delta.nonEmpty) {
    issues.push(`❌ 轻量计划不得含非空「语义增量」（触语义应升级为完整计划）：${p.rel}`);
        }
  return { issues, notes };
}

/** 首次建模分档与依据校验；存量契约引用；存量软判据。
 *  判定式：无「依据模块契约」∧ 有「依据探索记录」（不新增字段）。 */
function checkContractModel(ctx, p, proxy) {
  const issues = [];
  const notes = [];
  const { root, docRoot } = ctx;
  const contractPath = proxy.contractPath;   // 复用代理判据里的结果，避免同一份计划查两次契约
  if (p.isFirstBuild) {
  // 形态约束：首次建模必须「完整」+ 增量节 + 建模补充节（轻量会产出零信息建档）。
  // `shape=null`（缺 `> 计划形态：` 行或取值认不出）同样不算完整——否则这一条会被静默绕过
    if (p.shape !== 'full') {
      issues.push(`❌ 首次建模计划必须是「完整」形态（当前：${p.shape === 'light' ? '轻量' : '未标注'}；轻量不承载语义）：${p.rel}`);
          }
    if (!p.delta.hasSection) {
      issues.push(`❌ 首次建模计划缺「语义增量」节（建档的唯一语义来源）：${p.rel}`);
          }
    if (!p.modelingNotes) {
      issues.push(`❌ 首次建模计划缺「建模补充」节（契约 §2.1 / §8.2 的来源）：${p.rel}`);
          }
    // 图的唯一落点是 §1.3：首建建档要从 §1.3 取状态机/页面结构图——没图 ⇒ 契约 §3.2 / §5 将无图来源。
    // ℹ️ 不拦：无状态机也无页面的模块是合法情形。
    if (!p.ideaHasDiagram) {
      notes.push(`ℹ️ 首次建模计划的 §1.3 无 mermaid 图——建档时契约 §3.2 状态机 / §5 页面结构将无图来源（本模块确实无状态机/页面时可忽略）：${p.rel}`);
          }
    // 合法性（全状态）：契约已存在却标首次建模 → 走存量路径
    // 豁免：本计划就是它的首次建模载体，且已落账（合并状态=已合并）→ 这是正常完成态，不能报错
    if (contractPath && p.mergeState !== '已合并') {
      issues.push(`❌ 首次建模计划但该模块契约已存在（应走存量路径：计划增量 + M 更新）：${p.rel}`);
          }
    // 合法性（仅未进入实施时硬报错）：清单文件已全部存在 → 疑似存量模块（代理判据，设计文档 §7.5）
    if (!contractPath && proxy.allExist && ['待审核', '修订中', '已批准'].includes(p.state)) {
      issues.push(`❌ 首次建模计划但「变更文件清单」中的文件已全部存在（疑似存量模块）：${p.rel}`);
          }
    // 依据校验：空 → ❌；哨兵（人工降级）→ ℹ️；路径不存在 → ❌
    if (!p.evidence.raw) {
      issues.push(`❌ 首次建模计划缺「依据探索记录」（先 /module-explore；人工降级才写 无（自述））：${p.rel}`);
          } else if (p.evidence.sentinel) {
      notes.push(`ℹ️ 首次建模计划无探索记录（自述需求，人工降级）：${p.rel}`);
          } else if (!plan.contractRefExists(root, docRoot, p.evidence.path)) {
      issues.push(`❌ 「依据探索记录」路径不存在：${p.evidence.path}（${p.rel}）`);
          }
        } else if (p.shape === 'full' && p.delta.hasSection) {
  // 存量完整计划（含增量节）必须引用已存在的契约或首次建模计划路径。
    if (!p.contractRefs.length) {
      issues.push(`❌ 计划缺「依据模块契约」（存量计划必须引用契约；待实现模块请改填「依据探索记录」）：${p.rel}`);
          } else {
      const missing = p.contractRefs.filter(r => !plan.contractRefExists(root, docRoot, r));
      if (missing.length) {
        issues.push(`❌ 「依据模块契约」指向的文件不存在：${missing.join('、')}（${p.rel}）`);
            }
          }
        } else if (!p.contractRefs.length && !p.evidence.raw) {
  // 既无契约引用、也无探索记录 → 计划没有约束来源（模板必填其一），硬报错
    issues.push(`❌ 计划缺「依据模块契约」（存量模块必须引用契约）且无「依据探索记录」（待实现模块必填）：${p.rel}`);
        }

  // 设计文档 §7.5 软判据：清单文件 ≥50% 已存在 → 疑似存量模块（提示人工确认，不硬拦）
  if (p.isFirstBuild && !contractPath && !proxy.allExist && proxy.mostlyExist) {
    notes.push(`ℹ️ 首次建模计划的清单文件已有 ${proxy.existingCount}/${proxy.fileCount} 存在（疑似存量模块，请确认）：${p.rel}`);
        }
  return { issues, notes };
}

/** I2 / 建档兜底 / 合并状态行 / 占位跳过 / 完整形态增量节。 */
function checkMergeState(p, proxy) {
  const issues = [];
  const notes = [];
  const contractPath = proxy.contractPath;   // 建档兜底与「实施窗口期」都要看代理判据的结果
  const isLight = p.shape === 'light';
  // I2：状态「已完成」∧ 增量非空 ∧ 合并状态≠已合并 → 不得通过（建档兜底见下）
  if (p.state === '已完成') {
    if (p.delta.nonEmpty && p.mergeState !== '已合并') {
      const why = p.delta.mergeRaw && !p.mergeState
        ? `合并状态值无法识别「${p.delta.mergeRaw}」（应为 待合并 / 已合并 / 无需合并）`
        : `合并状态=${p.mergeState || '缺失'}`;
      issues.push(`❌ 计划「已完成」但语义增量未合并（${why}）：${p.rel}（由 /module-doc 合并后翻标记）`);
          }
    if (!p.delta.nonEmpty && p.delta.hasSection && p.mergeState === '待合并') {
      notes.push(`ℹ️ 空增量的计划应把「合并状态」标为 无需合并：${p.rel}`);
          }
    // 建档兜底：首次建模计划「已完成」却还没建档。要求**增量非空**——空增量的首次建模计划
    // 本身已由上面的 I2 报出根因，这里再报一次只是重复；标「已合并」却找不到契约同样不放过
    // （否则落账与否完全靠标记自证，`list --orphans` 也看不见）
    if (p.isFirstBuild && !contractPath && p.delta.nonEmpty) {
      if (p.mergeState === '待合并') {
        issues.push(`❌ 待实现模块已实施但未建档（契约缺失）：${p.rel}（跑 /module-doc 建档）`);
            } else if (p.mergeState === '已合并') {
        issues.push(`❌ 计划标「合并状态=已合并」但模块契约不存在（落账无据）：${p.rel}（跑 /module-doc 的 create 分支建档）`);
            }
          }
        }
  if (p.state === '实施中' && p.isFirstBuild && !contractPath && proxy.existingCount > 0) {
    notes.push(`ℹ️ 待实现模块已落代码、契约待建档（实施窗口期）：${p.rel}`);
        }
  if (p.delta.hasSection && !p.delta.hasMergeLine) {
    notes.push(`ℹ️ 「语义增量」节缺「合并状态」行（I2 无法校验）：${p.rel}`);
        } else if (p.delta.hasMergeLine && p.delta.mergeRaw && !p.delta.mergeState) {
    notes.push(`ℹ️ 「合并状态」值无法识别「${p.delta.mergeRaw}」（应为 待合并 / 已合并 / 无需合并）：${p.rel}`);
        }
  // 被跳过的未渲染占位行必须显式报出：双花括号是「待填字段」（渲染后不得残留），且丢行会让
  // 增量计数偏少——极端情况下 delta.nonEmpty 变 false，I2 硬校验被静默绕过。硬报错。
  if (p.delta.skipped) {
    issues.push(`❌ 「语义增量」有 ${p.delta.skipped} 行含未渲染占位符「{{…}}」被跳过（增量计数偏少，I2 可能误判）：`
      + `${p.rel}（渲染模板后重跑；合法内容请用单花括号记法）`);
        }
  if (!isLight && !p.delta.hasSection) {
  // 完整形态必有「语义增量」节（纯实现改动写"无（纯实现改动）"）——缺节 = 模板渲染不完整
    issues.push(`❌ 完整形态计划缺「语义增量」节（该项不存在于模板之外；纯实现改动应写"无（纯实现改动）"并标 \`无需合并\`）：${p.rel}`);
        }
  return { issues, notes };
}

/** 表态应用归属（清单文件落在哪个应用）+ SQL 执行环境。 */
function checkOwnership(p, registry, docExempt) {
  const issues = [];
  const notes = [];
  if (registry) {
    const stanceApps = Object.keys(p.stances);
    if (!stanceApps.length && p.shape !== 'light') {
      issues.push(`❌ 计划缺「逐应用表态」表（完整形态必备；漏表态 = 漏改）：${p.rel}`);
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

  // SQL 执行环境：**只有「含生产」的行才该登记契约 §10**（生产发布要人工再执行一遍）；
  // 缺标注时无法判断 ⇒「仅开发」的造数/修数脚本会被误登进 §10。ℹ️ 级（存量计划的旧三列表格只提示、不拦）。
  for (const [sqlFile, env] of p.sqlEnv) {
    if (!env) {
      notes.push(`ℹ️ SQL 行缺「执行环境」标注（生产+开发 / 仅开发），无法判断是否该登契约 §10：${sqlFile}（${p.rel}）`);
          }
        }
  return { issues, notes };
}

/** 任务清单两类行：勾选行 = AI 任务（阻塞已完成）/ 登记行 = 人工步骤（只登记）。 */
function checkTasks(p) {
  const issues = [];
  const notes = [];
  // 任务门槛：**带勾选框的行 = AI 可执行可验证的任务**——只有它们计入进度、未勾选才阻塞「已完成」。
  // 人工/平台侧步骤写成**不带勾选框**的登记行（`- 5.2 【人工·生产】重新部署后端`）：只显示、不阻塞。
  // 登记行不承担跨文档索引职责：生产待执行 SQL 的长期家是计划 §3 的 `生产+开发` 标注 + 契约 §10。
  // 向后兼容：v2.9.0 的 `- [ ] 【人工·…】` 仍是勾选行 ⇒ 行为与改前完全一致（未勾选照旧阻塞），只多一条 ℹ️。
  const tk = p.tasks;
  if (tk.total > 0 && p.state === '已完成' && tk.open.length) {
    issues.push(`❌ 计划状态「已完成」但存在未勾选任务 ${tk.open.join(', ')}：${p.rel}`);
        }
  if (p.state === '已完成' && tk.humanRows.length) {
    notes.push(`ℹ️ 计划「已完成」，另有 ${tk.humanRows.length} 项人工步骤（只登记、不打勾，不阻塞归档）：`
      + `${tk.humanRows.map(h => h.text).join('、')}：${p.rel}`);
        }
  if (p.state === '实施中' && tk.total > 0 && tk.done === tk.total) {
    notes.push(`ℹ️ 任务已全部勾选${tk.humanRows.length ? `（另有 ${tk.humanRows.length} 项人工步骤）` : ''}`
      + `但状态仍是「实施中」，可登记「已完成」：${p.rel}`);
        }
  if (tk.misplacedHuman.length) {
    notes.push(`ℹ️ 勾选框只留给 AI 可执行的任务：${tk.misplacedHuman.join(', ')} 带人工标记（【人工·…】），`
      + `请去掉方括号改成登记行（或确认它其实是 AI 任务）：${p.rel}`);
        }
  return { issues, notes };
}

/** I3：同模块 ≥2 份未回指主计划的非空增量。 */
function checkLedger(plans) {
  const issues = [];
  const notes = [];
// I3：同一模块下 ≥2 份「主计划」列为空的非空增量计划 → 硬报错（拆分计划应在该列回指主计划）。
// 注意：**已合并但尚未归档**的计划仍计入——同模块同一时刻只允许一份"无主的非空增量"，
// 换新计划前请先 `/module-plan {模块名} 归档`，或在「主计划」列回指（回归 13.3 就钉着这条）
const leadByModule = {};
for (const p of plans) {
  if (p.state === '已废弃' || !p.delta.nonEmpty || p.crossModule) continue;
  const rows = [...p.delta.added, ...p.delta.modified, ...p.delta.removed];
  if (rows.every(r => !r.leadPlan)) (leadByModule[p.module] = leadByModule[p.module] || []).push(p.rel);
      }
for (const [mod, list] of Object.entries(leadByModule)) {
  if (list.length > 1) {
    issues.push(`❌ 同一模块存在多份未回指主计划的语义增量计划（I3）：${mod} → ${list.join('、')}`);
        }
      }
  return { issues, notes };
}

/** I2 归档兜底：先 git mv 进 归档/ 不得绕过唯一的机器硬校验。 */
function checkArchivedPlans(ctx) {
  const issues = [];
  const notes = [];
  const { root, docRoot } = ctx;
// I2 归档兜底：归档计划不参与常规体检，否则"先 git mv 进 归档/"就能绕过唯一的机器硬校验
for (const ap of plan.collectArchivedPlans(docRoot)) {
  let apPlan = null;
  try { apPlan = plan.parsePlan(root, ap); } catch { continue; }
  if (apPlan.state !== '已完成' || !apPlan.delta.nonEmpty || apPlan.mergeState === '已合并') continue;
  const why = apPlan.delta.mergeRaw && !apPlan.mergeState
    ? `值无法识别「${apPlan.delta.mergeRaw}」` : `合并状态=${apPlan.mergeState || '缺失'}`;
  issues.push(`❌ 归档计划「已完成」但语义增量未合并（${why}）：${apPlan.rel}（先由 /module-doc 落账再归档）`);
      }
  return { issues, notes };
}

module.exports = { stagePlanHealth };
