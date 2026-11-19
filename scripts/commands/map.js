'use strict';
/**
 * `doc-framework map` —— **只读**的路径反查（不属 check，不影响退出码语义）。
 *
 *   1) `map <路径>`：这个文件/目录归哪个模块管、该读哪份契约、§5 第几行、应用规范、§7 不变量；
 *   2) `map --uncovered`：哪些 git 跟踪文件没有任何契约 §5 落点覆盖（按目录聚合）。
 *
 * 数据源：档案应用清单 + 契约 §5 + `git ls-files`。**只读路径，不读源码**，不依赖语言/框架。
 * 不落盘、不缓存：每次现算，零漂移。
 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const plan = require('../lib/plan');
const contract = require('../lib/contract');
const coverage = require('../lib/coverage');
const { parseArgs } = require('../lib/util');

const USAGE = `用法：
  doc-framework map <路径> [--root <项目根>] [--json]   反查：路径归哪个模块 / 该读哪份契约与规范
  doc-framework map --uncovered [--app <应用标识>] [--root <项目根>] [--json]
                                             列出未被任何契约 §5 落点覆盖的 git 跟踪文件（只读）`;

/** §5 节内行号 → 契约文件绝对行号（定位 `## 5.` 标题行；标题改过就退回节内行号）。 */
function absLineOf(text, relLine) {
  const m = /^##\s*5\.[^\n]*$/m.exec(text);
  if (!m) return relLine;
  const base = text.slice(0, m.index).split('\n').length;
  return base + relLine;
}

/** 读模块契约的 §7 不变量 ID 列表（复用 contract.analyzeContract，不另写 INV 解析）。 */
function invariantsOf(contractPath) {
  try {
    const text = fs.readFileSync(contractPath, 'utf-8');
    const a = contract.analyzeContract(text, { moduleName: path.basename(path.dirname(contractPath)) });
    return { text, ids: a.inv.invariants.map(x => x.id) };
  } catch { return { text: '', ids: [] }; }
}

function relOf(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function runLookup(root, docRoot, registry, arg, json) {
  const rel = path.isAbsolute(arg) ? coverage.normRel(relOf(root, arg)) : coverage.normRel(arg);
  const r = coverage.lookup(rel, docRoot, registry);
  const matches = r.matches.map(m => {
    const inv = invariantsOf(m.contract);
    return {
      module: m.module,
      contract: relOf(root, m.contract),
      scopeLine: m.line ? absLineOf(inv.text, m.line) : 0,
      scopePath: m.path,
      app: m.app,
      spec: (() => {
        const a = registry.find(x => x.id === m.app);
        return a && a.spec ? relOf(root, path.join(docRoot, a.spec)) : '';
      })(),
      invariants: inv.ids,
    };
  });
  if (json) {
    console.log(JSON.stringify({ path: r.target, app: r.app, covered: matches.length > 0, matches }, null, 2));
    return 0;
  }
  if (!matches.length) {
    console.log(`未被任何契约 §5 覆盖：${r.target}${r.app ? ` ｜ app=${r.app}` : ''}`);
    console.log('  两个出口：① 补进模块契约 §5 落点表（/module-doc）  ② 确认是应用级/框架级文件，无需覆盖');
    return 0;
  }
  matches.forEach((m, i) => {
    if (i) console.log('');
    console.log(`模块：${m.module}`);
    console.log(`契约：${m.contract}`);
    console.log(`§5  ：${m.scopeLine ? `第 ${m.scopeLine} 行` : '（无行号）'} ｜ app=${m.app} ｜ path=${m.scopePath}`);
    if (m.spec) console.log(`规范：${m.spec}`);
    console.log(m.invariants.length
      ? `不变量：${m.invariants.slice(0, 3).join('、')}${m.invariants.length > 3 ? ' 等' : ''}（共 ${m.invariants.length} 条，见 §7）`
      : '不变量：—（§7 未建）');
  });
  if (matches.length > 1) console.log(`\n⚠️ 同深度命中 ${matches.length} 处——交叉覆盖本身就是需要人工确认的信号。`);
  return 0;
}

function runUncovered(root, docRoot, registry, app, json) {
  const r = coverage.uncovered(root, docRoot, registry, { app });
  if (!r.ok) {
    if (r.reason === 'no-app') {
      console.log(`❌ 档案应用清单里没有应用${app ? `「${app}」` : ''}——先登记应用再统计覆盖`);
      return 1;
    }
    console.log('ℹ️ 当前目录不是 git 仓库（或无 git）——无法枚举跟踪文件，map --uncovered 跳过');
    return 0;
  }
  const pct = r.total ? ((r.covered / r.total) * 100).toFixed(1) : '0.0';
  if (json) {
    console.log(JSON.stringify({
      app: app || null, total: r.total, covered: r.covered,
      uncovered: r.uncovered.length, files: r.uncovered, dirs: r.dirs,
    }, null, 2));
    return 0;
  }
  console.log(`覆盖：${r.covered} / ${r.total}（${pct}%）；未覆盖 ${r.uncovered.length}`);
  if (!r.uncovered.length) return 0;
  console.log('按目录聚合（Top 20）：');
  for (const d of r.dirs.slice(0, 20)) {
    console.log(`  ${String(d.count).padStart(5)}  ${d.dir === '.' ? '（仓库根）' : d.dir}`);
  }
  return 0;
}

function map(argv = []) {
  const { flags, positionals, missingValue, unknownFlags } = parseArgs(
    argv, ['--root', '--app'], ['--uncovered', '--json'],
  );
  if (unknownFlags.length || missingValue.length) {
    if (unknownFlags.length) console.log(`❌ 未识别选项：${unknownFlags.join(', ')}`);
    if (missingValue.length) console.log(`❌ 选项缺少取值：${missingValue.join(', ')}`);
    console.log(USAGE);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  if (!fs.existsSync(docRoot)) {
    console.log(`❌ 未找到文档根 ${docLabel}/。请在已接入 doc-framework 的项目根目录运行。`);
    return 1;
  }
  const registry = plan.parseAppRegistry(docRoot);
  if (!registry) {
    console.log(`❌ ${docLabel}/项目档案.md 缺「应用清单」——map 的路径归属与应用规范都从它派生，先补登记。`);
    return 1;
  }
  if (flags['--uncovered']) {
    if (positionals.length) {
      console.log('❌ `--uncovered` 不接受路径参数（两个模式互斥）');
      console.log(USAGE);
      return 1;
    }
    return runUncovered(root, docRoot, registry, flags['--app'], !!flags['--json']);
  }
  if (positionals.length !== 1) {
    console.log(USAGE);
    return 1;
  }
  return runLookup(root, docRoot, registry, positionals[0], !!flags['--json']);
}

module.exports = { map };
