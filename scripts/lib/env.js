'use strict';
/**
 * 命令层环境（**项目根 / 版本 / 包根的唯一解析处**）。
 *
 * 为什么单独成文件：
 *   - 旧实现让 commands/* 与 checks/* 都 `require('../install')` 取 `PROJECT_ROOT` / `VERSION`，
 *     依赖方向变成 commands → install → lib，和声明的 `cli → commands → checks → lib` 不一致；
 *   - 旧安装器的 `PROJECT_ROOT` 用 `INIT_CWD`（npm 生命周期语义），而 CLI 从子目录 / CI 调用时
 *     需要 `--root` 或向上查找 `doc-framework/`；两者混在一起会检查错目录。
 *
 * 解析顺序（CLI）：
 *   1. `--root <dir>`（显式，最高优先）
 *   2. `DOC_FRAMEWORK_ROOT` 环境变量
 *   3. 从 cwd 向上查找 `doc-framework/`（找到则返回其父目录）
 *   4. cwd（未初始化 / 首次安装场景；由调用方给"未找到文档根"的清晰提示）
 *
 * 安装命令（commands/install → lib/install-actions）用 `installRoot()` 仅保留给遗留直接调用；
 * 正常运行 `doc-framework install` 走 `resolveRoot()`（支持 --root / 向上查找）。
 */
const fs = require('fs');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '../..');
const VERSION = require(path.join(PKG_ROOT, 'package.json')).version;

/** 文档根目录名（固定中文，不支持英文/旧目录名）。 */
const DOC_ROOT_NAME = 'doc-framework';

/** 从 start 向上找名为 name 的目录，返回绝对路径或 null。 */
function findUp(start, name) {
  let dir = path.resolve(start);
  for (;;) {
    const hit = path.join(dir, name);
    try {
      if (fs.statSync(hit).isDirectory()) return hit;
    } catch { /* 继续向上 */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * 解析 CLI 的项目根（见文件头顺序）。`rootArg` 可来自 `--root`。
 * 显式 `--root` 不要求目录已存在（安装命令可能要在空目录初始化）；命令层自己给"未找到文档根"提示。
 * @param {string|null} rootArg
 * @param {string} [cwd]
 * @returns {string} 绝对路径
 */
function resolveRoot(rootArg = null, cwd = process.cwd()) {
  if (rootArg) return path.isAbsolute(rootArg) ? rootArg : path.resolve(cwd, rootArg);
  if (process.env.DOC_FRAMEWORK_ROOT) {
    const envRoot = process.env.DOC_FRAMEWORK_ROOT;
    return path.isAbsolute(envRoot) ? envRoot : path.resolve(cwd, envRoot);
  }
  const docDir = findUp(cwd, DOC_ROOT_NAME);
  return docDir ? path.dirname(docDir) : path.resolve(cwd);
}

/**
 * 安装器用的项目根：npm/pnpm 生命周期里 `INIT_CWD` = 执行安装的项目根；
 * 无 `INIT_CWD` 时回退 cwd。
 * @returns {string} 绝对路径
 */
function installRoot() {
  return path.resolve(process.env.INIT_CWD || process.cwd());
}

module.exports = {
  PKG_ROOT,
  VERSION,
  DOC_ROOT_NAME,
  findUp,
  resolveRoot,
  installRoot,
};
