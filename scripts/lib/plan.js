'use strict';
/**
 * 计划与应用清单解析公共模块（cli.js 的 check / diff-check / list / show 共用）
 *
 * 设计纪律：
 *   1. 解析器必须**降级不崩溃**——章节缺失时返回空值/缺省，不抛异常（计划模板可能被本地定制）；
 *   2. 路径一律从档案「应用清单」的代码根派生，**禁止写死目录名**（如 apps/）；
 *   3. 归档计划（中文 `计划/归档/`、英文 `plans/archive/`）不参与任何 glob 清单，需路径直达。
 */

const fs = require('fs');
const path = require('path');

/**
 * 中英文命名映射（**唯一来源**）：文档根内的文件 / 目录 / 章节名 / 头部字段 / 表态值 / 状态枚举。
 * 中文模式根目录 `doc-framework/`，英文模式根目录 `doc-framework-en/`（语言由根目录名识别）。
 * 英文模式下**解析与中文模式能力对齐**（应用清单、计划体检、diff-check --module、list、show 全可用）。
 * 命名规范见 README「文档语言与命名」；改这里必须同步 README 与 AGENTS 永久段。
 */
const NAMES = {
  zh: {
    profile: '项目档案.md',
    rootContract: '总契约.md',
    testingGuide: '测试规范.md',
    apiGuide: '接口规范.md',
    dirs: { modules: '模块', boundaries: '边界', standards: '规范', plans: '计划', explore: '探索' },
    moduleContract: '契约.md',
    modulePlanDir: '计划',
    archiveDir: '归档',
    typeFrontend: '规范/类型-前端.md',
    typeBackend: '规范/类型-后端.md',
    legacyStdFrontend: '规范/前端开发规范.md',
    legacyStdBackend: '规范/后端开发规范.md',
    secRegistry: '应用清单',
    secStance: '逐应用表态',
    secFiles: '变更文件清单',
    secTasks: '任务清单',
    secWriteback: '回写清单',
    secCompat: '接口兼容性声明',
    secScope: '应用落点',
    fldState: '状态',
    fldShape: '计划形态',
    fldContracts: '依据模块契约',
    secDelta: '语义增量',
    secModeling: '建模补充',
    fldEvidence: '依据探索记录',
    fldMerge: '合并状态',
    leadPlanCol: '主计划',
    evidenceSentinel: '无（自述）',
    mergePending: '待合并',
    mergeMerged: '已合并',
    mergeNa: '无需合并',
    shapeLight: '轻量',
    shapeFull: '完整',
    // 表态值 / 应用类型关键词（表格单元格匹配用）
    stanceSkip: ['本次不改', '不适用'],
    stanceChange: ['改动'],
    typeFrontendWords: ['前端'],
    typeBackendWords: ['后端', '聚合'],
    headerWords: ['文件', '应用', '所属服务'],
  },
  en: {
    profile: 'profile.md',
    rootContract: 'contract.md',
    testingGuide: 'testing-guide.md',
    apiGuide: 'api-guide.md',
    dirs: { modules: 'modules', boundaries: 'boundaries', standards: 'standards', plans: 'plans', explore: 'explore' },
    moduleContract: 'contract.md',
    modulePlanDir: 'plans',
    archiveDir: 'archive',
    typeFrontend: 'standards/type-frontend.md',
    typeBackend: 'standards/type-backend.md',
    legacyStdFrontend: 'standards/frontend.md',
    legacyStdBackend: 'standards/backend.md',
    secRegistry: 'App registry',
    secStance: 'Per-app stance',
    secFiles: 'Changed files',
    secTasks: 'Task list',
    secWriteback: 'Writeback',
    secCompat: 'Compatibility',
    secScope: 'Application footprint',
    fldState: 'Status',
    fldShape: 'Plan shape',
    fldContracts: 'Module contract',
    secDelta: 'Delta',
    secModeling: 'Modeling notes',
    fldEvidence: 'Evidence',
    fldMerge: 'Merge state',
    leadPlanCol: 'Lead plan',
    evidenceSentinel: 'none (self-described)',
    mergePending: 'pending',
    mergeMerged: 'merged',
    mergeNa: 'n/a',
    shapeLight: 'light',
    shapeFull: 'full',
    stanceSkip: ['no-change', 'no change', 'not applicable', 'n/a'],
    stanceChange: ['change'],
    typeFrontendWords: ['frontend', 'web', 'mobile'],
    typeBackendWords: ['backend', 'service', 'bff', 'aggregate'],
    headerWords: ['file', 'app', 'service'],
  },
};

/** 英文状态 → 内部规范状态（中文枚举，全链路只用这一套） */
const EN_STATES = {
  'pending-review': '待审核', pending: '待审核', draft: '待审核',
  revising: '修订中', 'in-revision': '修订中',
  approved: '已批准',
  'in-progress': '实施中', implementing: '实施中',
  completed: '已完成', done: '已完成',
  abandoned: '已废弃', rejected: '已废弃', discarded: '已废弃',
};

