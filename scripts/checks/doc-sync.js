'use strict';
/** check 阶段 3.6：文档是否落后于代码。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需；模块契约/接口.md 先探可读性）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const plan = require('../lib/plan');

/** 阶段 3.6：文档是否落后于代码。
 *  判据：
 *    基线 C = 契约.md 与 接口.md 最后提交中的较晚者（`git log -1` 多路径一次取）；
 *    S = `git log --no-merges C..HEAD -- <§5「文件位置」∩ 应用代码根>`；
 *    未回写 = S 中提交信息（主题+body）不含「契约:无需变更」的提交；非空 → 提示。
 *  校验的是"契约是否还对得上当前代码"（而不是"已存在的 §9 行有没有写凭据"）——漏回写会被发现，
 *  这正是框架第一不变量（契约 = 当前代码的语义映射）的机器化。
 *  级别：默认 ℹ️ 不进退出码（§5 常是目录级路径，同目录无关提交会命中）；`--strict` 升 ⚠️ 进退出码。
 *  降级（全部只 ℹ️ 不 ❌，聚合为一条）：无 git / 文档未提交 / 文档有未提交修改（改完未提交窗口必误报）/
 *    基线不在 HEAD 祖先（疑似 rebase，差集会刷屏）/ §5 无可解析路径。 */
function stageDocSync(ctx, registry) {
  const { root, docRoot, docLabel, listDir, strict, readText } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg) => strict ? issues.push(`⚠️ ${msg}`) : notes.push(`ℹ️ ${msg}`);
  const modulesDir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  if (!fs.existsSync(modulesDir)) return { issues, notes };
  if (gitRun(root, ['rev-parse', '--is-inside-work-tree']) === null) {
    notes.push('ℹ️ 文档落后检查跳过：当前目录不是 git 仓库（或无 git 命令）——该检查依赖 git 历史');
    return { issues, notes };
  }
  const appRootOf = id => {
    const hit = (registry || []).find(a => a.id === id);
    return hit && hit.root ? hit.root : null;
  };
  const skipped = [];
  for (const mod of listDir(modulesDir)) {
    const contractPath = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
    const apiPath = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleApi);
    // 先探可读性：parseContractScope 内部 catch 后返回 null，会让"文档读不出"表现为"模块没有契约"，
    // 静默跳过本模块的文档落后检查。读不出 → 记入 unreadable（最终统一 ❌），本模块跳过。
    if (fs.existsSync(contractPath) && readText(contractPath) === null) continue;
    if (fs.existsSync(apiPath) && readText(apiPath) === null) continue;
    const scope = plan.parseContractScope(docRoot, mod);
    if (!scope) continue;
    const relContract = path.relative(root, scope.contractPath);
    const docFiles = fs.existsSync(apiPath) ? [relContract, path.relative(root, apiPath)] : [relContract];
    // 基线 = 契约/接口.md 最后提交中的较晚者
    const baseOut = gitRun(root, ['log', '-1', '--format=%H', '--', ...docFiles]);
    const base = baseOut && baseOut.trim();
    if (!base) { skipped.push(`${mod}（文档未提交）`); continue; }
    const dirty = gitRun(root, ['status', '--porcelain', '--', ...docFiles]);
    if (dirty === null) { skipped.push(`${mod}（git status 调用失败）`); continue; }
    if (dirty.trim()) { skipped.push(`${mod}（文档有未提交改动，先提交再判定）`); continue; }
    // 基线由 `git log` 从 HEAD 现算 → 必然是 HEAD 祖先，rebase 不会让它失效
    // §5「文件位置」可能是**应用根相对**（`views/order/…`）也可能是**仓库根相对**
    // （`services/order/src/…`）——两种真实写法都存在。判定：已以应用根开头 → 原样用；
    // 否则拼上应用根。拿错基准 = pathspec 匹配不到任何文件 → 检查静默失效。
    const specs = [];
    const noRoot = new Set();
    for (const pr of scope.pairs) {
      const r = appRootOf(pr.app);
      if (r == null) { noRoot.add(pr.app); continue; }
      specs.push(r === '.' || pr.path === r || pr.path.startsWith(`${r}/`) ? pr.path : `${r}/${pr.path}`);
    }
    if (!specs.length) { skipped.push(`${mod}（§5 无可解析的文件位置）`); continue; }
    const out = gitRun(root, ['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', `${base}..HEAD`, '--', ...specs]);
    const stale = (out || '').split('\x1e').map(s => s.trim()).filter(Boolean)
      .map(rec => {
        const parts = rec.split('\x1f');
        const sha = parts[0] || '';
        const subject = parts[1] || '';
  return { sha, subject, message: parts.slice(1).join('\n') };
      })
      .filter(c => !plan.TRAILER_NO_CHANGE_RE.test(c.message));
    if (stale.length) {
      const top = stale.slice(0, 3).map(c => `${c.sha.slice(0, 7)} ${c.subject}`.trim());
      report(`文档可能落后于代码：${docLabel}/${plan.NAMES.zh.dirs.modules}/${mod}`
        + `（基线 ${base.slice(0, 7)} 之后有 ${stale.length} 个落点代码提交未回写：${top.join('；')}${stale.length > 3 ? ' 等' : ''}）`
        + `——跑 /module-doc ${mod} 对账；确认无语义变更时在提交信息写「契约:无需变更」`);
    }
    if (noRoot.size) {
      notes.push(`ℹ️ 模块「${mod}」契约 §5 的落点应用未在档案应用清单登记（其路径已跳过）：${[...noRoot].join('、')}`);
    }
  }
  if (skipped.length) {
    notes.push(`ℹ️ 文档落后检查跳过 ${skipped.length} 个模块：${skipped.join('、')}`);
  }
  return { issues, notes };
}

/** git 调用（execFileSync 数组参数：§5 文件位置是用户内容，走 shell 字符串会有注入与转义问题）。
 *  失败返回 null（降级由调用方处理）；stderr 丢弃（git 失败时会喷 usage，淹没 CI 日志——
 *  真正的错误信息由调用方给一行，与 diff-check 的口径一致）。 */
function gitRun(root, args) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { return null; }
}

module.exports = { stageDocSync };
