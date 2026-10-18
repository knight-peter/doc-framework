'use strict';
/** diff-check 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const { execSync } = require('child_process');
const { parseArgs, resolvePlanArg } = require('../lib/util');
const path = require('path');
const install = require('../install');
const plan = require('../lib/plan');

/**
 * 取"本次变更的文件列表"（diff-check 的输入）。
 *
 * @param {string|null} base   对比基准（如 `HEAD`、某分支）；null 时用 `HEAD`
 * @param {boolean} staged     只看暂存区。**--staged 不再并入未跟踪文件**——它的语义是
 *                             pre-commit 闸门"将要提交的内容"，而没 `git add` 的新文件
 *                             不该卡住提交（design: 与 --staged 的语义保持一致）
 * @returns {string[]} 仓库相对路径（已去重）
 */
function gitChangedFiles(base, staged) {
  // core.quotepath=false：中文路径不转义，保证 doc-framework/ 等前缀排除生效
  // stderr 必须丢弃：git 失败时会喷 ~90 行 `usage: git diff --no-index …`，再被 execSync 包进
  // `Command failed:` 里二次打印——CI 日志直接被淹没，看不到真正的 ❌ 原因（错误信息由调用方给一行）。
  const run = args => execSync(`git -c core.quotepath=false ${args}`, {
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
  }).split('\n').map(s => s.trim()).filter(Boolean);
  // --staged = pre-commit 闸门，口径是"将要提交的内容"：只看 --cached。
  // 不能再并入未跟踪文件——否则一个还没 `git add` 的新文件会直接卡住提交（与 --staged 的语义矛盾）
  if (staged) return run('diff --cached --name-only');
  let files;
  if (base) files = run(`diff --name-only ${base}`);
  else files = run('diff --name-only HEAD');
  const untracked = run('ls-files --others --exclude-standard');
  return [...new Set([...files, ...untracked])];
}

/**
 * `doc-framework diff-check`：提交前对账——把 git 变更与"授权范围"比对，越界即失败。
 *
 * 两种模式（二选一，同时给会报错）：
 *   - `<计划路径>`：授权范围 = 计划「变更文件清单」∩ 表态为"改动"的应用代码根；
 *   - `--module <模块名>`：**直改通道**，授权范围 = 契约 §5「应用落点」里登记的应用
 *     （应用级边界，粒度比计划粗），故仅适用于无计划的实现级小改。
 *
 * 结果分级：越界（errors）一定失败；警告（warnings）默认不失败，`--strict` 时才失败。
 * 计划处于不可执行状态（待审核/已完成/缺状态）时直接拒绝——对账的前提是"这份计划真的在生效"。
 * 注：「执行「待审核」计划 = 调用即批准」是 **skill 侧**（/module-code）的动作：它先把状态登记为
 * 「已批准」再实施，因此落到文件上的状态始终是可执行态、本闸门照常放行；**本命令不因此放宽**——
 * 不认「待审核」，也不替任何人登记状态（设计文档 §4.4）。
 *
 * **管辖范围（重要，别把契约当"管全仓库"）**：判据只在**应用清单登记的应用**内成立——
 * 「越界」= 文件所属应用不在授权范围（或不在计划清单内）。**不属于任何已登记应用**的文件
 * （仓库根脚本、构建/CI 配置等）契约无权判定，只报 ⚠️ 提示、默认不影响退出码；
 * 管辖不到的文件是否该改由人判断，工具不替它背书。
 *
 * @param {string[]} argv 命令参数
 * @returns {number} 0 = 通过（含仅有警告且未加 --strict）；1 = 有越界或用法错误
 */