/** 英文合并状态 → 内部规范值（中文枚举，全链路只用这一套） */
const EN_MERGES = {
  pending: '待合并', 'to-merge': '待合并', unmerged: '待合并',
  merged: '已合并', done: '已合并',
  'n/a': '无需合并', 'n-a': '无需合并', na: '无需合并', none: '无需合并', 'no-merge': '无需合并', skipped: '无需合并',
};

/**
 * 解析「合并状态」（中英兼容）→ 待合并 / 已合并 / 无需合并；识别不出返回 null。
 * 三值缺一不可：`待合并` 未落账、`已合并` 已落账、`无需合并`（空增量或计划已废弃）。
 */
function normalizeMerge(raw) {
  if (!raw) return null;
  const v = String(raw).replace(/`/g, '').trim();
  if (!v || v.startsWith('{')) return null;
  const zh = v.match(/(待合并|已合并|无需合并)/);
  if (zh) return zh[1];
  // 剥离尾随说明：`merged（2025-01-02）` / `merged (2025-01-02)` / `merged 2025-01-02`
  const bare = v.replace(/[（(].*$/, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  // **中英词表都试**：避免"中文文档里写英文枚举"这类混排被判成无法识别（B1 的根因之一）
  const toks = [
    [NAMES.zh.mergePending, '待合并'], [NAMES.zh.mergeMerged, '已合并'], [NAMES.zh.mergeNa, '无需合并'],
    [NAMES.en.mergePending, '待合并'], [NAMES.en.mergeMerged, '已合并'], [NAMES.en.mergeNa, '无需合并'],
  ];
  for (const [tok, val] of toks) {
    if (tok && bare.toLowerCase().startsWith(String(tok).toLowerCase())) return val;
  }
  const key = bare.toLowerCase().replace(/[_/\s]+/g, '-').replace(/^-|-$/g, '');
  return EN_MERGES[key] || null;
}

/** 按文档根路径取语言映射（根目录名 = 语言标识） */
function lexicon(docRoot) {
  const base = path.basename(String(docRoot || ''));
  return (base === 'doc-framework-en' || base === 'docs-framework') ? NAMES.en : NAMES.zh;
}

/** 解析状态值（中英兼容）→ 内部规范状态；识别不出返回 null */
function normalizeState(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  const zh = v.match(/(待审核|修订中|已批准|实施中|已完成|已废弃)/);
  if (zh) return zh[1];
  const key = v.toLowerCase().replace(/[_/\s]+/g, '-').replace(/^-|-$/g, '');
  return EN_STATES[key] || null;
}

/** 正则转义（章节关键词可能是英文短语） */
function reEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 字段标签正则片段：容忍 markdown 加粗（`> **状态**：已批准`）——手写计划常见这种写法，
 * 紧邻冒号的写法会让整个字段解析不到（实测：state=null → 误报"缺状态字段"）。
 * 调用方负责拼上「行首 `>` 可选」前缀与 `[：:]` 后缀。
 */
function fldPat(alt) {
  return `\\*{0,2}(?:${alt})\\*{0,2}`;
}

/**
 * 文档根探测：**语言由目录名识别**，根目录名固定两种——
 *   中文模式 `doc-framework/`、英文模式 `doc-framework-en/`（中文目录优先）。
 * 语言模式只决定**根目录内的文件/目录命名**（项目档案.md vs profile.md、模块/ vs modules/ …），不改根目录名。
 * 兼容历史英文目录名 `docs-framework/`（只读兼容：能识别，但上层提示改名）。
 * 返回 { docRoot, docLabel, isEn, legacy }；两者都不存在时按中文模式返回默认路径（供上层给出初始化提示）。
 */
function resolveDocRoot(root) {
  const zhRoot = path.join(root, 'doc-framework');
  const enRoot = path.join(root, 'doc-framework-en');
  const legacyRoot = path.join(root, 'docs-framework');
  if (fs.existsSync(zhRoot)) return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false, lex: NAMES.zh };
  if (fs.existsSync(enRoot)) return { docRoot: enRoot, docLabel: 'doc-framework-en', isEn: true, legacy: false, lex: NAMES.en };
  if (fs.existsSync(legacyRoot)) return { docRoot: legacyRoot, docLabel: 'docs-framework', isEn: true, legacy: true, lex: NAMES.en };
  return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false, lex: NAMES.zh };
}

/** 提取 markdown 中标题含 keyword 的章节正文（到下一个 ## 或文末）；keyword 可传数组（多语言候选，先命中先用） */
function mdSection(content, keyword) {
  for (const kw of (Array.isArray(keyword) ? keyword : [keyword])) {
    const re = new RegExp(`^##[^\\n]*${reEscape(kw)}[^\\n]*\\n`, 'm');
    const m = content.match(re);
    if (!m) continue;
    const rest = content.slice(m.index + m[0].length);
    const next = rest.search(/^##\s/m);
    return next === -1 ? rest : rest.slice(0, next);
  }
  return null;
}

/** 章节关键词的中英候选（lex 优先、另一种语言兜底：混排/迁移期也能解析） */
function secCands(lex, key) {
  const other = lex === NAMES.en ? NAMES.zh : NAMES.en;
  return [lex[key], other[key]];
}

/** 解析档案「应用清单」表 → [{id, type, root, spec}]；无此节或无有效行返回 null（旧版档案回退） */
function parseAppRegistry(docRoot, lex = lexicon(docRoot)) {
  const profilePath = [lex.profile, (lex === NAMES.en ? NAMES.zh : NAMES.en).profile]
    .map(f => path.join(docRoot, f)).find(p => fs.existsSync(p));
  if (!profilePath) return null;
  const content = fs.readFileSync(profilePath, 'utf-8');
  const sec = mdSection(content, secCands(lex, 'secRegistry'));
  if (!sec) return null;
  const lines = sec.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null; // 表头 + 分隔 + 至少一行
  const header = lines[0].split('|').map(c => c.trim().toLowerCase());
  const col = (...names) => header.findIndex(h => names.some(n => h.includes(n.toLowerCase())));
  const iId = col('应用标识', '应用', 'app id', 'app', 'application');
  const iType = col('类型', 'type');
  const iRoot = col('代码根', 'code root', 'root', 'path');
  const iSpec = col('规范文件', 'spec');
  if (iId < 0 || iRoot < 0) return null;
  const strip = s => s.replace(/`/g, '').trim();
  // 代码根归一化：去掉前导 './' 与尾部 '/'；空值视为仓库根 '.'
  const normalizeRoot = r => {
    const cleaned = r.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim();
    return cleaned === '' ? '.' : cleaned;
  };
  const apps = [];
  for (const l of lines.slice(2)) {
    const cells = l.split('|').map(c => strip(c));
    const id = cells[iId];
    if (!id || id.includes('{')) continue; // 跳过未渲染占位行
    apps.push({
      id,
      type: iType >= 0 ? cells[iType] : '',
      root: normalizeRoot(cells[iRoot] || ''),
      spec: iSpec >= 0 ? cells[iSpec] : '',
    });
  }
  return apps.length ? apps : null;
}

/** 按最长前缀优先把文件归属到应用（root 为 '.' 时匹配一切） */
function matchApp(apps, file) {
  let best = null;
  for (const app of apps) {
    const hit = app.root === '.' || file === app.root || file.startsWith(app.root + '/');
    if (hit && (!best || app.root.length > best.root.length)) best = app;
  }
  return best;
}

/**
 * 应用类型关键词匹配（中英通用）：kind = 'front'（前端端）| 'back'（服务端/聚合层）。
 * **中英词表取并集**——文档根的语言与登记值的语言未必一致（中文根里登记 `frontend`、
 * 英文根里写「前端」都存在），只用当前 lex 会静默漏掉类型层规范文件缺失。
 */
function appTypeMatches(lex, type, kind) {
  const other = lex === NAMES.en ? NAMES.zh : NAMES.en;
  const pick = l => (kind === 'front' ? l.typeFrontendWords : l.typeBackendWords) || [];
  const words = [...new Set([...pick(lex), ...pick(other)])];
  const t = String(type || '').toLowerCase();
  return words.some(w => t.includes(String(w).toLowerCase()));
}

/**
 * 解析模块契约 §5 应用落点表 → { contractPath, apps }
 * 用途：**直改通道的边界来源**（无计划时按契约落点推导允许改动的应用集合）。
 * 未找到契约返回 null；契约在但 §5 为空/未解析 → apps 为空数组（上层据此硬报错）。
 */
function parseContractScope(docRoot, moduleName, lex = lexicon(docRoot)) {
  const other = lex === NAMES.en ? NAMES.zh : NAMES.en;
  const candidates = [
    path.join(docRoot, lex.dirs.modules, moduleName, lex.moduleContract),
    path.join(docRoot, other.dirs.modules, moduleName, other.moduleContract),
  ];
  const contractPath = candidates.find(p => fs.existsSync(p));
  if (!contractPath) return null;
  const content = fs.readFileSync(contractPath, 'utf-8');
  const sec = mdSection(content, secCands(lex, 'secScope'));
  const apps = [];
  if (sec) {
    for (const cells of tableRows(sec)) {
      // 跳过表头行（首列恰为「应用」/「App」/「App ID」等；不能用 ^app —— 会误伤 app-web 这类应用标识）
      if (/^(应用(\s*标识)?|apps?(\s*id)?|applications?)$/i.test((cells[0] || '').trim())) continue;
      // 应用列可能带「（主责）」「(primary)」等后缀，去掉后再当应用标识
      const id = (cells[0] || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
      if (!id || id.includes('{')) continue;
      if (!apps.includes(id)) apps.push(id);
    }
  }
  return { contractPath, apps };
}

/** 解析 markdown 表格行（跳过表头/分隔行/占位行）为单元格数组 */
function tableRows(sectionText) {
  if (!sectionText) return [];
  const rows = [];
  for (const l of sectionText.split('\n')) {
    const t = l.trim();
    if (!t.startsWith('|')) continue;
    // 反引号内的 `|` 属于值本身（如枚举 ACTIVE|INACTIVE）：先占位再切分，避免静默丢列/错位
    const guarded = t.replace(/`[^`\n]*`/g, m => m.replace(/\|/g, '\u0001'));
    const cells = guarded.split('|').map(c => c.replace(/\u0001/g, '|').replace(/`/g, '').trim());
    const body = cells.slice(1, -1);
    if (!body.length) continue;
    if (cells.some(c => c.includes('---'))) continue;
    if (body.every(c => c === '' || c.includes('{'))) continue;
    rows.push(body);
  }
  return rows;
}

/** 解析勾选清单（`- [ ] 1.1 任务`）→ {total, done, open[]}（兼容 CRLF） */
function parseChecklist(sectionText) {
  const out = { total: 0, done: 0, open: [] };
  if (!sectionText) return out;
  for (const rawLine of sectionText.split('\n')) {
    const l = rawLine.replace(/\r+$/, ''); // 先剥 CR，`.` 不匹配 \r 会导致 CRLF 下解析失败
    const m = l.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
    if (!m) continue;
    out.total += 1;
    const text = m[2].trim();
    const idMatch = text.match(/^(\d+(?:\.\d+)*)/);
    const id = idMatch ? idMatch[1] : text.slice(0, 12);
    if (m[1].toLowerCase() === 'x') out.done += 1;
    else out.open.push(id);
  }
  return out;
}

/**
 * 从计划路径解析 {module, subject, crossModule}（模块名从 模块/{名}/计划/ 或空=跨模块）
 * `archived` 用中英并集判定（与 `docDirs` 同口径）：中文模式认 `计划/归档/`，英文模式认 `plans/archive/`，
 * 另一语言的目录名同样识别——否则误把归档计划当在途计划扫回体检，`list --stale` 也会误报。
 */
function planIdentity(root, planPath, lex) {
  const rel = path.relative(root, planPath);
  const lex2 = lex || lexicon(root);
  const other = lex2 === NAMES.en ? NAMES.zh : NAMES.en;
  const dirs = [...new Set([lex2.dirs.modules, other.dirs.modules])].map(reEscape).join('|');
  const planDirs = [...new Set([lex2.modulePlanDir, other.modulePlanDir])].map(reEscape).join('|');
  const archiveDirs = [...new Set([lex2.archiveDir, other.archiveDir].filter(Boolean))].map(reEscape).join('|');
  const m = rel.match(new RegExp(`(?:${dirs})[\\\\/]([^\\\\/]+)[\\\\/](?:${planDirs})[\\\\/]`));
  return {
    rel,
    module: m ? m[1] : '(跨模块)',
    crossModule: !m,
    subject: path.basename(planPath).replace(/\.md$/, ''),
    archived: new RegExp(`(^|[\\\\/])(?:${archiveDirs})[\\\\/]`).test(rel),
  };
}

/**
 * 解析计划「语义增量」节 → { added, modified, removed, total, nonEmpty, mergeState, hasSection, hasMergeLine }
 * 三张表列固定（`# / 目标位置 / 对象 / 内容（或 现值·目标值·理由）/ 主计划`）；章节缺失/本地定制 → 降级返回空值。
 */
function parseDelta(content, lex) {
  const out = {
    added: [], modified: [], removed: [],
    total: 0, nonEmpty: false, mergeState: null, mergeRaw: null, hasSection: false, hasMergeLine: false,
  };
  const sec = mdSection(content, secCands(lex, 'secDelta'));
  if (!sec) return out;
  out.hasSection = true;
  const mf = [lex.fldMerge, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldMerge].map(reEscape).join('|');
  // 取整行（`(.+)$`）——值里可能带日期或冒号，用 `[^\n]+` 会被行内 ASCII `:` 截断
  const mm = sec.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(mf)}[：:]\\s*(.+)$`, 'm'));
  if (mm) {
    out.hasMergeLine = true;
    const raw = mm[1].trim();
    out.mergeRaw = raw.startsWith('{') ? null : raw;  // 原始值：供 check 区分"漏填"与"值无法识别"
    out.mergeState = out.mergeRaw ? normalizeMerge(out.mergeRaw) : null;
  }
  const parts = sec.split(/^###\s+/m).slice(1);
  const kindOf = t => (/ADDED|新增/i.test(t) ? 'added'
    : /MODIFIED|修改/i.test(t) ? 'modified'
      : /REMOVED|删除/i.test(t) ? 'removed' : null);
  for (const part of parts) {
    const kind = kindOf(part.split('\n')[0] || '');
    if (!kind) continue;
    // 列定位：优先按表头里的「主计划」列名（中英），退化到"最后一列"——列位不靠写死下标
    const tRows = tableRows(part);
    const leadNames = [lex.leadPlanCol, (lex === NAMES.en ? NAMES.zh : NAMES.en).leadPlanCol].filter(Boolean);
    const headRow = tRows.find(r => r.some(c => leadNames.some(n => String(c).trim() === n)));
    const leadIdx = headRow ? headRow.findIndex(c => leadNames.some(n => String(c).trim() === n)) : -1;
    for (const cells of tRows) {
      const c0 = (cells[0] || '').trim();
      if (!/^[AMR]\d+$/i.test(c0)) continue; // 只认编号行：跳过表头
      // 跳过未渲染模板行（占位符 `{…}` 或渲染后残留的裸 X）
      const rest = cells.slice(1).map(c => String(c || '').trim());
      if (rest.some(c => c.includes('{'))) continue;
      if (!rest[0] || rest[0] === 'X') continue;
      // 列数按表而不同：ADDED/REMOVED 5 列、MODIFIED 6 列（现值 + 目标值）。
      // 「主计划」优先取表头定位到的列（rest 已去掉首列，故 -1），否则取最后一列。
      // 空标记：中英都要认（英文模式写 n/a / none / empty 时不能被当成真实回指 → 否则 I3 漏判）
      const leadRaw = (leadIdx > 0 ? rest[leadIdx - 1] : rest[rest.length - 1]) || '';
      const leadPlan = /空|本计划为主|^[—\-–]+$|^(n\/?a|none|empty|无)$/i.test(leadRaw.trim()) ? '' : leadRaw;
      const mids = rest.slice(2, leadIdx > 0 ? leadIdx - 1 : rest.length - 1).filter(Boolean);
      out[kind].push({
        id: c0,
        target: rest[0],
        object: rest[1] || '',
        detail: mids.join(' → '),
        leadPlan,
      });
    }
  }
  out.total = out.added.length + out.modified.length + out.removed.length;
  out.nonEmpty = out.total > 0;
  return out;
}

/** 模块契约是否存在（中英两种文件名都认）→ 返回契约路径或 null */
function hasContract(docRoot, moduleName, lex = lexicon(docRoot)) {
  const other = lex === NAMES.en ? NAMES.zh : NAMES.en;
  const candidates = [
    path.join(docRoot, lex.dirs.modules, moduleName, lex.moduleContract),
    path.join(docRoot, other.dirs.modules, moduleName, other.moduleContract),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

/** 「依据」引用是否存在（基准依次为仓库根、文档根；引用可能写成 `{文档根}/…` 或 `doc-framework/…`） */
function contractRefExists(root, docRoot, ref) {
  if (!ref) return false;
  const clean = String(ref).replace(/`/g, '').trim();
  if (!clean || clean.includes('{')) return false;
  return [path.resolve(root, clean), path.resolve(docRoot, clean)].some(p => fs.existsSync(p));
}

/**
 * 「模块是否已有实现」的**代理判据**（设计文档 §6.4）：
 * 本仓库没有任何代码扫描能力（只读文档路径 + 应用代码根存在性 + git 变更清单），
 * 因此只能用「契约是否存在」+「计划变更文件清单里的路径是否已存在」近似判断，**不猜模块名**。
 */
function moduleImplementationProxy(root, plan, docRoot, lex = lexicon(docRoot)) {
  const docLabel = path.basename(docRoot);
  // 文档/说明性路径不是"模块已有实现"的证据（与 check 的 docExempt 口径一致）
  const files = (plan && plan.fileList ? [...plan.fileList] : [])
    .filter(f => !(f === 'AGENTS.md' || f.startsWith(docLabel + '/')));
  const existing = files.filter(f => fs.existsSync(path.join(root, f)));
  return {
    contractPath: plan ? hasContract(docRoot, plan.module, lex) : null,
    fileCount: files.length,
    existingCount: existing.length,
    allExist: files.length > 0 && existing.length === files.length,
    mostlyExist: files.length > 0 && existing.length / files.length >= 0.5,
    existing,
  };
}

/**
 * 解析实施计划 → 结构化对象（降级不崩溃：缺章节即缺省；**中英节名/字段名/状态枚举全支持**）
 * @returns {{path,rel,module,subject,archived,state,shape,stances,fileList,tasks,writeback,compat,contracts}}
 */
function parsePlan(root, planPath, lex = lexicon(root)) {
  const content = fs.readFileSync(planPath, 'utf-8');
  const id = planIdentity(root, planPath, lex);
  const flds = [lex.fldState, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldState].map(reEscape).join('|');

  // 状态：优先取头部 blockquote（`> 状态：已批准` / `> **Status**: approved`），避免误抓修订记录表格里的历史状态
  const stateM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(flds)}[：:]\\s*([^\\n]+)`, 'm'))
    || content.match(new RegExp(`${fldPat(flds)}[：:]\\s*([^\\n]+)`));
  // 未渲染模板（`> 状态：{待审核 | …}`）不算解析出状态，交由"缺状态字段"显式报出
  const stateRaw = stateM ? stateM[1].replace(/[（(].*$/, '').trim() : '';
  const state = stateRaw.startsWith('{') ? null : normalizeState(stateRaw);

  // 计划形态：完整（默认，八节齐全）/ 轻量（只表态+清单+任务，可选节可标"无"）
  // 只认行首那一个取值——模板 `> 计划形态：完整（**轻量**形态只保留…）` 的括注里也含"轻量"，不能用 includes 判定
  const shapeFlds = [lex.fldShape, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldShape].map(reEscape).join('|');
  const shapeM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(shapeFlds)}[：:]\\s*([^\\s（(]+)`, 'm'));
  const shapeTok = shapeM ? shapeM[1].trim() : '';
  const lightToks = [lex.shapeLight, (lex === NAMES.en ? NAMES.zh : NAMES.en).shapeLight];
  const fullToks = [lex.shapeFull, (lex === NAMES.en ? NAMES.zh : NAMES.en).shapeFull];
  const shape = !shapeTok || shapeTok.startsWith('{') ? null
    : lightToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'light'
      : fullToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'full' : null;

  // 逐应用表态：| 应用 | 表态 | 说明 |（表态值中英兼容：改动/change、本次不改/no-change/n-a）
  const stances = {};
  for (const cells of tableRows(mdSection(content, secCands(lex, 'secStance')))) {
    if (cells.length < 2 || !cells[0]) continue;
    if (/^(应用(\s*标识)?|apps?(\s*id)?|applications?)$/i.test(cells[0].trim()) || cells[0].includes('{')) continue;
    const v = String(cells[1] || '').toLowerCase();
    const isSkip = lex.stanceSkip.concat((lex === NAMES.en ? NAMES.zh : NAMES.en).stanceSkip)
      .some(k => v.includes(k.toLowerCase()));
    const isChange = !isSkip && lex.stanceChange.concat((lex === NAMES.en ? NAMES.zh : NAMES.en).stanceChange)
      .some(k => v.includes(k.toLowerCase()));
    stances[cells[0]] = isSkip ? 'skip' : isChange ? 'change' : 'unknown';
  }

  // 变更文件清单：先剥离代码围栏（围栏内是示例，不是真实清单）；
  // 表格行按"整格"取路径（不按空白切词，避免含空格路径被拆散），**排除每行最后一列=说明列**；
  // 非表格行只认"像路径"的 token（有扩展名或目录尾斜杠）。一律归一化前导 './' 与反斜杠。
  const fileList = new Set();
  const listSecRaw = mdSection(content, secCands(lex, 'secFiles'));
  const listSec = listSecRaw ? listSecRaw.replace(/```[\s\S]*?```/g, '') : null;
  const addPath = raw => {
    const clean = raw.replace(/`/g, '').replace(/\\/g, '/').trim().replace(/[，。；、]+$/, '');
    if (!clean || clean.includes('{')) return false;
    if (/^https?:/.test(clean) || /^YYYY/i.test(clean)) return false;
    const normalized = clean.replace(/^\.\//, '');
    // 单段路径（`package.json` / `AGENTS.md` / `Makefile`）同样是合法清单项——只有在**既没有扩展名、
    // 也不是目录**（不以 `/` 结尾）时才视为散文词丢弃；否则应用代码根为 `.` 的项目会出现
    // "清单里有、diff-check 却报清单外"的自相矛盾
    if (!normalized.includes('/') && !/\.[A-Za-z0-9]+$/.test(normalized) && !/\/$/.test(clean)) return false;
    fileList.add(normalized.replace(/\/+$/, ''));
    return true;
  };
  /** 从单元格取路径：优先反引号内容；否则整格；多路径按中英文逗号/顿号拆分 */
  const addCellPaths = cell => {
    const ticks = cell.match(/`([^`\n]+)`/g);
    if (ticks) {
      for (const t of ticks) addPath(t);
      return;
    }
    for (const part of cell.split(/[，,、]/)) addPath(part);
  };
  if (listSec) {
    const headerRe = new RegExp(
      lex.headerWords.concat((lex === NAMES.en ? NAMES.zh : NAMES.en).headerWords).join('|'), 'i');
    for (const l of listSec.split('\n')) {
      const t0 = l.trim();
      if (t0.startsWith('#') || t0.startsWith('>')) continue; // 标题与说明文字不是文件路径
      if (t0.startsWith('|')) {
        if (t0.includes('---')) continue; // 分隔行
        const cells = t0.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
        if (!cells.length || cells.some(c => c.includes('---'))) continue;
        if (headerRe.test(cells.join('|')) && cells.every(c => !c.includes('/'))) continue; // 表头
        for (const cell of cells.slice(0, -1)) { // 去掉说明列
          if (cell) addCellPaths(cell);
        }
        continue;
      }
      for (const t of (l.match(/`[^`\n]+`|[^\s|`，。；]+/g) || [])) {
        const clean = t.replace(/`/g, '').trim();
        // 非表格行：必须是"像路径"的 token（有扩展名或目录尾斜杠）
        if (!/\.[A-Za-z0-9]{1,8}$/.test(clean) && !/\/$/.test(clean)) continue;
        addPath(t);
      }
    }
  }

  const compatSec = mdSection(content, secCands(lex, 'secCompat'));
  // 依据模块契约（Module contract）：跨模块计划可能有多行；取值域已放宽——
  // 可指向**已存在的契约**，也可指向被依赖模块的**首次建模计划路径**（该模块尚无契约）。
  const contracts = [];
  const contractRefs = [];
  const contractLabel = [lex.fldContracts, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldContracts].map(reEscape).join('|');
  const contractFiles = [lex.moduleContract, (lex === NAMES.en ? NAMES.zh : NAMES.en).moduleContract].map(reEscape).join('|');
  // 行首可选 `>`：模板写成引用块（`> 依据模块契约：`），手写/v1 计划常写成纯行——两种都要认
  // 取值优先反引号内容；**无反引号时按整行兜底**（与 evidence 口径对齐）——否则纯文本写法会让
  // contractRefs 为空 → 被误判成"首次建模计划" → 连锁误报
  for (const m of content.matchAll(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(contractLabel)}[：:][^\\n]*`, 'gm'))) {
    const line = m[0];
    const rawVal = line.replace(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(contractLabel)}[：:]`), '').trim();
    const cands = [];
    for (const c of line.matchAll(/`([^`\n]+)`/g)) cands.push(c[1].trim());
    if (!cands.length && rawVal && !rawVal.startsWith('{')) {
      for (const part of rawVal.split(/[，,、;；]/)) cands.push(part.replace(/[，,、;；。\s]+$/, '').trim());
    }
    for (const ref of cands) {
      if (!ref || ref.includes('{')) continue;
      if (!contractRefs.includes(ref)) contractRefs.push(ref);
      if (new RegExp(contractFiles).test(ref) && !contracts.includes(ref)) contracts.push(ref);
    }
  }

  // 依据探索记录（首次建模计划必填；人工显式降级写哨兵 `无（自述）`，AI 不得自行省略）
  const evFlds = [lex.fldEvidence, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldEvidence].map(reEscape).join('|');
  const evM = content.match(new RegExp(`^[ \t]*>?[ \t]*${fldPat(evFlds)}[：:]\\s*([^\n]+)`, 'm'));
  let evidence = { raw: '', path: null, sentinel: false };
  if (evM) {
    const raw = evM[1].trim();
    if (!raw.startsWith('{')) {
      const ticks = raw.match(/`([^`\n]+)`/);
      const sentinels = [lex.evidenceSentinel,
        (lex === NAMES.en ? NAMES.zh : NAMES.en).evidenceSentinel, '无（自述）', 'self-described', 'none (self-described)']
        .filter(Boolean).map(t => String(t).toLowerCase());
      // 收紧为"trim 后等值"（允许反引号包裹）：`includes` 会把"人工降级：无（自述）"这类说明也当哨兵
      const probe = raw.replace(/`/g, '').trim().toLowerCase();
      const isSentinel = sentinels.includes(probe);
      evidence = { raw, path: isSentinel ? null : (ticks ? ticks[1].trim() : raw), sentinel: isSentinel };
    }
  }
  const delta = parseDelta(content, lex);
  const modelingNotes = mdSection(content, secCands(lex, 'secModeling'));
  // 首次建模判定式：无「依据模块契约」∧（有「依据探索记录」∨ 有增量节/建模补充节）
  // —— 后半个析取是为了能**报出"忘了填依据探索记录"**：只看前者时，字段缺失会让计划静默退化成"存量计划"。
  const isFirstBuild = contractRefs.length === 0
    && (!!evidence.raw || delta.hasSection || !!modelingNotes);

  return {
    path: planPath,
    rel: id.rel,
    module: id.module,
    crossModule: id.crossModule,
    subject: id.subject,
    archived: id.archived,
    state,
    shape,
    stances,
    fileList,
    tasks: parseChecklist(mdSection(content, secCands(lex, 'secTasks'))),
    writeback: parseChecklist(mdSection(content, secCands(lex, 'secWriteback'))),
    compat: compatSec ? (compatSec.match(/(?:变更类型|Change type)[：:]\s*(.+)/) || [])[1] || null : null,
    contracts,
    contractRefs,
    delta,
    mergeState: delta.mergeState,
    evidence,
    modelingNotes,
    isFirstBuild,
    body: content,
  };
}

