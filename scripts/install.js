#!/usr/bin/env node
/**
 * doc-framework 安装脚本（方式 A：npm/pnpm postinstall）
 *
 * 行为（与 install.sh 一致）：
 *   1. 解析目标 skill 目录（配置 doc-framework.config.json targetDirs > 探测 > 默认 .agents/skills）
 *   2. 复制 skills/* 到目标目录，逐文件记录 sha256 到版本标记 {目标目录}/.doc-framework.json
 *   3. 已初始化检测：项目根存在 doc-framework/项目档案.md 或 docs-framework/profile.md → 跳过接入指南与 AGENTS.md 引导段
 *   4. 未初始化：复制 接入指南.md 到项目根；写入/更新 AGENTS.md（接入引导段 + 永久段）
 *   5. 输出安装报告
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
const PROBE_DIRS = ['.agents/skills', '.claude/skills', '.cursor/skills'];
const DEFAULT_DIR = '.agents/skills';
const MARKER_FILE = '.doc-framework.json';

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 递归遍历目录，返回 [{ file: 相对路径, hash: sha256 }]（skills 顶层是 skill 目录）
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

function resolveTargetDirs() {
  const cfgPath = path.join(PROJECT_ROOT, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const td = cfg.targetDirs;
      if (typeof td === 'string') return [td];
      if (Array.isArray(td) && td.length) return td;
    } catch (e) {
      console.warn(`[doc-framework] ${CONFIG_FILE} 解析失败，改用探测：${e.message}`);
    }
  }
  for (const dir of PROBE_DIRS) {
    if (fs.existsSync(path.join(PROJECT_ROOT, dir))) return [dir];
  }
  return [DEFAULT_DIR];
}

function isInitialized() {
  return fs.existsSync(path.join(PROJECT_ROOT, 'doc-framework', '项目档案.md'))
    || fs.existsSync(path.join(PROJECT_ROOT, 'docs-framework', 'profile.md'))
    // v1.0.4 及以前的旧目录名，兼容升级
    || fs.existsSync(path.join(PROJECT_ROOT, 'doc', '项目档案.md'))
    || fs.existsSync(path.join(PROJECT_ROOT, 'docs', 'profile.md'));
}

function installSkills(targetDir) {
  const src = path.join(PKG_ROOT, 'skills');
  const dest = path.join(PROJECT_ROOT, targetDir);
  fs.mkdirSync(dest, { recursive: true });

  const files = [];
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    for (const f of walkFiles(to, to)) {
      files.push({ file: path.join(name, f.file), hash: f.hash });
    }
  }

  const marker = {
    source: `git+https://github.com/knight-peter/doc-framework.git`,
    version: `v${VERSION}`,
    installedAt: new Date().toISOString().slice(0, 10),
    files,
  };
  fs.writeFileSync(path.join(dest, MARKER_FILE), JSON.stringify(marker, null, 2), 'utf-8');
  return dest;
}

function installOnboarding() {
  // 0. 预置 doc-framework 目录骨架（防初始化遗漏；内容由 AI 按接入指南+模板渲染）
  const docRoot = path.join(PROJECT_ROOT, 'doc-framework');
  for (const sub of ['模块', '边界', '规范', '计划']) {
    fs.mkdirSync(path.join(docRoot, sub), { recursive: true });
  }
  // 引导 README：说明目录用途与初始化要求（初始化完成后由 AI 删除）
  const guideReadme = `# doc-framework（待初始化）

本目录为 doc-framework 文档体系骨架，由安装脚本预置。

请对 AI 说"初始化项目"，AI 将按项目根《接入指南.md》执行接入初始化：
从 \`node_modules/doc-framework/templates/\` 渲染生成 项目档案.md / 总契约.md / 测试规范.md / 接口规范.md / 规范/前后端开发规范.md 等骨架文档。

初始化完成后：本 README 与 接入指南.md 一并删除。
`;
  fs.writeFileSync(path.join(docRoot, 'README.md'), guideReadme, 'utf-8');

  // 接入指南.md（从模板渲染默认中文模式）
  const tpl = fs.readFileSync(path.join(PKG_ROOT, 'templates', '接入指南.md.tpl'), 'utf-8');
  fs.writeFileSync(path.join(PROJECT_ROOT, '接入指南.md'), tpl, 'utf-8');

  // AGENTS.md：引导段 + 永久段
  const agentsTpl = fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md.tpl'), 'utf-8');
  const rendered = agentsTpl
    .replace(/\{文档根\}/g, 'doc-framework')
    .replace(/\{文档语言\}/g, '中文');
  const agentsPath = path.join(PROJECT_ROOT, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf-8');
    if (!content.includes('CONTRACT-FRAMEWORK-BEGIN')) {
      fs.writeFileSync(agentsPath, content.replace(/\s*$/, '\n\n') + rendered, 'utf-8');
    }
  } else {
    fs.writeFileSync(agentsPath, rendered, 'utf-8');
  }
}

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

if (require.main === module) {
  runInstall();
}

module.exports = { PKG_ROOT, PROJECT_ROOT, VERSION, resolveTargetDirs, isInitialized, MARKER_FILE, walkFiles };
