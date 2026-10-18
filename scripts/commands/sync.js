'use strict';
/** sync 命令（由 scripts/cli.js 拆出：判据与输出文案不得在本文件之外重复）。 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const installer = require('../lib/installer');
const { parseArgs } = require('../lib/util');

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
  if (marker.skills && typeof marker.skills === 'object' && !Array.isArray(marker.skills)) {
    for (const [name, entry] of Object.entries(marker.skills)) {
      if (!installer.isSafeSkillName(name) || !entry || typeof entry !== 'object') continue;
      out[name] = {
        version: entry.version || marker.version || null,
        files: Array.isArray(entry.files)
          ? entry.files
            .filter(f => f && typeof f === 'object' && typeof f.file === 'string' && installer.isSafeRelPath(f.file))
            .map(f => {
              const rel = norm(f.file);
              return { file: rel.startsWith(`${name}/`) ? rel.slice(name.length + 1) : rel, hash: f.hash };
            })
            .filter(f => f.file)
          : [],
      };
    }
    if (Object.keys(out).length) return out;
  }
  if (Array.isArray(marker.files)) {
    for (const f of marker.files) {
      if (!f || typeof f !== 'object' || typeof f.file !== 'string') continue;
      const rel = norm(f.file);
      const slash = rel.indexOf('/');
      if (slash <= 0 || !installer.isSafeRelPath(rel)) continue;
      const name = rel.slice(0, slash);
      if (!installer.isSafeSkillName(name) || !installer.isSafeRelPath(rel.slice(slash + 1))) continue;
      if (!out[name]) out[name] = { version: marker.version || null, files: [] };
      out[name].files.push({ file: rel.slice(slash + 1), hash: f.hash });
    }
  }
  return out;
}

/**
 * `doc-framework sync`：把包内的 `skills/` 升级到已安装位置。
 *
 * 与 install 命令（lib/install-actions）的语义差别：
 *   - install 是**首次安装 / 强制刷新**：整体覆盖，不关心目标目录里改过什么；
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
 * 注意：本函数返回退出码（0 / 1），由 cli.js 统一 process.exit；每个分支都要打印说明。
 */
