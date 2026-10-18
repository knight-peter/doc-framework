'use strict';
/** check 阶段 4：占位符残留。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/listDirEnts/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 阶段 4：占位符残留（扫描文档根下所有 .md；豁免：探索/ 允许保留开放标记）。 */
function stagePlaceholders(ctx) {
  const { root, docRoot, readText, listDirEnts } = ctx;
  const issues = [];
  const notes = [];
  // 4. 占位符残留（扫描文档根下所有 .md；豁免：探索/ 是单次决策记录，允许保留 {待验证} 之类开放标记）
  if (fs.existsSync(docRoot)) {
    const mdFiles = [];
    const exploreDir = path.join(docRoot, plan.NAMES.zh.dirs.explore);
    (function walk(dir) {
      // 目录不可读也要记入 unreadable（否则整棵子树被静默跳过，check 可能假绿）
      for (const ent of listDirEnts(dir)) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (p === exploreDir) continue;
          walk(p);
        } else if (ent.name.endsWith('.md')) mdFiles.push(p);
      }
    })(docRoot);
    for (const f of mdFiles) {
      // 读不出的 .md 同样记入 unreadable；不再 catch 后静默 continue
      const content = readText(f);
      if (content === null) continue;
      const unique = plan.findPlaceholders(content);
      if (unique.length) {
      // 只列前几个：未渲染 token 可能很多（模板里的示例文案也用花括号），一行全量输出会刷屏到看不见别的问题。
      // 这是**硬问题**（进退出码）——模板渲染纪律见 templates/接入指南.md.tpl「渲染纪律」。
          const head = unique.slice(0, 3).join(' ');
          issues.push(`⚠️ 占位符未渲染（${unique.length} 个）：${path.relative(root, f)} → ${head}`
            + `${unique.length > 3 ? ' …（其余同类略）' : ''}`
            + '｜改法：替换为项目实际值，或删除该示例行/片段（示例文案也用花括号，见《接入指南.md》渲染纪律）');
      }
    }
  }

  return { issues, notes };
}

module.exports = { stagePlaceholders };
