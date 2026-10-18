'use strict';
/** check 阶段 1：骨架完整性 + 结构版本哨兵（R4）。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');
const env = require('../lib/env');

/** 阶段 1：骨架完整性（命名映射唯一来源 plan.NAMES.zh）+ 结构版本哨兵（R4）。 */
function stageSkeleton(ctx) {
  const { root, docRoot, docLabel, readText, listDir } = ctx;
  const issues = [];
  const notes = [];
  // 1. 骨架完整性（命名映射唯一来源：plan.js 的 NAMES.zh）
  const N = {
    profile: plan.NAMES.zh.profile,
    contract: plan.NAMES.zh.rootContract,
    testSpec: plan.NAMES.zh.testingGuide,
    apiSpec: plan.NAMES.zh.apiGuide,
    dirs: [plan.NAMES.zh.dirs.modules, plan.NAMES.zh.dirs.boundaries, plan.NAMES.zh.dirs.standards, plan.NAMES.zh.dirs.plans],
  };
  const requiredFiles = [N.profile, N.contract, N.testSpec, N.apiSpec];
  const requiredDirs = N.dirs;

  // 必需文件：**存在性之外还要可读**。只 existsSync 会把 EACCES / EISDIR 当成"文件在、没问题"，
  // 后续各阶段又各自 catch 掉，最终表现为 check 全绿（假绿）。统一走 ctx.readText 记入 unreadable。
  const fileContents = new Map();
  for (const f of requiredFiles) {
    const abs = path.join(docRoot, f);
    if (!fs.existsSync(abs)) {
      issues.push(`❌ 缺少文件：${docLabel}/${f}`);
      continue;
    }
    const content = readText(abs);
    if (content !== null) fileContents.set(f, content);
  }
  // 必需目录同理：readdir 失败（权限 / 路径类型）要报出来，而不是安静返回空目录
  for (const d of requiredDirs) {
    const abs = path.join(docRoot, d);
    if (!fs.existsSync(abs)) {
      issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
      continue;
    }
    listDir(abs);
  }

  // 1.1 结构版本哨兵（R4）：比较"文档结构版本"与框架版本。
  //     ⚠️（进退出码）仅用于**哨兵存在且落后**——文档明确声明了它属于旧结构、却已跑在新框架上；
  //     未标记（无哨兵的旧文档）只给一条汇总 ℹ️：体系纪律是"文档资产永不回灌、结构变更由人手工执行"，
  //     不能用门禁逼用户改写文档（设计文档 §5.4）。只比 major.minor，避免补丁版本刷屏。
  {
    const FW = env.VERSION;
    const parseVer = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const behind = (docV) => {
      const [dMa, dMi] = parseVer(docV);
      const [fMa, fMi] = parseVer(FW);
      return dMa < fMa || (dMa === fMa && dMi < fMi);
    };
    // 哨兵覆盖面 = 四份全局文档 + **每一份在途计划**（计划模板自带哨兵，渲染后随计划落到项目里）。
    // 归档计划不查：它们是历史，哨兵本就该停在当年版本（归档计划也不参与枚举）。
    const stale = [];
    let marked = 0;
    const probe = (content, label) => {
      const found = plan.parseDocstructVersion(content);
      if (!found) return;
      marked++;
      // 占位哨兵（`{{框架版本}}` 未被渲染）：只说明"这是模板产物"，无从比较版本 → 不判落后
      if (!found.placeholder && behind(found.version)) stale.push(`${label}（${found.version}）`);
    };
    for (const rel of requiredFiles) {
      const content = fileContents.get(rel);
      if (content == null) continue;
      probe(content, `${docLabel}/${rel}`);
    }
    const stalePlans = [];
    for (const ap of plan.collectPlanPaths(docRoot)) {
      // 计划文件读取失败：交给 plan-health 报「计划无法解析」；这里只跳过哨兵，不重复报。
      const content = readText(ap);
      if (content === null) continue;
      const found = plan.parseDocstructVersion(content);
      if (!found) continue;
      marked++;
      if (!found.placeholder && behind(found.version)) stalePlans.push(`${path.relative(root, ap)}（${found.version}）`);
    }
    if (stalePlans.length) {
    // 计划可能很多：只列前 2 份，其余计数，避免一行刷屏
      stale.push(`${stalePlans.length} 份在途计划的哨兵落后（如 ${stalePlans.slice(0, 2).join('、')}）`);
    }
    if (stale.length) {
      issues.push(`⚠️ 文档结构版本落后于框架（框架 v${FW}）：${stale.join('、')}`
        + ` → 按框架仓库 docs/设计文档.md §9.3 逐项人工对齐（框架不会自动改写你的文档）`);
    } else if (marked === 0) {
    notes.push(`ℹ️ 未标记「文档结构版本」（不影响使用）；如需对齐见框架仓库 docs/设计文档.md §9.3`);
    }
  }

  return { issues, notes };
}

module.exports = { stageSkeleton };
