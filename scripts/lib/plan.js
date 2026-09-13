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

// ══ 1. NAMES：文件/目录/章节/字段/枚举的唯一来源（改这里必须同步 README + AGENTS 永久段）══

/**
 * 产物命名（**唯一来源，只中文**）：文档根内的文件 / 目录 / 章节名 / 头部字段 / 表态值 / 状态枚举。
 * 文档根固定 `doc-framework/`；**v2.6.0 起不再支持英文产物命名**（理由见 docs/设计文档.md §8.3）。
 * 英文命名表已隔离到 `scripts/lib/lang-en.js`，**运行时不得引用**——那是将来"独立英文入口"的素材；
 * 想做英文项目时新增一个入口（一次性把中文文档根翻译成英文产物名），而不是让解析器重回双模式。
 * 命名规范见 README「文档命名」；改这里必须同步 README 与 AGENTS 永久段。
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
    secChangeLog: '变更记录',
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
};

/** 英文状态/合并状态别名已随「只支持中文产物命名」迁出运行时：
 *  见 scripts/lib/lang-en.js（未来英文入口的素材）。以下归一化只认中文词表，
 *  但保留 `已合并（日期）` 这类尾随说明的容错。 */

// ══ 2. 枚举归一化与基础工具（状态/合并状态、词法映射、章节关键词候选）══

/**
 * 解析「合并状态」→ 待合并 / 已合并 / 无需合并；识别不出返回 null。
 * 三值缺一不可：`待合并` 未落账、`已合并` 已落账、`无需合并`（空增量或计划已废弃）。
 * 只认中文词表（v2.6.0 起只支持中文产物命名），但容忍尾随说明与大小写/分隔符差异。
 */
