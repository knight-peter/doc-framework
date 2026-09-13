#!/usr/bin/env node
/**
 * doc-framework CLI
 * 用法：
 *   doc-framework sync                    —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework check                   —— 校验文档体系完整性（骨架 + 应用清单 + 计划体检 + 契约 §9 合并回链 + 结构版本哨兵 + 占位符残留）
 *   doc-framework diff-check <计划路径>    —— 提交前对账：git 变更 vs 计划白名单
 *   doc-framework list                    —— 列出在途计划（状态/涉及应用/任务进度）
 *   doc-framework show <计划路径>          —— 查看单个计划的结构化视图
 *   doc-framework --help                  —— 帮助
 *
 * 设计纪律：
 *   1. 除 sync 外所有命令**只读**，可安全用于 CI / pre-commit；
 *   2. 解析器降级不崩溃（计划模板可能被本地定制）：缺章节 → 缺省/提示，不抛异常；
 *   3. 路径一律从档案「应用清单」派生，禁止写死目录名；
 *   4. 归档计划（中文 `计划/归档/`、英文 `plans/archive/`）不参与 glob 清单，需路径直达；
 *   5. `--json` 是机器消费接口，当前标记 experimental（格式可能变动）。
 *
 * check 逻辑（文档根固定 doc-framework/；英文文档根已下线，检出即显式报错）：
 *   1. 骨架完整性：必需文件/目录是否存在
 *   2. 应用清单校验（档案含「应用清单」时启用；否则回退旧版前后端规范校验）
 *   3. 计划体检：表态应用已登记、清单路径落在对应应用代码根下、状态与任务进度一致
 *   4. 占位符残留 / 引导残留
 *   5. 退出码：0=通过，1=有硬问题（提示项不影响退出码）
 *
 * 本文件结构（按出现顺序，函数级细节见各自 JSDoc）：
 *   sync / check / diff-check / list / show / help —— 六个命令；**除 sync 外全部只读**
 *   hashFile / readMarker      —— sync 的逐文件哈希与安装标记读取（定制检测的依据）
 *   check(argv)                —— 唯一的多阶段校验器：
 *                                 1 骨架 1.1 哨兵(R4) 2 规范 3 计划体检 3.6 契约 §9 回链(R3)
 *                                 4 占位符 5 引导残留；另有只读子模式 --draft-contract
 *   parseArgs                  —— 参数解析公共设施（命名选项不挤占位置参数）
 *   diffCheck(argv)            —— git 变更 ↔ 计划白名单 / 契约 §5 落点 对账
 *   strWidth / pad             —— list/show 的对齐（中日韩字符按 2 列宽估算）
 *
 * 改本文件前先看：docs/设计文档.md §6.1（命令清单）/ §6.2（参数参考）/ §6.3（check 规则表——
 * 每个 issues.push / notes.push 的**级别**都在那张表登记）/ §6.4（diff-check 白名单推导）。
 * 纪律：新增硬问题必须同时更新 §6.3 与 scripts/selftest.sh 的对应类目（见 §10.3）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const install = require('./install');
const plan = require('./lib/plan');

/** 文件 sha256（hex）。sync 用它比对"安装当时的内容 vs 现在的内容"，从而识别本地定制。 */
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * 读目标 skill 目录里的安装标记 `.doc-framework.json`（由 install.js / sync 写入）。
 *
 * 读不出就返回 null 而**不抛异常**：marker 是"升级辅助信息"，不是必需输入——缺了应降级为
 * "无法判定本地定制"，不能因此让 sync 崩掉。
 *
 * @param {string} targetDir 目标 skill 目录（绝对路径）
 * @returns {{version?:string, files?:Array<{file:string,hash:string}>}|null}
 */
function readMarker(targetDir) {
  const p = path.join(targetDir, install.MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// ── sync ─────────────────────────────────────────────────────

/**
 * `doc-framework sync`：把包内的 `skills/` 升级到已安装位置。
 *
 * 与 install.js 的语义差别（这也是它单独存在的理由）：
 *   - install.js 是**首次安装**：整体覆盖，不关心目标目录里改过什么；
 *   - sync 是**升级**：用 marker 的逐文件 sha256 判断目标文件是否被本地改过，
 *     改过的 skill **跳过并告警**，避免升级把用户的定制覆盖掉。
 *
 * 三个降级分支（都只告警后继续，不中断）：
 *   1. 目标目录不存在（没装、或装到了别处）→ 跳过该目录；
 *   2. marker 版本已是最新 → 直接跳过；
 *   3. marker 缺逐文件 hash（旧版 install.sh 写的，或压根没 marker）→ **按"未定制"覆盖**并明确告警。
 *      这里不能保守地按"已定制"处理：那会让所有官方 skill 全部跳过，**升级静默失效**。
 *
 * 注意：本函数**没有返回值**，入口也不调用 process.exit——退出码恒为 0。
 * 因此每个分支都必须打印一行说明，调用方（人和 CI）只能靠日志判断结果。
 */
function sync() {
  const dirs = install.resolveTargetDirs();
  const src = path.join(install.PKG_ROOT, 'skills');
  let changed = false;

  for (const dir of dirs) {
    const targetDir = path.join(install.PROJECT_ROOT, dir);
    if (!fs.existsSync(targetDir)) {
      console.warn(`[doc-framework] 目标目录不存在，请重新安装：${targetDir}`);
      continue;
    }
    const marker = readMarker(targetDir);
    if (marker && marker.version === `v${install.VERSION}`) {
      console.log(`[doc-framework] ${dir} 已是最新版本 v${install.VERSION}，无需同步`);
      continue;
    }

    console.log(`[doc-framework] ${dir} 版本 ${marker ? marker.version : '未知'} → v${install.VERSION}，开始同步`);
    // marker 的文件键统一按 '/' 比较：install.sh 写的就是 '/'，而 path.join 在 Windows 上给 '\'——
    // 不归一会让同一个文件在两边键不同 → 所有文件都被判"已定制"，升级静默失效。
    const norm = s => String(s).replace(/\\/g, '/');
    const oldHashes = {};
    if (marker && Array.isArray(marker.files)) {
      for (const f of marker.files) oldHashes[norm(f.file)] = f.hash;
    }
    // 标记缺少逐文件 hash（旧版 install.sh 写的 marker，或无 marker）→ 无法判定本地定制，
    // 按"未定制"覆盖并明确告警（否则会把所有官方 skill 误判为已定制而全部跳过，升级静默失效）。
    const canDetectCustomization = Object.keys(oldHashes).length > 0;
    if (!canDetectCustomization) {
      console.warn(marker
        ? `  ! 版本标记缺少逐文件 hash（旧版安装脚本），本次按未定制处理并覆盖`
        : `  ! 未找到版本标记，本次按未定制处理并覆盖`);
    }

    const newFiles = [];
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(targetDir, name);
      const srcFiles = install.walkFiles(from, from)
        .map(f => ({ file: norm(path.join(name, f.file)), hash: f.hash }));

      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        changed = true;
      } else {
        // 「本地定制」的判据是：**marker 里有基线、且磁盘与基线不符**。
        // ★ marker 里没有基线的源文件 = 上游**新增**的文件（旧版 marker 不会记录它），
        //   不能当成定制证据——否则一个新增文件就让整个 skill 目录被判"已定制"跳过，
        //   而 marker 随即被写成新版本 → 后续 sync 因"版本已是最新"整体 no-op，
        //   这次升级连同那个新文件就永久搁浅（无法自愈）。
        const untouched = !canDetectCustomization || srcFiles.every(f => oldHashes[f.file] === undefined
          || (fs.existsSync(path.join(targetDir, f.file))
            && hashFile(path.join(targetDir, f.file)) === oldHashes[f.file]));
        if (untouched) {
          fs.rmSync(to, { recursive: true, force: true });
          fs.cpSync(from, to, { recursive: true });
          console.log(`  ~ 更新：${name}`);
          changed = true;
        } else {
          console.warn(`  ! 跳过（本地已定制）：${name}`);
        }
      }
      newFiles.push(...srcFiles);
    }

    const newMarker = {
      source: `git+https://github.com/knight-peter/doc-framework.git`,
      version: `v${install.VERSION}`,
      installedAt: new Date().toISOString().slice(0, 10),
      files: newFiles,
    };
    fs.writeFileSync(path.join(targetDir, install.MARKER_FILE), JSON.stringify(newMarker, null, 2), 'utf-8');
  }

  if (!changed) console.log('[doc-framework] 同步完成（无变更）');
  console.log('[doc-framework] 已初始化项目不会复活接入引导（见 install.js 已初始化检测）');
}

