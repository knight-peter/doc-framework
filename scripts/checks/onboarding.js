'use strict';
/** check 阶段 5：引导残留。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');

/** 阶段 5：引导残留（接入指南/骨架 README/AGENTS.md 接入引导段初始化后应清理）。 */
function stageOnboarding(ctx) {
  const { root, docRoot, docLabel, readText } = ctx;
  const issues = [];
  const notes = [];
  // 5. 引导残留
  if (fs.existsSync(path.join(root, '接入指南.md'))) {
    issues.push(`⚠️ 未清理：项目根/接入指南.md（初始化完成后应删除）`);
  }
  const skeletonReadme = path.join(docRoot, 'README.md');
  const skeletonText = fs.existsSync(skeletonReadme) ? readText(skeletonReadme) : null;
  if (skeletonText && skeletonText.includes('待初始化')) {
    issues.push(`⚠️ 未清理：${docLabel}/README.md（安装预置的骨架引导文件，初始化完成后应删除）`);
  }
  const agentsPath = path.join(root, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    // 永久段是每个会话加载框架规则的唯一入口；缺失不会让 check 失败（可能项目不用 DSH），但必须提示
    notes.push('ℹ️ 未找到 AGENTS.md：doc-framework 永久段缺失（新会话不会自动加载框架规则；按模板补）');
  } else {
    const content = readText(agentsPath);
    if (content) {
      if (content.includes('接入引导段') && content.includes('移除')) {
        issues.push(`⚠️ 未清理：AGENTS.md 仍包含接入引导段（初始化完成后应移除）`);
      }
      const hasBegin = content.includes('CONTRACT-FRAMEWORK-BEGIN');
      const hasEnd = content.includes('CONTRACT-FRAMEWORK-END');
      const hasCore = content.includes('语义先于代码') && content.includes('记录后于代码');
      if (!hasBegin || !hasEnd) {
        notes.push('ℹ️ AGENTS.md 缺永久段标记（CONTRACT-FRAMEWORK-BEGIN/END）——框架规则可能不会被加载；按 templates/AGENTS.md.tpl 人工对齐');
      } else if (!hasCore) {
        notes.push('ℹ️ AGENTS.md 永久段缺少核心纪律（语义先于代码 / 记录后于代码）——按 templates/AGENTS.md.tpl 人工对齐');
      }
    }
  }

  return { issues, notes };
}

module.exports = { stageOnboarding };
