'use strict';
/** check 阶段 2.7：能力契约健康（§1 人读层、无验收归属、无 SC、§6 关联代码、体量）。
 *  只认 `<!-- capability-schema: 3 -->`：schema>=3 硬判/提示；无标记只 ℹ️（迁移提示）。
 *  旧目录 `边界/` 直接报错（4.1.0 起不兼容），迁移由 `migrate v6` 完成。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

const LEGACY_DIR = '边界';

function stageCapabilityContent(ctx) {
  const { docRoot } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg, hard) => {
    if (hard) issues.push(`❌ ${msg}`);
    else notes.push(`ℹ️ ${msg}`); // 存量 grandfather：strict 也不升级
  };
  const legacy = path.join(docRoot, LEGACY_DIR);
  if (fs.existsSync(legacy)) {
    issues.push(`❌ 旧目录 ${LEGACY_DIR}/ 已废弃：git mv ${LEGACY_DIR} ${plan.NAMES.zh.dirs.capabilities}（或跑 doc-framework migrate v6）`);
  }
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.capabilities);
  if (!fs.existsSync(dir)) return { issues, notes };
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return { issues, notes }; }
  for (const f of files) {
    const file = path.join(dir, f);
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const rel = path.relative(path.dirname(docRoot), file);
    const marker = /<!--\s*capability-schema:\s*(\d+)\b/.exec(text);
    const schema = marker ? Number(marker[1]) : 0;
    const isCurrent = schema >= 3;
    if (!isCurrent) {
      notes.push(`ℹ️ 能力契约未迁移（缺 capability-schema: 3）：${rel}——跑 doc-framework migrate v6`);
    }
    const size = Buffer.byteLength(text, 'utf8');
    if (size > 20 * 1024) {
      notes.push(`ℹ️ 能力契约 ${(size / 1024).toFixed(1)}KB >20KB：${rel}——能力契约只放人读层/共享规则/失败模式`);
    }
    if (/^##\s*\d+\.\s*验收/m.test(text)) {
      report(`能力契约出现验收归属/验收场景：${rel}——验收归主责模块 测试/验收.md（经契约 §8 指针）`, isCurrent);
    }
    if (/^####\s+Scenario:\s*SC-/m.test(text) || /^\|\s*SC-[^|]+\|/m.test(text)) {
      report(`能力契约出现 SC 表/正文：${rel}——能力契约不拥有 SC；无主责能力用平台能力模块契约`, isCurrent);
    }
    if (isCurrent) {
      if (/^##\s*7\./m.test(text)) {
        notes.push(`ℹ️ schema3 能力契约章节应为 §1–§6（发现 §7）：${rel}——§7 关联代码应改为 §6`);
      }
      if (!/^##\s*6\.\s*关联代码/m.test(text)) {
        notes.push(`ℹ️ 能力契约缺 §6 关联代码：${rel}——回链代码路径与职责`);
      }
      const s1 = /^##\s+1\.\s*[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
      if (!s1) {
        notes.push(`ℹ️ 能力契约缺 §1 能力说明：${rel}——补「是什么/为什么需要/不做什么/谁在用」`);
      } else {
        const body = s1[1];
        if (/^\|/m.test(body)) {
          notes.push(`ℹ️ 能力契约 §1 不应重复消费者表：${rel}——清单归 总契约 §7，本文件只留指针`);
        }
        const bytes = Buffer.byteLength(body, 'utf8');
        if (bytes > 800) {
          notes.push(`ℹ️ 能力契约 §1 人读层超 800B（${bytes}B）：${rel}——删例子/背景，不扩章`);
        }
        if (!/不做什么|不包含|排除/.test(body)) {
          notes.push(`ℹ️ 能力契约 §1 缺「不做什么」：${rel}——补排除项，防误用`);
        }
      }
    }
  }
  return { issues, notes };
}

module.exports = { stageCapabilityContent };
