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
    moduleApi: '接口.md',
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
};

/**
 * 契约章节号 → 展示名（**§2.4 映射表的机器侧单一来源**）。
 *
 * 用途：`check --draft-contract` 把每条增量的「目标位置」派发到目标契约章节。
 * **与 skills/module-doc/SKILL.md §2.4 的章节清单必须一致**（设计文档 §4.2 的同步纪律）——
 * 此前该派发只在 cli.js 里写死 §3/4/5/8，§1/§2/§6/§7/§9/§10 一律落「未识别 → 人工定位」，
 * 而 §2.4 映射表（以及工具自己打印的"九步"文案）都列了更多章。新增契约章节时**只改这里一处**；
 * selftest §19 会断言 §2.4 列出的每一章都被识别。
 */
const CONTRACT_CHAPTERS = {
  1: '契约 §1 模块定位',
  2: '契约 §2 边界约定',
  3: '契约 §3 数据模型',
  4: '契约 §4 接口概览',
  5: '契约 §5 应用落点',
  6: '契约 §6 标杆参考',
  7: '契约 §7 特殊约定与陷阱',
  8: '契约 §8 测试与验证',
  9: '契约 §9 变更记录',
  10: '契约 §10 生产 SQL 登记',
};

// ══ 提交信息 trailer（凭据归 git；v2.8.0 起 §9 账本下线后的追溯与判据载体）══
// 权威描述（给人读）在 AGENTS.md 永久段 §5；这里是**机器侧单一来源**——
// selftest 有单一来源守卫，断言 trailer 常量与 AGENTS 永久段 / SKILL.md 一致。
const TRAILERS = { module: '模块', plan: '计划', contract: '契约' };
const TRAILER_NO_CHANGE = '无需变更';
/** 匹配「契约:无需变更」声明：扫提交信息**主题+body 整体**；容忍全角冒号与空白。 */
const TRAILER_NO_CHANGE_RE = /^契约\s*[:：]\s*无需变更\s*$/m;

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
    return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: !!legacyEnRoot };
  }
  if (legacyEnRoot) {
    return { docRoot: legacyEnRoot, docLabel: path.basename(legacyEnRoot), isEn: true, legacy: true };
  }
  return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false };
}

/** 提取 markdown 中标题含 keyword 的章节正文（到下一个 ## 或文末）；keyword 可传数组（多语言候选，先命中先用）。
 *  **大小写不敏感**（`i`）：章节关键词由调用方传入（中文节名 + 数据类英文表头别名如 `Change log`），
 *  容忍渲染时的大小写/全半角变体——否则 `mdSection` 返回 null，上层全部**静默降级**
 *  （I2 失效、应用清单消失、直改边界为空），且不报任何错。 */
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
function secCands(key) {
  return [NAMES.zh[key]];
}

/** 已初始化判据（安装/升级引导用）：任一「文档根 / 档案文件名」组合存在，即算"这个项目跑过接入初始化"。
 *  判的是"接入过"，不是"文档根还有效"——历史英文根（v2.6.0 已下线）与更早的目录名都算，
 *  否则升级会把《接入指南.md》与 AGENTS.md 引导段复活进老项目。
 *  历史目录名/档案名是迁移期知识，**唯一来源在此**；install.js 从这里派生（install.sh 是引导器
 *  的 bash 副本，两处靠互参注释同步）。只判存在不读内容：探测要便宜，且不因格式变化而误判。 */
const INIT_MARKERS = [
  ['doc-framework', NAMES.zh.profile],
  ['doc-framework-en', 'profile.md'],
  ['docs-framework', 'profile.md'],
  ['doc', NAMES.zh.profile],
  ['docs', 'profile.md'],
];

/** @returns {boolean} 项目根下是否存在任一 INIT_MARKERS 组合 */
function isInitialized(root) {
  return INIT_MARKERS.some(([d, f]) => fs.existsSync(path.join(root, d, f)));
}

// ══ 4. 档案：应用清单与「文件属于哪个应用」══

/** 定位档案文件（文档根固定 `doc-framework/`，档案固定 `项目档案.md`）；不存在则返回 null。
 *  单独导出是为了让 CLI 也能在"档案存在但读不出"时给出提示（否则会静默落进旧版档案回退分支）。 */
