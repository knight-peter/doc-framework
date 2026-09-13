#!/usr/bin/env node
/**
 * doc-framework 安装脚本（方式 A：npm/pnpm postinstall）
 *
 * 行为（与 install.sh 一致）：
 *   1. 解析目标 skill 目录（配置 doc-framework.config.json targetDirs > 探测 > 默认 .agents/skills）
 *   2. 复制 skills/* 到目标目录，逐文件记录 sha256 到版本标记 {目标目录}/.doc-framework.json
 *   3. 已初始化检测：项目根存在 doc-framework/项目档案.md（含历史英文根与旧目录名，见 isInitialized）→ 跳过接入指南与 AGENTS.md 引导段
 *   4. 未初始化：复制 接入指南.md 到项目根；写入/更新 AGENTS.md（接入引导段 + 永久段）
 *   5. 输出安装报告
 *
 * 设计纪律：
 *   - **只装 skill 与引导文件，不渲染文档体系**：`doc-framework/` 下的四份全局文档与契约由 AI 读
 *     《接入指南.md》+ `templates/` 渲染生成（内容依赖项目实际的应用清单，脚本无从得知）。
 *     脚本只预置空目录骨架 + 一份"待初始化"README，避免 AI 漏建目录（见 installOnboarding）。
 *   - **可重复执行**：每次安装整体覆盖 skill 目录（先 rm 再 cp），因此重复 `pnpm install` 结果一致；
 *     但**已初始化项目不再写 接入指南.md / AGENTS.md 引导段**，避免覆盖用户自己维护的 AGENTS.md。
 *   - 与 `scripts/cli.js sync` 的分工：本脚本是"装进项目"（npm postinstall 触发，含引导文件），
 *     `sync` 是"升级已装好的 skill"（读 marker 的 sha256，跳过用户本地定制过的文件）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PKG_ROOT = path.resolve(__dirname, '..');
// npm/pnpm 安装时 INIT_CWD 为执行安装的项目根；回退当前工作目录
const PROJECT_ROOT = process.env.INIT_CWD || process.cwd();

const VERSION = require(path.join(PKG_ROOT, 'package.json')).version;
const CONFIG_FILE = 'doc-framework.config.json';
// 探测顺序即优先级：多 skill 宿主共存时取第一个已存在的（.agents 是 DSH 的约定目录）
const PROBE_DIRS = ['.agents/skills', '.claude/skills', '.cursor/skills'];
const DEFAULT_DIR = '.agents/skills';
// 安装标记文件名（写在**目标 skill 目录内**，记录版本 + 逐文件 sha256），sync 靠它判断"哪些文件被本地改过"
const MARKER_FILE = '.doc-framework.json';

/** 文件 sha256（hex）。sync 用它比对"安装时的内容 vs 当前内容"来识别本地定制。 */
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * 递归遍历目录，返回 [{ file: 相对 base 的路径, hash: sha256 }]（skills 顶层是 skill 目录）。
 *
 * @param {string} dir  要遍历的目录
 * @param {string} [base=dir] 相对路径的基准（顶层传入自身，保证 marker 里存的是 `skill名/文件名`）
 */
function walkFiles(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      out.push(...walkFiles(p, base));
    } else {
      out.push({ file: path.relative(base, p), hash: hashFile(p) });
    }
  }
  return out;
}

/**
 * 决定 skill 装到哪：配置 > 探测已存在的宿主目录 > 默认。
 *
 * 三级回退的理由：`targetDirs` 是用户显式声明（配置文件坏了不能静默降级成默认——这里 warn 后降级，
 * 因为"装错位置"比"不装"更容易被发现和修复）；探测是为了兼容已用 .claude/.cursor 的项目，
 * 避免同一个项目里出现两份 skill 副本。
 *
 * @returns {string[]} 目标目录列表（相对 PROJECT_ROOT；配置允许数组 = 一次装多处）
 */
function resolveTargetDirs() {
  const cfgPath = path.join(PROJECT_ROOT, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const td = cfg.targetDirs;
      const raw = typeof td === 'string' ? [td] : (Array.isArray(td) ? td : []);
      // 过滤空串/非字符串：`targetDirs: ""` 会被 path.join(PROJECT_ROOT, '') 解析成**项目根**，
      // 把 5 个 skill 目录和 marker 直接倒在项目根——比"不装"更难发现，所以宁可回退探测。
      const clean = raw.filter(d => typeof d === 'string' && d.trim()).map(d => d.trim());
      if (clean.length) return clean;
      console.warn(`[doc-framework] ${CONFIG_FILE} 的 targetDirs 为空/非法，改用探测`);
    } catch (e) {
      // 配置存在但解析失败：warn 后继续走探测（不因一份坏配置让整个安装失败）
      console.warn(`[doc-framework] ${CONFIG_FILE} 解析失败，改用探测：${e.message}`);
    }
  }
  for (const dir of PROBE_DIRS) {
    if (fs.existsSync(path.join(PROJECT_ROOT, dir))) return [dir];
  }
  return [DEFAULT_DIR];
}

