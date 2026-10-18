'use strict';
/**
 * 安装器共享原语（**marker / 文件哈希 / 目标目录解析 / 写入**的唯一实现）。
 *
 * lib/install-actions（首次安装）与 commands/sync.js（升级）都用这里：
 *   - hashFile / walkFiles：逐文件 sha256；
 *   - writeMarker / readMarker：`.doc-framework.json` 的唯一字段结构；
 *   - resolveTargetDirs：配置 > 探测 > 默认。
 * 本文件不依赖 commands/checks，也不做安装动作本身（lib/install-actions 负责）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('./env');

// 版本标记里的 source 字段（install 与 sync 写 marker 的唯一来源）
const REPO_URL = 'git+https://github.com/knight-peter/doc-framework.git';
const CONFIG_FILE = 'doc-framework.config.json';
// 探测顺序即优先级：多 skill 宿主共存时取第一个已存在的（.agents 是 DSH 的约定目录）
const PROBE_DIRS = ['.agents/skills', '.claude/skills', '.cursor/skills'];
const DEFAULT_DIR = '.agents/skills';
// 安装标记文件名（写在**目标 skill 目录内**，记录版本 + 逐文件 sha256）
const MARKER_FILE = '.doc-framework.json';

/** 文件 sha256（hex）。sync 用它比对"安装时的内容 vs 当前内容"来识别本地定制。 */
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * 递归遍历目录，返回 [{ file: 相对 base 的路径, hash: sha256 }]（skills 顶层是 skill 目录）。
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

/** 相对路径是否安全：拒绝绝对路径、盘符、空段、`.`/`..`（marker 是项目内文件，不能让它指向项目外）。 */
function isSafeRelPath(file) {
  const s = String(file || '').replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[A-Za-z]:/.test(s)) return false;
  return s.split('/').every(seg => seg && seg !== '.' && seg !== '..');
}

/** skill 名是否安全：必须是单段相对名（不能是 `..` / 含分隔符 / 绝对路径）。 */
function isSafeSkillName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..') return false;
  const s = name.replace(/\\/g, '/');
  return !s.includes('/') && !/[:*?"<>|]/.test(s) && isSafeRelPath(s);
}

/**
 * 写版本标记 `.doc-framework.json`（install 与 sync 的唯一写入点——marker 字段结构只有这一份定义）。
 *
 * `files` 是**旧读取方兼容用的聚合清单**（`skill名/文件`）；真正的升级判定看 `skills`：
 * 每个 skill 各自记 `{version, files}`。这样 `sync` 跳过某个定制 skill 时不会把整个目录的版本
 * 推进到最新（旧实现只写一个全局 version，被跳过的 skill 会永久显示“已是最新”）。
 * @param {string} markerPath
 * @param {Array<{file:string,hash:string}>} files 聚合清单
 * @param {Object<string,{version:string|null,files:Array<{file:string,hash:string}>}>} [skills]
 */
function writeMarker(markerPath, files, skills = null) {
  const marker = {
    source: REPO_URL,
    version: `v${env.VERSION}`,
    installedAt: new Date().toISOString().slice(0, 10),
    files,
    ...(skills && Object.keys(skills).length ? { skills } : {}),
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
}

/**
 * 读目标 skill 目录里的安装标记 `.doc-framework.json`。
 * 读不出返回 null 而不抛异常：marker 是升级辅助信息，不是必需输入。
 * @param {string} targetDir 目标 skill 目录（绝对路径）
 * @returns {{version?:string, files?:Array<{file:string,hash:string}>, skills?:Object}|null}
 */
function readMarker(targetDir) {
  const p = path.join(targetDir, MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    // marker 是升级辅助信息：结构不对（数组/字符串/null）时按“没有 marker”处理，
    // 不把畸形 JSON 的子字段带进 sync/doctor 造成 TypeError。
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/** 判断配置里的 targetDir 是否是 projectRoot 内的相对目录（拒绝绝对路径、`..`、`.` 与空串）。
 *  安装/sync 会按这个目录写文件；不能允许项目内配置把写入引到项目外（或直接把项目根当 skill 宿主）。 */
function isSafeTargetDir(projectRoot, dir) {
  if (typeof dir !== 'string') return false;
  const value = dir.trim();
  if (!value || path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  const rootAbs = path.resolve(projectRoot);
  const abs = path.resolve(rootAbs, value);
  const rel = path.relative(rootAbs, abs);
  return !!rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * 决定 skill 装到哪：配置 > 探测已存在的宿主目录 > 默认。
 *
 * 三级回退的理由：`targetDirs` 是用户显式声明（配置文件坏了不能静默降级成默认——这里 warn 后降级，
 * 因为"装错位置"比"不装"更容易被发现和修复）；探测是为了兼容已用 .claude/.cursor 的项目，
 * 避免同一个项目里出现两份 skill 副本。
 *
 * @param {string} [projectRoot=process.cwd()] 项目根（绝对路径）
 * @returns {string[]} 目标目录列表（相对 projectRoot；配置允许数组 = 一次装多处）
 */
function resolveTargetDirs(projectRoot = process.cwd()) {
  const cfgPath = path.join(projectRoot, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const td = cfg.targetDirs;
      const raw = typeof td === 'string' ? [td] : (Array.isArray(td) ? td : []);
      // 过滤空串 / 非字符串 / 解析后落在项目根或项目根之外：
      // `targetDirs: ""` / "." 会被 path.join 解析成项目根，把 skill 与 marker 倒在项目根；
      // `../x` / 绝对路径会写到项目外——都不接受，宁可回退探测。
      const clean = [];
      for (const rawItem of raw) {
        if (typeof rawItem !== 'string') continue;
        const item = rawItem.trim();
        if (!isSafeTargetDir(projectRoot, item)) {
          if (item) console.warn(`[doc-framework] ${CONFIG_FILE} 的 targetDirs 含项目根外/项目根路径，已忽略：${item}`);
          continue;
        }
        const rel = path.relative(path.resolve(projectRoot), path.resolve(projectRoot, item));
        if (!rel) continue;
        const norm = rel.split(path.sep).join('/');
        if (!clean.includes(norm)) clean.push(norm);
      }
      if (clean.length) return clean;
      console.warn(`[doc-framework] ${CONFIG_FILE} 的 targetDirs 为空/非法，改用探测`);
    } catch (e) {
      // 配置存在但解析失败：warn 后继续走探测（不因一份坏配置让整个安装失败）
      console.warn(`[doc-framework] ${CONFIG_FILE} 解析失败，改用探测：${e.message}`);
    }
  }
  for (const dir of PROBE_DIRS) {
    if (fs.existsSync(path.join(projectRoot, dir))) return [dir];
  }
  return [DEFAULT_DIR];
}

module.exports = {
  REPO_URL,
  CONFIG_FILE,
  PROBE_DIRS,
  DEFAULT_DIR,
  MARKER_FILE,
  hashFile,
  walkFiles,
  writeMarker,
  readMarker,
  resolveTargetDirs,
  isSafeTargetDir,
  isSafeRelPath,
  isSafeSkillName,
};
