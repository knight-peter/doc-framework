'use strict';
/** check 阶段 2.4：契约健康（§5 落点存在性 + 落点应用登记）。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；
 *  返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。
 *
 *  为什么需要这个阶段：I1 是「契约 ⊆ 代码事实」，但它的机器化此前只有 doc-sync 的
 *  “基线之后有没有代码提交”——那是**时间**判据，不是**存在性**判据。§5 落点写了一个
 *  不存在的路径时，doc-sync 把它当 pathspec 匹配不到任何文件，检查静默失效。
 *  这里只做低成本事实核对（不读源码）：路径存在、且在登记应用的代码根内。
 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 阶段 2.4：逐模块契约 §5 落点核对。 */
function stageContractHealth(ctx, registry) {
  const { root, docRoot, listDir, readText, strict } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg) => (strict ? issues.push(`⚠️ ${msg}`) : notes.push(`ℹ️ ${msg}`));
  const modulesDir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  if (!fs.existsSync(modulesDir)) return { issues, notes };
  if (!registry) {
    // 缺应用清单时无法把 §5 的应用标识映射到代码根；registry 阶段已经硬报，这里不再重复刷屏。
    notes.push('ℹ️ 档案无「应用清单」，契约 §5 落点核对跳过（注册表是代码根的唯一来源）');
    return { issues, notes };
  }
  const appOf = id => registry.find(a => a.id === id) || null;
  // 用于识别“§5 把落点写到了另一个应用”的情形；最长前缀优先，与 matchApp 口径一致。
  const appRoots = registry.filter(a => a.root !== '.').sort((a, b) => b.root.length - a.root.length);
  for (const mod of listDir(modulesDir)) {
    const contractPath = path.join(modulesDir, mod, plan.NAMES.zh.moduleContract);
    if (!fs.existsSync(contractPath)) continue;
    // 先探可读性：parseContractScope 读失败会返回 null，会把“读不出”伪装成“没有 §5”。
    if (readText(contractPath) === null) continue;
    const scope = plan.parseContractScope(docRoot, mod);
    if (!scope) continue;
    const rel = path.relative(root, scope.contractPath);
    if (!scope.apps.length) {
      notes.push(`ℹ️ 契约 §5「应用落点」为空或未解析到：${rel}（直改通道将无法使用；可先 /module-doc 补全）`);
    }
    if (scope.paths.length && !scope.pairs.length) {
      notes.push(`ℹ️ 契约 §5 有「文件位置」但没有应用列，无法校验落点归属：${rel}`);
    }
    for (const pair of scope.pairs) {
      const app = appOf(pair.app);
      if (!app) {
        notes.push(`ℹ️ 契约 §5 落点应用未在档案应用清单登记：${mod} → ${pair.app}（路径 ${pair.path} 已跳过）`);
        continue;
      }
      // §5 路径两种写法都见过：应用根相对（views/order/...）与仓库根相对（services/order/src/...）。
      // 已以本应用根开头则原样用；否则若明确以**另一个**应用根开头，也按仓库根相对处理
      // （这样“登记到了别的应用”会被下面的归属判据抓住，而不是被拼到本应用根下假装存在）。
      const raw = pair.path;
      const otherApp = appRoots.find(a => a.id !== app.id
        && (raw === a.root || raw.startsWith(`${a.root}/`)));
      const repoRel = app.root === '.' || raw === app.root || raw.startsWith(`${app.root}/`) || otherApp
        ? raw
        : path.posix.join(app.root, raw);
      const abs = path.join(root, repoRel);
      // 归属判据：路径必须在本应用代码根内。放到别的应用根下 → 直改边界会失真，即使文件存在也要报。
      if (app.root !== '.' && repoRel !== app.root && !repoRel.startsWith(`${app.root}/`)) {
        report(`契约 §5 落点路径不在应用代码根内：${rel} → 应用「${app.id}」 ${repoRel}（应用根 ${app.root}）`);
        continue;
      }
      if (!fs.existsSync(abs)) {
        report(`契约 §5 落点路径不存在：${rel} → 应用「${app.id}」 ${repoRel}`
          + '（文档与代码可能已漂移；确认后修正 §5，或补登记缺失实现）');
      }
    }
  }
  return { issues, notes };
}

module.exports = { stageContractHealth };
