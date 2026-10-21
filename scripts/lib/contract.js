'use strict';
/**
 * 契约内容解析（P3 `contract-content` 与 `audit` 共用）。
 *
 * 纪律：
 *   - 只读、不抛异常；解析失败返回空字段，由上层的 rules 决定级别；
 *   - 不依赖应用技术栈/代码，只读 Markdown 文本；
 *   - 兼容存量格式：10 章 / 旧结构（`## 7. 变更记录`、无编号 `## 应用落点`）/ §7 的 `### 7.x` 子节 / SC 表用数字或 `SC-*` 首列。
 */
const fs = require('fs');
const path = require('path');

const SECTION_TITLES = {
  1: ['模块定位', '业务定位'],
  2: ['边界约定', '依赖与数据流', '领域模型'],
  3: ['数据模型', '状态机'],
  4: ['接口概览', '接口约定', 'API 接口', 'API 约定'],
  5: ['应用落点'],
  6: ['标杆参考', '前端页面'],
  7: ['不变量与陷阱', '特殊约定与陷阱'],
  8: ['测试与验证'],
  9: ['变更记录'],
  10: ['生产环境 SQL 执行登记'],
};

/** 去掉代码围栏与行内代码，避免把示例/代码里的日期当历史痕迹。 */
function stripCode(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

/** 按 `## ` 切章节；`num` 可能为空（旧结构无编号）。 */
function splitSections(text) {
  const lines = String(text || '').split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    const m = line.match(/^##\s+(?:(\d+)\.\s+)?(.+?)\s*$/);
    if (m) heads.push({ num: m[1] ? Number(m[1]) : null, title: m[2].trim(), start: i });
  });
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : lines.length;
    return { ...h, end, text: lines.slice(h.start, end).join('\n'), bytes: Buffer.byteLength(lines.slice(h.start, end).join('\n'), 'utf8') };
  });
}

function titleMatches(title, num) {
  const pats = SECTION_TITLES[num] || [];
  return pats.some(p => String(title).includes(p));
}

/** 按章号或标题找章节；章号优先。 */
function findSection(sections, num, titlePatterns) {
  const byNum = sections.find(s => s.num === num);
  if (byNum) return byNum;
  const pats = titlePatterns || SECTION_TITLES[num] || [];
  return sections.find(s => pats.some(p => String(s.title).includes(p))) || null;
}

function headerText(text, sections) {
  const lines = String(text || '').split('\n');
  const first = sections.length ? Math.min(...sections.map(s => s.start)) : lines.length;
  return lines.slice(0, first).join('\n');
}

function tableRows(sectionText) {
  const rows = [];
  for (const line of String(sectionText || '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|[\s:|-]+\|?\s*$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (!cells.length || cells.every(c => !c)) continue;
    rows.push(cells);
  }
  return rows;
}

/** §7 的 INV/TRAP 表；无表时退化到编号条目（存量格式）。 */
function parseInvariants(section7) {
  if (!section7) return { invariants: [], traps: [], numbered: [], maxItemBytes: 0 };
  const rows = tableRows(section7.text);
  const invariants = [];
  const traps = [];
  for (const cells of rows) {
    const id = (cells[0] || '').trim();
    if (/^INV-/.test(id)) invariants.push({ id, rule: cells[1] || '', symptom: cells[2] || '', ref: cells[3] || '' });
    if (/^TRAP-/.test(id)) traps.push({ id, phenomenon: cells[1] || '', cause: cells[2] || '', avoid: cells[3] || '' });
  }
  // 存量：`1. **...**` 或 `### 7.x` 子节；只在**没有 INV/TRAP 表**时用于计数/体量，
  // 避免把整张 7.1 表（20 行）误算成“单条 5KB”。
  const numbered = [];
  const lines = section7.text.split('\n');
  const hasTable = invariants.length > 0 || traps.length > 0;
  if (!hasTable) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\d+\.\s+/.test(lines[i]) || /^###\s+7\.\d+/.test(lines[i])) numbered.push(i);
    }
  }
  let maxItemBytes = 0;
  if (!hasTable) {
    for (let k = 0; k < numbered.length; k++) {
      const start = numbered[k];
      const end = k + 1 < numbered.length ? numbered[k + 1] : lines.length;
      maxItemBytes = Math.max(maxItemBytes, Buffer.byteLength(lines.slice(start, end).join('\n'), 'utf8'));
    }
  } else {
    for (const cells of rows) {
      const id = (cells[0] || '').trim();
      if (!/^(?:INV|TRAP)-/.test(id)) continue;
      maxItemBytes = Math.max(maxItemBytes, Buffer.byteLength(cells.join(' | '), 'utf8'));
    }
  }
  return { invariants, traps, numbered, maxItemBytes };
}

