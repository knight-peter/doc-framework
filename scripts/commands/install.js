'use strict';
/** install 命令（首次安装 / 强制刷新；安装动作在 lib/install-actions.js）。 */
const { parseArgs } = require('../lib/util');
const env = require('../lib/env');
const actions = require('../lib/install-actions');

/**
 * `doc-framework install [--root <项目根>] [--json]`
 *
 * 唯一的安装入口（v3 起不再发布 install.sh、也不依赖 postinstall）：
 *   - 项目有没有 package.json 都可：`npx doc-framework install`；
 *   - 已初始化项目只更新 skill，不覆盖文档与 AGENTS.md 永久段；
 *   - 未初始化项目预置 doc-framework/ 骨架 + 接入指南 + AGENTS 引导段。
 *
 * @returns {number} 0 = 成功；1 = 用法错误
 */
function install(argv = []) {
  const { flags, missingValue, unknownFlags } = parseArgs(argv, ['--root'], ['--json']);
  if (unknownFlags.length) {
    console.log(`❌ 未识别选项：${unknownFlags.join(', ')}（用法：doc-framework install [--root <项目根>] [--json]）`);
    return 1;
  }
  if (missingValue.length) {
    console.log(`❌ 选项缺少取值：${missingValue.join(', ')}（用法：doc-framework install [--root <项目根>] [--json]）`);
    return 1;
  }
  const root = env.resolveRoot(flags['--root']);
  const logs = [];
  const result = actions.install(root, { onLog: msg => logs.push(msg) });
  if (flags['--json']) {
    console.log(JSON.stringify({ ...result, logs }, null, 2));
    return 0;
  }
  for (const msg of logs) console.log(`[doc-framework] ${msg}`);
  return 0;
}

module.exports = { install };
