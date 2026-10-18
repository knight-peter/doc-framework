'use strict';
/** template 命令：打印官方模板（stdout）——v3 单安装方式下，未作为依赖安装也能取到模板。 */
const fs = require('fs');
const path = require('path');
const env = require('../lib/env');
const { parseArgs } = require('../lib/util');

function walk(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out.sort();
}

/**
 * `doc-framework template --list [--json]`
 * `doc-framework template <相对路径>`
 * 名称可带/不带 `.tpl`；也接受 basename（唯一匹配时）。
 * @returns {number} 0 = 输出；1 = 用法 / 模板不存在
 */
function template(argv = []) {
  const { flags, positionals, missingValue, unknownFlags } = parseArgs(argv, [], ['--list', '--json']);
  if (unknownFlags.length || missingValue.length) {
    console.log('用法：doc-framework template --list [--json] | doc-framework template <模板相对路径>');
    return 1;
  }
  const tdir = path.join(env.PKG_ROOT, 'templates');
  const files = walk(tdir);
  if (flags['--list'] || !positionals.length) {
    if (flags['--json']) console.log(JSON.stringify({ templates: files }, null, 2));
    else for (const f of files) console.log(f);
    return 0;
  }
  const raw = String(positionals[0]).replace(/^templates\//, '');
  const names = new Set([raw, `${raw}.tpl`, `${raw}.md.tpl`]);
  let hit = files.find(f => names.has(f));
  if (!hit) {
    const same = files.filter(f => names.has(path.basename(f)));
    if (same.length === 1) hit = same[0];
    else if (same.length > 1) {
      console.log(`❌ 模板名不唯一：${raw}（${same.join('、')}）；请给相对路径`);
      return 1;
    }
  }
  if (!hit) {
    console.log(`❌ 模板不存在：${raw}（用 doc-framework template --list 查看）`);
    return 1;
  }
  console.log(fs.readFileSync(path.join(tdir, hit), 'utf-8').replace(/\n$/, ''));
  return 0;
}

module.exports = { template };
