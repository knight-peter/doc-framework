# 项目规则（doc-framework 接入）

<!-- CONTRACT-FRAMEWORK-BEGIN -->
<!-- ↓↓↓ 接入引导段：初始化完成后由 AI 移除（保留永久段）↓↓↓ -->

## 项目接入（一次性）

本项目使用面向文档开发体系（doc-framework）。若 `{文档根}/项目档案.md` 不存在（项目尚未接入），AI 应主动提示用户执行接入初始化：按项目根《接入指南.md》执行（扫描代码库 → 档案草案 → 开发者确认 → 生成骨架与第一份契约）。初始化完成后：移除本引导段、删除《接入指南.md》。

<!-- ↑↑↑ 接入引导段结束 ↑↑↑ -->
<!-- CONTRACT-FRAMEWORK-END -->

## 通用约束（永久段）

- 文档语言：{文档语言}（**语言由文档根目录名识别**：中文 `doc-framework/`、英文 `doc-framework-en/`；目录与文件命名要么全中文、要么全英文，禁止混用）。
- 文档根目录：`{文档根}/`（总契约、测试规范、接口规范、模块/、边界/、规范/、计划/、探索/）。
- **英文命名映射**（英文模式根目录 `doc-framework-en/`，解析能力与中文模式对齐）：`profile.md`（`## App registry`）/ `contract.md` / `testing-guide.md` / `api-guide.md`；目录 `modules/` `boundaries/` `standards/` `plans/` `explore/`；模块四件套 `modules/{module}/{contract,api,testing}.md` + `test.sh`，模块计划 `modules/{module}/plans/`；契约 §5 = `## Application footprint`；计划章节 `Per-app stance` / `Changed files` / `Task list` / `Writeback` / `Compatibility`；计划头部 `> Status:` / `> Plan shape:` / `> Module contract:`；状态 `pending-review / revising / approved / in-progress / completed / abandoned`；表态 `change / no-change / n/a`。**要么全中文、要么全英文，禁止混用**（改映射须同步 `scripts/lib/plan.js` 的 `NAMES` 与本表）。
- **应用清单**：`{文档根}/项目档案.md` 的「应用清单」是全部 skill 的路由表（应用 → 类型/代码根/规范文件/数据库/依赖）；新增应用先登记清单再使用；代码路径一律从清单派生，禁止写死目录名。
- 模块文档四件套：`{文档根}/模块/{模块名}/契约.md`、`接口.md`、`测试.md`、`test.sh`——文档归 /module-doc 维护，/module-code 不直接修改文档。契约 §5 应用落点表登记"本业务在哪些应用存在"，落点先登记后实施。
- 探索记录（按需）：`{文档根}/探索/YYYY-MM-DD-{主题}.md`——写契约前的方案探索结论，单次决策记录（不作规范依据，不参与 check 硬校验）；由 /module-explore 落盘，契约导航区可回链它回答"为什么这么设计"。
- 实施计划文档：单模块 `{文档根}/模块/{模块名}/计划/YYYY-MM-DD-{主题}实施.md`；跨模块 `{文档根}/计划/YYYY-MM-DD-{主题}实施.md`（**文件名必须带日期前缀**，便于归档；契约文档不带日期，演进记录在"变更记录"章节）。计划状态（待审核/已批准等）由 /module-plan 维护，/module-code 只执行「已批准」计划；计划**形态**分 `完整 / 轻量`（头部 `> 计划形态：…`；轻量=单应用小改，只保留 逐应用表态/变更文件清单/任务清单 三节）；计划的「逐应用表态 + 变更文件清单」即 /module-code 的**授权作用域（白名单）**——**作用域不可就地修改**（须退回修订中重新批准），**作用域内追加任务项属记账**（可直接更新）；计划的**任务清单**（`- [ ] 组.序号`）是进度事实源——/module-code 实施时逐项勾选（**只勾事实完成的项**，未勾完不得登记「已完成」），/module-review 核对完成度。已完成/已废弃的计划由 `/module-plan {模块名} 归档` 移入同级 `计划/archive/`（归档计划不再进入 glob 清单，需路径直达）；`doc-framework list --stale {N}` 列出停滞计划（批量归档入口）。
- **改动通道（授权粒度 ∝ 爆炸半径）**：不能总用同一套文档承接所有改动——判据：触契约语义/含 SQL → 完整计划；跨应用 → 轻量计划；**单应用 + 不触语义 + 无 SQL → 直改通道**（`/module-code {模块名}` 探测后给编号确认门，边界=契约 §5 应用落点，应用级；执行后 `doc-framework diff-check --module {模块名}` 对账，并在契约 §9 记一行 `来源=实现`）。**免计划必须经用户确认（禁止 AI 自我授权）**，途中发现语义变更立即停下升级到 /module-doc + 计划。
- skill 触发命令（仅 /命令 显式触发，不用自然语言关键词；**DSH 只识别英文技能名**）：
  - `/module-explore {主题}` —— 探索与讨论（写契约前想清楚；不写契约/计划/代码，默认不落盘）
  - `/module-doc {模块名}` —— 模块四件套文档（**零后缀**；三模式：需求驱动/代码对账/产物补齐，探测后带编号确认）
  - `/module-plan {模块名}` —— 实施计划创建/修订/状态流转/归档（计划归 /module-plan）
  - `/module-code {计划路径}` —— 执行改动（三通道：完整计划 / 轻量计划 / **直改通道**免计划小改；契约为约束、白名单为边界），完成后回写
  - `/module-review {模块名}` —— 模块审查（多应用对账 + 完成度对账 + 回写查账）
- 编码纪律：先文档后代码；测试发现问题先定性（代码 Bug vs 契约缺口），涉及约定变化必回写契约。
- 文档模板来源：`node_modules/doc-framework/templates/`（方式 A）；方式 B 项目按安装时记录的仓库地址临时 clone 获取。`/module-doc` 生成模块四件套时参考 `templates/模块/{模块名}/`，初始化骨架文档一律从模板渲染、禁止自创结构。