function findProfilePath(docRoot) {
  return [NAMES.zh.profile].map(f => path.join(docRoot, f)).find(p => fs.existsSync(p)) || null;
}

/** 解析档案「应用清单」表 → [{id, type, root, spec}]；无此节或无有效行返回 null（旧版档案回退） */
function parseAppRegistry(docRoot) {
  const profilePath = findProfilePath(docRoot);
  if (!profilePath) return null;
  // 读失败（EACCES / EISDIR）降级为"无档案"，由调用方给清晰提示，不抛栈（纪律：解析器降级不崩溃）
  let content;
  try { content = fs.readFileSync(profilePath, 'utf-8'); } catch { return null; }
  const sec = mdSection(content, secCands('secRegistry'));
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
 * 应用类型关键词匹配：kind = 'front'（前端应用）| 'back'（服务端/聚合层）。
 * 只按中文关键词匹配（'frontend' 这类英文登记值匹配不到——应用清单「类型」请登记中文词）。
 */
function appTypeMatches(type, kind) {
  const key = kind === 'front' ? 'typeFrontendWords' : 'typeBackendWords';
  const words = NAMES.zh[key] || [];
  const t = String(type || '').toLowerCase();
  return words.some(w => t.includes(String(w).toLowerCase()));
}

// ══ 5. 契约：应用落点，以及 markdown 表格/勾选清单的通用解析 ══

/**
 * 解析模块契约 §5 应用落点表 → { contractPath, apps, paths }
 * 用途：**直改通道的边界来源**（无计划时按契约落点推导允许改动的应用集合）；
 * `paths`（v2.8.0 新增，§5「文件位置」列）供"文档是否落后于代码"检查当 pathspec 用。
 * 未找到契约返回 null；契约在但 §5 为空/未解析 → apps 为空数组（上层据此硬报错）。
 */
function parseContractScope(docRoot, moduleName) {
  const contractPath = path.join(docRoot, NAMES.zh.dirs.modules, moduleName, NAMES.zh.moduleContract);
  if (!fs.existsSync(contractPath)) return null;
  if (!contractPath) return null;
  // 读失败降级为"无契约范围"，由调用方给清晰提示，不抛栈（纪律：解析器降级不崩溃）
  let content;
  try { content = fs.readFileSync(contractPath, 'utf-8'); } catch { return null; }
  const sec = mdSection(content, secCands('secScope'));
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
  return { contractPath, apps, ...scopePathsFromSection(sec) };
}

/** 切分 markdown 表格行为单元格并**保留反引号**（tableRows 会去掉反引号；需要 token 信息的场景用本函数）。 */
function splitRowKeepTicks(row) {
  const t = String(row || '').trim();
  // 反引号内的 `|` 属于值本身：先占位再切分，避免静默丢列/错位
  const guarded = t.replace(/`[^`\n]*`/g, m => m.replace(/\|/g, '\u0001'));
  const cells = guarded.split('|').map(c => c.replace(/\u0001/g, '|').trim());
  return cells.slice(1, -1);
}

/** 「文件位置」列的表头写法（主匹配）；匹配不到时退回宽匹配。 */
const SCOPE_PATH_COL_STRICT = /文件位置|文件路径|落点文件|落点路径/;
const SCOPE_PATH_COL_LOOSE = /文件|路径/;

/**
 * 从契约 §5 原文提取「文件位置」列 → { pairs, paths }。
 * 用途："文档是否落后"检查的 pathspec（v2.8.0）。
 * **pairs = [{ app, path }]**：§5 的文件位置是**相对各应用代码根**写的（如 `views/order/…`），
 * 必须带上该行的应用标识，由调用方按档案「应用清单」拼成仓库根相对路径——
 * 直接拿裸路径当 git pathspec 会匹配不到任何文件，让检查**静默失效**。
 * 提取规则（plan/2026-10-14 方案 §2.3）：
 *   1. 按**表头列名**定位「文件位置」列（不写死列序——设计文档 §6.6 的教训）；
 *   2. 取单元格内反引号包裹的 token；无反引号则取整格；
 *   3. 归一：去掉 `…`/`...`、去掉尾部 `/`、丢弃含 `{` 的占位；
 *   4. 一格多路径按 `、`/`,`/`，` 切分（**不按空白切**，避免把含空格的路径切碎）。
 */
function scopePathsFromSection(sec) {
  const lines = String(sec || '').split(/\r?\n/);
  const isRow = s => /^\s*\|/.test(s);
  const isSep = s => /^\s*\|[\s:|-]+\|\s*$/.test(s);
  const pairs = [];
  const paths = [];
  let i = 0;
  while (i < lines.length) {
    if (!isRow(lines[i]) || i + 1 >= lines.length || !isSep(lines[i + 1])) { i++; continue; }
    const headers = splitRowKeepTicks(lines[i]).map(c => c.replace(/`/g, '').trim());
    let col = headers.findIndex(h => SCOPE_PATH_COL_STRICT.test(h));
    if (col < 0) col = headers.findIndex(h => SCOPE_PATH_COL_LOOSE.test(h));
    i += 2; // 跳过本表表头与分隔行
    while (i < lines.length && isRow(lines[i])) {
      // 无空行相邻的另一张表：表头行后面紧跟分隔行 → 交回外层当新表头
      if (i + 1 < lines.length && isSep(lines[i + 1])) break;
      const raw = lines[i]; i++;
      if (col < 0) continue;
      const cells = splitRowKeepTicks(raw);
      const app = (cells[0] || '').replace(/`/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
      const cell = cells[col] || '';
      const ticks = [...cell.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim()).filter(Boolean);
      const tokens = ticks.length ? ticks : [cell.replace(/`/g, '').trim()];
      for (const piece of tokens) {
        for (let tok of piece.split(/[、，,]/)) {
          tok = tok.trim().replace(/…+$/, '').replace(/\.{3,}$/, '').replace(/\/+$/, '').trim();
          if (!tok || tok.includes('{') || tok === '—' || tok === '-') continue;
          if (!paths.includes(tok)) paths.push(tok);
          if (app && !app.includes('{')) pairs.push({ app, path: tok });
        }
      }
    }
  }
  return { pairs, paths };
}

