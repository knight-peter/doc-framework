'use strict';
/**
 * 安装动作（**首次安装 / 强制刷新**）：skill 落地 + 未初始化项目的引导文件。
 *
 * 与 commands/sync.js 的分工：
 *   - 本文件 = install 语义：整体先删后拷，不管目标目录里改过什么；
 *   - sync = 升级语义：按 marker 的逐文件 sha256 识别本地定制并跳过。
 *
 * 两者共用 lib/installer.js 的 marker / 哈希 / 目标目录原语，避免第二套实现。
 * 本文件不做参数解析、不打印——命令层（commands/install.js）负责输出与 --json。
 */
const fs = require('fs');
const path = require('path');
const env = require('./env');
const plan = require('./plan');
const installer = require('./installer');

/** 项目是否已接入（判据唯一来源在 plan.js 的 INIT_MARKERS）。 */
function isInitialized(projectRoot) {
  return plan.isInitialized(projectRoot);
}

/**
 * 把 `skills/*` 整体复制到目标目录，并写安装标记（版本 + 逐文件 sha256）。
 *
 * 覆盖策略是**先 rm 再 cp**（不是增量合并）：skill 的旧文件若已被删除/改名，增量复制会留下
 * 幽灵文件；skill 按目录整体加载，残留一个旧 SKILL.md 就等于多一个技能。
 * 代价是用户对该目录的手动修改会被覆盖——这正是 marker 记录 sha256 的原因：
 * `sync` 借此识别本地定制并跳过（本函数不跳过，它是首次安装语义）。
 *
 * @param {string} projectRoot 项目根（绝对路径）
 * @param {string} targetDir 相对 projectRoot 的目标目录
 * @returns {{dest:string, removed:string[]}}
 */
function installSkills(projectRoot, targetDir) {
  if (!installer.isSafeTargetDir(projectRoot, targetDir)) {
    throw new Error(`拒绝安装到项目外/项目根：targetDir=${targetDir}（必须是项目内相对目录）`);
  }
  const src = path.join(env.PKG_ROOT, 'skills');
  const dest = path.join(projectRoot, targetDir);
  fs.mkdirSync(dest, { recursive: true });

  // 幽灵技能清理：只删**上一次由本框架安装（旧 marker 有记录）、而当前版本已删除/改名**的 skill 目录。
  // 目标目录可能是多 skill 宿主共享的，绝不能凭"不在 src 里"就删别人的目录；marker 缺失/损坏时保守不动。
  const removed = [];
  const old = installer.readMarker(dest);
  const srcNames = new Set(fs.readdirSync(src).filter(name => {
    try { return fs.statSync(path.join(src, name)).isDirectory(); } catch { return false; }
  }));
  if (old) {
    const managed = new Set([
      ...(Array.isArray(old.files)
        ? old.files
          .filter(f => f && typeof f === 'object' && typeof f.file === 'string' && installer.isSafeRelPath(f.file))
          .map(f => f.file.split(/[\\/]/)[0])
        : []),
      ...(old.skills && typeof old.skills === 'object' && !Array.isArray(old.skills)
        ? Object.keys(old.skills).filter(installer.isSafeSkillName)
        : []),
    ].filter(Boolean));
    for (const name of managed) {
      if (srcNames.has(name)) continue;
      const p = path.join(dest, name);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        removed.push(name);
      }
    }
  }

  const files = [];
  const skills = {};
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    if (!fs.statSync(from).isDirectory()) continue;
    const to = path.join(dest, name);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    // 逐文件哈希是为了让 sync 能做"文件级"判断：用户改了 A 文件不影响 B 文件的升级。
    // 键统一用 '/'（Windows 下才不会被 sync 误判成"已定制"）。
    const skillFiles = installer.walkFiles(to, to)
      .map(f => ({ file: f.file.replace(/\\/g, '/'), hash: f.hash }));
    skills[name] = { version: `v${env.VERSION}`, files: skillFiles };
    for (const f of skillFiles) files.push({ file: `${name}/${f.file}`, hash: f.hash });
  }
  installer.writeMarker(path.join(dest, installer.MARKER_FILE), files, skills);
  return { dest, removed };
}

