#!/usr/bin/env node
/**
 * doc-framework CLI —— **薄入口**：只做 argv 分发、`--help` 与错误退出码。
 *
 * 用法：
 *   doc-framework install                 —— 唯一安装入口（skill + 未初始化引导；v3 起无 install.sh/postinstall）
 *   doc-framework sync                    —— 同步 skill 到最新版本（本地定制文件自动跳过）
 *   doc-framework check [--strict]      —— 校验文档体系完整性（骨架 + 应用清单 + 计划体检 + 文档落后检查 + 规范层归属 + 结构版本哨兵 + 占位符残留）
 *   doc-framework diff-check <计划路径>    —— 提交前对账：git 变更 vs 计划白名单
 *   doc-framework list                    —— 列出在途计划（状态/涉及应用/任务进度）
 *   doc-framework list --explore          —— 聚合探索记录（探索/=进行中含待消费，探索/归档/=已归档）
 *   doc-framework show <计划路径>          —— 查看单个计划的结构化视图
 *   doc-framework doctor                  —— 安装 / 升级健康检查（只读，不替代 check）
 *   doc-framework audit [--module <名>] [--all] [--json] [--plan <计划>]  —— 契约健康/能力契约/按计划净增长报告（只读）
 *   doc-framework migrate v4|v5|v6 [--dry-run] [--json]  —— v4/v5/v6 迁移动作清单（只读；不自动改写契约）
 *   doc-framework template <模板>          —— 打印官方模板（只读，未装依赖也能取）
 *   doc-framework --help                  —— 帮助
 *
 * 设计纪律（全命令适用）：
 *   1. 写命令只有 install / sync；check / diff-check / list / show / doctor / template **只读**，可安全用于 CI / pre-commit；
 *   2. 解析器降级不崩溃（计划模板可能被本地定制）：缺章节 → 缺省/提示，不抛异常；
 *   3. 路径一律从档案「应用清单」派生，禁止写死目录名；
 *   4. 归档计划（`计划/归档/`）不参与在途 glob 清单，需路径直达；
 *   5. `--json` 是机器消费接口：`check --json` 带稳定规则码（DF-*）；list/show 的 `--json` 仍标 experimental。
 *
 * 代码结构（**依赖方向单向：cli → commands → checks → lib**，不得反向 require）：
 *   cli.js                本文件：argv 分发 + help（命令参数的唯一权威文本）
 *   commands/{install,sync,check,diff-check,list,show,doctor,template}.js
 *                         每个命令的入口与编排；`check` 另含 auditPlan（阶段汇总）
 *   checks/{skeleton,registry,contract-health,contract-content,standards,plan-health,doc-sync,placeholders,onboarding,rules}.js
 *                         check 的 8 个阶段 + 规则目录：入参 ctx 只读，返回 { issues, notes }（**不共享可变数组**）
 *   lib/util.js           命令层共享工具（参数解析 / 表格对齐 / 计划路径归一）
 *   lib/env.js            项目根 / 版本 / 目标目录解析
 *   lib/installer.js      marker / 文件哈希 / 目标目录（安装与 sync 共用原语）
 *   lib/install-actions.js 首次安装动作（install 命令的 core）
 *   lib/plan.js           文档解析层（命名、模板、解析器与判据的单一来源）
 *
 * check 的 9 个阶段（顺序即 issues/notes 的汇总顺序、即输出顺序，见 commands/check.js auditPlan）：
 *   1 骨架 + 1.1 结构版本哨兵(R4) → 2 应用清单/规范 → 2.4 契约健康（§5 落点）→ 2.6 契约内容健康（所有权/§7/SC/历史/能力索引）
 *   → 2.7 能力契约内容健康（§1 人读层/无验收归属/无 SC/§6 关联代码）→ 2.5 规范层归属 → 3 计划体检 → 3.6 文档落后检查 → 4 占位符残留 → 5 引导残留；另有只读子模式 --draft-contract；
 *   `--strict` 把提示类判据（文档落后 / 规范层归属 / 契约 §5 落点）升为 ⚠️ 进退出码。
 *
 * 改本文件前先看：docs/设计文档.md §6.1（命令清单）/ §6.2（参数参考，指针——权威文本即本文件 --help）/ §6.3（规则分组；
 * 规则码/级别以 `doc-framework check --rules` 为准）/ §6.4（diff-check 白名单推导）。
 * 纪律：新增硬问题必须同时更新 §6.3 的分组说明与 scripts/selftest/NN-*.sh 的对应用例（见 §10.3）。
 */
'use strict';

const env = require('./lib/env');
const plan = require('./lib/plan');
const { sync } = require('./commands/sync');
const { install } = require('./commands/install');
const { template } = require('./commands/template');
const { check } = require('./commands/check');
const { diffCheck } = require('./commands/diff-check');
const { list } = require('./commands/list');
const { show } = require('./commands/show');
const { doctor } = require('./commands/doctor');
const { audit } = require('./commands/audit');
const { migrate } = require('./commands/migrate');

