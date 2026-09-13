'use strict';
/**
 * 英文产物命名表（**已隔离，不在运行时使用**）
 *
 * 背景：v2.6.0 起 doc-framework **只支持中文产物命名**——文档根固定 `doc-framework/`，
 * 目录/文件/章节/头部字段/枚举值一律中文。原因：双套命名要求每加一个特性都同时维护两套词表
 * 且在项目里没有英文模板兜底（英文项目靠 AI 现场翻译渲染），长期必然漂移、且漂移是**静默降级**
 * （解析器认不出节名 → 该校验悄悄失效，不报错）。详见 docs/设计文档.md §8.3、§9.3。
 *
 * 本文件是「将来若要有英文，就走一个**独立入口**」的素材，**不是**运行时的第二套词表：
 *   - `cli.js` / `lib/plan.js` **不得 require 本文件**（运行时只有一套命名 = NAMES.zh）；
 *   - 将来做英文入口时（例如一次性的 `doc-framework i18n --en` 转换命令，
 *     把中文文档根整体翻译成英文产物名），由那个入口消费本表，而不是让解析器重新变成双模式；
 *   - 表内容是 v2.5.1 英文模式的原样快照（行为等价），改它不影响中文模式的任何判据。
 *
 * @see scripts/lib/plan.js 的 NAMES.zh（运行时唯一词表）
 */

/** 英文产物命名（与 NAMES.zh 同键；仅供未来的英文入口使用） */
const NAMES_EN = {
  profile: 'profile.md',
  rootContract: 'contract.md',
  testingGuide: 'testing-guide.md',
  apiGuide: 'api-guide.md',
  dirs: { modules: 'modules', boundaries: 'boundaries', standards: 'standards', plans: 'plans', explore: 'explore' },
  moduleContract: 'contract.md',
  modulePlanDir: 'plans',
  archiveDir: 'archive',
  typeFrontend: 'standards/type-frontend.md',
  typeBackend: 'standards/type-backend.md',
  legacyStdFrontend: 'standards/frontend.md',
  legacyStdBackend: 'standards/backend.md',
  secRegistry: 'App registry',
  secStance: 'Per-app stance',
  secFiles: 'Changed files',
  secTasks: 'Task list',
  secWriteback: 'Writeback',
  secCompat: 'Compatibility',
  secScope: 'Application footprint',
  secChangeLog: 'Change log',
  fldState: 'Status',
  fldShape: 'Plan shape',
  fldContracts: 'Module contract',
  secDelta: 'Delta',
  secModeling: 'Modeling notes',
  fldEvidence: 'Evidence',
  fldMerge: 'Merge state',
  leadPlanCol: 'Lead plan',
  evidenceSentinel: 'none (self-described)',
  mergePending: 'pending',
  mergeMerged: 'merged',
  mergeNa: 'n/a',
  shapeLight: 'light',
  shapeFull: 'full',
  stanceSkip: ['no-change', 'no change', 'not applicable', 'n/a'],
  stanceChange: ['change'],
  typeFrontendWords: ['frontend', 'web', 'mobile'],
  typeBackendWords: ['backend', 'service', 'bff', 'aggregate'],
  headerWords: ['file', 'app', 'service'],
};

/** 状态枚举的英文别名（v2.5.1 原样快照）；未来的英文入口做反向映射时用 */
const EN_STATES = {
  'pending-review': '待审核', pending: '待审核', draft: '待审核',
  revising: '修订中', 'in-revision': '修订中',
  approved: '已批准',
  'in-progress': '实施中', implementing: '实施中',
  completed: '已完成', done: '已完成',
  abandoned: '已废弃', rejected: '已废弃', discarded: '已废弃',
};

/** 合并状态三值的英文别名（v2.5.1 原样快照） */
const EN_MERGES = {
  pending: '待合并', 'to-merge': '待合并', unmerged: '待合并',
  merged: '已合并', done: '已合并',
  'n/a': '无需合并', 'n-a': '无需合并', na: '无需合并', none: '无需合并', 'no-merge': '无需合并', skipped: '无需合并',
};

module.exports = { NAMES_EN, EN_STATES, EN_MERGES };
