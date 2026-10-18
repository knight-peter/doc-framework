'use strict';
/**
 * doc-framework CLI 的**命令层共享工具**（无判据、无业务语义）。
 *
 * 边界纪律（决定一个函数该放哪）：
 *   - 解析文档内容 / 命名 / 路径知识 → `lib/plan.js`（唯一解析层，见其文件头）
 *   - 命令之间共享的纯工具（参数解析、表格对齐、计划路径归一） → 本文件
 *   - 校验判据（什么算 ❌ / ℹ️） → `checks/*.js`，**不进本文件**
 *
 * 本文件不得 require `commands/` 或 `checks/`（依赖方向单向：commands → checks → lib）。
 */

const fs = require('fs');
const path = require('path');

// ── 计划路径参数 ─────────────────────────────────────────────

/** 解析计划路径参数（绝对路径直用，相对路径拼仓库根）；不存在或不是文件时打印统一文案并返回 null。 */
function resolvePlanArg(root, arg) {
  const p = path.isAbsolute(arg) ? arg : path.join(root, arg);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    console.log(`❌ 计划文件不存在或不是文件：${arg}`);
    return null;
  }
  return p;
}

// ── 参数解析 ─────────────────────────────────────────────────

/** 解析 argv → {flags, positionals, missingValue, unknownFlags}。
 *  - valueFlags：需要取值的选项名；其取值不会挤占位置参数。
 *  - allowedFlags：合法选项白名单（布尔项；valueFlags 自动并入）。传了白名单时，
 *    未声明的 `--xxx` 进 unknownFlags，由命令报用法错误——避免 `--modul` 这类笔误被静默忽略。
 *    不传白名单保持旧行为（只用于不关心选项的测试/工具）。
 */
function parseArgs(argv, valueFlags = [], allowedFlags = null) {
  const flags = {};
  const positionals = [];
  const missingValue = [];
  const unknownFlags = [];
  const allowed = allowedFlags ? new Set([...valueFlags, ...allowedFlags]) : null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (allowed && !allowed.has(a)) { unknownFlags.push(a); continue; }
      if (valueFlags.includes(a)) {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) { flags[a] = null; missingValue.push(a); }
        else { flags[a] = v; i++; }
      } else {
        flags[a] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals, missingValue, unknownFlags };
}

// ── 文本表格渲染（list / show 的对齐）────────────────────────

/**
 * 字符串显示宽度：CJK / 全角字符按 2 列算，其余按 1 列。
 * 只用于 list/show 的文本表格对齐（不涉及文档内容解析，估宽不必精确）。
 */
function strWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}

/** 右侧补空格到 `width` 显示列宽（`s` 已超宽时不截断，`Math.max(0,…)` 防负数 repeat）。 */
function pad(s, width) {
  return String(s) + ' '.repeat(Math.max(0, width - strWidth(s)));
}

/** 文本表格渲染（strWidth/pad 对齐）：head 为表头数组，data 为行数组的数组。 */
function renderTable(head, data) {
  const widths = head.map((h, i) => Math.max(strWidth(h), ...data.map(r => strWidth(r[i]))));
  const line = cells => cells.map((c, i) => pad(c, widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const r of data) console.log(line(r));
}

module.exports = { resolvePlanArg, parseArgs, strWidth, pad, renderTable };
