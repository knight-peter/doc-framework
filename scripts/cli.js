#!/usr/bin/env node
/**
 * doc-framework CLI
 * 用法：
 *   doc-framework sync   —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework --help —— 帮助
 *
 * sync 逻辑（防漂移，与方案 §9.5/§9.6 一致）：
 *   1. 读版本标记 {目标目录}/.doc-framework.json（含逐文件 sha256）
 *   2. 对比当前包版本：不落后则提示已最新
 *   3. 落后则逐文件对比：
 *      - 目标不存在 → 复制新版本
 *      - 目标 hash == 标记中旧 hash → 未定制 → 覆盖为新版本
 *      - 目标 hash != 标记中旧 hash → 本地定制 → 跳过并提示
 *   4. 更新后重写版本标记（新版本 + 新 hash）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const install = require('./install');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readMarker(targetDir) {
  const p = path.join(targetDir, install.MARKER_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

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
    const oldHashes = {};
    if (marker && Array.isArray(marker.files)) {
      for (const f of marker.files) oldHashes[f.file] = f.hash;
    }

    const newFiles = [];
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(targetDir, name);
      // 逐文件记录（skill 是目录：递归到每个文件，相对路径如 module-code/SKILL.md）
      const srcFiles = install.walkFiles(from, from)
        .map(f => ({ file: path.join(name, f.file), hash: f.hash }));

      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
        console.log(`  + 新增：${name}`);
        changed = true;
      } else {
        // 全部源文件在标记中都有旧 hash 且目标内容与旧 hash 一致 → 未定制 → 覆盖
        const untouched = srcFiles.every(f => oldHashes[f.file] !== undefined
          && fs.existsSync(path.join(targetDir, f.file))
          && hashFile(path.join(targetDir, f.file)) === oldHashes[f.file]);
        if (untouched) {
          fs.rmSync(to, { recursive: true, force: true });
          fs.cpSync(from, to, { recursive: true });
          console.log(`  ~ 更新：${name}`);
          changed = true;
        } else {
          console.warn(`  ! 跳过（本地已定制）：${name}`);
        }
      }
      // 标记统一记录【源文件】hash（官方版本），供下次对比判断是否被本地定制
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

function help() {
  console.log(`doc-framework v${install.VERSION}
用法：
  doc-framework sync   同步 skill 到最新（本地定制自动跳过）
  doc-framework --help 显示帮助`);
}

const arg = process.argv[2];
if (arg === 'sync') sync();
else help();
