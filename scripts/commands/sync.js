'use strict';
/** sync 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const fs = require('fs');
const path = require('path');
const install = require('../install');

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
 *   3. marker 缺逐文件 hash（marker 不完整/被手工编辑过，或压根没 marker）→ **按"未定制"覆盖**并明确告警。
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
    // 标记缺少逐文件 hash（marker 不完整，或无 marker）→ 无法判定本地定制，
    // 按"未定制"覆盖并明确告警（否则会把所有官方 skill 误判为已定制而全部跳过，升级静默失效）。
    const canDetectCustomization = Object.keys(oldHashes).length > 0;
    if (!canDetectCustomization) {
      console.warn(marker
        ? `  ! 版本标记缺少逐文件 hash（标记不完整），本次按未定制处理并覆盖`
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
        // ★ marker 里没有基线的源文件 = 上游**新增**的文件（旧 marker 不会记录它），
        //   不能当成定制证据——否则一个新增文件就让整个 skill 目录被判"已定制"跳过，
        //   而 marker 随即被写成新版本 → 后续 sync 因"版本已是最新"整体 no-op，
        //   这次升级连同那个新文件就永久搁浅（无法自愈）。
        const untouched = !canDetectCustomization || srcFiles.every(f => oldHashes[f.file] === undefined
          || (fs.existsSync(path.join(targetDir, f.file))
            && install.hashFile(path.join(targetDir, f.file)) === oldHashes[f.file]));
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

    install.writeMarker(path.join(targetDir, install.MARKER_FILE), newFiles);
  }

  if (!changed) console.log('[doc-framework] 同步完成（无变更）');
  console.log('[doc-framework] 已初始化项目不会复活接入引导（见 install.js 已初始化检测）');
}

module.exports = { readMarker, sync };