function normalizeMerge(raw) {
  if (!raw) return null;
  const v = String(raw).replace(/`/g, '').trim();
  if (!v || v.startsWith('{')) return null;
  const zh = v.match(/(待合并|已合并|无需合并)/);
  if (zh) return zh[1];
  // 剥离尾随说明：`已合并（2025-01-02）` / `已合并 (2025-01-02)` / `已合并 2025-01-02`
  const bare = v.replace(/[（(].*$/, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  for (const [tok, val] of [
    [NAMES.zh.mergePending, '待合并'], [NAMES.zh.mergeMerged, '已合并'], [NAMES.zh.mergeNa, '无需合并'],
  ]) {
    if (tok && bare.toLowerCase().startsWith(String(tok).toLowerCase())) return val;
  }
  return null;
}

/** 词法映射（**恒为中文词表**）。
 *  v2.6.0 起只支持中文产物命名，语言不再由目录名分派；保留本函数与 `lex` 形参只为
 *  兼容既有调用方签名（cli.js / selftest），避免一次全量签名改动带来的回归风险。 */
function lexicon() {
  return NAMES.zh;
}

/** 解析状态值 → 内部规范状态；识别不出返回 null（只认中文词表） */
function normalizeState(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  const zh = v.match(/(待审核|修订中|已批准|实施中|已完成|已废弃)/);
  return zh ? zh[1] : null;
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

// ══ 3. 文档根探测与章节抽取（语言模式的总入口）══

/**
 * 文档根探测：**固定 `doc-framework/`**（v2.6.0 起只支持中文产物命名）。
 *
 * 另**始终**探测两个历史英文根目录名（`doc-framework-en/`、`docs-framework/`）——即使中文根已存在：
 *   - 只有英文根 → `isEn/legacy` 为真、`docRoot` 指向它，上层据此报「该模式已下线 + 迁移方向」；
 *   - 中文根与英文根并存 → 同样返回 `legacy` 但 `docRoot` 仍指中文根（英语根是遗留垃圾，提示清理）。
 * 为什么不能只在"没有中文根时"才探测：并存的仓库里英文根会**永远无人提示**，而它正是要清理的东西。
 * 返回 { docRoot, docLabel, isEn, legacy }；`isEn/legacy` 保留字段以兼容上层签名。
 */
function resolveDocRoot(root) {
  const zhRoot = path.join(root, 'doc-framework');
  const legacyEnRoot = ['doc-framework-en', 'docs-framework']
    .map(d => path.join(root, d)).find(p => fs.existsSync(p));
  if (fs.existsSync(zhRoot)) {
    return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: !!legacyEnRoot, lex: NAMES.zh };
  }
  if (legacyEnRoot) {
    return { docRoot: legacyEnRoot, docLabel: path.basename(legacyEnRoot), isEn: true, legacy: true, lex: NAMES.zh };
  }
  return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false, lex: NAMES.zh };
}

/** 提取 markdown 中标题含 keyword 的章节正文（到下一个 ## 或文末）；keyword 可传数组（多语言候选，先命中先用）。
 *  **大小写不敏感**（`i`）：英文模式的节名由人翻译渲染，`## Semantic delta` / `## App Registry` /
 *  `## 5. Application Footprint` 这类大小写变体必须照样解析——否则 `mdSection` 返回 null，
 *  上层全部**静默降级**（I2 失效、应用清单消失、直改边界为空），且不报任何错。 */
function mdSection(content, keyword) {
  for (const kw of (Array.isArray(keyword) ? keyword : [keyword])) {
    const re = new RegExp(`^##[^\\n]*${reEscape(kw)}[^\\n]*\\n`, 'mi');
    const m = content.match(re);
    if (!m) continue;
    const rest = content.slice(m.index + m[0].length);
    const next = rest.search(/^##\s/m);
    return next === -1 ? rest : rest.slice(0, next);
  }
  return null;
}

/** 章节关键词候选（只中文）。
 *  v2.6.0 起只有中文一套命名，且**不再保留任何历史别名**（英文产物命名与旧版中文文件名都已下线）。
 *  保留数组返回形态，便于将来按需追加同义写法而不改调用方。 */
function secCands(lex, key) {
  return [NAMES.zh[key]];
}

// ══ 4. 档案：应用清单与「文件属于哪个应用」══

/** 定位档案文件（文档根固定 `doc-framework/`，档案固定 `项目档案.md`）；不存在则返回 null。
 *  单独导出是为了让 CLI 也能在"档案存在但读不出"时给出提示（否则会静默落进旧版档案回退分支）。 */
function findProfilePath(docRoot, lex = lexicon(docRoot)) {
  return [NAMES.zh.profile].map(f => path.join(docRoot, f)).find(p => fs.existsSync(p)) || null;
}

/** 解析档案「应用清单」表 → [{id, type, root, spec}]；无此节或无有效行返回 null（旧版档案回退） */
function parseAppRegistry(docRoot, lex = lexicon(docRoot)) {
  const profilePath = findProfilePath(docRoot, lex);
  if (!profilePath) return null;
  // 读失败（EACCES / EISDIR）降级为"无档案"，由调用方给清晰提示，不抛栈（纪律：解析器降级不崩溃）
  let content;
  try { content = fs.readFileSync(profilePath, 'utf-8'); } catch { return null; }
  const sec = mdSection(content, secCands(lex, 'secRegistry'));
  if (!sec) return null;
  const lines = sec.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null; // 表头 + 分隔 + 至少一行
  const header = lines[0].split('|').map(c => c.trim().toLowerCase());
  const col = (...names) => header.findIndex(h => names.some(n => h.includes(n.toLowerCase())));
  const iId = col('应用标识', '应用', 'app id', 'app', 'application');
  // type 的中英别名都收：英文模板/翻译常写 Kind / Category，漏了会让 type='' →
  // cli.js 静默不再要求类型层规范（standards/type-frontend.md / type-backend.md），漏校验。
  const iType = col('类型', '应用类型', 'type', 'kind', 'category');
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
  const key = kind === 'front' ? 'typeFrontendWords' : 'typeBackendWords';
  const words = NAMES.zh[key] || [];
  const t = String(type || '').toLowerCase();
  return words.some(w => t.includes(String(w).toLowerCase()));
}

// ══ 5. 契约：应用落点，以及 markdown 表格/勾选清单的通用解析 ══

/**
 * 解析模块契约 §5 应用落点表 → { contractPath, apps }
 * 用途：**直改通道的边界来源**（无计划时按契约落点推导允许改动的应用集合）。
 * 未找到契约返回 null；契约在但 §5 为空/未解析 → apps 为空数组（上层据此硬报错）。
 */
function parseContractScope(docRoot, moduleName, lex = lexicon(docRoot)) {
    const candidates = [
    path.join(docRoot, NAMES.zh.dirs.modules, moduleName, NAMES.zh.moduleContract),
  ];
  const contractPath = candidates.find(p => fs.existsSync(p));
  if (!contractPath) return null;
  // 读失败降级为"无契约范围"，由调用方给清晰提示，不抛栈（纪律：解析器降级不崩溃）
  let content;
  try { content = fs.readFileSync(contractPath, 'utf-8'); } catch { return null; }
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
    if (cells.some(c => c.includes('---'))) continue;        // 分隔行 `|---|----|`
    if (body.every(c => c === '' || c.includes('{'))) continue; // 未渲染的模板占位行（整行都是 {占位符}）不是数据
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
    // 无编号的清单项（如 `- [ ] 契约变更记录追加一行`）没有稳定 id，只能截前 12 字符当展示标签；
    // 它只用于 show/list 的"未完成项"提示，**不要当键用**（截断后会与别的条目重复）。
    const id = idMatch ? idMatch[1] : text.slice(0, 12);
    if (m[1].toLowerCase() === 'x') out.done += 1;
    else out.open.push(id);
  }
  return out;
}

// ══ 6. 计划：标识（模块/主题/是否归档）与「语义增量」══

/**
 * 从计划路径解析 {module, subject, crossModule}（模块名从 模块/{名}/计划/ 或空=跨模块）
 * `archived` 用中英并集判定（与 `docDirs` 同口径）：中文模式认 `计划/归档/`，英文模式认 `plans/archive/`，
 * 另一语言的目录名同样识别——否则误把归档计划当在途计划扫回体检，`list --stale` 也会误报。
 */
function planIdentity(root, planPath, lex) {
  const rel = path.relative(root, planPath);
  const lex2 = lex || lexicon(root);
  const dirs = reEscape(NAMES.zh.dirs.modules);
  const planDirs = reEscape(NAMES.zh.modulePlanDir);
  const archiveDirs = reEscape(NAMES.zh.archiveDir);
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
  const mf = [lex.fldMerge, NAMES.zh.fldMerge].map(reEscape).join('|');
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
    const leadNames = [lex.leadPlanCol, NAMES.zh.leadPlanCol].filter(Boolean);
    const headRow = tRows.find(r => r.some(c => leadNames.some(n => String(c).trim() === n)));
    const leadIdx = headRow ? headRow.findIndex(c => leadNames.some(n => String(c).trim() === n)) : -1;
    for (const cells of tRows) {
      const c0 = (cells[0] || '').trim();
      // 只认编号行（跳过表头）。编号约定是 `A1/M1/R1`，但英文/手写常见 `ADD-1` / `MOD-1` / `REM-1`——
      // 漏认会让整表行数变 0（delta.nonEmpty=false），**I2 硬校验被静默绕过**，所以放宽前缀写法。
      if (!/^(?:ADD|MOD|REM|A|M|R)[-_]?\d+$/i.test(c0)) continue;
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

// ══ 7. 契约存在性、依据引用、以及"模块是否已有实现"的代理判据 ══

/** 模块契约是否存在（中英两种文件名都认）→ 返回契约路径或 null */
function hasContract(docRoot, moduleName, lex = lexicon(docRoot)) {
    const candidates = [
    path.join(docRoot, NAMES.zh.dirs.modules, moduleName, NAMES.zh.moduleContract),
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
 * 「模块是否已有实现」的**代理判据**（设计文档 §7.5）：
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

// ══ 8. 计划解析（parsePlan）：把一份计划读成结构化对象，全链路降级不崩溃 ══

/**
 * 解析实施计划 → 结构化对象（降级不崩溃：缺章节即缺省；**中英节名/字段名/状态枚举全支持**）
 * @returns {{path,rel,module,subject,archived,state,shape,stances,fileList,tasks,writeback,compat,contracts}}
 */
function parsePlan(root, planPath, lex = lexicon(root)) {
  const content = fs.readFileSync(planPath, 'utf-8');
  const id = planIdentity(root, planPath, lex);
  const flds = [lex.fldState, NAMES.zh.fldState].map(reEscape).join('|');

  // 状态：优先取头部 blockquote（`> 状态：已批准` / `> **Status**: approved`），避免误抓修订记录表格里的历史状态
  const stateM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(flds)}[：:]\\s*([^\\n]+)`, 'm'))
    || content.match(new RegExp(`${fldPat(flds)}[：:]\\s*([^\\n]+)`));
  // 未渲染模板（`> 状态：{待审核 | …}`）不算解析出状态，交由"缺状态字段"显式报出
  const stateRaw = stateM ? stateM[1].replace(/[（(].*$/, '').trim() : '';
  const state = stateRaw.startsWith('{') ? null : normalizeState(stateRaw);

  // 计划形态：完整（默认，八节齐全）/ 轻量（只表态+清单+任务，可选节可标"无"）
  // 只认行首那一个取值——模板 `> 计划形态：完整（**轻量**形态只保留…）` 的括注里也含"轻量"，不能用 includes 判定
  const shapeFlds = [lex.fldShape, NAMES.zh.fldShape].map(reEscape).join('|');
  const shapeM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(shapeFlds)}[：:]\\s*([^\\s（(]+)`, 'm'));
  const shapeTok = shapeM ? shapeM[1].trim() : '';
  const lightToks = [lex.shapeLight, NAMES.zh.shapeLight];
  const fullToks = [lex.shapeFull, NAMES.zh.shapeFull];
  const shape = !shapeTok || shapeTok.startsWith('{') ? null
    : lightToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'light'
      : fullToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'full' : null;

  // 逐应用表态：| 应用 | 表态 | 说明 |（表态值中英兼容：改动/change、本次不改/no-change/n-a）
  const stances = {};
  for (const cells of tableRows(mdSection(content, secCands(lex, 'secStance')))) {
    if (cells.length < 2 || !cells[0]) continue;
    if (/^(应用(\s*标识)?|apps?(\s*id)?|applications?)$/i.test(cells[0].trim()) || cells[0].includes('{')) continue;
    const v = String(cells[1] || '').toLowerCase();
    const isSkip = lex.stanceSkip.concat(NAMES.zh.stanceSkip)
      .some(k => v.includes(k.toLowerCase()));
    const isChange = !isSkip && lex.stanceChange.concat(NAMES.zh.stanceChange)
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
      lex.headerWords.concat(NAMES.zh.headerWords).join('|'), 'i');
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
  const contractLabel = [lex.fldContracts, NAMES.zh.fldContracts].map(reEscape).join('|');
  const contractFiles = [lex.moduleContract, NAMES.zh.moduleContract].map(reEscape).join('|');
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
  const evFlds = [lex.fldEvidence, NAMES.zh.fldEvidence].map(reEscape).join('|');
  const evM = content.match(new RegExp(`^[ \t]*>?[ \t]*${fldPat(evFlds)}[：:]\\s*([^\n]+)`, 'm'));
  let evidence = { raw: '', path: null, sentinel: false };
  if (evM) {
    const raw = evM[1].trim();
    if (!raw.startsWith('{')) {
      const ticks = raw.match(/`([^`\n]+)`/);
      const sentinels = [lex.evidenceSentinel,
        NAMES.zh.evidenceSentinel, '无（自述）', 'self-described', 'none (self-described)']
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

// ══ 9. 白名单匹配（计划清单 ∩ 应用代码根 = diff-check 的授权范围）══

/** 文件是否命中清单（精确路径或目录前缀） */
function inFileList(fileList, file) {
  for (const f of fileList) {
    if (file === f || file.startsWith(f + '/')) return true;
  }
  return false;
}

// ══ 10. 目录解析与计划枚举（在途 / 归档；中英目录名并集，防盲区）══

/**
 * 取某个顶层目录在**当前语言与另一语言**下的候选名（中英并集），与 `hasContract` / `parseAppRegistry`
 * 的口径一致。为什么并集：文档根是框架专有目录，混排布局下另一套目录名里的计划不该"静默不可见"
 * （体系虽禁止混用，但盲区比报错更糟）。
 * kind：`'modules'` / `'plans'` 返回 docRoot 下的绝对路径；`'modulePlan'` 返回相对模块目录的名字。
 */
function docDirs(docRoot, lex, kind) {
  const name = kind === 'modules' ? NAMES.zh.dirs.modules : kind === 'plans' ? NAMES.zh.dirs.plans : NAMES.zh.modulePlanDir;
  return kind === 'modulePlan' ? [name] : [path.join(docRoot, name)];
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
  // 归档目录名固定 `归档/`（v2.6.0 起只有中文一套命名，不再有另一语言/历史别名）。
  const archiveDirs = new Set([NAMES.zh.archiveDir]);
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
  return [NAMES.zh.archiveDir];
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

// ══ 11. 契约 §9 回链凭据解析（机检 R3）══

/** §9「来源」列的合法取值（列序错位时用于兜底识别，避免把变更内容正文当成来源）。 */
const SOURCE_VALUES = ['需求', '代码', '实现', '合并', 'requirement', 'code', 'implementation', 'merge'];

/** 单元格取值是否为合法「来源」（去反引号、去空白、忽略大小写，要求**完全相等**以免误命中正文）。 */
function isSourceValue(v) {
  const t = String(v == null ? '' : v).replace(/`/g, '').trim().toLowerCase();
  if (!t) return false;
  return SOURCE_VALUES.some(s => s.toLowerCase() === t);
}

/**
 * 解析模块契约 §9「变更记录」的回链凭据（R3 校验用）。
 *
 * 契约模型纪律（设计文档 §4.2）：**`合并` 行的回链不得为空**——它是"契约 §9 → 当时真实的代码/语义"
 * 的长期追溯锚点，为空则落账无据。
 *
 * v2.5.0 起回链指向**不会消失的凭据**（不再依赖计划文件存活——归档计划可由人手动清理）：
 *   `2026-09-08 财务模块金额统一成元 @a1b2c3d` ／ `@a1b2c3d` ／ `需求#1234 @a1b2c3d`
 * **旧写法兼容**：反引号内的计划 `.md` 路径仍被识别为引用（老项目不必回填）。
 *
 * 稳健性（对应真实项目写法，见设计文档 §6.6）：
 *   1. **按表头列名定位「来源」列**，不写死列序（同 I3 的教训）；
 *   2. 只认**反引号内以 `.md` 结尾**的 token 为文件引用——同行大量非路径反引号 token
 *      （`ACT_RE_PROCDEF.KEY_` 之类）**不算引用**；
 *   3. 找不到「来源」列 → `hasSourceCol=false`，调用方据此**只提示不硬拦**（旧格式契约）；
 *   4. **列数不一致时按取值识别来源**（真实项目教训：表头 `| 日期 | 版本 | 来源 | 变更内容 |`，
 *      中途的行却漏了「版本」列变成 3 列 —— 死套表头列序会把**变更内容正文**读成来源，
 *      既让提示文本撑成上千字符，又让该行悄悄绕过"空凭据"硬校验）。
 *
 * @returns {{hasSection:boolean, hasSourceCol:boolean, colMismatch:number, rows:Array<{source:string, refs:string[], shas:string[], widest:number}>}}
 */
function parseContractMergeRows(contractContent, lex = NAMES.zh) {
  const out = { hasSection: false, hasSourceCol: false, colMismatch: 0, rows: [] };
  // 'Changelog'（无空格）也要认：英文项目常见写法。漏认会让 R3 整节静默跳过（连 ℹ️ 都没有）。
  const kw = [lex && lex.secChangeLog, '变更记录', 'Change log', 'Changelog', '变更历史'].filter(Boolean);
  let sec = null;
  for (const k of kw) {
    sec = mdSection(contractContent, k);
    if (sec) break;
  }
  if (!sec) return out;
  out.hasSection = true;

  const lines = sec.split(/\r?\n/);
  const isRow = s => /^\s*\|/.test(s);
  const isSep = s => /^\s*\|[\s:|-]+\|\s*$/.test(s);

  // ★ §9 里**可能有多张表**——模板自己就有一张「回链写法」说明表排在变更记录表之前。
  //   因此必须**逐表**识别表头、逐表定位「来源」列；只认第一张表会让整节的回链校验静默跳过
  //   （v2.5.1 前的真实缺陷：新模板产出的契约一律被判"无「来源」列"，R3 对新项目等于没装）。
  let i = 0;
  while (i < lines.length) {
    if (!isRow(lines[i]) || i + 1 >= lines.length || !isSep(lines[i + 1])) { i++; continue; }
    const headers = lines[i].split('|').map(c => c.replace(/`/g, '').trim());
    const iSource = headers.findIndex(h => /来源|source/i.test(h));
    if (iSource >= 0) out.hasSourceCol = true;
    i += 2; // 跳过本表表头与分隔行
    while (i < lines.length && isRow(lines[i])) {
      // 无空行相邻的另一张表：表头行后面紧跟分隔行 → 交回外层当新表头
      if (i + 1 < lines.length && isSep(lines[i + 1])) break;
      const raw = lines[i];
      i++;
      if (iSource < 0) continue; // 本表没有「来源」列（如说明表）→ 只跳过本表
      const cells = raw.split('|').map(c => c.replace(/`/g, '').trim());
      // 来源识别：列数与表头一致 → 按表头列序取；否则（表格中途增删列）→ 退回取值白名单。
      // 列序取值还需过一次白名单：列序对但格子里不是合法来源值同样兜底。
      let source = cells.length === headers.length ? (cells[iSource] || '') : '';
      if (!isSourceValue(source)) {
        if (cells.length !== headers.length) out.colMismatch++;
        source = cells.find(c => isSourceValue(c)) || '';
      }
      if (!source) continue;
      // 回链 token：① 反引号内以 .md 结尾 → 文件引用；② 反引号内的「日期-主题」计划标识（无扩展名也认）；
      //             ③ `@` + 7–40 位十六进制 → 提交 SHA
      const refs = [];
      for (const m of raw.matchAll(/`([^`\n]+\.md)`/g)) {
        const ref = m[1].trim();
        if (ref && !refs.includes(ref)) refs.push(ref);
      }
      // 计划标识写法：`2026-09-11-契约对账缺陷修复`（真实项目里常见，不带 .md 后缀）
      for (const m of raw.matchAll(/`(\d{4}-\d{2}-\d{2}[-_][^`\n]{1,80})`/g)) {
        const ref = m[1].trim();
        if (ref && !refs.includes(ref)) refs.push(ref);
      }
      const shas = [...new Set([...raw.matchAll(/@([0-9a-f]{7,40})\b/gi)].map(m => m[1]))];
      out.rows.push({ source, refs, shas, widest: raw.length });
    }
  }
  return out;
}

// ══ 12. 结构版本哨兵（机检 R4）══

/**
 * 读取文档里的结构版本哨兵 `<!-- doc-framework:docstruct vX.Y.Z -->`（R4 校验用）。
 * 返回 `{ version: 'X.Y.Z' } | null`；未标记（v2.4.0 之前的文档）返回 null。
 */
function parseDocstructVersion(content) {
  const c = String(content || '');
  // 占位哨兵：模板里写 `{{框架版本}}`，初始化渲染时替换为当时的框架版本。
  // 让"版本号"只有 package.json 一个来源——此前 5 份模板各自硬编码，发版要手改 6 处，漏一处 R4 就炸。
  if (/<!--\s*doc-framework:docstruct\s+\{\{框架版本\}\}/.test(c)) return { version: null, placeholder: true };
  const m = c.match(/<!--\s*doc-framework:docstruct\s+v?(\d+\.\d+\.\d+)/i);
  return m ? { version: m[1], placeholder: false } : null;
}

// ══ 导出：CLI（scripts/cli.js）与 selftest 都只经这里取入口 ══

module.exports = {
  resolveDocRoot,
  lexicon,
  NAMES,
  normalizeState,
  normalizeMerge,
  mdSection,
  findProfilePath,
  parseAppRegistry,
  matchApp,
  appTypeMatches,
  parseContractScope,
  tableRows,
  parseChecklist,
  parseDelta,
  hasContract,
  contractRefExists,
  parseContractMergeRows,
  parseDocstructVersion,
  moduleImplementationProxy,
  planIdentity,
  parsePlan,
  inFileList,
  collectPlanPaths,
  collectArchivedPlans,
  docDirs,
  listPlans,
};