/** §8.2 的索引表 + Scenario 正文；兼容首列为数字（存量）或 SC-*（v4）。 */
function parseScenarios(section8, moduleName) {
  if (!section8) return { tableIds: [], bodyIds: [], missingTable: false, empty: true };
  const lines = section8.text.split('\n');
  let start = 0;
  const idx = lines.findIndex(l => /^###\s+8\.2/.test(l));
  if (idx >= 0) start = idx;
  const sub = lines.slice(start).join('\n');
  const tableIds = [];
  for (const cells of tableRows(sub)) {
    const c0 = (cells[0] || '').trim();
    const mSc = c0.match(/^(SC-[A-Za-z0-9\u4e00-\u9fa5_-]+)$/);
    const mNum = c0.match(/^(\d+)$/);
    if (mSc) tableIds.push(mSc[1]);
    else if (mNum) tableIds.push(`#${mNum[1]}`);
  }
  const bodyIds = [...sub.matchAll(/^####\s+Scenario:\s*(SC-[^\s]+)/gm)].map(m => m[1]);
  const empty = tableIds.length === 0 && bodyIds.length === 0;
  return {
    tableIds,
    bodyIds,
    missingTable: bodyIds.length > 0 && tableIds.length === 0,
    empty,
    moduleName: moduleName || '',
  };
}

function parseOwnership(text, sections, docRoot) {
  const head = headerText(text, sections);
  const owns = (head.match(/本契约拥有\*{0,2}\s*[：:]\s*(.+)/) || [])[1] || '';
  const delegatedRaw = (head.match(/委托给\*{0,2}\s*[：:]\s*(.+)/) || [])[1] || '';
  const excludes = /本契约不拥有\*{0,2}\s*[：:]/.test(head);
  const delegates = [];
  if (delegatedRaw) {
    for (const m of delegatedRaw.matchAll(/`([^`]+\.md)`/g)) {
      const rel = m[1].trim();
      const abs = docRoot ? path.join(docRoot, rel) : null;
      delegates.push({ rel, exists: abs ? fs.existsSync(abs) : null });
    }
  }
  return { owns: owns.trim(), delegatedRaw: delegatedRaw.trim(), excludes, delegates, present: !!owns && !!delegatedRaw && excludes };
}

function historyHits(text) {
  const body = stripCode(text);
  const hits = [];
  const add = (label, re) => {
    for (const m of body.matchAll(re)) {
      const s = Math.max(0, (m.index || 0) - 30);
      hits.push({ label, sample: body.slice(s, (m.index || 0) + 60).replace(/\s+/g, ' ') });
    }
  };
  add('日期+动词', /[（(]\d{4}-\d{2}-\d{2}[^（）()]{0,60}?(?:修正|新增|补充|合并|订正|改写|调整|删除)/g);
  add('来源标记', /来源\s*[:：=]\s*(?:需求|代码|实现|合并)/g);
  add('修订沿革', /修订沿革|沿革|原文保留|已作废|已废弃|已退场/g);
  add('版本标记', /[（(]v\d+(?:\.\d+)+/g);
  return hits;
}

/**
 * @param {string} text 契约全文
 * @param {{docRoot?:string, moduleName?:string}} opts
 */
function analyzeContract(text, opts = {}) {
  const sections = splitSections(text);
  const totalBytes = Buffer.byteLength(String(text || ''), 'utf8');
  const s5 = findSection(sections, 5);
  const s7 = findSection(sections, 7);
  const s8 = findSection(sections, 8);
  const legacy = !sections.some(s => s.num === 7 && !String(s.title).includes('变更记录'))
    || !sections.some(s => s.num === 10);
  const inv = parseInvariants(s7);
  const sc = parseScenarios(s8, opts.moduleName);
  const ownership = parseOwnership(text, sections, opts.docRoot);
  const head = headerText(text, sections);
  const form = (head.match(/模块形态\s*[：:]\s*([^｜|\n]+)/) || [])[1] || '';
  const isPlatform = /平台-能力/.test(form) || /平台-能力/.test(head);
  const sm = text.match(/doc-framework:docstruct\s+v?(\d+)\.(\d+)\.(\d+)/);
  const newStruct = !!sm && (Number(sm[1]) > 3
    || (Number(sm[1]) === 3 && (Number(sm[2]) > 1 || (Number(sm[2]) === 1 && Number(sm[3]) >= 1))));
  const v4 = newStruct || /本契约拥有/.test(text);
  // §1–§8 正文（不含头部、§9/§10）
  const bodySections = sections.filter(s => (s.num && s.num >= 1 && s.num <= 8) || (!s.num && /应用落点|测试与验证/.test(s.title)));
  const body = bodySections.map(s => s.text).join('\n');
  const hits = historyHits(body);
  const sized = {};
  for (const s of sections) sized[s.num || s.title] = s.bytes;
  const s7Bytes = s7 ? s7.bytes : 0;
  const s7Share = totalBytes ? (s7Bytes / totalBytes) * 100 : 0;
  const scTable = sc.tableIds.length;
  const scBodies = sc.bodyIds.length;
  const scMismatch = (scTable > 0 || scBodies > 0) && scTable !== scBodies;
  const scDup = sc.tableIds.length !== new Set(sc.tableIds).size || sc.bodyIds.length !== new Set(sc.bodyIds).size;
  return {
    totalBytes,
    sections,
    s5, s7, s8,
    s7Bytes,
    s7Share,
    inv,
    sc,
    scTable,
    scBodies,
    scMismatch,
    scDup,
    ownership,
    form: form.trim(),
    isPlatform,
    v4,
    legacy,
    historyHits: hits,
    sized,
  };
}

function readContract(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
}

module.exports = {
  stripCode,
  splitSections,
  findSection,
  tableRows,
  parseInvariants,
  parseScenarios,
  parseOwnership,
  historyHits,
  analyzeContract,
  readContract,
  SECTION_TITLES,
};
