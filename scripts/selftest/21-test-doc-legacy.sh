#!/usr/bin/env bash
# 21：旧测试文档（schema2 / 测试.md）迁移提示
#
# 覆盖：
#   28.1 schema2 旧 测试.md（14 章 / SC-1 / §7-28 / 执行记录）默认 ℹ️ 汇总，不硬红；
#   28.2 --strict 升 ⚠️；
#   28.3 migrate v5 只读报告列出旧测试资产动作。
set -uo pipefail
D="$TMP/test-doc-legacy"
mk_project "$D"
mkdir -p "$D/doc-framework/模块/订单"
cat > "$D/doc-framework/模块/订单/契约.md" <<'EOT'
<!-- doc-framework:docstruct 3.2.0 | 文档结构版本 -->
<!-- contract-schema: 2 | 契约语义层 -->
# 订单模块契约
> 模块形态：业务-CRUD ｜ 主责服务：svc-order
> **本契约拥有**：订单状态机
> **委托给**：无
> **本契约不拥有**：字段级（→ 接口.md）
## 1. 模块定位
订单。
## 2. 边界约定
无。
## 3. 数据模型
无。
## 4. 接口概览
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/list` | 列表 |
## 5. 应用落点
| 应用 | 页面结构 | 文件位置 | 权限控制方式 | 差异说明 |
|---|---|---|---|---|
| svc-order（主责） | — | `services/order/src/A.java` | 登录态 | 业务真相 |
## 6. 标杆参考
无。
## 7. 不变量
| ID | 规则 | 违反症状 | 关联接口 |
|---|---|---|---|
| INV-订单-01 | 必须校验登录态 | 返回 401 | `/list` |
## 8. 测试与验证
### 8.2 关键验收场景
| ID | 场景短名 | 对应接口 |
|---|---|---|
| SC-订单-01 | 列表 | `/list` |
#### Scenario: SC-订单-01 列表
- **WHEN** 请求列表
- **THEN** 返回 200
## 9. 变更记录
> 历史归 git。
## 10. 生产环境 SQL 执行登记
| 日期 | 所属服务 | 文件 | 影响摘要 | 状态 |
|---|---|---|---|---|
| — | — | — | 无 | — |
EOT
cat > "$D/doc-framework/模块/订单/测试.md" <<'EOT'
# 订单 模块测试
> 生成：2026-09-30（/module-test）
## 1. 测试目标
列表。
## 2. 适用层与依据
接口层。
## 3. 前置条件
无。
## 4. 测试账号
admin。
## 5. 验收标准
SC-1、SC-2、§7-28。
## 6. 端到端测试用例
T1。
## 7. 库层断言
无。
## 8. 编排层
无。
## 9. 端层 Checklist
无。
## 10. 验证 SQL
无。
## 11. 执行记录
2026-10-01 PASS。
## 12. 本轮缺陷
D-1 修复。
## 13. 分发通道
无。
## 14. dev 通道
无。
EOT
OUT=$(run "$D" check)
assert_grep "$OUT" '旧测试文档待迁移' '旧 测试.md：默认 ℹ️ 点名' '旧 测试.md：未点名'
assert_ngrep "$OUT" 'schema4 契约缺 测试/验收.md' '旧 schema2：不误报 schema4 缺验收' '旧 schema2：误报 schema4'
STRICT=$(run "$D" check --strict)
assert_grep "$STRICT" '⚠️ 旧测试文档待迁移' '旧 测试.md：--strict 升 ⚠️' '旧 测试.md：--strict 未升级'
MIG=$(run "$D" migrate v5 --json)
assert_json "$MIG" "any(m['module']=='订单' and any('测试.md' in a for a in m['actions']) for m in d['modules'])" 'migrate v5：列出旧测试资产动作' 'migrate v5：缺旧测试资产动作'