// ── check ────────────────────────────────────────────────────

/**
 * `doc-framework check`：文档体系完整性校验（本 CLI 的核心）。
 *
 * 子模式：`check --draft-contract <计划路径>` 只读打印「增量条目 → 目标契约章节」清单
 * （供 /module-doc 的 M 合并当 checklist），走完即 return，不进入下面的全量校验。
 *
 * 结果分两级（**这是本函数的输出契约**）：
 *   - `issues` —— 硬问题，退出码 1。判定口径见 docs/设计文档.md §6.3；
 *   - `notes`  —— 提示项，退出码仍为 0（例如"存量旧格式兼容放行"这类不该拦住用户的信息）。
 * 两级都会打印，`✅/❌` 汇总行按 `issues` 是否为空决定。
 *
 * 稳健性要求：**解析器降级不崩溃**（设计文档 §7.5）。不可读路径不抛栈，而是记进 `unreadable`
 * 并统一报一条 ❌——否则中途一个异常会丢掉**已经收集到的全部问题**，表现为"改了权限反而全绿"。
 *
 * @param {string[]} argv 命令参数（`check` 之后的那些）
 * @returns {number} 0 = 通过（可能带提示项）；1 = 有硬问题
 */
function check(argv = []) {
  const root = install.PROJECT_ROOT;
  const { docRoot, docLabel, isEn, legacy, lex } = plan.resolveDocRoot(root);
  const issues = [];   // 硬问题：退出码 1
  const notes = [];    // 提示项：不影响退出码
  // 读取失败不抛栈（体系纪律"解析器降级不崩溃"）：EACCES / EISDIR / ENOENT 也是输入。
  // 旧写法在这些点上裸调 fs → 一个 chmod 000 就吐 10 帧 Node 栈，而且**已收集的 issues 全部丢失**
  // （真正的问题反而看不见）——那正是"改了权限就报不出问题"的假绿来源。
  const unreadable = [];
  const readText = (file) => {
    try { return fs.readFileSync(file, 'utf-8'); }
    catch (e) { unreadable.push(`${path.relative(root, file)}（${e.code || e.message}）`); return null; }
  };
  const listDir = (dir) => {
    try { return fs.readdirSync(dir); }
    catch (e) { unreadable.push(`${path.relative(root, dir)}/（${e.code || e.message}）`); return []; }
  };

  // check --draft-contract <计划路径>：只读输出「增量条目 → 契约章节」建档清单（供 AI 当 checklist，不写文件）
  if (argv[0] === '--draft-contract') {
    const arg = argv[1];
    if (!arg) { console.log('用法：doc-framework check --draft-contract <计划路径>'); return 1; }
    const dp = path.isAbsolute(arg) ? arg : path.join(root, arg);
    if (!fs.existsSync(dp) || !fs.statSync(dp).isFile()) {
      console.log(`❌ 计划文件不存在或不是文件：${arg}`);
      return 1;
    }
    let pp;
    try { pp = plan.parsePlan(root, dp, lex); } catch (e) { console.log(`❌ 计划无法解析：${e.message}`); return 1; }
    // 目标位置可能写成"契约 §3.1 …"（中）或"contract §3.1 …"（英），两种都识别。
    // ★ 「总契约 §N」必须**先判**：`(契约|contract)\s*§4` 是不加锚点的子串匹配，
    //   "总契约 §4 模块索引表" 会被它命中并误判成**模块契约** §4（模块索引表/应用拓扑都是总契约的章）。
    const chapterOf = t => /总契约|root contract/i.test(t) ? '总契约（§3 应用拓扑 / §4 模块索引表 / §5 依赖矩阵之一）'
      : /(契约|contract)\s*§\s*3/i.test(t) ? '契约 §3 数据模型'
        : /(契约|contract)\s*§\s*4/i.test(t) ? '契约 §4 接口概览'
          : /(契约|contract)\s*§\s*5/i.test(t) ? '契约 §5 应用落点'
            : /(契约|contract)\s*§\s*8/i.test(t) ? '契约 §8 测试与验证'
              : /(接口|api)\.md|api-guide/i.test(t) ? '接口.md'
                : /contract\.md/i.test(t) ? '总契约' : '（未识别 → 人工定位）';
    console.log(`[draft-contract] ${pp.rel}`);
    console.log(`模块：${pp.module}｜状态：${pp.state || '未知'}${pp.isFirstBuild ? '｜首次建模计划（M 的 create 分支）' : ''}`);
    console.log(`合并状态：${pp.mergeState || '（缺标记）'}｜增量 ${pp.delta.total} 项（新增 ${pp.delta.added.length} / 修改 ${pp.delta.modified.length} / 删除 ${pp.delta.removed.length}）`);
    console.log(`建模补充：${pp.modelingNotes ? '有（M1–M4）' : '缺——create 分支建档会丢图与边界，先补计划'}`);
    const rows = [
      ...pp.delta.added.map(r => ['ADDED', r]),
      ...pp.delta.modified.map(r => ['MODIFIED', r]),
      ...pp.delta.removed.map(r => ['REMOVED', r]),
    ];
    console.log('\n增量条目 → 目标章节：');
    if (!rows.length) console.log('  （无增量条目：纯实现改动 → 合并状态应为「无需合并」）');
    for (const [kind, r] of rows) {
      const detailTxt = r.detail ? `：${r.detail}` : '';
      console.log(`  ${r.id} ${kind} → ${chapterOf(r.target || '')}｜${r.object || ''}${detailTxt}${r.leadPlan ? `（拆分计划，主计划=${r.leadPlan}）` : ''}`);
    }
    console.log('\n合并/建档九步：① 确认门 ② 读五类输入 ③ 渲染骨架 ④ 按映射表填 §2/§3/§4/§5/§8'
      + ' ⑤ 以代码校正并记偏离 ⑥ 填导航区 ⑦ §9 记「合并」+ 回链凭据 ⑧ 生成 接口.md ⑨ 回写总契约三处 → 翻「已合并」→ 自检 check + /module-review');
    return 0;
  }

  // 0. 前置：当前目录是否已接入（框架仓库自身或未初始化项目给清晰提示，而不是一串缺文件）
  //    英文文档根（doc-framework-en/、旧名 docs-framework/）已下线：必须**显式报错**，
  //    不能落进"未初始化/缺文件"分支——那会让人在几十行"缺少文件"里找不到真正的病因。
  if (legacy) {
    if (isEn) {
      console.log(`❌ 检测到英文文档根 ${docLabel}/：doc-framework 已不再支持英文产物命名。`);
      console.log('   文档根固定为 doc-framework/，目录/文件/章节名一律中文（英文只影响文档内容，不影响命名）。');
      console.log('   迁移：把目录改名为 doc-framework/，并把内部文件名/目录名/章节名按中文命名映射改回');
      console.log('   （映射与理由见 docs/设计文档.md §8.3；将来若要有英文，会提供独立的转换入口）。');
      return 1;
    }
    // 中文根已就位、但英文根还留着：那是遗留垃圾，提示清理即可（不阻塞）
    issues.push(`⚠️ 检测到遗留的英文文档根（doc-framework-en/ 或 docs-framework/）：该模式已下线，请删除该目录（内容已在 doc-framework/）`);
  }
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根 doc-framework/。');
    console.log('   请在已接入 doc-framework 的项目根目录运行，或先对 AI 说"初始化项目"。');
    return 1;
  }

  // 1. 骨架完整性（命名映射唯一来源：plan.js 的 NAMES.zh）
  const N = {
    profile: lex.profile,
    contract: lex.rootContract,
    testSpec: lex.testingGuide,
    apiSpec: lex.apiGuide,
    dirs: [lex.dirs.modules, lex.dirs.boundaries, lex.dirs.standards, lex.dirs.plans],
  };
  const requiredFiles = [N.profile, N.contract, N.testSpec, N.apiSpec];
  const requiredDirs = N.dirs;

  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少文件：${docLabel}/${f}`);
  }
  for (const d of requiredDirs) {
    if (!fs.existsSync(path.join(docRoot, d))) issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
  }

  // 1.1 结构版本哨兵（R4）：比较"文档结构版本"与框架版本。
  //     ⚠️（进退出码）仅用于**哨兵存在且落后**——文档明确声明了它属于旧结构、却已跑在新框架上；
  //     未标记（v2.4.0 之前的文档）只给一条汇总 ℹ️：体系纪律是"文档资产永不回灌、结构变更由人手工执行"，
  //     不能用门禁逼用户改写文档（设计文档 §5.4）。只比 major.minor，避免补丁版本刷屏。
  {
    const FW = install.VERSION;
    const parseVer = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const behind = (docV) => {
      const [dMa, dMi] = parseVer(docV);
      const [fMa, fMi] = parseVer(FW);
      return dMa < fMa || (dMa === fMa && dMi < fMi);
    };
    // 哨兵覆盖面 = 四份全局文档 + **每一份在途计划**（计划模板自带哨兵，渲染后随计划落到项目里）。
    // ★ 旧写法把**旧版模板文件名**当成项目里的路径（`计划/YYYY-MM-DD-{主题}实施.md`，含字面 `{主题}`；
    //   该模板名现已统一为 `YYYY-MM-DD-{实施主题}.md`）
    //   → existsSync 恒为 false，计划侧校验是**死代码**，与 §6.3/README 宣称的覆盖面不符。
    // 归档计划不查：它们是历史，哨兵本就该停在当年版本（归档计划也不参与枚举）。
    const SENTINEL_DOCS = [N.profile, N.contract, N.testSpec, N.apiSpec];
    const stale = [];
    let marked = 0;
    const probe = (abs, label) => {
      let found = null;
      try { found = plan.parseDocstructVersion(fs.readFileSync(abs, 'utf-8')); } catch { return; }
      if (!found) return;
      marked++;
      // 占位哨兵（`{{框架版本}}` 未被渲染）：只说明"这是模板产物"，无从比较版本 → 不判落后
      if (!found.placeholder && behind(found.version)) stale.push(`${label}（${found.version}）`);
    };
    for (const rel of SENTINEL_DOCS) {
      const abs = path.join(docRoot, rel);
      if (!fs.existsSync(abs)) continue;
      probe(abs, `${docLabel}/${rel}`);
    }
    const stalePlans = [];
    for (const ap of plan.collectPlanPaths(docRoot, lex)) {
      let found = null;
      try { found = plan.parseDocstructVersion(fs.readFileSync(ap, 'utf-8')); } catch { continue; }
      if (!found) continue;
      marked++;
      if (!found.placeholder && behind(found.version)) stalePlans.push(`${path.relative(root, ap)}（${found.version}）`);
    }
    if (stalePlans.length) {
      // 计划可能很多：只列前 2 份，其余计数，避免一行刷屏
      stale.push(`${stalePlans.length} 份在途计划的哨兵落后（如 ${stalePlans.slice(0, 2).join('、')}）`);
    }
    if (stale.length) {
      issues.push(`⚠️ 文档结构版本落后于框架（框架 v${FW}）：${stale.join('、')}`
        + ` → 按框架仓库 docs/设计文档.md §9.3 逐项人工对齐（框架不会自动改写你的文档）`);
    } else if (marked === 0) {
      notes.push(`ℹ️ 未标记「文档结构版本」（v2.4.0 之前的文档，不影响使用）；如需对齐见框架仓库 docs/设计文档.md §9.3`);
    }
  }

  // 2. 规范完整性：档案含「应用清单」→ 按清单逐应用校验；否则回退旧版固定两份
  //    ⚠️ 档案**存在但读不出**时不能静默落进"旧版档案回退"分支——那会用错误的判据给出绿色
  const profilePath = plan.findProfilePath(docRoot, lex);
  if (profilePath) {
    try { fs.accessSync(profilePath, fs.constants.R_OK); }
    catch (e) { unreadable.push(`${path.relative(root, profilePath)}（${e.code || e.message}）`); }
  }
  const registry = fs.existsSync(docRoot) ? plan.parseAppRegistry(docRoot, lex) : null;
  if (registry) {
    // 类型层规范：按应用类型要求（中英应用类型关键词见表，两边同样校验）
    const needTypeFront = registry.some(a => plan.appTypeMatches(lex, a.type, 'front'));
    const needTypeBack = registry.some(a => plan.appTypeMatches(lex, a.type, 'back'));
    if (needTypeFront && !fs.existsSync(path.join(docRoot, lex.typeFrontend))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/${lex.typeFrontend}（存在前端端应用，应从官方模板渲染）`);
    }
    if (needTypeBack && !fs.existsSync(path.join(docRoot, lex.typeBackend))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/${lex.typeBackend}（存在服务端应用，应从官方模板渲染）`);
    }
    for (const app of registry) {
      if (app.spec && !fs.existsSync(path.join(docRoot, app.spec))) {
        issues.push(`❌ 应用「${app.id}」缺少规范文件：${docLabel}/${app.spec}`);
      }
      if (app.root !== '.' && !fs.existsSync(path.join(root, app.root))) {
        issues.push(`❌ 应用「${app.id}」代码根不存在：${app.root}（按现状登记任意路径，但必须是会话内可见路径）`);
      }
      for (const other of registry) {
        if (other !== app && other.root !== '.' && app.root !== '.'
          && app.root.startsWith(other.root + '/')) {
          issues.push(`❌ 应用代码根互相嵌套：「${app.id}」${app.root} 在「${other.id}」${other.root} 之内（最长前缀优先解析，建议拆平）`);
        }
      }
    }
  } else {
    const requiredStdFiles = [lex.legacyStdFrontend, lex.legacyStdBackend];
    for (const f of requiredStdFiles) {
      if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少规范文档：${docLabel}/${f}（应从官方模板渲染，见《接入指南》「模板来源」）`);
    }
  }

  // 3. 计划体检（在途计划；归档计划不参与）
  if (fs.existsSync(docRoot)) {
    const planPaths = plan.collectPlanPaths(docRoot, lex);
    const plans = [];
    for (const pp of planPaths) {
      try {
        plans.push(plan.parsePlan(root, pp, lex));
      } catch (e) {
        // 解析失败不崩溃，但必须显式报出（否则坏计划会被静默忽略）
        issues.push(`❌ 计划无法解析：${path.relative(root, pp)}（${e.message}）`);
      }
    }
    if (plans.length && !registry) {
      notes.push(`ℹ️ 档案无「应用清单」，计划体检跳过应用归属校验（${plans.length} 份在途计划）`);
    }
    const docExempt = (file) => file.startsWith(docLabel + '/') || file === 'AGENTS.md';
    for (const p of plans) {
      if (p.state === '已废弃') {
        // 终态：不再体检。但 I4 的「废弃出口」要提示——增量的出口只有两个（合并 / 废弃），
        // 废弃计划归档前应把 `合并状态` 标成 `无需合并`，否则它永远挂在"待合并"（回归 14.x 钉着）
        if (p.delta.nonEmpty && p.mergeState !== '无需合并') {
          notes.push(`ℹ️ 已废弃计划建议把「合并状态」标为 无需合并（废弃是增量的第二条出口）：${p.rel}`);
        }
        continue;
      }
      if (!p.state) {
        issues.push(`❌ 计划缺状态字段：${p.rel}`);
        continue;
      }
      // 轻量计划（小改动通道）：表态 + 变更文件清单是它的全部价值（= /module-code 白名单），缺一不可
      if (p.shape === 'light') {
        if (!Object.keys(p.stances).length) {
          issues.push(`❌ 轻量计划缺「逐应用表态」表（表态即边界，不能省）：${p.rel}`);
        }
        if (!p.fileList.size) {
          issues.push(`❌ 轻量计划缺「变更文件清单」（白名单不能空）：${p.rel}`);
        }
      }

      // ── 契约模型校验（v2.2）：首次建模判定式 = 无「依据模块契约」∧ 有「依据探索记录」（不新增字段）──
      const isLight = p.shape === 'light';
      // 轻量计划不承载语义：带**非空**增量说明形态判错（空节/纯实现说明不算）
      if (isLight && p.delta.nonEmpty) {
        issues.push(`❌ 轻量计划不得含非空「语义增量」（触语义应升级为完整计划）：${p.rel}`);
      }
      const proxy = plan.moduleImplementationProxy(root, p, docRoot, lex);
      const contractPath = proxy.contractPath;   // 复用代理判据里的结果，避免同一份计划查两次契约

      if (p.isFirstBuild) {
        // 形态约束：首次建模必须「完整」+ 增量节 + 建模补充节（轻量会产出零信息建档）。
        // `shape=null`（缺 `> 计划形态：` 行或取值认不出）同样不算完整——否则这一条会被静默绕过
        if (p.shape !== 'full') {
          issues.push(`❌ 首次建模计划必须是「完整」形态（当前：${p.shape === 'light' ? '轻量' : '未标注'}；轻量不承载语义）：${p.rel}`);
        }
        if (!p.delta.hasSection) {
          issues.push(`❌ 首次建模计划缺「语义增量」节（建档的唯一语义来源）：${p.rel}`);
        }
        if (!p.modelingNotes) {
          issues.push(`❌ 首次建模计划缺「建模补充」节（契约 §1/§2/§3/§8 的来源）：${p.rel}`);
        }
        // 合法性（全状态）：契约已存在却标首次建模 → 走存量路径
        // 豁免：本计划就是它的首次建模载体，且已落账（合并状态=已合并）→ 这是正常完成态，不能报错
        if (contractPath && p.mergeState !== '已合并') {
          issues.push(`❌ 首次建模计划但该模块契约已存在（应走存量路径：计划增量 + M 更新）：${p.rel}`);
        }
        // 合法性（仅未进入实施时硬报错）：清单文件已全部存在 → 疑似存量模块（代理判据，设计文档 §7.5）
        if (!contractPath && proxy.allExist && ['待审核', '修订中', '已批准'].includes(p.state)) {
          issues.push(`❌ 首次建模计划但「变更文件清单」中的文件已全部存在（疑似存量模块）：${p.rel}`);
        }
        // 依据校验：空 → ❌；哨兵（人工降级）→ ℹ️；路径不存在 → ❌
        if (!p.evidence.raw) {
          issues.push(`❌ 首次建模计划缺「依据探索记录」（先 /module-explore；人工降级才写 无（自述））：${p.rel}`);
        } else if (p.evidence.sentinel) {
          notes.push(`ℹ️ 首次建模计划无探索记录（自述需求，人工降级）：${p.rel}`);
        } else if (!plan.contractRefExists(root, docRoot, p.evidence.path)) {
          issues.push(`❌ 「依据探索记录」路径不存在：${p.evidence.path}（${p.rel}）`);
        }
      } else if (p.shape === 'full' && p.delta.hasSection) {
        // 存量完整计划：**已采用 v2.2 模型（含增量节）**的，必须引用已存在的契约或首次建模计划路径。
        // 兼容：v2.1 模板渲染的存量计划（`计划形态：完整` 但无增量节/无依据探索记录）不硬报错，只提示——
        // 否则升级后老项目 check 立刻变红，与"存量计划免迁移"的承诺冲突（审核 I1）。
        if (!p.contractRefs.length) {
          issues.push(`❌ 计划缺「依据模块契约」（存量计划必须引用契约；待实现模块请改填「依据探索记录」）：${p.rel}`);
        } else {
          const missing = p.contractRefs.filter(r => !plan.contractRefExists(root, docRoot, r));
          if (missing.length) {
            issues.push(`❌ 「依据模块契约」指向的文件不存在：${missing.join('、')}（${p.rel}）`);
          }
        }
      } else if (!p.contractRefs.length && !p.evidence.raw) {
        // 未采用 v2.2 模型的旧计划（无增量节、无依据探索记录）：兼容放行
        notes.push(`ℹ️ 计划缺「依据模块契约」（v2.1 及更早的计划，兼容放行）：${p.rel}`);
      }

      // 设计文档 §7.5 软判据：清单文件 ≥50% 已存在 → 疑似存量模块（提示人工确认，不硬拦）
      if (p.isFirstBuild && !contractPath && !proxy.allExist && proxy.mostlyExist) {
        notes.push(`ℹ️ 首次建模计划的清单文件已有 ${proxy.existingCount}/${proxy.fileCount} 存在（疑似存量模块，请确认）：${p.rel}`);
      }

      // I2：状态「已完成」∧ 增量非空 ∧ 合并状态≠已合并 → 不得通过（建档兜底见下）
      if (p.state === '已完成') {
        if (p.delta.nonEmpty && p.mergeState !== '已合并') {
          const why = p.delta.mergeRaw && !p.mergeState
            ? `合并状态值无法识别「${p.delta.mergeRaw}」（应为 待合并 / 已合并 / 无需合并）`
            : `合并状态=${p.mergeState || '缺失'}`;
          issues.push(`❌ 计划「已完成」但语义增量未合并（${why}）：${p.rel}（由 /module-doc 合并后翻标记）`);
        }
        if (!p.delta.nonEmpty && p.delta.hasSection && p.mergeState === '待合并') {
          notes.push(`ℹ️ 空增量的计划应把「合并状态」标为 无需合并：${p.rel}`);
        }
        // 建档兜底：首次建模计划「已完成」却还没建档。要求**增量非空**——空增量的首次建模计划
        // 本身已由上面的 I2 报出根因，这里再报一次只是重复；标「已合并」却找不到契约同样不放过
        // （否则落账与否完全靠标记自证，`list --orphans` 也看不见）
        if (p.isFirstBuild && !contractPath && p.delta.nonEmpty) {
          if (p.mergeState === '待合并') {
            issues.push(`❌ 待实现模块已实施但未建档（契约缺失）：${p.rel}（跑 /module-doc 建档）`);
          } else if (p.mergeState === '已合并') {
            issues.push(`❌ 计划标「合并状态=已合并」但模块契约不存在（落账无据）：${p.rel}（跑 /module-doc 的 create 分支建档）`);
          }
        }
      }
      if (p.state === '实施中' && p.isFirstBuild && !contractPath && proxy.existingCount > 0) {
        notes.push(`ℹ️ 待实现模块已落代码、契约待建档（实施窗口期）：${p.rel}`);
      }
      if (p.delta.hasSection && !p.delta.hasMergeLine) {
        notes.push(`ℹ️ 「语义增量」节缺「合并状态」行（I2 无法校验）：${p.rel}`);
      } else if (p.delta.hasMergeLine && p.delta.mergeRaw && !p.delta.mergeState) {
        notes.push(`ℹ️ 「合并状态」值无法识别「${p.delta.mergeRaw}」（应为 待合并 / 已合并 / 无需合并）：${p.rel}`);
      }
      if (!isLight && !p.delta.hasSection) {
        notes.push(`ℹ️ 计划缺「语义增量」节（存量计划或本地定制模板，兼容放行）：${p.rel}`);
      }

      if (registry) {
        const stanceApps = Object.keys(p.stances);
        if (!stanceApps.length && p.shape !== 'light') {
          notes.push(`ℹ️ 计划无「逐应用表态」表（v2.0 前的旧格式）：${p.rel}`);
        }
        for (const appId of stanceApps) {
          if (!registry.some(a => a.id === appId)) {
            issues.push(`❌ 计划表态了未登记应用「${appId}」：${p.rel}（先回填档案应用清单）`);
          }
        }
        for (const file of p.fileList) {
          if (docExempt(file)) continue; // 文档/说明性路径不参与代码归属校验
          const owner = plan.matchApp(registry, file);
          if (!owner) {
            // 集中式 SQL 目录（不属于任何应用）是常见合法布局：提示而非硬报错
            if (/\.sql$/i.test(file) || file.includes('/sql/change/')) {
              notes.push(`ℹ️ SQL 文件未归属任何已登记应用（集中式 SQL 目录？）：${file}（${p.rel}）`);
            } else {
              issues.push(`❌ 清单文件不在任何已登记应用代码根下：${file}（${p.rel}）`);
            }
            continue;
          }
          const st = p.stances[owner.id];
          if (st === 'skip') {
            issues.push(`❌ 清单文件落在表态「本次不改」的应用「${owner.id}」下：${file}（${p.rel}）`);
          } else if (st !== 'change') {
            notes.push(`ℹ️ 清单文件所属应用「${owner.id}」未在计划中表态：${file}（${p.rel}）`);
          }
        }
      }

      if (p.tasks.total > 0) {
        if (p.state === '已完成' && p.tasks.open.length) {
          issues.push(`❌ 计划状态「已完成」但存在未勾选任务 ${p.tasks.open.join(', ')}：${p.rel}`);
        }
        if (p.state === '实施中' && p.tasks.done === p.tasks.total) {
          notes.push(`ℹ️ 任务已全部勾选但状态仍是「实施中」，可登记「已完成」：${p.rel}`);
        }
      }
      if (p.state === '已完成' && p.writeback.total > 0 && p.writeback.done < p.writeback.total) {
        notes.push(`ℹ️ 计划「已完成」但回写清单未勾完（${p.writeback.done}/${p.writeback.total}）：${p.rel}`);
      }
    }

    // I3：同一模块下 ≥2 份「主计划」列为空的非空增量计划 → 硬报错（拆分计划应在该列回指主计划）。
    // 注意：**已合并但尚未归档**的计划仍计入——同模块同一时刻只允许一份"无主的非空增量"，
    // 换新计划前请先 `/module-plan {模块名} 归档`，或在「主计划」列回指（回归 13.3 就钉着这条）
    const leadByModule = {};
    for (const p of plans) {
      if (p.state === '已废弃' || !p.delta.nonEmpty || p.crossModule) continue;
      const rows = [...p.delta.added, ...p.delta.modified, ...p.delta.removed];
      if (rows.every(r => !r.leadPlan)) (leadByModule[p.module] = leadByModule[p.module] || []).push(p.rel);
    }
    for (const [mod, list] of Object.entries(leadByModule)) {
      if (list.length > 1) {
        issues.push(`❌ 同一模块存在多份未回指主计划的语义增量计划（I3）：${mod} → ${list.join('、')}`);
      }
    }

    // I2 归档兜底：归档计划不参与常规体检，否则"先 git mv 进 归档/"就能绕过唯一的机器硬校验
    for (const ap of plan.collectArchivedPlans(docRoot, lex)) {
      let apPlan = null;
      try { apPlan = plan.parsePlan(root, ap, lex); } catch { continue; }
      if (apPlan.state !== '已完成' || !apPlan.delta.nonEmpty || apPlan.mergeState === '已合并') continue;
      const why = apPlan.delta.mergeRaw && !apPlan.mergeState
        ? `值无法识别「${apPlan.delta.mergeRaw}」` : `合并状态=${apPlan.mergeState || '缺失'}`;
      issues.push(`❌ 归档计划「已完成」但语义增量未合并（${why}）：${apPlan.rel}（先由 /module-doc 落账再归档）`);
    }
  }

  // 3.6 契约 §9 回链凭据校验（R3，硬校验；v2.5.0 起判据改为"不变凭据"）：
  //     设计文档 §4.2 既有硬约束——回链不得为空（它是该行唯一的追溯锚点，为空则落账无据）。
  //     v2.5.0 起回链指向**不会消失的凭据**（计划标识 + 提交 SHA / `@SHA` / 需求号），
  //     不再要求"指向的计划文件存在"——归档计划可被人手动清理（module-plan §2.3），硬报会挡住正常清理。
  //     **判据只对"当前流程写的来源"生效**（`合并` / `实现`）：其余来源（`需求`/`代码`）大量是
  //     旧版遗留的批量登记行，当年没有回链规则——逼人回填历史等于制造噪音（同 R4"无哨兵只提示"的口径）。
  //     稳健性：按表头列名定位「来源」列；找不到（旧格式契约）→ 只提示不硬拦。
  {
    const REQUIRED_SOURCES = ['合并', '实现', 'merge', 'implementation'];
    const modulesDir = path.join(docRoot, lex.dirs.modules);
    if (fs.existsSync(modulesDir)) {
      const legacyNoCol = [];
      const longRows = [];
      let rowsChecked = 0;
      let legacyNoRef = 0;
      let colMismatch = 0;
      // 提示文本里的行标签必须短：来源若被解析成正文（列序错位），整行内容会撑进提示里
      const shortSrc = s => {
        const t = String(s).replace(/\s+/g, ' ').trim();
        return t.length > 20 ? `${t.slice(0, 20)}…` : t;
      };
      for (const mod of listDir(modulesDir)) {
        const contractPath = plan.hasContract(docRoot, mod, lex);
        if (!contractPath) continue;
        const rel = `${docLabel}/${lex.dirs.modules}/${mod}/${lex.moduleContract}`;
        const contractText = readText(contractPath);
        if (contractText === null) continue;
        const parsed = plan.parseContractMergeRows(contractText, lex);
        if (!parsed.hasSection) continue;
        // 旧格式契约：有 §9 表但表头无「来源」列 → 只 ℹ️ 跳过（不能因为"没有合并行"就当成合法）
        if (!parsed.hasSourceCol) { legacyNoCol.push(mod); continue; }
        if (!parsed.rows.length) continue;
        colMismatch += parsed.colMismatch || 0;
        parsed.rows.forEach((row, i) => {
          rowsChecked++;
          const where = `${rel} §9 第 ${i + 1} 行（来源=${shortSrc(row.source)}）`;
          const hasRef = row.refs.length > 0 || row.shas.length > 0;
          const srcNorm = String(row.source).trim().toLowerCase();
          const required = REQUIRED_SOURCES.some(w => srcNorm === w.toLowerCase());
          if (!hasRef && required) {
            issues.push(`❌ §9 变更记录缺回链凭据（落账无据，追溯链断）：${where} —— 补「计划标识 + @提交SHA」或「@提交SHA」`);
          } else if (!hasRef) {
            legacyNoRef++; // 旧版遗留的批量登记行：不回填，计数提示
          }
          // 旧写法：引用的计划文件已不在工作区（人工清理或路径变更）→ 提示改用凭据，不硬拦
          const gone = row.refs.filter(ref => !plan.contractRefExists(root, docRoot, ref));
          if (gone.length) {
            notes.push(`ℹ️ §9 回链的计划文件不在工作区（人工已清理或路径变更）：${gone.join('、')}（${where}）`
              + ` → 建议改为 @提交SHA，避免指向会消失的文件`);
          }
          // 篇幅：单行过长通常是"抄了计划正文"，与"一条一行"纪律冲突（ℹ️，迁移期提示）
          if (row.widest > 300) longRows.push(`${where}（${row.widest} 字符）`);
        });
      }
      if (legacyNoCol.length) {
        notes.push(`ℹ️ 契约 §9 无「来源」列，跳过回链校验（旧格式，兼容放行）：${legacyNoCol.join('、')}`);
      }
      if (colMismatch) {
        notes.push(`ℹ️ §9 有 ${colMismatch} 行的列数与表头不一致（表格中途增删过列）——来源已按取值识别，校验不受影响`
          + `；建议补正表格（表头与数据行同列数），否则人工阅读与工具解析都容易错位`);
      }
      if (rowsChecked) notes.push(`ℹ️ 已校验 ${rowsChecked} 条 §9 变更记录的回链凭据`);
      if (legacyNoRef) {
        notes.push(`ℹ️ §9 有 ${legacyNoRef} 行无回链凭据（旧版遗留：来源为 需求/代码 的批量登记行，不回填）——新增行请带「计划标识 + @提交SHA」`);
      }
      if (longRows.length) {
        notes.push(`ℹ️ §9 有 ${longRows.length} 行超过 300 字符（可能是抄了计划正文；详细论证请留在探索记录/计划，本表只记结论+理由一句话）：${longRows.slice(0, 3).join('、')}${longRows.length > 3 ? ' 等' : ''}`);
      }
    }
  }

  // 4. 占位符残留（扫描文档根下所有 .md；剥离代码围栏与行内代码后再判定）
  //    判定口径按语言模式：中文模式只报含中日韩字符的（避免误报代码片段里的 `{...}`）；
  //    英文模式反过来——`{AppName}` 这类标识符式占位符必须报，否则英文项目"零占位符残留"形同虚设
  //    豁免：探索/（探索记录是单次决策记录，允许保留 {待验证} 之类的开放标记，不参与硬校验）
  if (fs.existsSync(docRoot)) {
    const mdFiles = [];
    const exploreDir = path.join(docRoot, lex.dirs.explore);
    (function walk(dir) {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (p === exploreDir) continue;
          walk(p);
        } else if (ent.name.endsWith('.md')) mdFiles.push(p);
      }
    })(docRoot);
    const isPlaceholder = x => /[一-龥]/.test(x)
      || (isEn && /^\{[A-Za-z][A-Za-z0-9 _.\-/]*\}$/.test(x));
    for (const f of mdFiles) {
      let content = '';
      try { content = fs.readFileSync(f, 'utf-8'); } catch { continue; }
      const noFence = content.replace(/```[\s\S]*?```/g, '');
      const noInline = noFence.replace(/`[^`\n]*`/g, '');
      const placeholders = noInline.match(/\{[^{}\n]+\}/g);
      if (placeholders) {
        const unique = [...new Set(placeholders)].filter(isPlaceholder);
        if (unique.length) {
          // 只列前几个：未渲染 token 可能很多（模板里的示例文案也用花括号），一行全量输出会刷屏到看不见别的问题。
          // 这是**硬问题**（进退出码）——模板渲染纪律见 templates/接入指南.md.tpl「渲染纪律」。
          const head = unique.slice(0, 3).join(' ');
          issues.push(`⚠️ 占位符未渲染（${unique.length} 个）：${path.relative(root, f)} → ${head}`
            + `${unique.length > 3 ? ' …（其余同类略）' : ''}`
            + '｜改法：替换为项目实际值，或删除该示例行/片段（示例文案也用花括号，见《接入指南.md》渲染纪律）');
        }
      }
    }
  }

  // 5. 引导残留
  if (fs.existsSync(path.join(root, '接入指南.md'))) {
    issues.push(`⚠️ 未清理：项目根/接入指南.md（初始化完成后应删除）`);
  }
  const skeletonReadme = path.join(docRoot, 'README.md');
  const skeletonText = fs.existsSync(skeletonReadme) ? readText(skeletonReadme) : null;
  if (skeletonText && skeletonText.includes('待初始化')) {
    issues.push(`⚠️ 未清理：${docLabel}/README.md（安装预置的骨架引导文件，初始化完成后应删除）`);
  }
  const agentsPath = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = readText(agentsPath);
    if (content && content.includes('接入引导段') && content.includes('移除')) {
      issues.push(`⚠️ 未清理：AGENTS.md 仍包含接入引导段（初始化完成后应移除）`);
    }
  }

  // 读取失败的路径统一报一条（否则用户只看到"某几项没报错"，不知道为什么）
  if (unreadable.length) {
    issues.push(`❌ 以下路径无法读取，相关校验已跳过（权限/路径类型问题）：${unreadable.join('、')}`);
  }

  if (notes.length) {
    console.log('ℹ️ 提示项（不影响退出码）：');
    notes.forEach(n => console.log(`  ${n}`));
  }
  if (issues.length === 0) {
    console.log(notes.length
      ? '✅ doc-framework check 通过（有提示项，见上）'
      : '✅ doc-framework check 通过：骨架完整，应用清单健康，计划体检通过，无占位符残留，引导已清理');
    return 0;
  }
  console.log('❌ doc-framework check 发现问题：');
  issues.forEach(i => console.log(`  ${i}`));
  return 1;
}

// ── 参数解析（统一：命名选项可任意顺序，值不会挤占位置参数）────

/** 解析 argv → {flags, positionals, missingValue}；valueFlags 为需要取值的选项名 */
function parseArgs(argv, valueFlags = []) {
  const flags = {};
  const positionals = [];
  const missingValue = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (valueFlags.includes(a)) {
        const v = argv[i + 1];
        if (v === undefined || v.startsWith('--')) { flags[a] = null; missingValue.push(a); }
        else { flags[a] = v; i++; }
      } else {
        flags[a] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals, missingValue };
}

// ── diff-check ───────────────────────────────────────────────

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
  const planPath = planArg ? (path.isAbsolute(planArg) ? planArg : path.join(root, planArg)) : null;
  if (planArg && (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile())) {
    console.log(`❌ 计划文件不存在或不是文件：${planArg}`);
    return 1;
  }
  const base = flags['--base'] || null;
  const staged = !!flags['--staged'];
  const strict = !!flags['--strict'];
  // `--base` 会拼进 shell 串，先做保守校验（防止 `--base "main; rm -rf /"` 这类注入）
  if (base && !/^[A-Za-z0-9._\/@{}~^:-]+$/.test(base)) {
    console.log(`❌ --base 取值不合法：${base}（只允许 ref 名常见字符）`);
    return 1;
  }

  const { docRoot, docLabel, isEn, legacy, lex } = plan.resolveDocRoot(root);
  if (legacy && isEn) {
    console.log(`❌ 检测到英文文档根 ${docLabel}/：doc-framework 已不再支持英文产物命名（文档根固定 doc-framework/）。`);
    console.log('   迁移见 docs/设计文档.md §8.3（改目录名 + 内部命名改回中文）。');
    return 1;
  }
  const registry = plan.parseAppRegistry(docRoot, lex);
  if (!registry) {
    console.log(`❌ 档案缺少「应用清单」（${docLabel}/${lex.profile}），diff-check 需要应用清单提供代码根`);
    return 1;
  }

  const errors = [];
  const warnings = [];
  let p = null;
  let scopeApps = null;
  let scopeLabel = '';

  if (planArg) {
    try {
      p = plan.parsePlan(root, planPath, lex);
    } catch (e) {
      console.log(`❌ 计划无法解析：${planArg}（${e.message}）`);
      return 1;
    }
    if (!p.state) {
      // 状态认不出 = 无法确认"已批准"→ 提交前闸门必须拦住（曾有 ⚠️ 放行、退出码 0 的口子）
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
    const scope = plan.parseContractScope(docRoot, moduleArg, lex);
    if (!scope) {
      console.log(`❌ 未找到模块契约：${docLabel}/${lex.dirs.modules}/${moduleArg}/${lex.moduleContract}`);
      console.log('   直改通道的边界来源是契约 §5 应用落点表。待实现模块（代码库零实现）请改用计划通道：');
      console.log(`   doc-framework diff-check <计划路径>（由 /module-plan ${moduleArg} 建首次建模计划）；`);
      console.log(`   已有代码但契约缺失 → 先 /module-doc ${moduleArg} 模式 B 对账补建契约。`);
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
  const docPrefix = docLabel + '/';
  for (const file of changed) {
    if (file.startsWith(docPrefix) || file === 'AGENTS.md') continue; // 文档回写不受白名单约束
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

// ── list / show（只读查询；--json 标记 experimental）─────────

/**
 * 字符串显示宽度：CJK / 全角字符按 2 列算，其余按 1 列。
 * 只用于 list/show 的文本表格对齐（不涉及文档内容解析，估宽不必精确）。
 */
// 中文按 2 列宽估算（表格对齐）
function strWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}
/** 右侧补空格到 `width` 显示列宽（`s` 已超宽时不截断，`Math.max(0,…)` 防负数 repeat）。 */
function pad(s, width) {
  return String(s) + ' '.repeat(Math.max(0, width - strWidth(s)));
}

/**
 * `doc-framework list`：列出在途计划（只读）。
 *
 * 过滤链（顺序即语义）：`--all` 决定是否含终态 → `--module` → `--state` → `--app` → `--stale`。
 * 默认**排除已完成/已废弃**（它们是终态，留在活跃目录里只说明还没归档）。
 *
 * 两个易混点：
 *   - `--stale N` 是"归档候选"入口：按**计划文件名里的日期前缀**算停滞天数。因为它在上面
 *     已被默认过滤掉终态，所以想批量归档（对象是"已完成"）必须 `--stale N --all` 一起给；
 *   - `--orphans` 用**未过滤**的集合判断"有没有在途计划"（见 allParsed），否则 `--all`
 *     与否会改变孤立模块的判定结果。
 *
 * @returns {number} 0 = 正常（含"没有匹配计划"）；1 = 用法错误（未知状态、--stale 取值非法）
 */
function list(argv) {
  const root = install.PROJECT_ROOT;
  const { docRoot, docLabel: _lbl, isEn: _isEn, legacy: _legacy, lex } = plan.resolveDocRoot(root);
  if (_legacy && _isEn) {
    console.log(`❌ 检测到英文文档根 ${_lbl}/：doc-framework 已不再支持英文产物命名（文档根固定 doc-framework/）。`);
    console.log('   迁移见 docs/设计文档.md §8.3（改目录名 + 内部命名改回中文）。');
    return 1;
  }
  if (!fs.existsSync(docRoot)) {
    console.log('❌ 未找到文档根 doc-framework/');
    return 1;
  }
  const { flags, missingValue } = parseArgs(argv, ['--module', '--app', '--state', '--stale']);
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}`);
    return 1;
  }
  const moduleFilter = flags['--module'] || null;
  const appFilter = flags['--app'] || null;
  const stateFilter = flags['--state'] || null;
  const staleArg = flags['--stale'];
  const json = !!flags['--json'];
  const all = !!flags['--all'];
  const orphans = !!flags['--orphans'];

  // 状态过滤：中英枚举都收（英文模式用户按 AGENTS 映射写 `--state completed` 不该被拒）
  const VALID_STATES = ['待审核', '修订中', '已批准', '实施中', '已完成', '已废弃'];
  let stateWanted = stateFilter;
  if (stateFilter) {
    stateWanted = VALID_STATES.includes(stateFilter) ? stateFilter : plan.normalizeState(stateFilter);
    if (!stateWanted) {
      console.log(`❌ 未识别的状态「${stateFilter}」；可用：${VALID_STATES.join(' / ')}（或英文枚举 pending-review / revising / approved / in-progress / completed / abandoned）`);
      return 1;
    }
  }
  let staleDays = null;
  if (staleArg) {
    staleDays = Number(staleArg);
    if (!Number.isFinite(staleDays) || staleDays <= 0) {
      console.log(`❌ --stale 需要正整数天数（如 --stale 14）：${staleArg}`);
      return 1;
    }
  }

  let plans = plan.listPlans(root, docRoot, lex);
  const allParsed = plans.slice(); // --orphans 用未过滤集合判"在途计划"（否则 --all 与否会影响结果）
  if (!all) plans = plans.filter(p => p.state !== '已完成' && p.state !== '已废弃');
  if (moduleFilter) plans = plans.filter(p => p.module === moduleFilter);
  if (stateWanted) plans = plans.filter(p => p.state === stateWanted);
  if (appFilter) plans = plans.filter(p => p.stances[appFilter] === 'change');
  if (staleDays) {
    // 计划文件名带日期前缀：日期早于 N 天前的在途计划 = 归档候选（批量归档入口）
    const d0 = new Date(Date.now() - staleDays * 86400000);
    const cutoff = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
    plans = plans.filter(p => {
      const d = (p.subject.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
      return d && d < cutoff;
    });
  }

  const rows = plans.map(p => ({
    module: p.module,
    subject: p.subject,
    shape: p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : null,
    state: p.state || '未知',
    mergeState: p.mergeState,
    delta: p.delta ? p.delta.total : 0,
    firstBuild: !!p.isFirstBuild,
    apps: Object.entries(p.stances).filter(([, v]) => v === 'change').map(([k]) => k),
    tasks: { done: p.tasks.done, total: p.tasks.total },
    path: p.rel,
  }));

  // --orphans：无契约且无在途计划的模块（"代码是否存在"需人工确认——本仓库不扫描代码）
  // 「在途」口径与 /module-review 一致：未归档 ∧ 状态 ∈ {已批准, 实施中, 已完成}
  // （已完成但未归档仍算在途——它的增量为空说明没建档，由 check 的"建档兜底"负责报错，
  //  这里不列它：列出来会给出"模式 B 对账"这条错误的路由建议）
  if (orphans) {
    const inflight = new Set(allParsed
      .filter(p => p.state === '已批准' || p.state === '实施中' || p.state === '已完成')
      .map(p => p.module));
    const missing = [];
    for (const modulesDir of plan.docDirs(docRoot, lex, 'modules')) {
      let ents = [];
      try { ents = fs.readdirSync(modulesDir, { withFileTypes: true }); } catch { ents = []; }
      for (const ent of ents) {
        if (!ent.isDirectory()) continue;
        const mod = ent.name;
        if (plan.hasContract(docRoot, mod, lex)) continue;
        if (inflight.has(mod)) continue;
        if (missing.includes(mod)) continue;
        missing.push(mod);
      }
    }
    if (json) {
      console.log(JSON.stringify({ experimental: true, count: missing.length, orphans: missing }, null, 2));
      return 0;
    }
    if (!missing.length) {
      console.log('没有"缺契约且在途计划为空"的模块。');
      return 0;
    }
    console.log('缺契约且无在途计划的模块（需人工确认代码是否存在）：');
    for (const m of missing) console.log(`  ${m}  → 有代码：/module-doc ${m} 模式 B 对账补建；零实现：/module-plan ${m} 建首次建模计划`);
    return 0;
  }

  if (json) {
    console.log(JSON.stringify({ experimental: true, count: rows.length, plans: rows }, null, 2));
    return 0;
  }
  if (!rows.length) {
    console.log(staleDays ? `没有停滞计划（日期早于 ${staleDays} 天前的在途计划）。` : '没有匹配的在途计划。');
    console.log(staleDays && !all
      ? '提示：批量归档的对象是「已完成/已废弃」计划，需加 --all：`doc-framework list --stale N --all`。'
      : '提示：`doc-framework list --all` 可包含已完成/已废弃（归档计划需路径直达）。');
    return 0;
  }
  const head = ['模块', '计划（日期-主题）', '状态', '涉及应用（表态=改动）', '任务'];
  const data = rows.map(r => {
    let tag = r.shape === '轻量' ? '（轻量）' : '';
    if (r.state === '已完成' && r.mergeState === '待合并') tag += '（待合并）';
    else if (r.mergeState === '已合并') tag += '（已合并）';
    if (r.delta) tag += `［增量 ${r.delta} 项］`;
    return [r.module, r.subject + tag, r.state, r.apps.join(', ') || '—', r.tasks.total ? `${r.tasks.done}/${r.tasks.total}` : '—'];
  });
  const widths = head.map((h, i) => Math.max(strWidth(h), ...data.map(r => strWidth(r[i]))));
  const line = cells => cells.map((c, i) => pad(c, widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const r of data) console.log(line(r));
  console.log(all ? `\n共 ${rows.length} 份计划（含已完成/已废弃）。`
    : staleDays ? `\n共 ${rows.length} 份停滞计划（日期早于 ${staleDays} 天前）——完成则 /module-plan {模块名} 归档，不做了则废弃`
      : `\n共 ${rows.length} 份在途计划。`);
  const next = rows.find(r => r.state !== '已完成' && r.state !== '已废弃') || rows[0];
  console.log(staleDays && next.state === '已完成'
    ? `Next: /module-plan ${next.module} 归档`
    : `Next: doc-framework show ${next.path}`);
  return 0;
}

/**
 * `doc-framework show <计划路径>`：单份计划的结构化视图（只读，归档计划需路径直达）。
 *
 * 输出是"给 AI 与人和解用的"：状态/形态/依据/语义增量与合并状态/表态（附应用是否已登记）/
 * 推导出的白名单/变更文件清单/任务进度/回写清单/接口兼容性声明。`--json` 是机器消费接口，
 * 带 `experimental: true` 字段（格式可能变，见设计文档 §6.5）。
 *
 * 与 check 的分工：check 判"有没有问题"，show 只**呈现事实**，不做合规判定。
 *
 * @returns {number} 0 = 输出成功；1 = 缺参数 / 路径不存在或不是文件 / 计划无法解析
 */
function show(argv) {
  const root = install.PROJECT_ROOT;
  const { flags, positionals } = parseArgs(argv, []);
  const arg = positionals[0];
  if (!arg) {
    console.log('用法：doc-framework show <计划路径> [--json]');
    return 1;
  }
  const planPath = path.isAbsolute(arg) ? arg : path.join(root, arg);
  if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
    console.log(`❌ 计划文件不存在或不是文件：${arg}`);
    return 1;
  }
  const { docRoot, docLabel: _lbl, isEn: _isEn, legacy: _legacy, lex } = plan.resolveDocRoot(root);
  if (_legacy && _isEn) {
    console.log(`❌ 检测到英文文档根 ${_lbl}/：doc-framework 已不再支持英文产物命名（文档根固定 doc-framework/）。`);
    console.log('   迁移见 docs/设计文档.md §8.3（改目录名 + 内部命名改回中文）。');
    return 1;
  }
  let p;
  try {
    p = plan.parsePlan(root, planPath, lex);
  } catch (e) {
    console.log(`❌ 计划无法解析：${arg}（${e.message}）`);
    return 1;
  }
  const registry = plan.parseAppRegistry(docRoot, lex);

  const stances = Object.entries(p.stances).map(([appId, st]) => {
    const reg = registry ? registry.find(a => a.id === appId) : null;
    return {
      app: appId,
      stance: st === 'change' ? '改动' : st === 'skip' ? '本次不改/不适用' : '未识别',
      root: reg ? reg.root : null,
      registered: !!reg,
    };
  });
  const whitelist = stances
    .filter(s => s.stance === '改动' && s.root)
    .map(s => (s.root === '.' ? './（退化为文件级清单）' : s.root + '/**'));

  const out = {
    experimental: true,
    path: p.rel,
    module: p.module,
    subject: p.subject,
    archived: p.archived,
    crossModule: p.crossModule,
    state: p.state,
    shape: p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : null,
    contracts: p.contracts,
    contractRefs: p.contractRefs,
    firstBuild: !!p.isFirstBuild,
    evidence: p.evidence,
    delta: p.delta,
    mergeState: p.mergeState,
    hasModelingNotes: !!p.modelingNotes,
    stances,
    whitelist,
    fileList: [...p.fileList],
    tasks: p.tasks,
    writeback: p.writeback,
    compat: p.compat,
  };

  if (flags['--json']) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`计划：${p.rel}`);
  console.log(`模块：${p.module}${p.archived ? '（已归档）' : ''}｜状态：${p.state || '未知'}｜形态：${p.shape === 'light' ? '轻量' : p.shape === 'full' ? '完整' : '未标注'}`);
  if (p.contracts.length) console.log(`依据契约：${p.contracts.join('、')}`);
  if (p.contractRefs.length && p.contractRefs.length !== p.contracts.length) {
    console.log(`依据（含未建档模块的计划）：${p.contractRefs.join('、')}`);
  }
  if (p.isFirstBuild) {
    console.log(`计划类型：首次建模（待实现模块）｜依据探索记录：${p.evidence.sentinel ? '无（自述，人工降级）' : (p.evidence.path || '（缺失）')}｜建模补充：${p.modelingNotes ? '有' : '（缺失）'}`);
  }
  if (p.delta && p.delta.hasSection) {
    console.log(`语义增量：${p.delta.total} 项（新增 ${p.delta.added.length} / 修改 ${p.delta.modified.length} / 删除 ${p.delta.removed.length}）｜合并状态：${p.mergeState || '（缺标记）'}`);
  }
  if (p.compat) console.log(`接口兼容性：${p.compat}`);

  console.log('\n逐应用表态（白名单来源）：');
  if (!stances.length) console.log('  （未解析到表态表——旧格式计划或模板被本地定制）');
  for (const s of stances) {
    console.log(`  ${s.app}  ${s.stance}${s.registered ? '' : '  ⚠️ 未登记在应用清单'}`);
  }
  if (whitelist.length) console.log(`  允许改动路径：${whitelist.join('  ')}`);

  console.log(`\n变更文件清单（${p.fileList.size} 项）${p.fileList.size ? '：' : ''}`);
  for (const f of p.fileList) console.log(`  ${f}`);

  console.log(`\n任务进度：${p.tasks.total ? `${p.tasks.done}/${p.tasks.total}` : '（无任务清单）'}`);
  if (p.tasks.open.length) console.log(`  未完成：${p.tasks.open.join(', ')}`);
  console.log(`回写清单：${p.writeback.total ? `${p.writeback.done}/${p.writeback.total}` : '（未解析到）'}`);

  if (p.archived) {
    console.log('\n（已归档：不再参与在途清单，如需重做请新建计划）');
  } else if (p.state === '已完成' && p.delta && p.delta.nonEmpty && p.mergeState !== '已合并') {
    console.log(`\nNext: /module-doc ${p.module}${p.isFirstBuild ? '（M 的 create 分支：建档 + 回写总契约）' : '（M 合并增量 → 翻 已合并）'}`);
  } else if (p.state === '已批准' || p.state === '实施中') {
    console.log(`\nNext: doc-framework diff-check ${p.rel}`);
  } else if (p.state === '已完成' && !p.archived && p.writeback.total > 0 && p.writeback.done === p.writeback.total) {
    // 一律用路径形式：跨模块计划没有「模块名」形式可用；已归档计划无需再提示归档
    console.log(`\nNext: /module-plan ${p.rel} 归档`);
  }
  return 0;
}

