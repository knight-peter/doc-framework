'use strict';
/** 项目根 / 安装器共享原语的单元测试。 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('../scripts/lib/env');
const installer = require('../scripts/lib/installer');
const sync = require('../scripts/commands/sync');

const TMP = [];
function tempRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'df-env-'));
  TMP.push(d);
  return d;
}
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}
after(() => {
  delete process.env.DOC_FRAMEWORK_ROOT;
  delete process.env.INIT_CWD;
  for (const d of TMP) fs.rmSync(d, { recursive: true, force: true });
});

test('resolveRoot：--root 优先；否则向上查找 doc-framework；否则 cwd', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'doc-framework'), { recursive: true });
  const cwd = path.join(root, 'apps/web');
  fs.mkdirSync(cwd, { recursive: true });
  assert.equal(env.resolveRoot(null, cwd), root);
  assert.equal(env.resolveRoot(root, '/tmp'), root);
  assert.equal(env.findUp(cwd, 'doc-framework'), path.join(root, 'doc-framework'));
  const empty = tempRoot();
  assert.equal(env.resolveRoot(null, empty), empty);
});

test('resolveRoot：DOC_FRAMEWORK_ROOT 生效（在向上查找之前）', () => {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'doc-framework'), { recursive: true });
  process.env.DOC_FRAMEWORK_ROOT = root;
  assert.equal(env.resolveRoot(null, os.tmpdir()), root);
  delete process.env.DOC_FRAMEWORK_ROOT;
});

test('installer.resolveTargetDirs：配置 > 探测 > 默认；空/项目根/越界配置回退', () => {
  const a = tempRoot();
  fs.mkdirSync(path.join(a, '.agents/skills'), { recursive: true });
  assert.deepEqual(installer.resolveTargetDirs(a), ['.agents/skills']);

  const b = tempRoot();
  write(path.join(b, 'doc-framework.config.json'), JSON.stringify({ targetDirs: ['custom/skills'] }));
  assert.deepEqual(installer.resolveTargetDirs(b), ['custom/skills']);

  const c = tempRoot();
  write(path.join(c, 'doc-framework.config.json'), JSON.stringify({ targetDirs: '' }));
  assert.deepEqual(installer.resolveTargetDirs(c), ['.agents/skills']);

  for (const bad of ['.', './', ' . ', '..', '../outside', '/tmp/outside']) {
    const d = tempRoot();
    write(path.join(d, 'doc-framework.config.json'), JSON.stringify({ targetDirs: bad }));
    assert.deepEqual(installer.resolveTargetDirs(d), ['.agents/skills'], `targetDirs=${bad}`);
  }

  const e = tempRoot();
  write(path.join(e, 'doc-framework.config.json'), JSON.stringify({ targetDirs: ' .agents/skills ' }));
  assert.deepEqual(installer.resolveTargetDirs(e), ['.agents/skills']);
});

test('marker 往返：files 聚合 + skills per-skill 版本', () => {
  const dir = tempRoot();
  const marker = path.join(dir, installer.MARKER_FILE);
  const files = [{ file: 'module-code/SKILL.md', hash: 'h1' }];
  const skills = { 'module-code': { version: 'v3.0.0', files: [{ file: 'SKILL.md', hash: 'h1' }] } };
  installer.writeMarker(marker, files, skills);
  const m = installer.readMarker(dir);
  assert.equal(m.version, `v${env.VERSION}`);
  assert.deepEqual(m.files, files);
  assert.equal(m.skills['module-code'].version, 'v3.0.0');
  assert.deepEqual(m.skills['module-code'].files, [{ file: 'SKILL.md', hash: 'h1' }]);
});

test('hashFile / walkFiles：逐文件 sha256 与相对路径', () => {
  const dir = tempRoot();
  write(path.join(dir, 'a.txt'), 'hello');
  const h = installer.hashFile(path.join(dir, 'a.txt'));
  assert.match(h, /^[0-9a-f]{64}$/);
  const files = installer.walkFiles(dir);
  assert.equal(files.length, 1);
  assert.equal(files[0].file, 'a.txt');
  assert.equal(files[0].hash, h);
});

test('marker 路径安全：旧 marker 的 ../ 名称/文件不得进入清理或哈希路径', () => {
  assert.equal(installer.isSafeSkillName('module-code'), true);
  assert.equal(installer.isSafeSkillName('../evil'), false);
  assert.equal(installer.isSafeSkillName('a/b'), false);
  assert.equal(installer.isSafeRelPath('module-code/SKILL.md'), true);
  assert.equal(installer.isSafeRelPath('../evil/SKILL.md'), false);
  assert.equal(installer.isSafeRelPath('module-code/../evil'), false);
  const old = sync.oldSkillsOf({
    skills: { '../evil': { files: [] }, 'module-code': { version: 'v1', files: [{ file: '../x.md', hash: 'h' }] } },
    files: [{ file: '../evil/SKILL.md', hash: 'h' }, { file: 'module-code/SKILL.md', hash: 'h' }],
  });
  assert.equal(Object.hasOwn(old, '../evil'), false);
  assert.equal(Object.hasOwn(old, 'module-code'), true);
  assert.deepEqual(old['module-code'].files, []);
});
