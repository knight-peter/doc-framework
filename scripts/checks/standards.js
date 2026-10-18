'use strict';
/** check 阶段 2.5：规范层归属判据。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 判据 c 的忽略集：模板自带的结构节标题（每个应用规范都有），不算"跨应用共享主题"。 */
/** 阶段 2.5：规范层归属判据。
 *  a 变更痕迹（`规范/` 与 `边界/` 全部 .md）/ c 跨应用同题 / d 小节越界 / e 索引↔分册一致；
 *  b（代码清单密度）阈值待真实语料校准，暂不启用。
 *  级别：默认 ℹ️ 不进退出码；`--strict` 升 ⚠️；e 的"索引指向不存在的分册"是断链类缺陷，恒 ⚠️ 进退出码。
 *  扫描范围纪律：**只扫 `规范/` 与 `边界/`**——计划（不属规范层，且正文按"最新方案"就地改写）、探索记录（头部日期合法）、
 *  测试报告（文件名含日期）一律不扫。 */
const STD_SECTION_MAX_LINES = 80;  // 判据 d 单节行数（ui §3.6=120、zlb-h5 §3.4=164 命中；server §3=6 不命中）
const STD_SECTION_MAX_COUNT = 8;   // 判据 d 小节数（zjppm-h5=10 命中）
const STD_TRACE_RES = [
  // 标题版本标记：`### 3.7 …（v1.1 新增；v1.19 补…）`——变更沿革漏进目录的最糟形态
  { re: /^#{1,6}\s.*[（(]v\d+(?:\.\d+)+/m, label: '章节标题含版本标记' },
  // 正文「日期+动词」：`（2026-10-09 修正，来源=实现）`；两条反误报：裸日期不报（「自 X 起生效」合法）、
  // `YYYY-MM-DD-*.md` 文件引用不报（负向断言排除）
  { re: /[（(]\d{4}-\d{2}-\d{2}(?![^（）()]*\.md)[^（）()]*?(?:修正|新增|补充|改写|作废|废弃|实现)/, label: '正文含日期痕迹' },
  // 「来源=」必须是旧 §9 的枚举值（需求/代码/实现/合并）——模板「四不写」说明里的 `来源=/` 不算
  { re: /来源\s*[:：=]\s*(?:需求|代码|实现|合并|requirement|code|implementation|merge)/i, label: '正文含「来源=」标记' },
  { re: /已作废|已废弃/, label: '正文含作废/废弃标记' },
];
const STD_TITLE_IGNORE = new Set(['技术主题索引']);
function stageStandards(ctx, registry) {
  const { docRoot, readText, listDir, strict } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg) => strict ? issues.push(`⚠️ ${msg}`) : notes.push(`ℹ️ ${msg}`);
  // ── 判据 a：变更痕迹（规范/ 与 边界/ 下全部 .md）──
  const standardsDir = path.join(docRoot, plan.NAMES.zh.dirs.standards);
  const boundariesDir = path.join(docRoot, plan.NAMES.zh.dirs.boundaries);
  const traceFiles = [];
  for (const dir of [standardsDir, boundariesDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of listDir(dir)) {
      if (!f.endsWith('.md')) continue;
      const text = readText(path.join(dir, f));
      if (text === null) continue;
      const hits = STD_TRACE_RES.filter(t => t.re.test(text)).map(t => t.label);
      if (hits.length) traceFiles.push(`${path.basename(dir)}/${f}（${hits.join('、')}）`);
    }
  }
  if (traceFiles.length) {
    report(`规范层疑似变更痕迹（应归 git；正文只留现行约定与"禁止 X"红线——留结论、删来历）：${traceFiles.slice(0, 5).join('、')}${traceFiles.length > 5 ? ' 等' : ''}`);
  }
  // ── 判据 c / d / e：应用规范（registry 登记的应用）──
  const titleOwners = new Map(); // 归一化小节标题 → Set(应用标识)
  const themeOwners = new Map(); // 分册主题（文件名）→ Set(应用标识)
  for (const app of registry || []) {
    if (!app.spec) continue;
    const topics = plan.appSpecTopicFiles(docRoot, app.id);
    for (const tf of topics) {
      const theme = tf.slice(app.id.length + 1, -3);
      if (theme) {
        if (!themeOwners.has(theme)) themeOwners.set(theme, new Set());
        themeOwners.get(theme).add(app.id);
      }
    }
    const specPath = path.join(docRoot, app.spec);
    const text = fs.existsSync(specPath) ? readText(specPath) : null;
    if (text === null) {
      if (topics.length) report(`应用「${app.id}」有 ${topics.length} 份主题分册但应用规范缺失/不可读：${topics.join('、')}（索引一致性无法校验）`);
      continue;
    }
    // d：小节越界
    const sections = text.split(/^(?=### )/m).slice(1);
    if (sections.length > STD_SECTION_MAX_COUNT) {
      report(`应用规范 ${app.spec} 有 ${sections.length} 个 ### 小节（>${STD_SECTION_MAX_COUNT}）——建议拆主题分册（规范/${app.id}-{主题}.md）`);
    }
    for (const sec of sections) {
      const title = ((sec.match(/^###\s+(.+)$/m) || [])[1] || '').trim();
      const rows = sec.split('\n').length;
      if (rows > STD_SECTION_MAX_LINES) {
        report(`应用规范 ${app.spec} 的「${title}」已 ${rows} 行（>${STD_SECTION_MAX_LINES}）——该主题可独立成分册 规范/${app.id}-{主题}.md`);
      }
    }
    // c：小节标题归一后跨应用重复（分册主题同理，在循环外统一报）；模板结构节不计
    for (const t of plan.appSpecSectionTitles(text)) {
      if (STD_TITLE_IGNORE.has(t.norm)) continue;
      if (!titleOwners.has(t.norm)) titleOwners.set(t.norm, new Set());
      titleOwners.get(t.norm).add(app.id);
    }
    // e：§3 主题索引 ↔ 分册文件集合（索引有机器校验才不会腐坏）
    const indexed = new Set();
    for (const m of text.matchAll(/`([^`\n]+\.md)`/g)) {
      const base = m[1].trim().split('/').pop();
      if (base.includes('{')) continue; // 未渲染占位（渲染 fixture 的单括号记法允许保留）
      if (base.startsWith(`${app.id}-`)) indexed.add(base);
    }
    for (const tf of topics) {
      if (!indexed.has(tf)) report(`应用「${app.id}」的主题分册未被应用规范 §3 主题索引收录：规范/${tf}（索引 ↔ 分册 必须一致）`);
    }
    for (const ref of indexed) {
      if (!topics.includes(ref)) issues.push(`⚠️ 应用规范 ${app.spec} §3 主题索引指向不存在的分册：规范/${ref}（修复索引或补建分册）`);
    }
  }
  for (const [norm, owners] of titleOwners) {
    if (owners.size >= 2) report(`疑似跨应用共享主题「${norm}」（出现在 ${[...owners].join('、')} 的应用规范）——考虑上移 边界/{能力}边界.md`);
  }
  for (const [theme, owners] of themeOwners) {
    if (owners.size >= 2) report(`疑似跨应用共享主题分册（主题=${theme}，出现在 ${[...owners].join('、')}）——考虑上移 边界/{能力}边界.md`);
  }
  return { issues, notes };
}

module.exports = { stageStandards };
