'use strict';
/** check 阶段 2.8：测试资产健康（4.0.0 目录化）。
 *  schema4：测试/验收.md（SC 唯一事实源）+ 测试/方案.md（索引）+ 测试/{主题}_测试.md + 测试/报告/。
 *  schema2：旧 测试.md 仍可读，只做汇总迁移提示，不硬红。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');
const contract = require('../lib/contract');
const env = require('../lib/env');

const PLAN_TITLES = {
  1: /测试目标/, 2: /适用层/, 3: /前置条件/, 4: /账号/, 5: /验收场景/, 6: /主题索引/, 7: /执行方式/, 8: /报告约定/, 9: /SQL|验证/,
};
const HISTORY_RE = /执行记录|缺陷|本轮|修复|故障签名/;

function staleSentinel(text) {
  const m = String(text || '').match(/doc-framework:docstruct\s+v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  const cur = String(env.VERSION || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const doc = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (doc[0] < cur[0] || (doc[0] === cur[0] && doc[1] < cur[1])) return m[0].replace(/^doc-framework:docstruct\s+v?/, '');
  return null;
}

function listModules(docRoot) {
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.modules);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => fs.existsSync(path.join(dir, name, plan.NAMES.zh.moduleContract)));
  } catch { return []; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
}

function relOf(docRoot, file) {
  return path.relative(path.dirname(docRoot), file);
}

function topicFiles(testDir) {
  if (!fs.existsSync(testDir)) return [];
  try {
    return fs.readdirSync(testDir).filter(f => /_测试\.md$/.test(f));
  } catch { return []; }
}

function topicIndex(planText) {
  const sections = contract.splitSections(planText);
  const s6 = contract.findSection(sections, 6);
  if (!s6) return { present: false, files: [] };
  const files = [];
  for (const cells of contract.tableRows(s6.text)) {
    const joined = cells.join(' ');
    const m = joined.match(/`?([^\s|`]+_测试\.md)`?/);
    if (m) files.push(path.basename(m[1]));
  }
  return { present: true, files };
}

function scRefs(text) {
  return [...String(text || '').matchAll(/SC-[A-Za-z0-9\u4e00-\u9fa5_-]+/g)].map(m => m[0]);
}

function headingHits(text) {
  return String(text || '').split('\n').filter(l => /^#{1,6}\s+/.test(l) && HISTORY_RE.test(l));
}

function stageTestContent(ctx, registry) {
  const { docRoot, strict } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg, hard) => {
    if (hard) issues.push(`❌ ${msg}`);
    else if (strict) issues.push(`⚠️ ${msg}`);
    else notes.push(`ℹ️ ${msg}`);
  };

  for (const mod of listModules(docRoot)) {
    const moduleDir = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod);
    const contractPath = path.join(moduleDir, plan.NAMES.zh.moduleContract);
    const contractText = readText(contractPath);
    if (contractText === null) continue;
    const a = contract.analyzeContract(contractText, { docRoot, moduleName: mod });
    const testDir = path.join(moduleDir, plan.NAMES.zh.dirs.tests);
    const acceptancePath = path.join(testDir, plan.NAMES.zh.testAcceptance);
    const planPath = path.join(testDir, plan.NAMES.zh.testPlan);
    const acceptanceText = fs.existsSync(acceptancePath) ? readText(acceptancePath) : null;
    const planText = fs.existsSync(planPath) ? readText(planPath) : null;
    const topics = topicFiles(testDir);
    let otherTestDocs = [];
    try {
      otherTestDocs = fs.readdirSync(testDir)
        .filter(f => f.endsWith('.md') && f !== plan.NAMES.zh.testAcceptance && f !== plan.NAMES.zh.testPlan && !/_测试\.md$/.test(f));
    } catch { /* no dir */ }

    if (a.schema4) {
      if (acceptanceText === null) continue;
      const acc = contract.analyzeAcceptance(acceptanceText, { moduleName: mod });
      const relAcc = relOf(docRoot, acceptancePath);
      for (const f of otherTestDocs) {
        report(`测试/${f} 不是可执行主题测试（缺少 _测试.md 后缀）：${relOf(docRoot, path.join(testDir, f))}`, true);
      }
      if (!/<!--\s*test-schema:\s*1\b/.test(acceptanceText)) report(`测试/验收.md 缺 test-schema: 1 标记：${relAcc}`, true);
      if (!/<!--\s*doc-framework:docstruct\s+v?\d+\.\d+\.\d+/.test(acceptanceText)) report(`测试/验收.md 缺 docstruct 哨兵：${relAcc}`, true);
      const accStale = staleSentinel(acceptanceText);
      if (accStale) report(`测试/验收.md 哨兵落后（${accStale}）：${relAcc}——按 v${env.VERSION} 模板对齐`, false);
      if (acc.empty) report(`测试/验收.md 缺 SC 索引/正文：${relAcc}`, true);
      if (acc.sc.missingTable) report(`测试/验收.md 有 SC 正文但无索引表：${relAcc}（${acc.scBodies} 个正文）`, true);
      if (acc.scMismatch) report(`测试/验收.md 索引表/正文数量不一致：${relAcc}（表 ${acc.scTable} / 正文 ${acc.scBodies}）`, true);
      if (acc.scSetMismatch && !acc.scMismatch) report(`测试/验收.md 索引表/正文 ID 集合不一致：${relAcc}（表 ${acc.scTable} / 正文 ${acc.scBodies}）`, true);
      if (acc.scDup) report(`测试/验收.md SC ID 重复：${relAcc}`, true);
      for (const id of [...acc.sc.tableIds, ...acc.sc.bodyIds]) {
        if (!new RegExp(`^SC-${mod}-\\d{2}$`).test(id)) report(`测试/验收.md SC ID 不是「SC-${mod}-NN」：${relAcc} → ${id}`, true);
      }
      if (acc.maxScBytes > 1024) report(`测试/验收.md 单条 SC ${acc.maxScBytes}B >1KB：${relAcc}——多分支矩阵移主题测试`, false);
      if (acc.totalBytes > 20 * 1024) report(`测试/验收.md 总量 ${(acc.totalBytes / 1024).toFixed(1)}KB >20KB：${relAcc}`, false);
      if (headingHits(acceptanceText).length) report(`测试/验收.md 出现历史/执行/缺陷类标题：${relAcc}`, true);

      const accIds = new Set([...acc.sc.tableIds, ...acc.sc.bodyIds]);
      const indexed = new Set();


      if (planText !== null) {
        const relPlan = relOf(docRoot, planPath);
        if (!/<!--\s*test-schema:\s*1\b/.test(planText)) report(`测试/方案.md 缺 test-schema: 1 标记：${relPlan}`, true);
        if (!/<!--\s*doc-framework:docstruct\s+v?\d+\.\d+\.\d+/.test(planText)) report(`测试/方案.md 缺 docstruct 哨兵：${relPlan}`, true);
        const planStale = staleSentinel(planText);
        if (planStale) report(`测试/方案.md 哨兵落后（${planStale}）：${relPlan}`, false);
        const sections = contract.splitSections(planText);
        const nums = sections.filter(s => s.num).map(s => s.num);
        for (const n of nums) {
          if (!PLAN_TITLES[n] || !PLAN_TITLES[n].test(String((sections.find(s => s.num === n) || {}).title || ''))) {
            report(`测试/方案.md 出现未知章节 §${n}：${relPlan}——只允许 §1–§9`, true);
          }
        }
        for (const n of Object.keys(PLAN_TITLES).map(Number)) {
          if (!nums.includes(n)) report(`测试/方案.md 缺 §${n}：${relPlan}`, true);
        }
        if (headingHits(planText).length) report(`测试/方案.md 出现历史/执行/缺陷类标题：${relPlan}`, true);
        if (/\*\*(?:WHEN|THEN)\*\*/.test(planText)) report(`测试/方案.md 复制了 WHEN/THEN：${relPlan}`, true);
        const idx = topicIndex(planText);
        if (!idx.present) report(`测试/方案.md 缺 §6 主题索引：${relPlan}`, true);
        for (const f of idx.files) indexed.add(f);
        for (const f of topics) {
          if (!indexed.has(f)) report(`测试/${f} 未被测试/方案.md §6 索引（孤儿）：${relPlan}`, true);
        }
        for (const f of indexed) {
          if (!topics.includes(f)) report(`测试/方案.md §6 索引了不存在的主题文件：${relPlan} → ${f}`, true);
        }
        const planBytes = Buffer.byteLength(planText, 'utf8');
        if (planBytes > 30 * 1024) report(`测试/方案.md 总量 ${(planBytes / 1024).toFixed(1)}KB >30KB：${relPlan}`, false);
        const s5 = contract.findSection(sections, 5);
        const planScIds = new Set(scRefs(s5 ? s5.text : ''));
        const missingSc = [...accIds].filter(id => !planScIds.has(id));
        if (missingSc.length) report(`测试/方案.md §5 未覆盖 ${missingSc.length} 个 SC：${relPlan} → ${missingSc.slice(0, 5).join('、')}`, true);
        const unknownSc = [...planScIds].filter(id => !accIds.has(id));
        if (unknownSc.length) report(`测试/方案.md §5 引用不存在的 SC：${relPlan} → ${unknownSc.slice(0, 5).join('、')}`, true);
        for (const old of planText.match(/SC-\d+\b/g) || []) report(`测试/方案.md 出现旧 SC 编号「${old}」：${relPlan}`, true);
        for (const old of planText.match(/§7-\d+/g) || []) report(`测试/方案.md 出现旧 §7-n 引用「${old}」：${relPlan}`, true);
      } else if (topics.length) {
        report(`存在 测试/{主题}_测试.md 但缺 测试/方案.md：${relOf(docRoot, testDir)}`, true);
      }

      for (const f of topics) {
        const p = path.join(testDir, f);
        const text = readText(p);
        const rel = relOf(docRoot, p);
        if (text === null) continue;
        if (!/<!--\s*test-schema:\s*1\b/.test(text)) report(`主题测试缺 test-schema: 1：${rel}`, true);
        if (!/<!--\s*doc-framework:docstruct\s+v?\d+\.\d+\.\d+/.test(text)) report(`主题测试缺 docstruct 哨兵：${rel}`, true);
        const topicStale = staleSentinel(text);
        if (topicStale) report(`主题测试哨兵落后（${topicStale}）：${rel}`, false);
        if (!/^##\s+1\.\s+用例/m.test(text)) report(`主题测试缺「## 1. 用例」：${rel}`, true);
        if (/\*\*(?:WHEN|THEN)\*\*/.test(text)) report(`主题测试复制了 WHEN/THEN：${rel}`, true);
        if (headingHits(text).length) report(`主题测试出现历史/执行/缺陷类标题：${rel}`, true);
        const topicBytes = Buffer.byteLength(text, 'utf8');
        if (topicBytes > 40 * 1024) report(`测试/${f} 总量 ${(topicBytes / 1024).toFixed(1)}KB >40KB：${rel}`, false);
        for (const id of scRefs(text)) {
          if (!accIds.has(id)) report(`主题测试引用不存在的 SC「${id}」：${rel}`, true);
        }
        for (const old of text.match(/SC-\d+\b/g) || []) report(`主题测试出现旧 SC 编号「${old}」：${rel}`, true);
        for (const old of text.match(/§7-\d+/g) || []) report(`主题测试出现旧 §7-n 引用「${old}」：${rel}`, true);
      }

      // 旧路径/报告
      if (fs.existsSync(path.join(moduleDir, plan.NAMES.zh.legacyTest))) {
        report(`schema4 模块仍有旧 测试.md：${relOf(docRoot, path.join(moduleDir, plan.NAMES.zh.legacyTest))}——迁 测试/`, true);
      }
      if (fs.existsSync(path.join(moduleDir, plan.NAMES.zh.legacyTestReports))) {
        report(`schema4 模块仍有旧 测试报告/：${relOf(docRoot, path.join(moduleDir, plan.NAMES.zh.legacyTestReports))}——迁 测试/报告/`, true);
      }
      if (fs.existsSync(path.join(moduleDir, plan.NAMES.zh.testScript))) {
        report(`schema4 模块根仍有 test.sh：${relOf(docRoot, path.join(moduleDir, plan.NAMES.zh.testScript))}——迁 测试/test.sh`, true);
      }
      const reportDir = path.join(testDir, plan.NAMES.zh.testReports);
      if (fs.existsSync(reportDir)) {
        let entries = [];
        try {
          if (!fs.statSync(reportDir).isDirectory()) {
            report(`测试/报告 不是目录：${relOf(docRoot, reportDir)}`, true);
          } else {
            entries = fs.readdirSync(reportDir).filter(x => x.endsWith('.md'));
          }
        } catch (e) {
          report(`测试/报告 无法读取：${relOf(docRoot, reportDir)}（${e.code || e.message}）`, true);
        }
        for (const f of entries) {
          if (!/^v\d{4}-\d{2}-\d{2}-(?:[0-9a-f]{6,}|nogit)-[^/]+\.md$/.test(f)) {
            report(`测试/报告/${f} 命名不符合 v{YYYY-MM-DD}-{短SHA|nogit}-{主题|全量}.md：${relOf(docRoot, path.join(reportDir, f))}`, false);
          }
        }
      }
      continue;
    }

    // schema2：旧 测试.md 汇总扫描，不硬红
    const legacyPath = path.join(moduleDir, plan.NAMES.zh.legacyTest);
    if (!fs.existsSync(legacyPath)) continue;
    const text = readText(legacyPath);
    if (text === null) continue;
    const rel = relOf(docRoot, legacyPath);
    const t = contract.analyzeTestDoc(text, { moduleName: mod });
    const refs = [...new Set(scRefs(text))];
    const contractIds = new Set(a.sc.bodyIds);
    const unknown = refs.filter(id => !contractIds.has(id));
    const oldIds = text.match(/SC-\d+\b/g) || [];
    const oldRefs = text.match(/§7-\d+/g) || [];
    const heads = (text.match(/^##\s+\d+\./gm) || []).length;
    const bits = [];
    if (heads > 10) bits.push(`${heads} 个一级章节`);
    if (oldIds.length) bits.push(`${oldIds.length} 处旧 SC 编号`);
    if (oldRefs.length) bits.push(`${oldRefs.length} 处旧 §7-n`);
    if (unknown.length) bits.push(`${unknown.length} 个 SC 无法在契约 §8.2 找到`);
    if (headingHits(text).length) bits.push(`${headingHits(text).length} 个历史/执行/缺陷标题`);
    if (t.totalBytes > 80 * 1024) bits.push(`总量 ${(t.totalBytes / 1024).toFixed(1)}KB`);
    report(`旧测试文档待迁移：${rel}${bits.length ? `——${bits.join('；')}；` : '——'}迁 测试/验收.md + 方案.md + _测试.md`, false);
  }
  return { issues, notes };
}

module.exports = { stageTestContent };
