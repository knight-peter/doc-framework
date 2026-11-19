'use strict';
/**
 * §5 落点覆盖计算（`map` 命令与管理报告共用）。
 *
 * 纪律（设计文档 §7.5）：**只读路径**——不读源码、不依赖语言/框架。
 * 数据源只有三样：档案应用清单 + 契约 §5「应用落点」+ `git ls-files`。
 * 每次现算，不落盘、不缓存：派生物一旦落盘就要治理，等于把第二份真相搬进仓库。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const plan = require('./plan');

/** 统一为仓库根相对的 posix 路径（去 `./`、反斜杠、尾部 `/`）。 */
function normRel(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * §5 路径归一为**仓库根相对**：与 `checks/contract-health.js` 同口径——
 * 已以本应用根开头 → 原样用；明确以**另一个**应用根开头 → 按仓库根相对；否则拼本应用根。
 * 拿错基准 = 前缀永远匹配不到，覆盖统计会静默失效。
 */
function repoPathOf(pair, app, registry) {
  const raw = normRel(pair.path);
  if (!app) return raw;
  const others = (registry || []).filter(a => a.root && a.root !== '.')
    .sort((a, b) => b.root.length - a.root.length);
  const otherApp = others.find(a => a.id !== app.id && (raw === a.root || raw.startsWith(a.root + '/')));
  if (app.root === '.' || raw === app.root || raw.startsWith(app.root + '/') || otherApp) return raw;
  return normRel(path.posix.join(app.root, raw));
}

/** 收集全部模块契约的 §5 落点 → [{module, app, appRoot, path, repoPath, line, contract}]。 */
function collectScopes(docRoot, registry) {
  const modulesDir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  let mods;
  try { mods = fs.readdirSync(modulesDir); } catch { return []; }
  const out = [];
  for (const mod of mods) {
    const scope = plan.parseContractScope(docRoot, mod);
    if (!scope) continue;
    for (const pair of scope.pairs) {
      const app = (registry || []).find(a => a.id === pair.app) || null;
      out.push({
        module: mod,
        app: pair.app,
        appRoot: app ? app.root : '',
        path: normRel(pair.path),
        repoPath: repoPathOf(pair, app || { id: pair.app, root: '.' }, registry),
        line: pair.line || 0,
        contract: scope.contractPath,
      });
    }
  }
  return out;
}

/**
 * 反查：一个路径归哪个模块管。
 * 匹配规则 = 双向前缀（文件落在目录落点下 / 目录包含某落点）；**最深优先**，同深度多命中全部返回
 * （交叉覆盖本身就是信号，不替用户裁决）。
 * @returns {{target, app, matches: Array}}
 */
function lookup(relPath, docRoot, registry) {
  const target = normRel(relPath);
  const scopes = collectScopes(docRoot, registry);
  const hits = [];
  for (const s of scopes) {
    if (!s.repoPath) continue;
    const hit = target === s.repoPath
      || target.startsWith(s.repoPath + '/')
      || s.repoPath.startsWith(target + '/');
    if (hit) hits.push({ ...s, depth: s.repoPath.length });
  }
  const appOfFile = plan.matchApp(registry || [], target);
  if (!hits.length) return { target, app: appOfFile ? appOfFile.id : null, matches: [] };
  const maxDepth = Math.max(...hits.map(h => h.depth));
  const matches = hits.filter(h => h.depth === maxDepth)
    .sort((a, b) => a.module.localeCompare(b.module, 'zh'));
  return { target, app: appOfFile ? appOfFile.id : matches[0].app, matches };
}

/**
 * 未覆盖文件：git 跟踪文件 − 已登记 §5 落点前缀。
 * 排除：文档根（应用根登记为 `.` 时尤其重要）、AGENTS.md。
 * @returns {{ok:false, reason:'not-git'|'no-app'} | {ok:true, total, covered, uncovered:string[], dirs:Array}}
 */
function uncovered(root, docRoot, registry, opts = {}) {
  const scopes = collectScopes(docRoot, registry);
  const prefixes = scopes.map(s => s.repoPath).filter(Boolean);
  const docRel = normRel(path.relative(root, docRoot));
  const skip = f => f === 'AGENTS.md' || (docRel && (f === docRel || f.startsWith(docRel + '/')));
  const apps = (registry || []).filter(a => !opts.app || a.id === opts.app);
  if (!apps.length) return { ok: false, reason: 'no-app' };
  const seen = new Set();
  let gitOk = false;
  for (const app of apps) {
    let out;
    try {
      out = execFileSync('git', ['ls-files', '-z', '--', app.root === '.' ? '.' : app.root], {
        cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      });
    } catch { continue; }
    gitOk = true;
    for (const f of out.split('\0')) if (f) seen.add(f);
  }
  if (!gitOk) return { ok: false, reason: 'not-git' };
  const files = [...seen].filter(f => !skip(f));
  const covered = files.filter(f => prefixes.some(p => f === p || f.startsWith(p + '/')));
  const coveredSet = new Set(covered);
  const missing = files.filter(f => !coveredSet.has(f));
  const dirCount = new Map();
  for (const f of missing) {
    const dir = path.posix.dirname(f);
    dirCount.set(dir, (dirCount.get(dir) || 0) + 1);
  }
  const dirs = [...dirCount.entries()].map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));
  return { ok: true, total: files.length, covered: covered.length, uncovered: missing, dirs };
}

module.exports = { collectScopes, lookup, uncovered, repoPathOf, normRel };