function sync(argv = []) {
  const { flags, missingValue, unknownFlags } = parseArgs(argv, ['--root'], []);
  if (unknownFlags.length) {
    console.warn(`[doc-framework] 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework sync [--root <项目根>]）`);
    return 1;
  }
  if (missingValue.length) {
    console.warn(`[doc-framework] 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework sync [--root <项目根>]）`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const dirs = installer.resolveTargetDirs(root);
  const src = path.join(env.PKG_ROOT, 'skills');
  const current = `v${env.VERSION}`;
  const norm = s => String(s).replace(/\\/g, '/');
  let changed = false;
  let skippedTotal = 0;
  let hadError = false;

  for (const dir of dirs) {
    const targetDir = path.join(root, dir);
    if (!fs.existsSync(targetDir)) {
      console.warn(`[doc-framework] 目标目录不存在，请重新安装：${targetDir}`);
      hadError = true;
      continue;
    }
    const marker = installer.readMarker(targetDir);
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
      const skillFiles = installer.walkFiles(from, from)
        .map(f => ({ file: norm(f.file), hash: f.hash }));
      const old = oldSkills[name] || null;
      const oldFiles = (old && old.files) || [];
      const oldHashes = {};
      for (const f of oldFiles) oldHashes[norm(f.file)] = f.hash;
      const oldSet = new Set(oldFiles.map(f => norm(f.file)));
      const sourceSet = new Set(skillFiles.map(f => f.file));
      const canDetect = oldFiles.length > 0;
      const exists = fs.existsSync(to);
      const diskHash = rel => {
        try { return installer.hashFile(path.join(to, rel)); } catch { return null; }
      };

      // 目标存在但**没有 marker**：无法区分官方文件与用户文件。sync 不是 install，
      // 不能把同名 skill 目录当官方目录覆盖（那正是"升级把用户改的东西吃掉"）。
      // 需要强制刷新时用 install（它的语义就是先删后拷）。
      if (!old && exists) {
        console.warn(`  ! 跳过（无安装标记，无法确认是否本地定制）：${name}（要强制刷新请跑 doc-framework install）`);
        skippedHere++;
        continue;
      }

      // 目标目录/文件不可读：不猜、不覆盖；交给用户先修权限。
      let targetFiles = [];
      if (exists) {
        try {
          if (!fs.statSync(to).isDirectory()) {
            console.warn(`  ! 跳过（目标不是目录）：${name}`);
            skippedHere++;
            continue;
          }
          targetFiles = installer.walkFiles(to, to).map(f => ({ file: norm(f.file), hash: f.hash }));
        } catch (e) {
          console.warn(`  ! 跳过（目标不可读：${e.code || e.message}）：${name}`);
          skippedHere++;
          continue;
        }
      }
      const extraFiles = targetFiles.filter(f => !sourceSet.has(f.file));
      // marker 记录过的旧文件被上游删掉 = 幽灵文件，可安全清理；marker 没记录过的额外文件 = 用户文件，不能删。
      const unmanagedExtra = extraFiles.filter(f => !oldSet.has(f.file));
      const oldHashMismatch = oldFiles.some(f => {
        const h = diskHash(norm(f.file));
        return h !== null && h !== f.hash;
      });
      const diskMatchesSource = skillFiles.every(f => diskHash(f.file) === f.hash);
      // 与旧实现同口径：marker 没有基线的源文件 = 上游新增文件，不构成"本地定制"证据；
      // 有基线的文件，磁盘与基线一致才算未被改过。额外用户文件与旧文件改动也算定制。
      const untouched = !canDetect
        || (!oldHashMismatch
          && unmanagedExtra.length === 0
          && skillFiles.every(f => oldHashes[f.file] === undefined || diskHash(f.file) === oldHashes[f.file]));
      const oldMatchesSource = !!(old && old.version === current
        && oldFiles.length === skillFiles.length
        && skillFiles.every(f => oldSet.has(f.file) && oldHashes[f.file] === f.hash));

      if (!exists) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        newSkills[name] = { version: current, files: skillFiles };
        changed = changedHere = true;
      } else if (!untouched) {
        console.warn(`  ! 跳过（本地已定制）：${name}`);
        // 关键：保留该 skill 的旧版本，不跟着全局 version 推进；下次 sync 仍会尝试。
        newSkills[name] = { version: old ? (old.version || null) : null, files: oldFiles };
        skippedHere++;
      } else if (oldMatchesSource && diskMatchesSource && extraFiles.length === 0) {
        // 版本、文件集与磁盘内容都已是当前：不重写，避免无意义的磁盘改动
        newSkills[name] = { version: current, files: skillFiles };
        upToDate++;
      } else {
        if (old && !canDetect) {
          console.warn(`  ! 旧 marker 无逐文件哈希，无法判定定制，按未定制覆盖：${name}`);
        }
        fs.rmSync(to, { recursive: true, force: true });
        fs.cpSync(from, to, { recursive: true });
        console.log(`  ~ 更新：${name}`);
        newSkills[name] = { version: current, files: skillFiles };
        changed = changedHere = true;
      }
    }

    // 幽灵技能：旧 marker 记录过、当前源已不存在 → 删除（只删自己管理过的目录）
    for (const name of Object.keys(oldSkills)) {
      if (!installer.isSafeSkillName(name)) continue;
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
    installer.writeMarker(path.join(targetDir, installer.MARKER_FILE), files, newSkills);
    skippedTotal += skippedHere;
    if (!changedHere) {
      console.log(`[doc-framework] ${dir} 已是最新${upToDate === srcNames.length ? '' : '（有跳过项）'}：${current}`);
    }
  }

  if (hadError) {
    console.warn('[doc-framework] 同步未完成：至少一个目标目录不存在（先跑 doc-framework install）');
    return 1;
  }
  if (!changed) {
    console.log(`[doc-framework] 同步完成（无变更${skippedTotal ? `，${skippedTotal} 个 skill 因本地定制跳过` : ''}）`);
  }
  console.log('[doc-framework] 已初始化项目不会复活接入引导（见 commands/install 已初始化检测）');
  return 0;
}

module.exports = { readMarker: installer.readMarker, oldSkillsOf, sync };