/**
 * 未初始化项目的引导落地：预置目录骨架 + "待初始化"README + 项目根《接入指南.md》+ AGENTS.md 引导段。
 *
 * 为什么预置 `doc-framework/` 子目录：初始化由 AI 执行，AI 漏建目录时 `check` 会报一串"缺少目录"，
 * 与"文档没写"混在一起难定位；脚本先把骨架摆好，AI 只需渲染文件内容。
 * README 里的"待初始化"是给 `check` 的哨兵（检测到该文案 → ⚠️ 未清理）。
 *
 * AGENTS.md 的**永久段**由模板提供，`CONTRACT-FRAMEWORK-BEGIN` 用于幂等：
 * 已有永久段就不重复追加。
 *
 * @param {string} projectRoot 项目根（绝对路径）
 * @returns {{docRoot:string}}
 */
function installOnboarding(projectRoot) {
  const docRoot = path.join(projectRoot, 'doc-framework');
  const zh = plan.NAMES.zh.dirs;
  for (const sub of [zh.modules, zh.boundaries, zh.standards, zh.plans, zh.explore, path.join(zh.explore, plan.NAMES.zh.archiveDir)]) {
    fs.mkdirSync(path.join(docRoot, sub), { recursive: true });
  }
  const guideReadme = `# doc-framework（待初始化）

本目录为 doc-framework 文档体系骨架，由 doc-framework install 预置。

请对 AI 说"初始化项目"，AI 将按项目根《接入指南.md》执行接入初始化：
从官方模板渲染生成（项目已装 git 依赖用 npx doc-framework template <模板>；未装依赖用 npx --yes "github:knight-peter/doc-framework#<tag>" template <模板>，或读 node_modules/doc-framework/templates/） 项目档案.md（含应用清单）/ 总契约.md / 测试规范.md / 接口规范.md / 规范三层（类型-前端、类型-后端、每个应用一份「应用-＜应用标识＞」） 等骨架文档，并预置 模块/ 边界/ 规范/ 计划/ 探索/（含 归档/）目录。

初始化完成后：本 README 与 接入指南.md 一并删除。
`;
  fs.writeFileSync(path.join(docRoot, 'README.md'), guideReadme, 'utf-8');

  // 接入指南.md **原样拷贝**（指南里的 {{…}} 是正文在讲述记法，不是待填字段）
  const guideTpl = fs.readFileSync(path.join(env.PKG_ROOT, 'templates', '接入指南.md.tpl'), 'utf-8');
  fs.writeFileSync(path.join(projectRoot, '接入指南.md'), guideTpl, 'utf-8');

  // AGENTS.md：引导段 + 永久段（默认中文；新项目还没有文档根可探测语言）
  const agentsTpl = fs.readFileSync(path.join(env.PKG_ROOT, 'templates', 'AGENTS.md.tpl'), 'utf-8');
  const rendered = agentsTpl
    .replace(/\{文档根\}/g, 'doc-framework')
    .replace(/\{文档语言\}/g, '中文');
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    if (!content.includes('CONTRACT-FRAMEWORK-BEGIN')) {
      fs.writeFileSync(agentsPath, content.replace(/\s*$/, '\n\n') + rendered, 'utf-8');
    }
  } else {
    fs.writeFileSync(agentsPath, rendered, 'utf-8');
  }
  return { docRoot };
}

/**
 * 安装入口：装 skill（可能多个目标目录）→ 按是否已接入决定要不要写引导文件。
 * 两件事互相独立：skill 一定要装（已初始化项目升级也要换 skill），引导文件只在未接入时写。
 *
 * @param {string} projectRoot 项目根（绝对路径）
 * @param {{onLog?:(msg:string)=>void}} [opts]
 * @returns {{root:string, initialized:boolean, targets:Array, onboarding:Object|null}}
 */
function install(projectRoot, { onLog } = {}) {
  const log = onLog || (() => {});
  const targets = [];
  for (const dir of installer.resolveTargetDirs(projectRoot)) {
    const r = installSkills(projectRoot, dir);
    targets.push({ dir, dest: r.dest, removed: r.removed });
    log(`已安装 skill 到：${r.dest}`);
    for (const name of r.removed) log(`已移除不再发布的 skill：${name}`);
  }
  const initialized = isInitialized(projectRoot);
  let onboarding = null;
  if (initialized) {
    log('检测到项目已接入（档案已存在），跳过接入指南与 AGENTS.md 引导段写入');
  } else {
    onboarding = installOnboarding(projectRoot);
    log('已生成项目根《接入指南.md》并写入 AGENTS.md（含接入引导段）');
  }
  if (initialized) {
    log('已初始化：只更新了 skill；文档与 AGENTS.md 未改动');
  } else {
    log('下一步：对 AI 说"初始化项目"，AI 将按《接入指南.md》执行接入初始化');
  }
  return { root: projectRoot, initialized, targets, onboarding };
}

module.exports = { isInitialized, installSkills, installOnboarding, install };
