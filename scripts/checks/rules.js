'use strict';
/**
 * `check` 的规则目录（**规则码 / 分级 / 摘要的单一来源**）。
 *
 * 为什么需要它：
 *   - 设计文档 §6.3 的规则表与 `checks/*` 的 push 是两份手工维护的表示，历史上已漂移
 *     （「缺语义增量」文档写 ℹ️、代码 ❌）；`check --rules` 现在从这份目录输出，文档只保留
 *     “分组说明 + 回链”，不再假装自己是运行时权威；
 *   - `check --json` 给 CI / AI 稳定规则码（`DF-<区域>-NNN`），不要求消费方匹配中文长句。
 *
 * 匹配方式是**后置归类**：阶段函数仍返回中文消息（输出文案不变），auditPlan 汇总时按
 * `stage + message` 匹配到规则。匹配不到的消息落到 `DF-<区域>-999`（未分类），不会丢失；
 * 新增规则时在对应阶段加一条 pattern 即可。
 *
 * 级别说明：这里的 `level` 是**默认级别**；实际级别以消息前缀为准（`⚠️` → warn，`ℹ️` → note，
 * 其余 → error），因为 `--strict` 会把部分 note 提升为 warn。
 */
const STAGE_CODES = {
  pre: 'PRE',
  skeleton: 'SKEL',
  registry: 'REG',
  'contract-health': 'CONTRACT',
  standards: 'STD',
  'plan-health': 'PLAN',
  'doc-sync': 'DOC',
  placeholders: 'PH',
  onboarding: 'ONB',
  unreadable: 'IO',
};

