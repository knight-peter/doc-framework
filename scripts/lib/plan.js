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
  if (fs.existsSync(zhRoot)) return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false };
  if (fs.existsSync(enRoot)) return { docRoot: enRoot, docLabel: 'doc-framework-en', isEn: true, legacy: false };
  if (fs.existsSync(legacyRoot)) return { docRoot: legacyRoot, docLabel: 'docs-framework', isEn: true, legacy: true };
  return { docRoot: zhRoot, docLabel: 'doc-framework', isEn: false, legacy: false };
}

/** 提取 markdown 中标题含 keyword 的章节正文（到下一个 ## 或文末） */
function mdSection(content, keyword) {
  const re = new RegExp(`^##[^\\n]*${keyword}[^\\n]*\\n`, 'm');
  const m = content.match(re);
  if (!m) return null;
  const rest = content.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** 解析档案「应用清单」表 → [{id, type, root, spec}]；无此节或无有效行返回 null（旧版档案回退） */
function parseAppRegistry(docRoot) {
  const profilePath = ['项目档案.md', 'profile.md']
    .map(f => path.join(docRoot, f)).find(p => fs.existsSync(p));
  if (!profilePath) return null;
  const content = fs.readFileSync(profilePath, 'utf-8');
  const sec = mdSection(content, '应用清单');
  if (!sec) return null;
  const lines = sec.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null; // 表头 + 分隔 + 至少一行
  const header = lines[0].split('|').map(c => c.trim());
  const col = (...names) => header.findIndex(h => names.some(n => h.includes(n)));
  const iId = col('应用标识', '应用');
  const iType = col('类型');
  const iRoot = col('代码根');
  const iSpec = col('规范文件');
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
 * 解析模块契约 §5 应用落点表 → { contractPath, apps }
 * 用途：**直改通道的边界来源**（无计划时按契约落点推导允许改动的应用集合）。
 * 未找到契约返回 null；契约在但 §5 为空/未解析 → apps 为空数组（上层据此硬报错）。
 */
function parseContractScope(docRoot, moduleName) {
  const candidates = [
    path.join(docRoot, '模块', moduleName, '契约.md'),
    path.join(docRoot, 'modules', moduleName, 'contract.md'),
  ];
  const contractPath = candidates.find(p => fs.existsSync(p));
  if (!contractPath) return null;
  const content = fs.readFileSync(contractPath, 'utf-8');
  const sec = mdSection(content, '应用落点') || mdSection(content, 'Application');
  const apps = [];
  if (sec) {
    for (const cells of tableRows(sec)) {
      // 跳过表头行（首列为「应用」/「Application」，中英模板通用）
      if (/^(应用|Application)/i.test(cells[0] || '')) continue;
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
function planIdentity(root, planPath) {
  const rel = path.relative(root, planPath);
  const m = rel.match(/模块[\\/]([^\\/]+)[\\/]计划[\\/]/);
  return {
    rel,
    module: m ? m[1] : '(跨模块)',
    crossModule: !m,
    subject: path.basename(planPath).replace(/\.md$/, ''),
    archived: /(^|[\\/])archive[\\/]/.test(rel),
  };
}

/**
 * 解析实施计划 → 结构化对象（降级不崩溃：缺章节即缺省）
 * @returns {{path,rel,module,subject,archived,state,stances,fileList,tasks,writeback,compat,contracts}}
 */
function parsePlan(root, planPath) {
  const content = fs.readFileSync(planPath, 'utf-8');
  const id = planIdentity(root, planPath);

  // 状态：优先取头部 blockquote（`> 状态：已批准`），避免误抓修订记录表格里的历史状态
  const stateM = content.match(/^>\s*状态[：:]\s*(待审核|修订中|已批准|实施中|已完成|已废弃)/m)
    || content.match(/状态[：:]\s*(待审核|修订中|已批准|实施中|已完成|已废弃)/);

  // 计划形态：完整（默认，八节齐全）/ 轻量（只表态+清单+任务，可选节可标"无"）
  const shapeM = content.match(/^>\s*计划形态[：:]\s*(完整|轻量)/m);

  // 逐应用表态：| 应用 | 表态 | 说明 |
  const stances = {};
  for (const cells of tableRows(mdSection(content, '逐应用表态'))) {
    if (cells.length < 2 || !cells[0]) continue;
    if (cells[0].includes('应用') || cells[0].includes('{')) continue;
    const v = cells[1] || '';
    stances[cells[0]] = v.includes('不改') ? 'skip' : v.includes('不适用') ? 'skip' : v.includes('改动') ? 'change' : 'unknown';
  }

  // 变更文件清单：先剥离代码围栏（围栏内是示例，不是真实清单）；
  // 表格行按"整格"取路径（不按空白切词，避免含空格路径被拆散），**排除每行最后一列=说明列**；
  // 非表格行只认"像路径"的 token（有扩展名或目录尾斜杠）。一律归一化前导 './' 与反斜杠。
  const fileList = new Set();
  const listSecRaw = mdSection(content, '变更文件清单');
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
    for (const l of listSec.split('\n')) {
      const t0 = l.trim();
      if (t0.startsWith('#') || t0.startsWith('>')) continue; // 标题与说明文字不是文件路径
      if (t0.startsWith('|')) {
        if (t0.includes('---')) continue; // 分隔行
        const cells = t0.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
        if (!cells.length || cells.some(c => c.includes('---'))) continue;
        if (/文件|应用|所属服务/.test(cells.join('|')) && cells.every(c => !c.includes('/'))) continue; // 表头
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

  const compatSec = mdSection(content, '接口兼容性声明');
  // 依据模块契约：跨模块计划可能有多行，逐行提取反引号内的契约路径
  const contracts = [];
  for (const m of content.matchAll(/依据模块契约[：:][^\n]*/g)) {
    for (const c of m[0].matchAll(/`([^`]*契约\.md)`/g)) {
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
    state: stateM ? stateM[1] : null,
    shape: shapeM ? (shapeM[1] === '轻量' ? 'light' : 'full') : null,
    stances,
    fileList,
    tasks: parseChecklist(mdSection(content, '任务清单')),
    writeback: parseChecklist(mdSection(content, '回写清单')),
    compat: compatSec ? (compatSec.match(/变更类型[：:]\s*(.+)/) || [])[1] || null : null,
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

/** 枚举计划文件路径（模块内 + 跨模块），排除 计划/archive/（只认顶层 .md，天然排除子目录） */
function collectPlanPaths(docRoot) {
  const out = [];
  const modulesDir = path.join(docRoot, '模块');
  if (fs.existsSync(modulesDir)) {
    for (const mod of fs.readdirSync(modulesDir)) {
      const planDir = path.join(modulesDir, mod, '计划');
      if (!fs.existsSync(planDir)) continue;
      for (const f of fs.readdirSync(planDir)) {
        if (f.endsWith('.md')) out.push(path.join(planDir, f));
      }
    }
  }
  const globalPlanDir = path.join(docRoot, '计划');
  if (fs.existsSync(globalPlanDir)) {
    for (const f of fs.readdirSync(globalPlanDir)) {
      if (f.endsWith('.md')) out.push(path.join(globalPlanDir, f));
    }
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

module.exports = {
  resolveDocRoot,
  mdSection,
  parseAppRegistry,
  matchApp,
  parseContractScope,
  tableRows,
  parseChecklist,
  planIdentity,
  parsePlan,
  inFileList,
  collectPlanPaths,
  listPlans,
};
