#!/usr/bin/env node
/**
 * doc-framework CLI
 * 用法：
 *   doc-framework sync   —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework check  —— 校验 doc-framework 文档体系完整性（骨架 + 占位符残留）
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
 *
 * check 逻辑（文档根支持中英文模式：doc-framework/ 或 docs-framework/）：
 *   1. 骨架完整性：必需文件/目录是否存在
 *   2. 占位符残留：扫描文档根下所有 .md，检测未渲染的 {xxx} 占位符
 *   3. 引导残留：接入指南.md / 骨架 README 是否未删除、AGENTS.md 引导段是否未移除
 *   4. 退出码：0=通过，1=发现问题
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

/**
 * check：校验文档体系完整性（文档根支持中英文模式：doc-framework/ 或 docs-framework/）
 * - 骨架完整性：必需文件/目录是否存在
 * - 占位符残留：文档根下 .md 含未渲染的 {xxx} 占位符
 * - 引导残留：接入指南.md / 骨架 README 未删除、AGENTS.md 引导段未移除
 * 退出码：0=通过，1=发现问题
 */
function check() {
  const root = install.PROJECT_ROOT;
  // 文档根探测：中文模式 doc-framework/ 优先，否则英文模式 docs-framework/（都不存在时按中文报缺失）
  const cnRoot = path.join(root, 'doc-framework');
  const enRoot = path.join(root, 'docs-framework');
  const docRoot = fs.existsSync(cnRoot) ? cnRoot : enRoot;
  const docLabel = docRoot === enRoot ? 'docs-framework' : 'doc-framework';
  const issues = [];

  // 1. 骨架完整性
  const requiredFiles = ['项目档案.md', '总契约.md', '测试规范.md', '接口规范.md'];
  const requiredDirs = ['模块', '边界', '规范', '计划'];
  const requiredStdFiles = ['规范/前端开发规范.md', '规范/后端开发规范.md'];

  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少文件：${docLabel}/${f}`);
  }
  for (const d of requiredDirs) {
    if (!fs.existsSync(path.join(docRoot, d))) issues.push(`❌ 缺少目录：${docLabel}/${d}/`);
  }
  for (const f of requiredStdFiles) {
    if (!fs.existsSync(path.join(docRoot, f))) issues.push(`❌ 缺少规范文档：${docLabel}/${f}（应从官方模板渲染，见《接入指南.md》「模板来源」）`);
  }

  // 2. 占位符残留（扫描文档根下所有 .md）
  // 过滤策略：剥离代码围栏与行内代码后，只报告"含中文"的 {占位符}
  // ——模板占位符均为中文/中英混合（{文档根} {模块名} {业务域}），而 API 路径参数（/{id}）、
  //    MyBatis 参数（#{version}）、JS 模板串（${creator}）、mermaid 表达式均为英文，不误报。
  if (fs.existsSync(docRoot)) {
    const mdFiles = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.md')) mdFiles.push(p);
      }
    })(docRoot);
    for (const f of mdFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      // 剥离 ``` 代码围栏（含 mermaid/json/js/sql/bash）
      const noFence = content.replace(/```[\s\S]*?```/g, '');
      // 剥离行内代码（反引号包裹）
      const noInline = noFence.replace(/`[^`\n]*`/g, '');
      const placeholders = noInline.match(/\{[^{}\n]+\}/g);
      if (placeholders) {
        // 只报含中文的占位符（模板占位符特征）
        const unique = [...new Set(placeholders)].filter(p => /[\u4e00-\u9fa5]/.test(p));
        if (unique.length) {
          issues.push(`⚠️ 占位符未渲染：${path.relative(root, f)} → ${unique.join(' ')}`);
        }
      }
    }
  }

  // 3. 引导残留（检测"接入引导段"特征注释；永久段的 CONTRACT-FRAMEWORK-BEGIN 标记不误报）
  if (fs.existsSync(path.join(root, '接入指南.md'))) {
    issues.push(`⚠️ 未清理：项目根/接入指南.md（初始化完成后应删除）`);
  }
  // 安装预置的骨架引导 README（install.js / install.sh 生成）
  const skeletonReadme = path.join(docRoot, 'README.md');
  if (fs.existsSync(skeletonReadme) && fs.readFileSync(skeletonReadme, 'utf-8').includes('待初始化')) {
    issues.push(`⚠️ 未清理：${docLabel}/README.md（安装预置的骨架引导文件，初始化完成后应删除）`);
  }
  const agentsPath = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    if (content.includes('接入引导段') && content.includes('移除')) {
      issues.push(`⚠️ 未清理：AGENTS.md 仍包含接入引导段（初始化完成后应移除）`);
    }
  }

  if (issues.length === 0) {
    console.log('✅ doc-framework check 通过：骨架完整，无占位符残留，引导已清理');
    return 0;
  }
  console.log('❌ doc-framework check 发现问题：');
  issues.forEach(i => console.log(`  ${i}`));
  return 1;
}

function help() {
  console.log(`doc-framework v${install.VERSION}
用法：
  doc-framework sync    同步 skill 到最新（本地定制自动跳过）
  doc-framework check   校验文档体系完整性（骨架 + 占位符残留 + 引导清理）
  doc-framework --help  显示帮助`);
}

const arg = process.argv[2];
if (arg === 'sync') sync();
else if (arg === 'check') process.exit(check());
else help();
