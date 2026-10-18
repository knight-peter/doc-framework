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
 * @returns {{version?:string, files?:Array<{file:string,hash:string}>, skills?:Object}|null}
 */
function readMarker(targetDir) {
  const p = path.join(targetDir, install.MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

/**
 * 从 marker 还原 **per-skill** 版本信息；兼容只有聚合 `files` 的旧 marker。
 *
 * 新 marker：`skills: { name: { version, files:[{file,hash}] } }`（file 相对 skill 目录）。
 * 旧 marker：`version` + `files:[{file:'name/rel',hash}]` —— 按首段目录名分组，
 * 每个 skill 继承旧的全局 version（所以旧 marker 升级时所有 skill 都会被重新判定）。
 *
 * @returns {Object<string,{version:string|null, files:Array<{file:string,hash:string}>}>}
 */
function oldSkillsOf(marker) {
  const out = {};
  if (!marker) return out;
  const norm = s => String(s).replace(/\\/g, '/');
  if (marker.skills && typeof marker.skills === 'object') {
    for (const [name, entry] of Object.entries(marker.skills)) {
      if (!entry || typeof entry !== 'object') continue;
      out[name] = {
        version: entry.version || marker.version || null,
        files: Array.isArray(entry.files)
          ? entry.files
            .map(f => {
              const rel = norm(f.file);
              return { file: rel.startsWith(`${name}/`) ? rel.slice(name.length + 1) : rel, hash: f.hash };
            })
            .filter(f => f.file)
          : [],
      };
    }
    return out;
  }
  if (Array.isArray(marker.files)) {
    for (const f of marker.files) {
      const rel = norm(f.file);
      const slash = rel.indexOf('/');
      if (slash <= 0) continue;
      const name = rel.slice(0, slash);
      if (!out[name]) out[name] = { version: marker.version || null, files: [] };
      out[name].files.push({ file: rel.slice(slash + 1), hash: f.hash });
    }
  }
  return out;
}

/**
 * `doc-framework sync`：把包内的 `skills/` 升级到已安装位置。
 *
 * 与 install.js 的语义差别：
 *   - install.js 是**首次安装 / 强制刷新**：整体覆盖，不关心目标目录里改过什么；
 *   - sync 是**升级**：按 marker 的逐文件 sha256 判断目标文件是否被本地改过，
 *     改过的 skill **跳过并告警**，避免升级把用户的定制覆盖掉。
 *
 * **判定粒度是 skill，不是整个目标目录**：每个 skill 的版本单独记在 marker 的 `skills` 里。
 * 旧实现只有一个全局 version，跳过某个定制 skill 时仍把全局版本写成最新 → 下次 sync 直接
 * "已是最新" 整体 no-op，那个 skill 就永久搁浅。现在被跳过的 skill 保留它自己的旧版本，
 * 下次 sync 会继续尝试；其它 skill 正常升级。
 *
 * 幽灵技能：旧 marker 记录过、当前源已不存在的 skill 目录会被删除（只删 marker 记录过的，
 * 不碰宿主目录里别的工具的技能）。
 *
 * 注意：本函数没有返回值，入口也不调用 process.exit——退出码恒为 0；每个分支都要打印说明。
 */
function sync() {
  const dirs = install.resolveTargetDirs();
  const src = path.join(install.PKG_ROOT, 'skills');
  const current = `v${install.VERSION}`;
  const norm = s => String(s).replace(/\\/g, '/');
  let changed = false;
  let skippedTotal = 0;

  for (const dir of dirs) {
    const targetDir = path.join(install.PROJECT_ROOT, dir);
    if (!fs.existsSync(targetDir)) {
      console.warn(`[doc-framework] 目标目录不存在，请重新安装：${targetDir}`);
      continue;
    }
    const marker = readMarker(targetDir);
    const oldSkills = oldSkillsOf(marker);
    const oldVersion = marker ? (marker.version || '未知') : '未知';
    const srcNames = fs.readdirSync(src).filter(name => {
      try { return fs.statSync(path.join(src, name)).isDirectory(); } catch { return false; }
    });
    const newSkills = {};
    let changedHere = false;
    let skippedHere = 0;
    let upToDate = 0;

    console.log(`[doc-framework] ${dir} 版本 ${oldVersion} → ${current}，开始同步`);
    for (const name of srcNames) {
      const from = path.join(src, name);
      const to = path.join(targetDir, name);
      const skillFiles = install.walkFiles(from, from)
        .map(f => ({ file: norm(f.file), hash: f.hash }));
      const old = oldSkills[name] || null;
      const oldHashes = {};
      for (const f of (old && old.files) || []) oldHashes[norm(f.file)] = f.hash;
      const canDetect = !!(old && old.files.length > 0);
      const diskHash = rel => {
        try { return install.hashFile(path.join(to, rel)); } catch { return null; }
      };
      const diskMatchesSource = skillFiles.every(f => diskHash(f.file) === f.hash);
      // 与旧实现同口径：marker 没有基线的源文件 = 上游新增文件，不构成"本地定制"证据；
      // 有基线的文件，磁盘与基线一致才算未被改过。
      const untouched = !canDetect
        || skillFiles.every(f => oldHashes[f.file] === undefined || diskHash(f.file) === oldHashes[f.file]);
      const oldMatchesSource = !!(old && old.version === current
        && skillFiles.every(f => oldHashes[f.file] === f.hash));

      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        newSkills[name] = { version: current, files: skillFiles };
        changed = changedHere = true;
      } else if (!untouched) {
        console.warn(`  ! 跳过（本地已定制）：${name}`);
        // 关键：保留该 skill 的旧版本，不跟着全局 version 推进；下次 sync 仍会尝试。
        newSkills[name] = { version: old.version || null, files: (old && old.files) || [] };
        skippedHere++;
      } else if (oldMatchesSource && diskMatchesSource) {
        // 版本与文件都已是当前：不重写，避免无意义的磁盘改动
        newSkills[name] = { version: current, files: skillFiles };
        upToDate++;
      } else {
        fs.rmSync(to, { recursive: true, force: true });
        fs.cpSync(from, to, { recursive: true });
        console.log(`  ~ 更新：${name}`);
        newSkills[name] = { version: current, files: skillFiles };
        changed = changedHere = true;
      }
    }

    // 幽灵技能：旧 marker 记录过、当前源已不存在 → 删除（只删自己管理过的目录）
    for (const name of Object.keys(oldSkills)) {
      if (srcNames.includes(name)) continue;
      const p = path.join(targetDir, name);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`  - 移除不再发布的 skill：${name}`);
        changed = changedHere = true;
      }
      delete newSkills[name];
    }

    const files = [];
    for (const [name, s] of Object.entries(newSkills)) {
      for (const f of s.files) files.push({ file: `${name}/${f.file}`, hash: f.hash });
    }
    install.writeMarker(path.join(targetDir, install.MARKER_FILE), files, newSkills);
    skippedTotal += skippedHere;
    if (!changedHere) {
      console.log(`[doc-framework] ${dir} 已是最新${upToDate === srcNames.length ? '' : '（有跳过项）'}：${current}`);
    }
  }

  if (!changed) {
    console.log(`[doc-framework] 同步完成（无变更${skippedTotal ? `，${skippedTotal} 个 skill 因本地定制跳过` : ''}）`);
  }
  console.log('[doc-framework] 已初始化项目不会复活接入引导（见 install.js 已初始化检测）');
}

module.exports = { readMarker, oldSkillsOf, sync };
