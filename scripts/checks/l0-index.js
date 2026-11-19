'use strict';
/** check 阶段 2.45：L0 一致性（总契约 §4 ↔ 模块目录 ↔ §5 依赖全景图）。
 *
 *  为什么需要这个阶段：§4 是 skill 路由表（「有哪些模块」的唯一事实源），但此前没有任何
 *  机器校验它和 `模块/` 目录、§5 全景图是否对得上。后果是**静默失效**——§4 漏登记一行，
 *  这个模块就永不路由、永不计划、永不审查，而且不报错（doc-sync 只按已登记的模块工作）。
 *
 *  判级原则（设计文档 §6.3「L0 一致性」）：**静默失败硬、显性失败软**——
 *    001 模块有契约但 §4 无行（下游永远发现不了）→ ❌ 一条聚合；
 *    002 §4 有行但契约缺失（读者当场撞空）→ ⚠️ 逐条。
 *
 *  模块约定：ctx 只读（docRoot/docLabel/listDir 按需）；返回 { issues, notes }，
 *  由 commands/check.js 按阶段顺序汇总（不共享可变数组）。解析器降级不崩溃。
 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 阶段 2.45：L0 一致性。 */
function stageL0Index(ctx, registry) {
  const { docRoot, docLabel, listDir } = ctx;
  const issues = [];
  const notes = [];

  // 总契约缺失/不可读 → 静默返回：skeleton 已报「缺少文件」，这里再报就是重复刷屏。
  const idx = plan.parseModuleIndex(docRoot);
  if (idx === null) return { issues, notes };
  if (idx.degraded) {
    notes.push(`ℹ️ 总契约 §4「模块索引表」解析为空（节名或表格结构异常）：${docLabel}/${plan.NAMES.zh.rootContract}——L0 一致性核对跳过`);
    return { issues, notes };
  }

  const modulesDir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  // 目录缺失由 skeleton 硬报；此处不走 listDir（它会把 ENOENT 记成「不可读」再报一条 IO ❌）。
  if (!fs.existsSync(modulesDir)) return { issues, notes };
  const dirs = listDir(modulesDir) || [];
  const contractDirs = dirs.filter(d => {
    try {
      return fs.statSync(path.join(modulesDir, d)).isDirectory()
        && fs.existsSync(path.join(modulesDir, d, plan.NAMES.zh.moduleContract));
    } catch { return false; }
  });

  // 001：模块目录有契约、§4 无对应行 → 模块不可路由（静默失败，硬报且聚合，避免 45 个模块 45 条）。
  const covered = new Set();
  for (const r of idx.rows) {
    if (r.folderKind === 'no-contract') continue; // 不建档不是模块，不要求有目录/契约行
    covered.add(r.name);
    covered.add(r.dirName); // 目录名与模块名允许不同（§4「模块文件夹」列是权威路径）
  }
  const unrouted = contractDirs.filter(d => !covered.has(d));
  if (unrouted.length) {
    const head = unrouted.slice(0, 5).join('、');
    issues.push(`❌ 模块有契约但总契约 §4 未登记（模块将不可路由）：${head}${unrouted.length > 5 ? ' 等' : ''}（共 ${unrouted.length} 个）`);
  }

  // 002：§4 登记为建档模块、契约文件缺失 → 索引指向空气（显性失败，逐条 ⚠️）。
  for (const r of idx.rows) {
    if (r.folderKind !== 'module') continue; // —（不建档）/（子域，契约归宿主模块）豁免
    const contractPath = path.join(modulesDir, r.dirName, plan.NAMES.zh.moduleContract);
    if (!fs.existsSync(contractPath)) {
      issues.push(`⚠️ 总契约 §4 登记了模块但契约不存在：${r.name} → ${docLabel}/${plan.NAMES.zh.dirs.modules}/${r.dirName}/${plan.NAMES.zh.moduleContract}`);
    }
  }

  // 003：§4 依赖边在 §5 图里缺失（派生视图漂移）。只比「§4 有、§5 无」单向：
  // mermaid 写法自由度高，反向比对必然假红；解析不出节点/边时 parseModuleGraph 已 degraded，整条跳过。
  const graph = plan.parseModuleGraph(docRoot);
  if (!graph.degraded) {
    const edges = new Set(graph.edges.map(e => `${e.from}→${e.to}`));
    const missing = [];
    for (const r of idx.rows) {
      for (const d of r.deps) {
        if (!edges.has(`${r.name}→${d}`)) missing.push(`${r.name}→${d}`);
      }
    }
    if (missing.length) {
      notes.push(`ℹ️ 总契约 §5 全景图缺 ${missing.length} 条 §4 依赖边：${missing.slice(0, 3).join('、')}${missing.length > 3 ? ' 等' : ''}——依赖先改 §4 再重绘 §5`);
    }
  }

  // 004：§4「主责服务」未在档案登记。只核这一列（单值、可精确匹配）；
  // 「各应用落点」列虽是 `app: 路径; …` 格式，但本轮不核（避免把自由写法误判成应用标识）。
  if (registry && registry.length) {
    const ids = new Set(registry.map(a => a.id));
    for (const r of idx.rows) {
      for (const app of r.primary) {
        if (!ids.has(app)) notes.push(`ℹ️ 总契约 §4「主责服务」未在档案应用清单登记：${r.name} → ${app}`);
      }
    }
  } else {
    notes.push('ℹ️ 档案无「应用清单」，总契约 §4「主责服务」核对跳过');
  }

  return { issues, notes };
}

module.exports = { stageL0Index };