/** 打印用法（`--help` 是参数参考的唯一权威文本；docs/设计文档.md §6.2 只是指向这里的指针）。 */
function help() {
  console.log(`doc-framework v${env.VERSION}
用法：
  doc-framework install [--root <项目根>] [--json]  首次安装 / 强制刷新（安装 skill + 未初始化引导；v3 唯一安装入口）
  doc-framework sync [--root <项目根>]         同步 skill 到最新（按 skill 跳过本地定制；不改动文档根与 AGENTS.md）
  doc-framework check [--strict] [--root <项目根>]  校验体系完整性（骨架 + 应用清单 + 计划体检 + 语义增量/合并状态 + 文档落后检查 + 规范层归属判据 + 结构版本哨兵 + 占位符 + 引导清理）
      --strict       提示类判据（文档落后 / 规范层归属 / 契约 §5 落点）升为 ⚠️ 进退出码（PR / pre-push 门禁）
      --json         机器可读输出（规则码 DF-* + 分级 + 计数；供 CI / AI，稳定接口）
      --rules        打印规则目录（可配 --json；运行时权威，设计文档 §6.3 只做分组说明）
  doc-framework check --draft-contract <计划>  只读打印"增量条目 → 目标契约章节"建档清单（供「合并增量」当 checklist）
  doc-framework diff-check <计划路径> [选项]   提交前对账：git 变更 vs 计划白名单
  doc-framework diff-check --module <模块名>   直改通道对账：git 变更 vs 契约 §5 应用落点（应用级边界；待实现模块请用计划通道）
      （管辖范围 = 应用清单登记的应用：契约管辖不到的文件只给 ⚠️ 提示，不判定越界）
      --base <ref>   与指定 ref 比较（默认 HEAD，含未跟踪文件）
      --staged       只检查已暂存文件（pre-commit 场景）
      --strict       警告也算失败
      --root <项目根> 指定项目根（默认从 cwd 向上查找 doc-framework/）
  doc-framework list [选项]                    列出在途计划（状态 / 形态 / 合并状态 / 涉及应用 / 任务进度）
      --module <名>  只列某模块      --app <标识>  只列会改动该应用的计划
      --state <状态> 按状态过滤      --stale <天>  只列日期早于 N 天前的计划（**批量归档：--stale N --all**）
      --orphans      只列"缺契约且无在途计划"的模块（代码是否存在需人工确认）
      --all          包含已完成/已废弃（批量归档必需；归档计划需路径直达）   --json  机器可读（experimental）
      --root <项目根> 指定项目根（默认从 cwd 向上查找 doc-framework/）
  doc-framework list --explore [--state <状态>]  聚合探索记录（探索/=进行中含待消费，探索/归档/=已归档；
      状态：探索中/已定案/已使用/已作废）   --json  机器可读（experimental）
  doc-framework template --list [--json] | template <模板>  打印官方模板（未装依赖也能取；stdout）
  doc-framework doctor [--root <项目根>] [--json] 安装 / 升级健康检查（只读；不替代 check）
  doc-framework audit [--module <名>] [--all] [--json] [--plan <计划>] [--root <项目根>] 契约健康/能力契约/按计划净增长报告（只读；不替代 check）
  doc-framework show <计划路径> [--json] [--root <项目根>]  查看单个计划：状态/形态/依据/语义增量与合并状态/表态/白名单/文件清单/进度
  安装 / 同步 / 校验 / 查询命令接受 --root <项目根>；template 与项目无关，不接受 --root。默认从 cwd 向上查找 doc-framework/。
  doc-framework --help（或 -h）                显示帮助`);
}

const arg = process.argv[2];
if (require.main === module && arg === 'install') process.exit(install(process.argv.slice(3)));
else if (require.main === module && arg === 'sync') process.exit(sync(process.argv.slice(3)));
else if (require.main === module && arg === 'check') process.exit(check(process.argv.slice(3)));
else if (require.main === module && arg === 'diff-check') process.exit(diffCheck(process.argv.slice(3)));
else if (require.main === module && arg === 'list') process.exit(list(process.argv.slice(3)));
else if (require.main === module && arg === 'show') process.exit(show(process.argv.slice(3)));
else if (require.main === module && arg === 'doctor') process.exit(doctor(process.argv.slice(3)));
else if (require.main === module && arg === 'template') process.exit(template(process.argv.slice(3)));
else if (require.main === module && arg === 'audit') process.exit(audit(process.argv.slice(3)));
else if (require.main === module && arg === 'migrate') process.exit(migrate(process.argv.slice(3)));
// `--help`（与 `-h`）是**成功**请求：退出码 0，否则 CI / 脚本里的 `tool --help` 探测会误判为失败。
// 裸调用（无参数）仍是用法错误 → 1。
else if (require.main === module && (arg === '--help' || arg === '-h')) { help(); process.exit(0); }
else if (require.main === module) { help(); process.exit(1); }

// 兼容导出：`findPlaceholders` 的机器侧单一来源已迁至 lib/plan.js（本文件不再实现，仅转发）。
module.exports = { findPlaceholders: plan.findPlaceholders };