/** 文件是否命中清单（精确路径或目录前缀） */
function inFileList(fileList, file) {
  for (const f of fileList) {
    if (file === f || file.startsWith(f + '/')) return true;
  }
  return false;
}

/**
 * 取某个顶层目录在**当前语言与另一语言**下的候选名（中英并集），与 `hasContract` / `parseAppRegistry`
 * 的口径一致。为什么并集：文档根是框架专有目录，混排布局下另一套目录名里的计划不该"静默不可见"
 * （体系虽禁止混用，但盲区比报错更糟）。
 * kind：`'modules'` / `'plans'` 返回 docRoot 下的绝对路径；`'modulePlan'` 返回相对模块目录的名字。
 */
function docDirs(docRoot, lex, kind) {
  const other = lex === NAMES.en ? NAMES.zh : NAMES.en;
  const pick = l => (kind === 'modules' ? l.dirs.modules : kind === 'plans' ? l.dirs.plans : l.modulePlanDir);
  const names = [...new Set([pick(lex), pick(other)])].filter(Boolean);
  return kind === 'modulePlan' ? names : names.map(n => path.join(docRoot, n));
}

/**
 * 枚举计划文件路径（模块内 + 跨模块），排除归档目录（中文 `归档/`、英文 `archive/`）。
 * **递归**子目录：早期只认计划目录顶层的 `.md`，于是把计划放进 `计划/done/` 这类自建子目录
 * 就能同时逃过常规体检与 I2 归档兜底（实测：`已完成 + 待合并 + 非空增量` 放进去 check 退出码 0）。
 * 为免把子目录里的随手笔记当成计划报错，**嵌套目录只认日期前缀文件** `YYYY-MM-DD-…`（顶层保持原行为）。
 * 目录不可读时安静跳过（由调用方按"计划数量异常"另行提示，不抛 Node 栈）。
 */