/**
 * 项目是否已接入 doc-framework（决定要不要写引导文件）。
 *
 * 认四个历史路径，是为了**升级场景**：老项目用旧目录名（doc/、docs/、docs-framework/）初始化过，
 * 若不认就会把它当新项目，重新塞一份《接入指南.md》+ AGENTS.md 引导段——污染用户目录。
 * 只判目录里的档案文件是否存在，不读内容（探测要便宜且不因内容格式变化而误判）。
 *
 * @returns {boolean}
 */
function isInitialized() {
  // **判据是"这个项目已经跑过接入初始化"，不是"文档根还有效"**——所以英文根（v2.6.0 已下线）
  // 与更早的目录名都算"已初始化"：否则升级时会**复活**《接入指南.md》与 AGENTS.md 引导段，
  // 在这个已经被 `check` 明确报错要求迁移的项目里再塞一份引导，只会添乱。
  // "英文根该迁移"由 `check` / `list` / `diff-check` 显式报错负责，不靠安装脚本。
  return fs.existsSync(path.join(PROJECT_ROOT, 'doc-framework', '项目档案.md'))
    || fs.existsSync(path.join(PROJECT_ROOT, 'doc-framework-en', 'profile.md'))
    || fs.existsSync(path.join(PROJECT_ROOT, 'docs-framework', 'profile.md'))
    // v1.0.4 及以前的旧目录名，兼容升级
    || fs.existsSync(path.join(PROJECT_ROOT, 'doc', '项目档案.md'))
    || fs.existsSync(path.join(PROJECT_ROOT, 'docs', 'profile.md'));
}

/**
 * 把 `skills/*` 整体复制到目标目录，并写安装标记（版本 + 逐文件 sha256）。
 *
 * 覆盖策略是**先 rm 再 cp**（而不是增量合并）：skill 的旧文件若已被删除/改名，增量复制会留下
 * 幽灵文件，而 skill 是按目录整体加载的——残留一个旧 SKILL.md 就等于多一个技能。
 * 代价是用户对该目录的**手动修改会被覆盖**，这正是 marker 记录 sha256 的原因：
 * `sync` 借此识别本地定制并跳过（本函数不跳过，它是首次安装语义）。
 *
 * @param {string} targetDir 相对 PROJECT_ROOT 的目标目录
 * @returns {string} 目标目录的绝对路径
 */
function installSkills(targetDir) {
  const src = path.join(PKG_ROOT, 'skills');
  const dest = path.join(PROJECT_ROOT, targetDir);
  fs.mkdirSync(dest, { recursive: true });

  // 幽灵技能清理：只删**上一次由本框架安装（旧 marker 有记录）、而当前版本已删除/改名**的 skill 目录。
  // 目标目录可能是多 skill 宿主共享的（`.agents/skills` 里还有别的工具的技能），
  // 因此绝不能凭"不在 src 里"就删——那是别人的目录。marker 缺失/损坏时保守不动。
  const markerPath = path.join(dest, MARKER_FILE);
  const srcNames = new Set(fs.readdirSync(src));
  try {
    const old = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    const managed = new Set((old.files || [])
      .map(f => String(f.file).split(/[\\/]/)[0]).filter(Boolean));
    for (const name of managed) {
      if (srcNames.has(name)) continue;
      const p = path.join(dest, name);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`[doc-framework] 已移除不再发布的 skill：${name}`);
      }
    }
  } catch { /* 无旧 marker 或不可解析 → 不清理（保守） */ }

  const files = [];
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    // 逐文件哈希是为了让 sync 能做"文件级"判断：用户改了 A 文件不影响 B 文件的升级。
    // 键统一用 '/'（与 install.sh 的 marker 同构），Windows 下才不会被 sync 误判成"已定制"。
    for (const f of walkFiles(to, to)) {
      files.push({ file: path.join(name, f.file).replace(/\\/g, '/'), hash: f.hash });
    }
  }

  const marker = {
    source: `git+https://github.com/knight-peter/doc-framework.git`,
    version: `v${VERSION}`,
    installedAt: new Date().toISOString().slice(0, 10),
    files,
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
  return dest;
}

