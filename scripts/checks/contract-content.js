'use strict';
/** check 阶段 2.6：契约内容健康（所有权/§7/SC/历史/能力索引）。
 *  设计：存量格式默认 ℹ️（迁移提示），v4 契约（docstruct 3.1.1+ / 4.x 或已有所有权声明）默认 ❌/⚠️。
 *  只读；不修改任何文档。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');
const contract = require('../lib/contract');

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

function boundaryFiles(docRoot) {
  const dir = path.join(docRoot, plan.NAMES.zh.dirs.boundaries);
  if (!fs.existsSync(dir)) return [];
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return []; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
}

/** 总契约 §7 能力契约索引：返回 {rows, files, missingRows, missingFiles} */
function capabilityIndex(docRoot) {
  const totalPath = path.join(docRoot, plan.NAMES.zh.rootContract);
  const text = readText(totalPath);
  if (!text) return null;
  const sections = contract.splitSections(text);
  const s7 = contract.findSection(sections, 7);
  const files = boundaryFiles(docRoot);
  if (!s7) return { present: false, files, rows: [], missingRows: files, missingFiles: [] };
  const rows = contract.tableRows(s7.text).filter(c => c.length >= 2 && /\.md/.test(c[1] || ''));
  const rowFiles = rows.map(c => String(c[1]).replace(/`/g, '').split('/').pop());
  const missingRows = files.filter(f => !rowFiles.includes(f));
  const missingFiles = rowFiles.filter(f => !files.includes(f));
  return { present: true, files, rows, missingRows, missingFiles };
}

function stageContractContent(ctx, registry) {
  const { docRoot, docLabel, strict } = ctx;
  const issues = [];
  const notes = [];
  const report = (msg, hard) => {
    if (hard) issues.push(`❌ ${msg}`);
    else if (strict) issues.push(`⚠️ ${msg}`);
    else notes.push(`ℹ️ ${msg}`);
  };

  const modules = listModules(docRoot);
  for (const mod of modules) {
    const file = path.join(docRoot, plan.NAMES.zh.dirs.modules, mod, plan.NAMES.zh.moduleContract);
    const text = readText(file);
    if (text === null) continue;
    const rel = path.relative(path.dirname(docRoot), file);
    const a = contract.analyzeContract(text, { docRoot, moduleName: mod });
    const hard = a.v4;

    if (a.legacy) {
      report(`契约章节结构不是 10 章（旧结构/缺章）：${rel}——先对齐模板再迁 §7/§8`, hard);
    }

    if (a.ownership.present) {
      for (const d of a.ownership.delegates) {
        if (d.exists === false) report(`契约「委托给」指向的文件不存在：${rel} → ${d.rel}`, hard);
      }
    } else {
      report(`契约头部缺「本契约拥有 / 委托给 / 本契约不拥有」所有权声明：${rel}`, hard);
    }

    if (a.historyHits.length) {
      const labels = [...new Set(a.historyHits.map(h => h.label))].join('、');
      report(`契约 §1–§8 出现历史痕迹（${labels}，共 ${a.historyHits.length} 处）：${rel}——历史归 git，留结论删来历`, hard);
    }

    if (a.inv.invariants.length) {
      const ids = a.inv.invariants.map(x => x.id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dup.length) report(`契约 §7 ID 重复：${rel} → ${[...new Set(dup)].join('、')}`, true);
      for (const id of ids) {
        const m = id.match(/^INV-(.+?)-\d{2}$/);
        if (!m || m[1] !== mod) report(`契约 §7 ID 不是「INV-${mod}-NN」：${rel} → ${id}`, hard);
      }
    } else if (hard) {
      report(`v4 契约 §7 缺 INV 表：${rel}`, true);
    }

    if (a.inv.traps.length) {
      if (a.schema2) {
        report(`新契约出现 TRAP-*（§7.2 已退场）：${rel} → ${a.inv.traps.map(x => x.id).join('、')}——转 INV 或移应用规范/代码`, true);
      } else {
        notes.push(`ℹ️ 存量契约含 TRAP-*（迁移期兼容）：${rel} → ${a.inv.traps.length} 条，按 D9 转 INV/移出`);
      }
    }
    if (a.inv.invariants.length > 20) report(`契约 §7 不变量 ${a.inv.invariants.length} 条 >20：${rel}——上移能力契约/应用规范或删历史`, false);
    if (a.inv.maxItemBytes > 800) report(`契约 §7 单条 ${a.inv.maxItemBytes}B >800：${rel}——在写机制/历史，不是在写规则`, false);
    if (a.s7Bytes > 15 * 1024) report(`契约 §7 ${(a.s7Bytes / 1024).toFixed(1)}KB >15KB：${rel}——先分类/上移/压缩`, false);
    if (a.totalBytes > 50 * 1024) report(`契约总量 ${(a.totalBytes / 1024).toFixed(1)}KB >50KB：${rel}`, false);

    if (a.sc.empty) {
      if (hard) report(`v4 契约 §8.2 无 SC 索引表/正文：${rel}`, true);
    } else {
      if (a.sc.missingTable) report(`契约 §8.2 有 SC 正文但无索引表：${rel}（${a.scBodies} 个正文）`, hard);
      if (a.scMismatch) report(`契约 §8.2 索引表/正文数量不一致：${rel}（表 ${a.scTable} / 正文 ${a.scBodies}）`, hard);
      if (a.scDup) report(`契约 §8.2 ID 重复：${rel}`, true);
      if (hard) {
        for (const id of a.sc.bodyIds) {
          if (!new RegExp(`^SC-${mod}-\\d{2}$`).test(id)) report(`契约 §8.2 正文 ID 不是「SC-${mod}-NN」：${rel} → ${id}`, true);
        }
      }
    }

    const refs = (text.match(/§7-\d+/g) || []).length;
    if (refs > 0) report(`契约含 ${refs} 处脆弱引用「§7-n」：${rel}——改用 INV ID`, false);

    // §5 单元格体量（只对表格行做粗略检查）
    if (a.s5) {
      let maxCell = 0;
      for (const line of a.s5.text.split('\n')) {
        if (!line.trim().startsWith('|') || /^\|[\s:|-]+\|?\s*$/.test(line.trim())) continue;
        for (const c of line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')) maxCell = Math.max(maxCell, Buffer.byteLength(c.trim(), 'utf8'));
      }
      if (maxCell > 2 * 1024) report(`契约 §5 单元格 ${maxCell}B >2KB：${rel}——差异说明只留 ≤2 句 + 回链`, false);
    }

    if (a.isPlatform) {
      const s1 = contract.findSection(a.sections, 1);
      const hasConsumer = s1 && /消费者|消费方/.test(s1.text) && /\|/.test(s1.text);
      const hasFailure = /失败模式|401|403/.test(a.sections.map(s => s.text).join('\n'));
      if (!hasConsumer) report(`平台能力契约缺消费者表：${rel}`, hard);
      if (!hasFailure) report(`平台能力契约缺失败模式（401/403/超时/降级）：${rel}`, hard);
    }
  }

  const idx = capabilityIndex(docRoot);
  if (idx) {
    if (!idx.present) {
      if (idx.files.length) report(`总契约缺「§7 能力契约索引」，但已有 ${idx.files.length} 份边界文档：${docLabel}/总契约.md`, false);
    } else {
      if (idx.missingRows.length) report(`能力契约索引漏登记：${idx.missingRows.slice(0, 5).join('、')}${idx.missingRows.length > 5 ? ' 等' : ''}`, false);
      if (idx.missingFiles.length) report(`能力契约索引指向不存在的文件：${idx.missingFiles.slice(0, 5).join('、')}`, true);
    }
  }

  return { issues, notes };
}

module.exports = { stageContractContent };
