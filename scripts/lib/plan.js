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

/** 文档根探测（中文模式 doc-framework/ 优先，否则英文模式 docs-framework/） */
function resolveDocRoot(root) {
  const cnRoot = path.join(root, 'doc-framework');
  const enRoot = path.join(root, 'docs-framework');
  const docRoot = fs.existsSync(cnRoot) ? cnRoot : enRoot;
  return { docRoot, docLabel: docRoot === enRoot ? 'docs-framework' : 'doc-framework' };
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
  const apps = [];
  for (const l of lines.slice(2)) {
    const cells = l.split('|').map(c => strip(c));
    const id = cells[iId];
    if (!id || id.includes('{')) continue; // 跳过未渲染占位行
    apps.push({
      id,
      type: iType >= 0 ? cells[iType] : '',
      root: (cells[iRoot] || '').replace(/\/+$/, '') || '.',
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

/** 解析勾选清单（`- [ ] 1.1 任务`）→ {total, done, open[]} */
function parseChecklist(sectionText) {
  const out = { total: 0, done: 0, open: [] };
  if (!sectionText) return out;
  for (const l of sectionText.split('\n')) {
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

  const stateM = content.match(/状态[：:]\s*(待审核|修订中|已批准|实施中|已完成|已废弃)/);

  // 逐应用表态：| 应用 | 表态 | 说明 |
  const stances = {};
  for (const cells of tableRows(mdSection(content, '逐应用表态'))) {
    if (cells.length < 2) continue;
    if (cells[0].includes('应用') || cells[0].includes('{')) continue;
    const v = cells[1] || '';
    stances[cells[0]] = v.includes('不改') ? 'skip' : v.includes('不适用') ? 'skip' : v.includes('改动') ? 'change' : 'unknown';
  }

  // 变更文件清单：含 '/' 的 token（排除 URL/占位符）
  const fileList = new Set();
  const listSec = mdSection(content, '变更文件清单');
  if (listSec) {
    for (const l of listSec.split('\n')) {
      if (l.trim().startsWith('|') && (l.includes('---') || l.includes('文件'))) continue;
      const tokens = l.match(/`[^`\n]+`|[^\s|`，。；]+/g) || [];
      for (const t of tokens) {
        const clean = t.replace(/`/g, '').trim();
        if (clean.includes('/') && !clean.includes('{') && !/^https?:/.test(clean) && !/^(YYYY|placeholder)/i.test(clean)) {
          fileList.add(clean.replace(/\/+$/, ''));
        }
      }
    }
  }

  const compatSec = mdSection(content, '接口兼容性声明');
  const contractsSec = mdSection(content, '依据模块契约');
  const contracts = [];
  if (contractsSec) {
    for (const l of contractsSec.split('\n')) {
      const m = l.match(/`([^`]*契约\.md)`/);
      if (m) contracts.push(m[1]);
    }
  }
  const headContract = content.match(/依据模块契约[：:]\s*`([^`]+)`/);
  if (headContract && !contracts.includes(headContract[1])) contracts.push(headContract[1]);

  return {
    path: planPath,
    rel: id.rel,
    module: id.module,
    crossModule: id.crossModule,
    subject: id.subject,
    archived: id.archived,
    state: stateM ? stateM[1] : null,
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

/** 枚举在途计划（模块内 + 跨模块），排除 计划/archive/；返回 [{plan, docRoot}] */
function listPlans(root, docRoot) {
  const out = [];
  const modulesDir = path.join(docRoot, '模块');
  if (fs.existsSync(modulesDir)) {
    for (const mod of fs.readdirSync(modulesDir)) {
      const planDir = path.join(modulesDir, mod, '计划');
      if (!fs.existsSync(planDir)) continue;
      for (const f of fs.readdirSync(planDir)) {
        if (!f.endsWith('.md')) continue; // 只认顶层，天然排除 archive/ 子目录
        out.push(path.join(planDir, f));
      }
    }
  }
  const globalPlanDir = path.join(docRoot, '计划');
  if (fs.existsSync(globalPlanDir)) {
    for (const f of fs.readdirSync(globalPlanDir)) {
      if (!f.endsWith('.md')) continue;
      out.push(path.join(globalPlanDir, f));
    }
  }
  const plans = [];
  for (const p of out) {
    try {
      plans.push(parsePlan(root, p));
    } catch (e) {
      /* 解析失败的计划跳过（降级不崩溃），由 check 体检提示 */
    }
  }
  return plans.sort((a, b) => (a.subject < b.subject ? 1 : -1));
}

module.exports = {
  resolveDocRoot,
  mdSection,
  parseAppRegistry,
  matchApp,
  tableRows,
  parseChecklist,
  planIdentity,
  parsePlan,
  inFileList,
  listPlans,
};