/**
 * 未初始化项目的引导落地：预置目录骨架 + "待初始化"README + 项目根《接入指南.md》+ AGENTS.md 引导段。
 *
 * 为什么预置 `doc-framework/` 子目录：初始化由 AI 执行，AI 漏建目录时 `check` 会报一串"缺少目录"，
 * 而"缺少目录"与"文档没写"是两种问题，混在一起难定位；脚本先把骨架摆好，AI 只需渲染文件内容。
 * README 里写"待初始化"是给 `check` 的哨兵（见 cli.js：检测到该文案 → ⚠️ 未清理），
 * 提醒初始化完成后删掉这个骨架文件。
 *
 * AGENTS.md 的**永久段**由模板提供，末尾的 `CONTRACT-FRAMEWORK-BEGIN` 标记用于幂等：
 * 已有永久段就不重复追加（否则每次安装都会把同一段拼一遍）。
 */
function installOnboarding() {
  // 0. 预置 doc-framework 目录骨架（防初始化遗漏；内容由 AI 按接入指南+模板渲染）
  const docRoot = path.join(PROJECT_ROOT, 'doc-framework');
  for (const sub of ['模块', '边界', '规范', '计划', '探索']) {
    fs.mkdirSync(path.join(docRoot, sub), { recursive: true });
  }
  // 引导 README：说明目录用途与初始化要求（初始化完成后由 AI 删除）
  const guideReadme = `# doc-framework（待初始化）

本目录为 doc-framework 文档体系骨架，由安装脚本预置。

请对 AI 说"初始化项目"，AI 将按项目根《接入指南.md》执行接入初始化：
从 \`node_modules/doc-framework/templates/\` 渲染生成 项目档案.md（含应用清单）/ 总契约.md / 测试规范.md / 接口规范.md / 规范三层（类型-前端、类型-后端、每个应用一份「应用-＜应用标识＞」） 等骨架文档，并预置 模块/ 边界/ 规范/ 计划/ 探索/ 目录。

初始化完成后：本 README 与 接入指南.md 一并删除。
`;
  fs.writeFileSync(path.join(docRoot, 'README.md'), guideReadme, 'utf-8');

  // 接入指南.md（从模板渲染默认中文模式）
  const tpl = fs.readFileSync(path.join(PKG_ROOT, 'templates', '接入指南.md.tpl'), 'utf-8');
  fs.writeFileSync(path.join(PROJECT_ROOT, '接入指南.md'), tpl, 'utf-8');

  // AGENTS.md：引导段 + 永久段
  const agentsTpl = fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md.tpl'), 'utf-8');
  // 初始化默认中文模式（英文模式由 AI 按接入指南改渲染；此处不做语言探测：新项目还没有文档根可探）
  const rendered = agentsTpl
    .replace(/\{文档根\}/g, 'doc-framework')
    .replace(/\{文档语言\}/g, '中文');
  const agentsPath = path.join(PROJECT_ROOT, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    // 幂等：已有永久段标记就不再追加；追加前补空行，避免与用户原有内容黏在最后一行
    if (!content.includes('CONTRACT-FRAMEWORK-BEGIN')) {
      fs.writeFileSync(agentsPath, content.replace(/\s*$/, '\n\n') + rendered, 'utf-8');
    }
  } else {
    fs.writeFileSync(agentsPath, rendered, 'utf-8');
  }
}

/**
 * 安装入口：装 skill（可能多个目标目录）→ 按是否已接入决定要不要写引导文件 → 打印下一步提示。
 *
 * 两件事互相独立：**skill 一定要装**（已初始化项目升级框架也得换新 skill），
 * 引导文件**只在未接入时写**。所以这里不是 if/else，而是"装完再判断"。
 */
function runInstall() {
  const dirs = resolveTargetDirs();
  for (const dir of dirs) {
    const dest = installSkills(dir);
    console.log(`[doc-framework] 已安装 skill 到：${dest}`);
  }

  if (isInitialized()) {
    console.warn('[doc-framework] 检测到项目已接入（档案已存在），跳过接入指南与 AGENTS.md 引导段写入');
  } else {
    installOnboarding();
    console.log('[doc-framework] 已生成项目根《接入指南.md》并写入 AGENTS.md（含接入引导段）');
  }
  console.log('[doc-framework] 下一步：对 AI 说"初始化项目"，AI 将按《接入指南.md》执行接入初始化');
}

// 仅在直接执行时跑安装（被 require 时只导出工具函数，便于测试与复用）
if (require.main === module) {
  runInstall();
}

// 导出的都是幂等查询/工具：install.sh、selftest 与 sync 都复用这里的判定口径
module.exports = { PKG_ROOT, PROJECT_ROOT, VERSION, resolveTargetDirs, isInitialized, MARKER_FILE, walkFiles };
