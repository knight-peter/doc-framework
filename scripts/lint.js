#!/usr/bin/env node
'use strict';
/**
 * 零依赖 lint / 架构守卫（`npm run lint`）。
 *
 * 为什么不用 ESLint/Prettier：本仓库长期零运行时依赖，CI 也不希望为一个守卫引入锁文件；
 * 这里只做**能机器确定**的几件事：
 *   1. 全部 JS `node --check`（语法）；
 *   2. 单安装入口守卫：install.sh / scripts/install.js 不得复活，package.json 不得有 postinstall；
 *   3. 依赖方向守卫：commands / checks / lib 不得 require 安装器（commands → checks → lib）；
 *   4. 行尾空白检查（JS / test）。
 * 语义/风格判断不在这里冒充 lint。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
let checked = 0;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

for (const file of [...walk(path.join(ROOT, 'scripts')), ...walk(path.join(ROOT, 'test'))]) {
  checked++;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failures.push(`${path.relative(ROOT, file)}: node --check 失败\n${e.stderr ? e.stderr.toString() : e.message}`);
  }
  const text = fs.readFileSync(file, 'utf-8');
  text.split('\n').forEach((line, i) => {
    if (/[ \t]+$/.test(line)) failures.push(`${path.relative(ROOT, file)}:${i + 1}: 行尾空白`);
  });
}

// 单安装入口
for (const dead of ['install.sh', 'scripts/install.js']) {
  if (fs.existsSync(path.join(ROOT, dead))) failures.push(`${dead} 不应存在（v3 单安装入口）`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
if (pkg.scripts && pkg.scripts.postinstall) failures.push('package.json 不应有 postinstall（v3 显式 install）');

// 依赖方向：commands/checks/lib 不得 require '../install' / './install'（安装动作已进 lib）
for (const dir of ['scripts/commands', 'scripts/checks', 'scripts/lib']) {
  for (const file of walk(path.join(ROOT, dir))) {
    const text = fs.readFileSync(file, 'utf-8');
    // 去注释后再查 require：注释里讲历史（`require('../install')`）不算依赖
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/require\(['"](?:\.\.\/)+install(?:\.js)?['"]\)/.test(code) || /require\(['"]\.\/install(?:\.js)?['"]\)/.test(code)) {
      failures.push(`${path.relative(ROOT, file)}: 反向依赖安装器（应使用 lib/installer / lib/install-actions）`);
    }
  }
}

if (failures.length) {
  console.error('❌ lint 失败：');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`✅ lint 通过：${checked} 个 JS（语法 + 行尾空白 + 单安装入口 + 依赖方向）`);