/** 打印用法（`--help` 的权威文本；docs/设计文档.md §6.2 是它的副本，改这里要同步那张表）。 */
function help() {
  console.log(`doc-framework v${install.VERSION}
用法：
  doc-framework sync                          同步 skill 到最新（本地定制自动跳过；不改动文档根与 AGENTS.md）
  doc-framework check                         校验体系完整性（骨架 + 应用清单 + 计划体检 + 语义增量/合并状态 + 契约 §9 合并/实现回链 + 结构版本哨兵 + 占位符 + 引导清理）
  doc-framework check --draft-contract <计划>  只读打印"增量条目 → 目标契约章节"建档清单（供 /module-doc M 当 checklist）
  doc-framework diff-check <计划路径> [选项]   提交前对账：git 变更 vs 计划白名单
  doc-framework diff-check --module <模块名>   直改通道对账：git 变更 vs 契约 §5 应用落点（应用级边界；待实现模块请用计划通道）
      （管辖范围 = 应用清单登记的应用：契约管辖不到的文件只给 ⚠️ 提示，不判定越界）
      --base <ref>   与指定 ref 比较（默认 HEAD，含未跟踪文件）
      --staged       只检查已暂存文件（pre-commit 场景）
      --strict       警告也算失败
  doc-framework list [选项]                    列出在途计划（状态 / 形态 / 合并状态 / 涉及应用 / 任务进度）
      --module <名>  只列某模块      --app <标识>  只列会改动该应用的计划
      --state <状态> 按状态过滤      --stale <天>  只列日期早于 N 天前的计划（**批量归档：--stale N --all**）
      --orphans      只列"缺契约且无在途计划"的模块（代码是否存在需人工确认）
      --all          包含已完成/已废弃（批量归档必需；归档计划需路径直达）   --json  机器可读（experimental）
  doc-framework show <计划路径> [--json]        查看单个计划：状态/形态/依据/语义增量与合并状态/表态/白名单/文件清单/进度
  doc-framework --help（或 -h）                显示帮助`);
}

const arg = process.argv[2];
if (arg === 'sync') sync();
else if (arg === 'check') process.exit(check(process.argv.slice(3)));
else if (arg === 'diff-check') process.exit(diffCheck(process.argv.slice(3)));
else if (arg === 'list') process.exit(list(process.argv.slice(3)));
else if (arg === 'show') process.exit(show(process.argv.slice(3)));
// `--help`（与 `-h`）是**成功**请求：退出码 0，否则 CI / 脚本里的 `tool --help` 探测会误判为失败。
// 裸调用（无参数）仍是用法错误 → 1。
else if (arg === '--help' || arg === '-h') { help(); process.exit(0); }
else { help(); process.exit(1); }
