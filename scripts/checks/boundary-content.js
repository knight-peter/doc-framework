'use strict';
/** check 阶段 2.7：边界文档健康（§6 验收归属、无 SC、无端实现、体量）。
 *  新边界（带 `<!-- boundary-schema: 2 -->`）硬判；存量边界只 ℹ️（迁移提示）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

function stageBoundaryContent(ctx) {
  const { docRoot } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg, hard) => {
    if (hard) issues.push(`❌ ${msg}`);
    else notes.push(`ℹ️ ${msg}`); // 存量边界 grandfather：strict 也不升级
  };
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.boundaries);
  if (!fs.existsSync(dir)) return { issues, notes };
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return { issues, notes }; }
  for (const f of files) {
    const file = path.join(dir, f);
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const rel = path.relative(path.dirname(docRoot), file);
    const isNew = /<!--\s*boundary-schema:\s*2\b/.test(text);
    const size = Buffer.byteLength(text, 'utf8');
    if (size > 20 * 1024) report(`边界文档 ${(size / 1024).toFixed(1)}KB >20KB：${rel}——边界只放共享规则/失败模式/验收归属`, isNew);
    if (/^#{2,4}\s*6\.\s*验收场景/m.test(text) || /^####\s+Scenario:/m.test(text)) {
      report(`边界出现 §6 验收场景/#### Scenario：${rel}——改为 §6 验收归属指针，不写 SC`, isNew);
    }
    if (/^####\s+Scenario:\s*SC-/m.test(text) || /^\|\s*SC-[^|]+\|/m.test(text)) {
      report(`边界出现 SC 表/正文：${rel}——边界不拥有 SC；无主责能力用平台能力模块契约`, isNew);
    }
    if (/^##\s+7\.\s*关联代码/m.test(text) && /^##\s+8\./m.test(text)) {
      report(`边界章节数异常（§7 关联代码后又出现 §8）：${rel}`, false);
    }
  }
  return { issues, notes };
}

module.exports = { stageBoundaryContent };
