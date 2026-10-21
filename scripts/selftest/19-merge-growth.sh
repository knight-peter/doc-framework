#!/usr/bin/env bash
# 19：合并净增长夹具（10 次模拟合并）
#
# 覆盖：
#   27.1 8 次单模块改动只替换 INV 文本 → 契约净增长 ≈0，边界不变；
#   27.2 2 次共享规则变化 → 边界只改规则/失败模式，不新增 SC/Scenario；
#   27.3 全流程 check 无硬错误。
set -uo pipefail
D="$TMP/merge-growth"
mk_project "$D"
mkdir -p "$D/services/order/src"
echo 'class A {}' > "$D/services/order/src/A.java"

cat > "$D/doc-framework/边界/工作流边界.md" <<'EOT'
# 工作流边界
<!-- boundary-schema: 2 | 能力契约 -->
> 文档类型：能力契约 ｜ 主责：svc-order
## 1. 适用范围
| 消费者 | 接入方式 | 消费内容 | 说明 |
|---|---|---|---|
| svc-order | HTTP | 流程 | — |
## 5. 失败模式与降级
| 场景 | 判据 | 返回/表现 | 消费方应当 |
|---|---|---|---|
| 无令牌 | 无 | 401 | 重新登录 |
## 6. 验收归属
| 验收主题 | 归属 |
|---|---|
| 订单流程 | `模块/订单/契约.md` §8.2 SC-订单-01 |
## 7. 关联代码
- `services/order/src/A.java`（入口）
EOT

cat > "$D/doc-framework/模块/订单/契约.md" <<'EOT'
<!-- doc-framework:docstruct 3.1.1 | 文档结构版本 -->
<!-- contract-schema: 2 | 契约语义层 -->
# 订单模块契约
> 模块形态：业务-CRUD ｜ 主责服务：svc-order
> **本契约拥有**：订单状态机
> **委托给**：`边界/工作流边界.md`（流程）
> **本契约不拥有**：字段级（→ 接口.md）
## 1. 模块定位
订单。
## 2. 边界约定
无。
## 3. 数据模型
无自有表。
## 4. 接口概览
`/list`。
## 5. 应用落点
| 应用 | 代码路径 | 说明 |
|---|---|---|
| svc-order | `services/order/src/A.java` | 入口 |
## 6. 标杆参考
无。
## 7. 不变量
### 7.1 不变量（必须 / 不得）
| ID | 规则 | 违反症状 | 关联接口 |
|---|---|---|---|
| INV-订单-01 | 规则A | 错误A | `/list` |
## 8. 测试与验证
### 8.2 关键验收场景
| ID | 场景短名 | 对应接口 |
|---|---|---|
| SC-订单-01 | 列表 | `/list` |
#### Scenario: SC-订单-01 列表
- **WHEN** 请求
- **THEN** 200
## 9. 变更记录
见 git。
## 10. 生产环境 SQL 执行登记
| 日期 | 所属服务 | 文件 | 影响摘要 | 状态 |
|---|---|---|---|---|
| — | — | — | 无 | — |
EOT

CONTRACT="$D/doc-framework/模块/订单/契约.md"
BOUNDARY="$D/doc-framework/边界/工作流边界.md"
BASE_C=$(wc -c < "$CONTRACT")
BASE_B=$(wc -c < "$BOUNDARY")

# 8 次单模块改动：只替换 INV 文本，不改边界
for i in $(seq 1 8); do
  if [ $((i % 2)) -eq 0 ]; then R='规则A'; else R='规则B'; fi
  python3 - "$CONTRACT" "$R" <<'PY'
import sys
p, r = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
import re
s = re.sub(r'\| INV-订单-01 \| [^|]+ \|', f'| INV-订单-01 | {r} |', s, count=1)
open(p, 'w', encoding='utf-8').write(s)
PY
done
NOW_B=$(wc -c < "$BOUNDARY")
[ "$BASE_B" = "$NOW_B" ] && ok "8 次单模块改动：边界零改动" || bad "8 次单模块改动：边界被改动"

# 2 次共享规则变化：只追加失败模式，不新增 SC/Scenario
python3 - "$BOUNDARY" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('| 无令牌 | 无 | 401 | 重新登录 |', '| 无令牌 | 无 | 401 | 重新登录 |\n| 超时 | 超时 | 超时 | 重试 |', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
python3 - "$BOUNDARY" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('| 超时 | 超时 | 超时 | 重试 |', '| 超时 | 超时 | 超时 | 重试 |\n| 降级 | 不可用 | 降级 | 兜底 |', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
GROWTH=$(( $(wc -c < "$CONTRACT") - BASE_C ))
[ "$GROWTH" -le 3072 ] && ok "10 次合并：契约净增长 ${GROWTH}B ≤3KB" || bad "10 次合并：契约净增长 ${GROWTH}B >3KB"
assert_ngrep "$(cat "$BOUNDARY")" '^| SC-' '2 次共享规则变化：边界未新增 SC' '2 次共享规则变化：边界出现 SC'
assert_ngrep "$(cat "$BOUNDARY")" '^#### Scenario:' '2 次共享规则变化：边界未新增 Scenario' '2 次共享规则变化：边界出现 Scenario'
OUT=$(run "$D" check)
assert_ngrep "$OUT" '❌' '全流程 check 无硬错误' '全流程 check 有硬错误'
