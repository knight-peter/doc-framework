'use strict';
/** check 阶段 1：骨架完整性 + 结构版本哨兵（R4）。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');
const install = require('../install');

/** 阶段 1：骨架完整性（命名映射唯一来源 plan.NAMES.zh）+ 结构版本哨兵（R4）。 */
function stageSkeleton(ctx) {
  const { root, docRoot, docLabel } = ctx;
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

  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少文件：${docLabel}/${f}`);
  }
  for (const d of requiredDirs) {
    if (!fs.existsSync(path.join(docRoot, d))) issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
  }

  // 1.1 结构版本哨兵（R4）：比较"文档结构版本"与框架版本。
  //     ⚠️（进退出码）仅用于**哨兵存在且落后**——文档明确声明了它属于旧结构、却已跑在新框架上；
  //     未标记（无哨兵的旧文档）只给一条汇总 ℹ️：体系纪律是"文档资产永不回灌、结构变更由人手工执行"，
  //     不能用门禁逼用户改写文档（设计文档 §5.4）。只比 major.minor，避免补丁版本刷屏。
  {
    const FW = install.VERSION;
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
    const probe = (abs, label) => {
      let found = null;
      try { found = plan.parseDocstructVersion(fs.readFileSync(abs, 'utf-8')); } catch { return; }
      if (!found) return;
      marked++;
      // 占位哨兵（`{{框架版本}}` 未被渲染）：只说明"这是模板产物"，无从比较版本 → 不判落后
      if (!found.placeholder && behind(found.version)) stale.push(`${label}（${found.version}）`);
    };
    for (const rel of requiredFiles) {
      const abs = path.join(docRoot, rel);
      if (!fs.existsSync(abs)) continue;
      probe(abs, `${docLabel}/${rel}`);
    }
    const stalePlans = [];
    for (const ap of plan.collectPlanPaths(docRoot)) {
      let found = null;
      try { found = plan.parseDocstructVersion(fs.readFileSync(ap, 'utf-8')); } catch { continue; }
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
