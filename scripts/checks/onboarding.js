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
  if (fs.existsSync(agentsPath)) {
    const content = readText(agentsPath);
    if (content && content.includes('接入引导段') && content.includes('移除')) {
      issues.push(`⚠️ 未清理：AGENTS.md 仍包含接入引导段（初始化完成后应移除）`);
    }
  }

  return { issues, notes };
}

module.exports = { stageOnboarding };