const RULES = [
  // 0. 前置（文档根缺失；check --json 的 pre 阶段）
  { id: 'DF-PRE-001', stage: 'pre', level: 'error', summary: '未找到文档根', re: /未找到文档根/ },

  // 1. 骨架 + 哨兵
  { id: 'DF-SKEL-001', stage: 'skeleton', level: 'error', summary: '缺少必需文件', re: /缺少文件/ },
  { id: 'DF-SKEL-002', stage: 'skeleton', level: 'error', summary: '缺少必需目录', re: /缺少目录/ },
  { id: 'DF-SKEL-003', stage: 'skeleton', level: 'warn', summary: '文档结构版本落后于框架', re: /文档结构版本落后/ },
  { id: 'DF-SKEL-004', stage: 'skeleton', level: 'note', summary: '未标记文档结构版本', re: /未标记「文档结构版本」/ },

  // 2. 应用清单 / 规范
  { id: 'DF-REG-001', stage: 'registry', level: 'error', summary: '缺少类型层规范', re: /缺少规范文档/ },
  { id: 'DF-REG-002', stage: 'registry', level: 'error', summary: '应用缺少规范文件', re: /缺少规范文件/ },
  { id: 'DF-REG-003', stage: 'registry', level: 'error', summary: '应用代码根不存在', re: /代码根不存在/ },
  { id: 'DF-REG-004', stage: 'registry', level: 'error', summary: '应用代码根重复登记', re: /应用代码根重复登记/ },
  { id: 'DF-REG-005', stage: 'registry', level: 'error', summary: '应用代码根互相嵌套', re: /应用代码根互相嵌套/ },
  { id: 'DF-REG-006', stage: 'registry', level: 'error', summary: '档案缺应用清单', re: /档案缺「应用清单」/ },

  // 2.4 契约健康（§5 落点）
  { id: 'DF-CONTRACT-001', stage: 'contract-health', level: 'note', summary: '§5 落点路径不存在', re: /落点路径不存在/ },
  { id: 'DF-CONTRACT-002', stage: 'contract-health', level: 'note', summary: '§5 落点不在应用代码根内', re: /落点路径不在应用代码根内/ },
  { id: 'DF-CONTRACT-003', stage: 'contract-health', level: 'note', summary: '§5 落点应用未登记', re: /落点应用未在档案应用清单登记/ },
  { id: 'DF-CONTRACT-004', stage: 'contract-health', level: 'note', summary: '§5 应用落点为空', re: /应用落点」为空/ },
  { id: 'DF-CONTRACT-005', stage: 'contract-health', level: 'note', summary: '§5 有路径但无应用列', re: /没有应用列/ },
  { id: 'DF-CONTRACT-006', stage: 'contract-health', level: 'note', summary: '缺应用清单，§5 核对跳过', re: /档案无「应用清单」，契约 §5 落点核对跳过/ },

  // 2.5 规范层归属
  { id: 'DF-STD-001', stage: 'standards', level: 'note', summary: '规范层疑似变更痕迹', re: /规范层疑似变更痕迹/ },
  { id: 'DF-STD-002', stage: 'standards', level: 'note', summary: '疑似跨应用共享主题', re: /跨应用共享主题|跨应用共享主题分册/ },
  { id: 'DF-STD-003', stage: 'standards', level: 'note', summary: '应用规范单节/小节越界', re: /个 ### 小节|已 \d+ 行（>/ },
  { id: 'DF-STD-004', stage: 'standards', level: 'note', summary: '主题索引与分册不一致', re: /主题索引|分册/ },
  { id: 'DF-STD-005', stage: 'standards', level: 'note', summary: '主题分册未被索引/应用规范缺失', re: /主题分册未被.*索引|应用规范缺失\/不可读/ },

  // 3. 计划体检
  { id: 'DF-PLAN-001', stage: 'plan-health', level: 'error', summary: '计划无法解析', re: /计划无法解析/ },
  { id: 'DF-PLAN-002', stage: 'plan-health', level: 'error', summary: '计划缺状态字段', re: /计划缺状态字段/ },
  { id: 'DF-PLAN-003', stage: 'plan-health', level: 'error', summary: '计划形态值无法识别', re: /计划形态值无法识别/ },
  { id: 'DF-PLAN-031', stage: 'plan-health', level: 'note', summary: '旧格式计划迁移提示', re: /旧格式计划/ },
  { id: 'DF-PLAN-004', stage: 'plan-health', level: 'error', summary: '轻量计划缺逐应用表态', re: /轻量计划缺「逐应用表态」/ },
  { id: 'DF-PLAN-005', stage: 'plan-health', level: 'error', summary: '轻量计划缺变更文件清单', re: /轻量计划缺「变更文件清单」/ },
  { id: 'DF-PLAN-006', stage: 'plan-health', level: 'error', summary: '轻量计划含非空语义增量', re: /轻量计划不得含非空/ },
  { id: 'DF-PLAN-007', stage: 'plan-health', level: 'error', summary: '首次建模必须是完整形态', re: /首次建模计划必须是「完整」/ },
  { id: 'DF-PLAN-008', stage: 'plan-health', level: 'error', summary: '首次建模缺语义增量节', re: /首次建模计划缺「语义增量」/ },
  { id: 'DF-PLAN-009', stage: 'plan-health', level: 'error', summary: '首次建模缺建模补充节', re: /首次建模计划缺「建模补充」/ },
  { id: 'DF-PLAN-010', stage: 'plan-health', level: 'error', summary: '首次建模但契约已存在', re: /首次建模计划但该模块契约已存在/ },
  { id: 'DF-PLAN-011', stage: 'plan-health', level: 'error', summary: '首次建模但清单文件已全部存在', re: /首次建模计划但「变更文件清单」中的文件已全部存在/ },
  { id: 'DF-PLAN-012', stage: 'plan-health', level: 'error', summary: '缺依据探索记录', re: /缺「依据探索记录」/ },
  { id: 'DF-PLAN-013', stage: 'plan-health', level: 'error', summary: '依据探索记录路径不存在', re: /「依据探索记录」路径不存在/ },
  { id: 'DF-PLAN-014', stage: 'plan-health', level: 'error', summary: '缺依据模块契约', re: /缺「依据模块契约」/ },
  { id: 'DF-PLAN-015', stage: 'plan-health', level: 'error', summary: '依据模块契约指向的文件不存在', re: /「依据模块契约」指向的文件不存在/ },
  { id: 'DF-PLAN-030', stage: 'plan-health', level: 'error', summary: '归档计划增量未合并', re: /归档计划「已完成」但语义增量未合并/ },
  { id: 'DF-PLAN-016', stage: 'plan-health', level: 'error', summary: '已完成但语义增量未合并（I2）', re: /语义增量未合并/ },
  { id: 'DF-PLAN-017', stage: 'plan-health', level: 'error', summary: '待实现模块已实施但未建档', re: /待实现模块已实施但未建档/ },
  { id: 'DF-PLAN-018', stage: 'plan-health', level: 'error', summary: '标已合并但契约不存在（假合并）', re: /落账无据/ },
  { id: 'DF-PLAN-019', stage: 'plan-health', level: 'error', summary: '增量含未渲染占位符被跳过', re: /未渲染占位符「\{\{…\}\}」被跳过/ },
  { id: 'DF-PLAN-020', stage: 'plan-health', level: 'error', summary: '完整形态缺语义增量节', re: /完整形态计划缺「语义增量」/ },
  { id: 'DF-PLAN-021', stage: 'plan-health', level: 'error', summary: '缺逐应用表态表', re: /计划缺「逐应用表态」/ },
  { id: 'DF-PLAN-022', stage: 'plan-health', level: 'error', summary: '表态了未登记应用', re: /表态了未登记应用/ },
  { id: 'DF-PLAN-023', stage: 'plan-health', level: 'error', summary: '表态值无法识别', re: /表态值无法识别/ },
  { id: 'DF-PLAN-024', stage: 'plan-health', level: 'error', summary: '清单文件不在任何应用代码根下', re: /清单文件不在任何已登记应用代码根下/ },
  { id: 'DF-PLAN-025', stage: 'plan-health', level: 'error', summary: '清单文件落在本次不改的应用下', re: /清单文件落在表态/ },
  { id: 'DF-PLAN-026', stage: 'plan-health', level: 'note', summary: '清单文件所属应用未表态', re: /清单文件所属应用.*未在计划中表态/ },
  { id: 'DF-PLAN-027', stage: 'plan-health', level: 'note', summary: 'SQL 行缺执行环境', re: /SQL 行缺「执行环境」/ },
  { id: 'DF-PLAN-028', stage: 'plan-health', level: 'error', summary: '已完成但存在未勾选任务', re: /存在未勾选任务/ },
  { id: 'DF-PLAN-029', stage: 'plan-health', level: 'error', summary: '同模块多份无主增量（I3）', re: /未回指主计划/ },
  { id: 'DF-PLAN-032', stage: 'plan-health', level: 'note', summary: '人工步骤/勾选行提示', re: /人工步骤|勾选框只留给|任务已全部勾选|空增量的计划/ },
  { id: 'DF-PLAN-033', stage: 'plan-health', level: 'note', summary: '合并状态行缺失/无法识别', re: /缺「合并状态」行|合并状态」值无法识别/ },
  { id: 'DF-PLAN-034', stage: 'plan-health', level: 'note', summary: '首次建模窗口期/软判据提示', re: /实施窗口期|疑似存量模块|首次建模计划的清单文件已有/ },
  { id: 'DF-PLAN-035', stage: 'plan-health', level: 'note', summary: '缺应用清单，计划体检跳过归属校验', re: /档案无「应用清单」，计划体检跳过/ },
  { id: 'DF-PLAN-036', stage: 'plan-health', level: 'note', summary: '首次建模无探索记录（自述降级）', re: /首次建模计划无探索记录/ },

  // 3.6 文档落后
  { id: 'DF-DOC-001', stage: 'doc-sync', level: 'note', summary: '文档可能落后于代码', re: /文档可能落后于代码/ },
  { id: 'DF-DOC-002', stage: 'doc-sync', level: 'note', summary: '文档落后检查跳过', re: /文档落后检查跳过|文档有未提交改动|文档未提交|git status 调用失败|§5 无可解析的文件位置/ },
  { id: 'DF-DOC-003', stage: 'doc-sync', level: 'note', summary: '§5 落点应用未登记（路径跳过）', re: /落点应用未在档案应用清单登记/ },
  { id: 'DF-DOC-004', stage: 'doc-sync', level: 'note', summary: 'git log 调用失败，文档落后检查跳过', re: /git log 调用失败/ },

  // 4. 占位符
  { id: 'DF-PH-001', stage: 'placeholders', level: 'warn', summary: '占位符未渲染', re: /占位符未渲染/ },

  // 5. 引导清理
  { id: 'DF-ONB-001', stage: 'onboarding', level: 'warn', summary: '接入引导残留未清理', re: /未清理/ },
  { id: 'DF-ONB-002', stage: 'onboarding', level: 'note', summary: 'AGENTS.md 缺失', re: /未找到 AGENTS\.md/ },
  { id: 'DF-ONB-003', stage: 'onboarding', level: 'note', summary: 'AGENTS.md 缺永久段标记', re: /缺永久段标记/ },
  { id: 'DF-ONB-004', stage: 'onboarding', level: 'note', summary: 'AGENTS.md 永久段缺核心纪律', re: /永久段缺少核心纪律/ },

  // 读取失败
  { id: 'DF-IO-001', stage: 'unreadable', level: 'error', summary: '路径无法读取', re: /无法读取/ },
];

/** 判断消息的实际级别（消息前缀是唯一依据；--strict 的 note→warn 已在文本里体现）。 */
function levelOf(message) {
  const s = String(message || '');
  // 只看前缀：正文里引用「⚠️」「ℹ️」不足以改变级别
  if (/^\s*⚠️/.test(s)) return 'warn';
  if (/^\s*ℹ️/.test(s)) return 'note';
  return 'error';
}

/** 按 stage + 消息匹配规则；匹配不到返回未分类码（不会丢消息）。 */
function ruleFor(stage, message) {
  const hit = RULES.find(r => r.stage === stage && r.re.test(String(message || '')));
  if (hit) return hit;
  const code = STAGE_CODES[stage] || 'GEN';
  return { id: `DF-${code}-999`, stage, level: 'error', summary: '未分类问题' };
}

/** 给 `check --rules --json` 用的可序列化视图（去掉 RegExp）。 */
function describeRules() {
  return RULES.map(({ id, stage, level, summary }) => ({ id, stage, level, summary }));
}

module.exports = { RULES, STAGE_CODES, levelOf, ruleFor, describeRules };