// ══ 5.5 规范层：应用规范主题分册与小节标题（v2.8.0，§2.9 判据用）══

/** 发现某应用的主题分册文件（`规范/{应用标识}-{主题}.md`）→ 文件名数组（不含目录，已排序）。 */
function appSpecTopicFiles(docRoot, appId) {
  const dir = path.join(docRoot, NAMES.zh.dirs.standards);
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const prefix = `${appId}-`;
  return entries.filter(f => f.startsWith(prefix) && f.endsWith('.md')).sort();
}

/**
 * 抽取应用规范的 `###` 小节标题 → [{ raw, norm }]。
 * norm 归一规则（plan §2.9.5c）：剥离**尾部连续括注组**（`（本应用核心约定）`/`（v1.3 新增）` 等）、
 * 去掉章号前缀（`3.1 `）、归一空白——供"跨应用同题"判据做相等比较。
 * **只剥离尾部括注，不做词序归一**（承认漏报，先保零误报）。
 */
function appSpecSectionTitles(content) {
  const out = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (!m) continue;
    const raw = m[1].trim();
    let norm = raw;
    let prev;
    do { prev = norm; norm = norm.replace(/[（(][^（）()]*[）)]\s*$/, '').trim(); } while (norm !== prev);
    norm = norm.replace(/^\d+(?:\.\d+)*[.、]?\s*/, '').replace(/\s+/g, ' ').trim();
    if (norm) out.push({ raw, norm });
  }
  return out;
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
    // 无编号的清单项（如 `- [ ] 契约变更记录追加一行`）没有稳定 id，只能截前若干字符当展示标签；
    // 它只用于 show/list 的"未完成项"提示，**不要当键用**（截断后会与别的条目重复）。
    const id = idMatch ? idMatch[1] : text.slice(0, CHECKLIST_FALLBACK_ID_LEN);
    if (m[1].toLowerCase() === 'x') out.done += 1;
    else out.open.push(id);
  }
  return out;
}

// ══ 6. 计划：标识（模块/主题/是否归档）与「语义增量」══