function collectPlanPaths(docRoot, lex = lexicon(docRoot)) {
  const out = [];
  const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
  // 归档目录名与当前语言一致（中文 `归档/`、英文 `archive/`）；另一语言的目录名由 `planIdentity`
  // 的并集判定兜住——真乱用了也不会被静默当成在途计划。
  const archiveDirs = new Set([lex.archiveDir, NAMES.en.archiveDir, NAMES.zh.archiveDir].filter(Boolean));
  const walkPlanDir = (dir, nested) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        // 名字像计划文件的目录（`计划/坏计划.md/`）交给解析层显式报错，不能静默忽略（回归 5 钉着这条）
        if (ent.name.endsWith('.md')) { out.push(p); continue; }
        if (archiveDirs.has(ent.name)) continue;
        walkPlanDir(p, true);
      } else if (ent.name.endsWith('.md') && (!nested || DATE_PREFIX.test(ent.name))) {
        out.push(p);
      }
    }
  };
  for (const modulesDir of docDirs(docRoot, lex, 'modules')) {
    let mods = [];
    try { mods = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { mods = []; }
    for (const ent of mods) {
      if (!ent.isDirectory()) continue;
      for (const pd of docDirs(docRoot, lex, 'modulePlan')) {
        walkPlanDir(path.join(modulesDir, ent.name, pd), false);
      }
    }
  }
  for (const gd of docDirs(docRoot, lex, 'plans')) walkPlanDir(gd, false);
  return out;
}

