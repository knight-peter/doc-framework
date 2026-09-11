'use strict';
/**
 * 计划与应用清单解析公共模块（cli.js 的 check / diff-check / list / show 共用）
 *
 * 设计纪律：
 *   1. 解析器必须**降级不崩溃**——章节缺失时返回空值/缺省，不抛异常（计划模板可能被本地定制）；
 *   2. 路径一律从档案「应用清单」的代码根派生，**禁止写死目录名**（如 apps/）；
 *   3. 归档计划（`计划/archive/`）不参与任何 glob 清单，需路径直达。
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

/** 应用类型关键词匹配（中英通用）：kind = 'front'（前端端）| 'back'（服务端/聚合层） */
function appTypeMatches(lex, type, kind) {
  const words = kind === 'front' ? lex.typeFrontendWords : lex.typeBackendWords;
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
    const cells = t.split('|').map(c => c.replace(/`/g, '').trim());
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

/** 从计划路径解析 {module, subject, crossModule}（模块名从 模块/{名}/计划/ 或空=跨模块） */
function planIdentity(root, planPath, lex) {
  const rel = path.relative(root, planPath);
  const lex2 = lex || lexicon(root);
  const other = lex2 === NAMES.en ? NAMES.zh : NAMES.en;
  const dirs = [...new Set([lex2.dirs.modules, other.dirs.modules])].map(reEscape).join('|');
  const planDirs = [...new Set([lex2.modulePlanDir, other.modulePlanDir])].map(reEscape).join('|');
  const m = rel.match(new RegExp(`(?:${dirs})[\\\\/]([^\\\\/]+)[\\\\/](?:${planDirs})[\\\\/]`));
  return {
    rel,
    module: m ? m[1] : '(跨模块)',
    crossModule: !m,
    subject: path.basename(planPath).replace(/\.md$/, ''),
    archived: /(^|[\\/])archive[\\/]/.test(rel),
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

  // 状态：优先取头部 blockquote（`> 状态：已批准` / `> Status: approved`），避免误抓修订记录表格里的历史状态
  const stateM = content.match(new RegExp(`^>\\s*(?:${flds})[：:]\\s*([^\\n]+)`, 'm'))
    || content.match(new RegExp(`(?:${flds})[：:]\\s*([^\\n]+)`));
  // 未渲染模板（`> 状态：{待审核 | …}`）不算解析出状态，交由"缺状态字段"显式报出
  const stateRaw = stateM ? stateM[1].replace(/[（(].*$/, '').trim() : '';
  const state = stateRaw.startsWith('{') ? null : normalizeState(stateRaw);

  // 计划形态：完整（默认，八节齐全）/ 轻量（只表态+清单+任务，可选节可标"无"）
  // 只认行首那一个取值——模板 `> 计划形态：完整（**轻量**形态只保留…）` 的括注里也含"轻量"，不能用 includes 判定
  const shapeFlds = [lex.fldShape, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldShape].map(reEscape).join('|');
  const shapeM = content.match(new RegExp(`^>\\s*(?:${shapeFlds})[：:]\\s*([^\\s（(]+)`, 'm'));
  const shapeTok = shapeM ? shapeM[1].trim() : '';
  const shape = !shapeTok || shapeTok.startsWith('{') ? null
    : /^(轻量|light)$/i.test(shapeTok) ? 'light'
      : /^(完整|full)$/i.test(shapeTok) ? 'full' : null;

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
    if (!normalized.includes('/')) return false;
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
  // 依据模块契约（Module contract）：跨模块计划可能有多行，逐行提取反引号内的契约路径
  const contracts = [];
  const contractLabel = [lex.fldContracts, (lex === NAMES.en ? NAMES.zh : NAMES.en).fldContracts].map(reEscape).join('|');
  const contractFiles = [lex.moduleContract, (lex === NAMES.en ? NAMES.zh : NAMES.en).moduleContract].map(reEscape).join('|');
  for (const m of content.matchAll(new RegExp(`(?:${contractLabel})[：:][^\\n]*`, 'g'))) {
    for (const c of m[0].matchAll(new RegExp('`([^`]*(?:' + contractFiles + '))`', 'g'))) {
      if (!contracts.includes(c[1])) contracts.push(c[1]);
    }
  }

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

/** 枚举计划文件路径（模块内 + 跨模块），排除 plans/archive/（只认顶层 .md，天然排除子目录） */
function collectPlanPaths(docRoot, lex = lexicon(docRoot)) {
  const out = [];
  const modulesDir = path.join(docRoot, lex.dirs.modules);
  if (fs.existsSync(modulesDir)) {
    for (const mod of fs.readdirSync(modulesDir)) {
      const planDir = path.join(modulesDir, mod, lex.modulePlanDir);
      if (!fs.existsSync(planDir)) continue;
      for (const f of fs.readdirSync(planDir)) {
        if (f.endsWith('.md')) out.push(path.join(planDir, f));
      }
    }
  }
  const globalPlanDir = path.join(docRoot, lex.dirs.plans);
  if (fs.existsSync(globalPlanDir)) {
    for (const f of fs.readdirSync(globalPlanDir)) {
      if (f.endsWith('.md')) out.push(path.join(globalPlanDir, f));
    }
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
  mdSection,
  parseAppRegistry,
  matchApp,
  appTypeMatches,
  parseContractScope,
  tableRows,
  parseChecklist,
  planIdentity,
  parsePlan,
  inFileList,
  collectPlanPaths,
  listPlans,
};