/**
 * 从计划路径解析 {module, subject, crossModule}（模块名从 模块/{名}/计划/ 或空=跨模块）
 * `archived` 只按中文 `计划/归档/` 判定（v2.6.0 起命名类别一律不再识别英文/历史目录名）——
 * 否则误把归档计划当在途计划扫回体检，`list --stale` 也会误报。
 */
function planIdentity(root, planPath) {
  const rel = path.relative(root, planPath);
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
 * 解析计划「语义增量」节 → { added, modified, removed, total, skipped, nonEmpty, mergeState, hasSection, hasMergeLine }
 * 三张表列固定（`# / 目标位置 / 对象 / 内容（或 现值·目标值·理由）/ 主计划`）；章节缺失/本地定制 → 降级返回空值。
 * `skipped` = 因含未渲染占位符 `{{…}}` 被跳过的编号行数——**供上层显式报出**，
 * 避免"行被静默丢弃、total 只是变小"（见下方跳过逻辑的注释）。
 */
function parseDelta(content) {
  const out = {
    added: [], modified: [], removed: [],
    total: 0, skipped: 0, nonEmpty: false, mergeState: null, mergeRaw: null, hasSection: false, hasMergeLine: false,
  };
  const sec = mdSection(content, secCands('secDelta'));
  if (!sec) return out;
  out.hasSection = true;
  // lexicon() 恒为中文词表（v2.6.0 起只支持中文命名），别名对去重后只取一份
  const mf = reEscape(NAMES.zh.fldMerge);
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
    // 列定位：优先按表头里的「主计划」列名，退化到"最后一列"——列位不靠写死下标
    const tRows = tableRows(part);
    const leadNames = [NAMES.zh.leadPlanCol].filter(Boolean);
    const headRow = tRows.find(r => r.some(c => leadNames.some(n => String(c).trim() === n)));
    const leadIdx = headRow ? headRow.findIndex(c => leadNames.some(n => String(c).trim() === n)) : -1;
    for (const cells of tRows) {
      const c0 = (cells[0] || '').trim();
      // 只认编号行（跳过表头）。编号约定是 `A1/M1/R1`，但英文/手写常见 `ADD-1` / `MOD-1` / `REM-1`——
      // 漏认会让整表行数变 0（delta.nonEmpty=false），**I2 硬校验被静默绕过**，所以放宽前缀写法。
      if (!/^(?:ADD|MOD|REM|A|M|R)[-_]?\d+$/i.test(c0)) continue;
      // 跳过未渲染模板行（占位符 `{{…}}` 或渲染后残留的裸 X）。
      // ★ 占位符的唯一标记是**双**花括号 `{{…}}`（《接入指南》渲染纪律：渲染后 `grep -n '{{'` 应为空）；
      //   **单**花括号是「记法」（`{penaltyId}` / `{域}:{实体}:{操作}` / `{文档根}`），按定义照原样保留。
      //   旧写法 `includes('{')` 把两者混为一谈：含路由参数/权限标识/命名记法的合法增量行会被
      //   **静默丢弃**（total 只是变小），极端情况下整表为 0 → `delta.nonEmpty=false` → I2 被绕过。
      //   跳过的行不再静默：计入 out.skipped，由 check / --draft-contract 显式报出。
      const rest = cells.slice(1).map(c => String(c || '').trim());
      if (rest.some(c => c.includes('{{'))) { out.skipped += 1; continue; }
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

/** 模块契约是否存在（只认中文文件名 `契约.md`，v2.6.0 起不再识别历史命名）→ 返回契约路径或 null */
function hasContract(docRoot, moduleName) {
  const p = path.join(docRoot, NAMES.zh.dirs.modules, moduleName, NAMES.zh.moduleContract);
  return fs.existsSync(p) ? p : null;
}

/** 「依据」引用是否存在（基准依次为仓库根、文档根；引用可能写成 `{文档根}/…` 或 `doc-framework/…`） */
function contractRefExists(root, docRoot, ref) {
  if (!ref) return false;
  const clean = String(ref).replace(/`/g, '').trim();
  if (!clean || clean.includes('{')) return false;
  return [path.resolve(root, clean), path.resolve(docRoot, clean)].some(p => fs.existsSync(p));
}

/**
 * 文档/说明性路径豁免口径——check 的 docExempt、diff-check 的管辖跳过、moduleImplementationProxy
 * 的实现证据过滤**三处共用**（语义必须一致：文档根内的路径与 AGENTS.md 不参与
 * "是否越界 / 是否已有实现"的判定）。
 */
function isDocPath(docLabel, file) {
  return file === 'AGENTS.md' || file.startsWith(docLabel + '/');
}

/**
 * 「模块是否已有实现」的**代理判据**（设计文档 §7.5）：
 * 本仓库没有任何代码扫描能力（只读文档路径 + 应用代码根存在性 + git 变更清单），
 * 因此只能用「契约是否存在」+「计划变更文件清单里的路径是否已存在」近似判断，**不猜模块名**。
 */
function moduleImplementationProxy(root, plan, docRoot) {
  const docLabel = path.basename(docRoot);
  // 文档/说明性路径不是"模块已有实现"的证据（与 check 的 docExempt 口径一致）
  const files = (plan && plan.fileList ? [...plan.fileList] : [])
    .filter(f => !isDocPath(docLabel, f));
  const existing = files.filter(f => fs.existsSync(path.join(root, f)));
  return {
    contractPath: plan ? hasContract(docRoot, plan.module) : null,
    fileCount: files.length,
    existingCount: existing.length,
    allExist: files.length > 0 && existing.length === files.length,
    mostlyExist: files.length > 0 && existing.length / files.length >= EXIST_MOSTLY_RATIO,
  };
}

// ══ 8. 计划解析（parsePlan）：把一份计划读成结构化对象，全链路降级不崩溃 ══

// ── 8a-8d. parsePlan 的各节解析原语（纯函数：content → 结构化结果，正则逐字保留）──

/** 逐应用表态表 → {应用标识: 'skip'|'change'|'unknown'}（表态值只认中文词：改动 / 本次不改 / 不适用） */
function parseStances(content) {
  const stances = {};
  for (const cells of tableRows(mdSection(content, secCands('secStance')))) {
    if (cells.length < 2 || !cells[0]) continue;
    if (/^(应用(\s*标识)?|apps?(\s*id)?|applications?)$/i.test(cells[0].trim()) || cells[0].includes('{')) continue;
    const v = String(cells[1] || '').toLowerCase();
    const isSkip = NAMES.zh.stanceSkip.some(k => v.includes(k.toLowerCase()));
    const isChange = !isSkip && NAMES.zh.stanceChange.some(k => v.includes(k.toLowerCase()));
    stances[cells[0]] = isSkip ? 'skip' : isChange ? 'change' : 'unknown';
  }
  return stances;
}

/** 变更文件清单 → Set<路径>：先剥离代码围栏（围栏内是示例，不是真实清单）；
 *  表格行按"整格"取路径（不按空白切词，避免含空格路径被拆散），**排除每行最后一列=说明列**；
 *  非表格行只认"像路径"的 token（有扩展名或目录尾斜杠）。一律归一化前导 './' 与反斜杠。 */
function parseFileList(content) {
  const fileList = new Set();
  const listSecRaw = mdSection(content, secCands('secFiles'));
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
    fileList.add(normalized.replace(/\/+$/g, ''));
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
    const headerRe = new RegExp(NAMES.zh.headerWords.join('|'), 'i');
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
  return fileList;
}

/** 「依据模块契约」引用 → { contracts, contractRefs }。取值域已放宽——
 *  可指向**已存在的契约**，也可指向被依赖模块的**首次建模计划路径**（该模块尚无契约）。 */
function parseContractRefs(content) {
  const contracts = [];
  const contractRefs = [];
  const contractLabel = reEscape(NAMES.zh.fldContracts);
  const contractFiles = reEscape(NAMES.zh.moduleContract);
  // 行首可选 `>`：模板写成引用块（`> 依据模块契约：`），手写/v1 计划常写成纯行——两种都要认
  // 取值优先反引号内容；**无反引号时按整行兜底**（与 evidence 口径对齐）——否则纯文本写法会让
  // contractRefs 为空 → 被误判成"首次建模计划" → 连锁误报
  for (const m of content.matchAll(new RegExp(`^[ \t]*>?[ \t]*${fldPat(contractLabel)}[：:][^\n]*`, 'gm'))) {
    const line = m[0];
    const rawVal = line.replace(new RegExp(`^[ \t]*>?[ \t]*${fldPat(contractLabel)}[：:]`), '').trim();
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
  return { contracts, contractRefs };
}

/** 「依据探索记录」（首次建模计划必填；人工显式降级写哨兵 `无（自述）`，AI 不得自行省略） */
function parseEvidence(content) {
  const evFlds = reEscape(NAMES.zh.fldEvidence);
  const evM = content.match(new RegExp(`^[ \t]*>?[ \t]*${fldPat(evFlds)}[：:]\s*([^\n]+)`, 'm'));
  let evidence = { raw: '', path: null, sentinel: false };
  if (evM) {
    const raw = evM[1].trim();
    if (!raw.startsWith('{')) {
      const ticks = raw.match(/`([^`\n]+)`/);
      const sentinels = [NAMES.zh.evidenceSentinel, '无（自述）', 'self-described', 'none (self-described)']
        .filter(Boolean).map(t => String(t).toLowerCase());
      // 收紧为"trim 后等值"（允许反引号包裹）：`includes` 会把"人工降级：无（自述）"这类说明也当哨兵
      const probe = raw.replace(/`/g, '').trim().toLowerCase();
      const isSentinel = sentinels.includes(probe);
      evidence = { raw, path: isSentinel ? null : (ticks ? ticks[1].trim() : raw), sentinel: isSentinel };
    }
  }
  return evidence;
}

/**
 * 解析实施计划 → 结构化对象（降级不崩溃：缺章节即缺省；节名/字段名/状态枚举只认中文词表）
 * @returns {{path,rel,module,subject,archived,state,shape,stances,fileList,tasks,writeback,compat,contracts}}
 */
function parsePlan(root, planPath) {
  const content = fs.readFileSync(planPath, 'utf-8');
  const id = planIdentity(root, planPath);
  const flds = reEscape(NAMES.zh.fldState);

  // 状态：优先取头部 blockquote（`> 状态：已批准` / `> **Status**: approved`），避免误抓修订记录表格里的历史状态
  const stateM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(flds)}[：:]\\s*([^\\n]+)`, 'm'))
    || content.match(new RegExp(`${fldPat(flds)}[：:]\\s*([^\\n]+)`));
  // 未渲染模板（`> 状态：{待审核 | …}`）不算解析出状态，交由"缺状态字段"显式报出
  const stateRaw = stateM ? stateM[1].replace(/[（(].*$/, '').trim() : '';
  const state = stateRaw.startsWith('{') ? null : normalizeState(stateRaw);

  // 计划形态：完整（默认，八节齐全）/ 轻量（只表态+清单+任务，可选节可标"无"）
  // 只认行首那一个取值——模板 `> 计划形态：完整（**轻量**形态只保留…）` 的括注里也含"轻量"，不能用 includes 判定
  const shapeFlds = reEscape(NAMES.zh.fldShape);
  const shapeM = content.match(new RegExp(`^[ \\t]*>?[ \\t]*${fldPat(shapeFlds)}[：:]\\s*([^\\s（(]+)`, 'm'));
  const shapeTok = shapeM ? shapeM[1].trim() : '';
  const lightToks = [NAMES.zh.shapeLight];
  const fullToks = [NAMES.zh.shapeFull];
  const shape = !shapeTok || shapeTok.startsWith('{') ? null
    : lightToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'light'
      : fullToks.some(t => t && shapeTok.toLowerCase() === String(t).toLowerCase()) ? 'full' : null;

  const stances = parseStances(content);

  const fileList = parseFileList(content);

  const compatSec = mdSection(content, secCands('secCompat'));
  const { contracts, contractRefs } = parseContractRefs(content);

  // 依据探索记录（首次建模计划必填；人工显式降级写哨兵 `无（自述）`，AI 不得自行省略）
  const evidence = parseEvidence(content);
  const delta = parseDelta(content);
  const modelingNotes = mdSection(content, secCands('secModeling'));
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
    tasks: parseChecklist(mdSection(content, secCands('secTasks'))),
    writeback: parseChecklist(mdSection(content, secCands('secWriteback'))),
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

// ══ 10. 目录解析与计划枚举（在途 / 归档；目录名只认中文词表，防混排盲区）══

/**
 * 取某个顶层目录的中文候选名（v2.6.0 起命名类别不再识别任何英文/历史目录名），与 `hasContract` / `parseAppRegistry`
 * 的口径一致。为什么并集：文档根是框架专有目录，混排布局下另一套目录名里的计划不该"静默不可见"
 * （体系虽禁止混用，但盲区比报错更糟）。
 * kind：`'modules'` / `'plans'` 返回 docRoot 下的绝对路径；`'modulePlan'` 返回相对模块目录的名字。
 */
function docDirs(docRoot, kind) {
  const name = kind === 'modules' ? NAMES.zh.dirs.modules : kind === 'plans' ? NAMES.zh.dirs.plans : NAMES.zh.modulePlanDir;
  return kind === 'modulePlan' ? [name] : [path.join(docRoot, name)];
}

/**
 * 枚举计划文件路径（模块内 + 跨模块），排除归档目录（只认中文 `归档/`，不识别 `archive/`）。
 * **递归**子目录：早期只认计划目录顶层的 `.md`，于是把计划放进 `计划/done/` 这类自建子目录
 * 就能同时逃过常规体检与 I2 归档兜底（实测：`已完成 + 待合并 + 非空增量` 放进去 check 退出码 0）。
 * 为免把子目录里的随手笔记当成计划报错，**嵌套目录只认日期前缀文件** `YYYY-MM-DD-…`（顶层保持原行为）。
 * 目录不可读时安静跳过（由调用方按"计划数量异常"另行提示，不抛 Node 栈）。
 */
function collectPlanPaths(docRoot) {
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
  for (const modulesDir of docDirs(docRoot, 'modules')) {
    let mods = [];
    try { mods = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { mods = []; }
    for (const ent of mods) {
      if (!ent.isDirectory()) continue;
      for (const pd of docDirs(docRoot, 'modulePlan')) {
        walkPlanDir(path.join(modulesDir, ent.name, pd), false);
      }
    }
  }
  for (const gd of docDirs(docRoot, 'plans')) walkPlanDir(gd, false);
  return out;
}

/** 归档目录名候选（v2.6.0 起只有中文 `归档/`，`archive/` 不再识别） */
function archiveDirNames() {
  return [NAMES.zh.archiveDir];
}

/** 枚举归档计划（模块目录下的 计划/归档 与全局 计划/归档）——归档不参与常规体检，但 I2 兜底要查 */
function collectArchivedPlans(docRoot) {
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
  for (const modulesDir of docDirs(docRoot, 'modules')) {
    let mods = [];
    try { mods = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { mods = []; }
    for (const ent of mods) {
      if (!ent.isDirectory()) continue;
      for (const pd of docDirs(docRoot, 'modulePlan')) {
        for (const ad of archiveDirNames()) pushDir(path.join(modulesDir, ent.name, pd, ad));
      }
    }
  }
  for (const gd of docDirs(docRoot, 'plans')) {
    for (const ad of archiveDirNames()) pushDir(path.join(gd, ad));
  }
  return out;
}

/** 枚举在途计划（解析失败的计划被跳过；collectPlanPaths + parsePlan 可获取失败明细） */
function listPlans(root, docRoot) {
  const plans = [];
  for (const p of collectPlanPaths(docRoot)) {
    try {
      plans.push(parsePlan(root, p));
    } catch {
      /* 解析失败的计划跳过（降级不崩溃），check 通过 collectPlanPaths 另报明细 */
    }
  }
  return plans.sort((a, b) => (a.subject < b.subject ? 1 : -1));
}

// ══ 11.（已删除）契约 §9 回链凭据解析 ══
// v2.8.0 起 §9 账本下线（plan/2026-10-14 方案）：R3 只校验"已存在的 §9 行有没有写凭据"，
// **漏写不报**——机器价值≈0。判据升级为 check 的「文档落后检查」（依 git 历史判定，
// 见 cli.js stageDocSync），原 parseContractMergeRows / SOURCE_VALUES / isSourceValue 随之删除。

// 阈值类魔数集中在此（改动只影响判定，不影响任何输出文案）
const EXIST_MOSTLY_RATIO = 0.5;        // moduleImplementationProxy：清单文件已存在过半 → 疑似存量模块
const CHECKLIST_FALLBACK_ID_LEN = 12;  // parseChecklist：无编号清单项的展示标签截断长度
const EXPLORATION_HEADER_LINES = 15;   // parseExplorationHeader：只读文件头前 N 行

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

// ══ 13. 探索记录枚举与头部解析（`list --explore` 用）══

/**
 * 解析单份探索记录的头部引用行（`> 状态：` / `> 结论去向：` / `> 已被：`）。
 *
 * 纪律对齐模板 `templates/探索/YYYY-MM-DD-{主题}.md.tpl` 头部：
 *   - 容忍 markdown 加粗（`> **状态**：已定案`），与计划解析器的 fldPat 口径一致；
 *   - 只读**文件头前 15 行**的引用行，正文永不参与解析；
 *   - 「状态」人读但 `list --explore` 需要聚合它——枚举：探索中 / 已定案 / 已使用 / 已作废，
 *     旧写法「已废弃」按数据兼容别名归一为「已作废」（只用于读，写新文档一律用新枚举）；
 *   - 头部缺失/未识别 → state='未知'，照常列出（探索记录不参与 check 硬校验，这里也降级不抛错）。
 */
function parseExplorationHeader(filePath, fileName, archived) {
  let content = '';
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { content = ''; }
  const head = content.split('\n').slice(0, EXPLORATION_HEADER_LINES);
  const grab = (label) => {
    const re = new RegExp('^>\\s*\\*{0,2}' + reEscape(label) + '\\*{0,2}\\s*[：:]\\s*(.+?)\\s*$');
    for (const line of head) {
      const m = line.match(re);
      if (m) return m[1].trim();
    }
    return null;
  };
  const rawState = grab('状态');
  let state = '未知';
  if (rawState) {
    const m = rawState.match(/(探索中|已定案|已使用|已作废|已废弃)/);
    state = m ? (m[1] === '已废弃' ? '已作废' : m[1]) : '未知';
  }
  return {
    subject: fileName.replace(/\.md$/, ''),
    state,
    outcome: grab('结论去向'),
    supersededBy: grab('已被'),
    archived: !!archived,
    path: filePath,
  };
}

/**
 * 枚举探索记录：`{文档根}/探索/`（探索中 + 已定案待消费）与 `{文档根}/探索/归档/`
 * （已使用 + 已作废 + 定案即归档的"不做"结论），两侧并集、按文件名（日期前缀）倒序。
 * 位置本身即生命周期信号，所以 `archived` 必须随记录返回给上层展示。
 * 目录不存在时安静跳过（探索/ 不是必需目录）；非 .md 文件忽略。
 */
function listExplorations(docRoot) {
  const out = [];
  const scan = (dir, archived) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      out.push(parseExplorationHeader(path.join(dir, ent.name), ent.name, archived));
    }
  };
  const exploreDir = path.join(docRoot, NAMES.zh.dirs.explore);
  scan(exploreDir, false);
  scan(path.join(exploreDir, NAMES.zh.archiveDir), true);
  return out.sort((a, b) => (a.subject < b.subject ? 1 : -1));
}

// ══ 导出：CLI（scripts/cli.js）与 selftest 都只经这里取入口 ══

module.exports = {
  resolveDocRoot,
  isInitialized,
  NAMES,
  CONTRACT_CHAPTERS,
  TRAILERS,
  TRAILER_NO_CHANGE,
  TRAILER_NO_CHANGE_RE,
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
  parseDocstructVersion,
  moduleImplementationProxy,
  isDocPath,
  planIdentity,
  parsePlan,
  inFileList,
  collectPlanPaths,
  collectArchivedPlans,
  listExplorations,
  docDirs,
  listPlans,
  appSpecTopicFiles,
  appSpecSectionTitles,
};