function diffCheck(argv) {
  const root = install.PROJECT_ROOT;
  const { flags, positionals, missingValue } = parseArgs(argv, ['--base', '--module']);
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework diff-check <计划路径> | --module <模块名> [--base <ref>] [--staged] [--strict]）`);
    return 1;
  }
  const planArg = positionals[0];
  const moduleArg = flags['--module'] || null;
  if (!planArg && !moduleArg) {
    console.log('用法：doc-framework diff-check <计划路径> [--base <ref>] [--staged] [--strict]');
    console.log('      doc-framework diff-check --module <模块名> [--base <ref>] [--staged] [--strict]   # 直改通道：边界=契约 §5 落点');
    return 1;
  }
  if (planArg && moduleArg) {
    console.log('❌ 计划路径与 --module 二选一（前者对账计划白名单，后者对账契约 §5 落点）');
    return 1;
  }
  let planPath = null;
  if (planArg) {
    planPath = resolvePlanArg(root, planArg);
    if (!planPath) return 1;
  }
  const base = flags['--base'] || null;
  const staged = !!flags['--staged'];
  const strict = !!flags['--strict'];
  // `--base` 会拼进 shell 串，先做保守校验（防止 `--base "main; rm -rf /"` 这类注入）
  if (base && !/^[A-Za-z0-9._\/@{}~^:-]+$/.test(base)) {
    console.log(`❌ --base 取值不合法：${base}（只允许 ref 名常见字符）`);
    return 1;
  }

  const { docRoot, docLabel } = plan.resolveDocRoot(root);
  const registry = plan.parseAppRegistry(docRoot);
  if (!registry) {
    console.log(`❌ 档案缺少「应用清单」（${docLabel}/${plan.NAMES.zh.profile}），diff-check 需要应用清单提供代码根`);
    return 1;
  }

  const errors = [];
  const warnings = [];
  let p = null;
  let scopeApps = null;
  let scopeLabel = '';

  if (planArg) {
    try {
      p = plan.parsePlan(root, planPath);
    } catch (e) {
      console.log(`❌ 计划无法解析：${planArg}（${e.message}）`);
      return 1;
    }
    if (!p.state) {
    // 状态认不出 = 无法确认"已批准"→ 提交前闸门必须拦住（不得以 ⚠️ 放行）
      errors.push(`❌ 计划未解析到状态字段（无法确认已批准，不得放行）：${planArg}`);
    } else if (p.state !== '已批准' && p.state !== '实施中') {
      errors.push(`❌ 计划状态为「${p.state}」，不是可执行状态（已批准/实施中）：${planArg}`);
    }
    for (const appId of Object.keys(p.stances)) {
      if (!registry.some(a => a.id === appId)) {
        errors.push(`❌ 计划表态了未登记应用「${appId}」（先回填档案应用清单）`);
      }
    }
    scopeLabel = `计划：${p.rel}（状态=${p.state || '未知'}${p.shape === 'light' ? '，轻量' : ''}）`;
  } else {
    // 直改通道：无计划，边界从模块契约 §5 应用落点表推导（应用级）
    const scope = plan.parseContractScope(docRoot, moduleArg);
    if (!scope) {
      console.log(`❌ 未找到模块契约：${docLabel}/${plan.NAMES.zh.dirs.modules}/${moduleArg}/${plan.NAMES.zh.moduleContract}`);
      console.log('   直改通道的边界来源是契约 §5 应用落点表。待实现模块（代码库零实现）请改用计划通道：');
      console.log(`   doc-framework diff-check <计划路径>（由 /module-plan ${moduleArg} 建首次建模计划）；`);
      console.log(`   已有代码但契约缺失 → 先 /module-doc ${moduleArg} 代码对账补建契约。`);
      return 1;
    }
    if (!scope.apps.length) {
      console.log(`❌ 契约 §5「应用落点」为空或未解析到：${path.relative(root, scope.contractPath)}`);
      console.log('   请先 /module-doc 补全落点表（落点先登记后实施），再走直改通道。');
      return 1;
    }
    scopeApps = scope.apps;
    scopeLabel = `模块：${moduleArg}（直改通道，边界=契约 §5 落点：${scopeApps.join('、')}）`;
    for (const appId of scopeApps) {
      if (!registry.some(a => a.id === appId)) {
        warnings.push(`⚠️ 契约落点应用「${appId}」未登记在档案应用清单（先回填档案）`);
      }
    }
  }

  let changed;
  try {
    changed = gitChangedFiles(base, staged);
  } catch (e) {
    console.log(`❌ 读取 git 变更失败：${e.message}`);
    return 1;
  }
  for (const file of changed) {
    if (plan.isDocPath(docLabel, file)) continue; // 文档回写不受白名单约束
    const owner = plan.matchApp(registry, file);
    if (!owner) {
      warnings.push(`⚠️ 不在任何已登记应用代码根下（契约管辖不到，工具不判定是否越界，请自行确认）：${file}`);
      continue;
    }
    if (scopeApps) {
      // 直改通道：应用级边界（防的是"改到别的应用"，文件级细节交 /module-review 事后审计）
      if (!scopeApps.includes(owner.id)) {
        errors.push(`❌ 越界：${file} 属于应用「${owner.id}」，不在模块「${moduleArg}」契约 §5 落点内（直改通道边界=落点应用）`);
      }
      continue;
    }
    const st = p.stances[owner.id];
    if (st === 'skip') {
      errors.push(`❌ 越界：${file} 属于表态「本次不改/不适用」的应用「${owner.id}」`);
      continue;
    }
    if (st === undefined) {
      warnings.push(`⚠️ 应用「${owner.id}」未在计划中表态，变更文件：${file}（漏表态 = 漏改红线）`);
      continue;
    }
    if (!plan.inFileList(p.fileList, file)) {
      if (owner.root === '.') {
        errors.push(`❌ 越界：${file} 不在计划变更文件清单内（应用「${owner.id}」代码根为 ./，白名单已退化为文件级）`);
      } else {
        warnings.push(`⚠️ 清单外文件：${file}（应用「${owner.id}」表态=改动，但该文件未列入计划变更文件清单，建议回 /module-plan 补登记）`);
      }
    }
  }

  const scope = staged ? 'staged' : base ? `vs ${base}` : 'vs HEAD（含未跟踪）';
  console.log(`[diff-check] ${scopeLabel}｜范围：${scope}｜变更文件 ${changed.length} 个`);
  for (const e of errors) console.log(`  ${e}`);
  for (const w of warnings) console.log(`  ${w}`);
  if (errors.length || (strict && warnings.length)) {
    console.log(`❌ diff-check 未通过：${errors.length} 个越界，${warnings.length} 个警告${strict ? '（--strict 警告即失败）' : ''}`);
    return 1;
  }
  console.log(`✅ diff-check 通过：${errors.length} 个越界，${warnings.length} 个警告`);
  return 0;
}

module.exports = { gitChangedFiles, diffCheck };
