'use strict';
/**
 * 解析器单元测试（node:test）——与 bash selftest 的分工：
 *   - 这里测**纯函数边界**（表头列序、枚举、文件头截断、CJK 边界、嵌套计划识别）；
 *   - scripts/selftest/ 继续做端到端（真实 cli.js / 临时项目 / git）。
 * 不引入测试框架之外的依赖。
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plan = require('../scripts/lib/plan');
const rules = require('../scripts/checks/rules');

const TMP = [];
function tempRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'df-parser-'));
  TMP.push(d);
  return d;
}
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

test('normalizeStance：只认精确枚举，否定写法不授权', () => {
  assert.equal(plan.normalizeStance('改动'), 'change');
  assert.equal(plan.normalizeStance('改动（仅文案）'), 'change');
  assert.equal(plan.normalizeStance('本次不改'), 'skip');
  assert.equal(plan.normalizeStance('本次不改动'), 'skip');
  assert.equal(plan.normalizeStance('不适用'), 'skip');
  assert.equal(plan.normalizeStance('无需改动'), 'unknown');
  assert.equal(plan.normalizeStance('不改'), 'unknown');
  assert.equal(plan.normalizeStance('待定'), 'unknown');
  assert.equal(plan.normalizeStance(''), 'unknown');
});

test('parseStances：按表头列定位，列序变化不改变语义', () => {
  const content = [
    '## 2. 逐应用表态',
    '',
    '| 应用 | 说明 | 表态 |',
    '|------|------|------|',
    '| app-web | 无端侧改动 | 本次不改 |',
    '| svc-order | 服务端实现 | 改动 |',
    '| ghost | 待定 | 不需要 |',
  ].join('\n');
  const s = plan.parseStances(content);
  assert.equal(s['app-web'], 'skip');
  assert.equal(s['svc-order'], 'change');
  assert.equal(s['ghost'], 'unknown');
});

test('parseStances：旧格式（应用|表态|说明）仍可解析', () => {
  const content = [
    '## 逐应用表态',
    '| 应用 | 表态 | 说明 |',
    '|---|---|---|',
    '| app-web | 改动 | 文案 |',
    '| svc-order | 本次不改 | 服务端 |',
  ].join('\n');
  assert.deepEqual(plan.parseStances(content), { 'app-web': 'change', 'svc-order': 'skip' });
});

test('parseDelta：三表 + 合并状态 + 主计划列 + 双括号跳过计数', () => {
  const content = [
    '## 语义增量（delta）',
    '> 合并状态：已合并（2026-01-02）',
    '### ADDED（新增）',
    '| # | 目标位置 | 对象 | 内容 | 主计划 |',
    '|---|---|---|---|---|',
    '| A1 | 契约 §3.1 主表 | 字段 x | int | |',
    '| A2 | 契约 §4.2 | 未渲染 | {{x}} | |',
    '### MODIFIED（修改）',
    '| # | 目标位置 | 对象 | 现值 | 目标值 | 主计划 |',
    '|---|---|---|---|---|---|',
    '| M1 | 契约 §4.2 | 接口 | 旧 | 新 | 2025-01-01-主计划 |',
    '### REMOVED（删除）',
    '| # | 目标位置 | 对象 | 理由 | 主计划 |',
    '|---|---|---|---|---|',
    '| R1 | 契约 §5 | 落点 | 不再需要 | |',
  ].join('\n');
  const d = plan.parseDelta(content);
  assert.equal(d.hasSection, true);
  assert.equal(d.mergeState, '已合并');
  assert.equal(d.total, 3);
  assert.equal(d.skipped, 1);
  assert.equal(d.added[0].target, '契约 §3.1 主表');
  assert.equal(d.modified[0].detail, '旧 → 新');
  assert.equal(d.modified[0].leadPlan, '2025-01-01-主计划');
  assert.equal(d.removed[0].detail, '不再需要');
});

test('parseChecklist：勾选行计入进度，登记行不计入，围栏里的登记行跳过', () => {
  const content = [
    '## 4. 任务清单',
    '- [x] 1.1 已完成',
    '- [ ] 2.1 未完成',
    '- 5.2 【人工·生产】重新部署',
    '```text',
    '- 9.9 【人工·生产】围栏里的示例',
    '```',
    '- [ ] 6.1 【人工·生产】矛盾写法',
  ].join('\n');
  const t = plan.parseChecklist(content);
  assert.equal(t.total, 3);
  assert.equal(t.done, 1);
  assert.deepEqual(t.open, ['2.1', '6.1']);
  assert.equal(t.humanRows.length, 1);
  assert.equal(t.humanRows[0].id, '5.2');
  assert.deepEqual(t.misplacedHuman, ['6.1']);
});

test('parseContractScope：§5 应用与文件位置（应用根相对 / 仓库根相对）', () => {
  const root = tempRoot();
  const docRoot = path.join(root, 'doc-framework');
  write(path.join(docRoot, '模块/订单/契约.md'), [
    '# 订单契约',
    '## 5. 应用落点',
    '| 应用 | 页面结构 | 文件位置 | 说明 |',
    '|---|---|---|---|',
    '| svc-order（主责） | — | `services/order/src/A.java` | 真相 |',
    '| app-web | 列表页 | `views/order/List.vue` | 端 |',
  ].join('\n'));
  const s = plan.parseContractScope(docRoot, '订单');
  assert.ok(s);
  assert.deepEqual(s.apps, ['svc-order', 'app-web']);
  // line = §5 节内 1-based 行号（map 输出用）：header=1、sep=2、首行数据=3
  assert.deepEqual(s.pairs, [
    { app: 'svc-order', path: 'services/order/src/A.java', line: 3 },
    { app: 'app-web', path: 'views/order/List.vue', line: 4 },
  ]);
  assert.deepEqual(s.paths, ['services/order/src/A.java', 'views/order/List.vue']);
});

test('findPlaceholders：CJK 边界 U+9FA6 / U+9FFF 都要报，围栏/行内不算', () => {
  const text = [
    '正文 {中文} 与 {pure}',
    '行内 `{行内}`',
    '```text',
    '{围栏}',
    '```',
    '边界 {龦} 与 {鿿}',
  ].join('\n');
  const hits = plan.findPlaceholders(text);
  assert.ok(hits.includes('{中文}'));
  assert.ok(hits.includes('{龦}'));
  assert.ok(hits.includes('{鿿}'));
  assert.ok(!hits.includes('{pure}'));
  assert.ok(!hits.includes('{行内}'));
  assert.ok(!hits.includes('{围栏}'));
});

test('parsePlan：状态/形态只读文件头，hasShapeLine 区分没写与写了认不出', () => {
  const root = tempRoot();
  const planPath = path.join(root, 'doc-framework/模块/订单/计划/2025-01-01-头部.md');
  write(planPath, [
    '# 2025-01-01 头部',
    '> 依据模块契约：`doc-framework/模块/订单/契约.md`',
    '> 状态：已批准',
    '> 计划形态：完整',
    '',
    '## 1. 需求与思路',
    '状态：已完成',
    '计划形态：轻量',
    '## 语义增量（delta）',
    '> 合并状态：待合并',
    '## 变更文件清单',
    '| 文件 | 说明 |',
    '|---|---|',
    '| services/order/src/A.java | x |',
  ].join('\n'));
  const p = plan.parsePlan(root, planPath);
  assert.equal(p.state, '已批准');
  assert.equal(p.shape, 'full');
  assert.equal(p.hasShapeLine, true);
});

test('parsePlan：无头部状态/形态时正文不生效（hasShapeLine=false）', () => {
  const root = tempRoot();
  const planPath = path.join(root, 'doc-framework/模块/订单/计划/2025-01-02-正文.md');
  write(planPath, [
    '# 2025-01-02 正文',
    '> 依据模块契约：`doc-framework/模块/订单/契约.md`',
    '## 1. 需求与思路',
    '状态：已完成',
    '计划形态：轻量',
    '## 变更文件清单',
    '| 文件 | 说明 |',
    '|---|---|',
    '| services/order/src/A.java | x |',
  ].join('\n'));
  const p = plan.parsePlan(root, planPath);
  assert.equal(p.state, null);
  assert.equal(p.shape, null);
  assert.equal(p.hasShapeLine, false);
});

test('isPlanLike / collectPlanPaths：嵌套非日期计划纳入，随手笔记跳过', () => {
  const root = tempRoot();
  const docRoot = path.join(root, 'doc-framework');
  const dir = path.join(docRoot, '模块/订单/计划/杂项');
  write(path.join(dir, '未合并报告.md'), '> 状态：已完成\n## 语义增量\n> 合并状态：待合并\n');
  write(path.join(dir, '随手笔记.md'), '# 讨论\n今天聊导出。\n');
  assert.equal(plan.isPlanLike('> 状态：已批准\n'), true);
  assert.equal(plan.isPlanLike('## 任务清单\n'), true);
  assert.equal(plan.isPlanLike('# 讨论\n今天聊导出。\n'), false);
  const paths = plan.collectPlanPaths(docRoot).map(p => path.relative(root, p));
  assert.ok(paths.some(p => p.includes('未合并报告.md')));
  assert.ok(!paths.some(p => p.includes('随手笔记.md')));
});

test('parsePlan：变更文件清单的单个文件名含「应用」不被误判成表头', () => {
  const root = tempRoot();
  const planPath = path.join(root, 'doc-framework/模块/订单/计划/2025-01-03-单文件.md');
  write(planPath, [
    '# 2025-01-03 单文件',
    '> 依据模块契约：`doc-framework/模块/订单/契约.md`',
    '> 状态：已批准',
    '> 计划形态：完整',
    '## 1. 需求与思路',
    '## 变更文件清单',
    '| 文件 | 说明 |',
    '|---|---|',
    '| 应用配置.json | 单文件改动 |',
    '| 文件A.java | 另一个含「文件」的文件名 |',
  ].join('\n'));
  const p = plan.parsePlan(root, planPath);
  assert.ok(p.fileList.has('应用配置.json'));
  assert.ok(p.fileList.has('文件A.java'));
});

test('rules：旧格式/归档的规则优先级与级别前缀', () => {
  assert.equal(rules.ruleFor('plan-health', 'ℹ️ 旧格式计划（无「计划形态」行）缺「依据模块契约」').id, 'DF-PLAN-031');
  assert.equal(rules.ruleFor('plan-health', '❌ 归档计划「已完成」但语义增量未合并').id, 'DF-PLAN-030');
  assert.equal(rules.ruleFor('plan-health', '❌ 计划「已完成」但语义增量未合并').id, 'DF-PLAN-016');
  assert.equal(rules.ruleFor('standards', 'ℹ️ 应用规范 x 有 12 个 ### 小节（>8）').id, 'DF-STD-003');
  assert.equal(rules.levelOf('❌ 正文提到 ⚠️ 但仍是错误'), 'error');
  assert.equal(rules.levelOf('ℹ️ 提示'), 'note');
  assert.equal(rules.levelOf('⚠️ 警告'), 'warn');
});

test('parseModuleIndex：表头定位 / 不建档与子域 / 未渲染占位行跳过', () => {
  const root = tempRoot();
  const docRoot = path.join(root, 'doc-framework');
  write(path.join(docRoot, '总契约.md'), [
    '# 总契约',
    '',
    '## 4. 模块索引表（含依赖关系）',
    '',
    '| 模块名 | 业务域 | 模块文件夹 | 主责服务 | 各应用落点 | 模块形态 | 标杆参考 | 依赖的下游模块/数据 | 能力依赖 |',
    '|---|---|---|---|---|---|---|---|---|',
    '| 订单 | order | `doc-framework/模块/订单/` | svc-order | app-web: apps/web | 简单 CRUD | — | 库存、退货（主数据） | — |',
    '| 库存 | stock | —（不建档） | svc-order | — | 简单 CRUD | — | — | — |',
    '| 明细 | detail | `doc-framework/模块/订单/（子域）` | svc-order | — | 简单 CRUD | — | — | — |',
    '| {{模块名}} | {{业务域}} | `{文档根}/模块/{{模块名}}/` | {{主责服务}} | {{各应用落点}} | {{模块形态}} | {{标杆参考}} | {{依赖}} | {{能力依赖}} |',
    '',
  ].join('\n'));
  const idx = plan.parseModuleIndex(docRoot);
  assert.equal(idx.degraded, false);
  assert.equal(idx.rows.length, 3);
  assert.deepEqual(idx.rows.map(r => r.folderKind), ['module', 'no-contract', 'subdomain']);
  assert.equal(idx.rows[0].dirName, '订单');
  assert.deepEqual(idx.rows[0].deps, ['库存', '退货']);
  assert.deepEqual(idx.rows[0].primary, ['svc-order']);
  assert.deepEqual(idx.rows[0].apps, ['app-web']);
  assert.equal(idx.rows[2].dirName, '订单', '子域行的契约归宿主模块');
});

test('parseModuleIndex：总契约缺失 → null；§4 节名不符 → degraded', () => {
  const root = tempRoot();
  const docRoot = path.join(root, 'doc-framework');
  assert.equal(plan.parseModuleIndex(docRoot), null);
  write(path.join(docRoot, '总契约.md'), '# 总契约\n\n## 4. 模块清单\n\n| 模块名 | 业务域 |\n|---|---|\n| 订单 | order |\n');
  const idx = plan.parseModuleIndex(docRoot);
  assert.equal(idx.degraded, true);
  assert.deepEqual(idx.rows, []);
});

test('parseModuleGraph：节点/边按标签归一，subgraph 行不产出节点，0 边降级', () => {
  const root = tempRoot();
  const docRoot = path.join(root, 'doc-framework');
  write(path.join(docRoot, '总契约.md'), [
    '# 总契约',
    '',
    '## 5. 模块依赖全景图（由 §4 渲染）',
    '',
    '```mermaid',
    'flowchart LR',
    '    subgraph D1["order"]',
    '        A["订单"] -->|"扣减"| B["库存"]',
    '    end',
    '```',
    '',
  ].join('\n'));
  const g = plan.parseModuleGraph(docRoot);
  assert.equal(g.degraded, false);
  assert.deepEqual(g.nodes.map(n => n.label), ['订单', '库存']);
  assert.deepEqual(g.edges, [{ from: '订单', to: '库存' }]);

  write(path.join(docRoot, '总契约.md'), '# 总契约\n\n## 5. 模块依赖全景图\n\n（暂无图）\n');
  const empty = plan.parseModuleGraph(docRoot);
  assert.equal(empty.degraded, true);
});

test('rules：DF-L0-001..005 规则码与级别', () => {
  assert.equal(rules.ruleFor('l0-index', '❌ 模块有契约但总契约 §4 未登记（模块将不可路由）：退货（共 1 个）').id, 'DF-L0-001');
  assert.equal(rules.ruleFor('l0-index', '⚠️ 总契约 §4 登记了模块但契约不存在：库存').id, 'DF-L0-002');
  assert.equal(rules.ruleFor('l0-index', 'ℹ️ 总契约 §5 全景图缺 1 条 §4 依赖边：订单→退货').id, 'DF-L0-003');
  assert.equal(rules.ruleFor('l0-index', 'ℹ️ 总契约 §4「主责服务」未在档案应用清单登记：库存 → ghost-svc').id, 'DF-L0-004');
  assert.equal(rules.ruleFor('l0-index', 'ℹ️ 总契约 §4「模块索引表」解析为空').id, 'DF-L0-005');
});