/** 归档目录名候选（当前语言 + 中英两名兜底）——`archiveDir` 是随语言切换的路径段（中文 `归档`、英文 `archive`） */
function archiveDirNames(lex) {
  return [...new Set([lex.archiveDir, NAMES.zh.archiveDir, NAMES.en.archiveDir].filter(Boolean))];
}

/** 枚举归档计划（模块目录下的 计划/归档 与全局 计划/归档）——归档不参与常规体检，但 I2 兜底要查 */
function collectArchivedPlans(docRoot, lex = lexicon(docRoot)) {
  const out = [];
  const pushDir = d => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) pushDir(p);          // 归档目录再分子目录也要兜住
      else if (ent.name.endsWith('.md')) out.push(p);
    }
  };
  for (const modulesDir of docDirs(docRoot, lex, 'modules')) {
    let mods = [];
    try { mods = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { mods = []; }
    for (const ent of mods) {
      if (!ent.isDirectory()) continue;
      for (const pd of docDirs(docRoot, lex, 'modulePlan')) {
        for (const ad of archiveDirNames(lex)) pushDir(path.join(modulesDir, ent.name, pd, ad));
      }
    }
  }
  for (const gd of docDirs(docRoot, lex, 'plans')) {
    for (const ad of archiveDirNames(lex)) pushDir(path.join(gd, ad));
  }
  return out;
}

/** 枚举在途计划（解析失败的计划被跳过；collectPlanPaths + parsePlan 可获取失败明细） */
function listPlans(root, docRoot, lex = lexicon(docRoot)) {
  const plans = [];
  for (const p of collectPlanPaths(docRoot, lex)) {
    try {
      plans.push(parsePlan(root, p, lex));
    } catch {
      /* 解析失败的计划跳过（降级不崩溃），check 通过 collectPlanPaths 另报明细 */
    }
  }
  return plans.sort((a, b) => (a.subject < b.subject ? 1 : -1));
}

module.exports = {
  resolveDocRoot,
  lexicon,
  NAMES,
  normalizeState,
  normalizeMerge,
  mdSection,
  parseAppRegistry,
  matchApp,
  appTypeMatches,
  parseContractScope,
  tableRows,
  parseChecklist,
  parseDelta,
  hasContract,
  contractRefExists,
  moduleImplementationProxy,
  planIdentity,
  parsePlan,
  inFileList,
  collectPlanPaths,
  collectArchivedPlans,
  docDirs,
  listPlans,
};
