#!/usr/bin/env bash
# 用例 26：能力契约 §2 规则编号（capability-schema 4；DF-CAPABILITY-010..014）
#
# 覆盖判据：
#   33.1 schema4 + 全部规则带 `RULE-{能力}-NN` → 不报 RULE 问题；
#   33.2 规则 ID 重复 → ⚠️（进退出码）；
#   33.3 §2 有列表项但全无 ID → ⚠️；
#   33.4 部分规则未编号 → ⚠️「有 N 条」；
#   33.5 脆弱引用「§2 第 N 条」→ ℹ️；
#   33.6 schema3 存量：整块 RULE 校验跳过（不因旧文档刷 ⚠️）。

mk_cap() {
  local d="$1" schema="$2" body="$3"
  mk_project "$d"
  cat > "$d/doc-framework/能力/流程契约.md" <<EOT
# 流程契约

<!-- capability-schema: ${schema} | 能力契约 -->

> **文档类型：能力契约** ｜ **主责：svc-order**

## 1. 能力说明（人读层，≤800B）

- **是什么**：跨模块流程编排。
- **不做什么**：不写各端实现。

## 2. 统一约定

${body}

## 3. 接入 Checklist

1. 登记消费者。

## 5. 失败模式与降级

| 场景 | 判据 | 返回 | 消费方应当 |
|---|---|---|---|
| 超时 | 5s | 503 | 重试 |

## 6. 关联代码

- \`services/order/src/Flow.java\`
EOT
}

RULE_OK='- **RULE-流程-01** 必须走审批；违反症状：绕过审批。
- **RULE-流程-02** 不得直连数据库；违反症状：跨库事务。'

# ── 33.1 正例 ──
D="$TMP/cap-rule-ok"; rm -rf "$D"; mk_cap "$D" 4 "$RULE_OK"
OUT=$(run "$D" check 2>&1)
assert_ngrep "$OUT" '§2 规则未编号' '正例：不误报未编号' '正例：误报未编号'
assert_ngrep "$OUT" 'ID 不合规' '正例：不误报不合规' '正例：误报不合规'
assert_ngrep "$OUT" 'ID 重复' '正例：不误报重复' '正例：误报重复'

# ── 33.2 重复 ID ──
D="$TMP/cap-rule-dup"; rm -rf "$D"
mk_cap "$D" 4 '- **RULE-流程-01** 必须走审批。
- **RULE-流程-01** 不得直连数据库。'
OUT=$(run "$D" check 2>&1); CODE=$?
assert_grep "$OUT" '规则 ID 重复' '重复 ID：点名' '重复 ID：未点名'
assert_exit "$CODE" "1" '重复 ID：进退出码' '重复 ID：未进退出码'

# ── 33.3 全无 ID ──
D="$TMP/cap-rule-none"; rm -rf "$D"
mk_cap "$D" 4 '1. 必须走审批。
2. 不得直连数据库。'
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '§2 规则未编号' '全无 ID：点名' '全无 ID：未点名'

# ── 33.4 部分未编号 ──
D="$TMP/cap-rule-part"; rm -rf "$D"
mk_cap "$D" 4 '- **RULE-流程-01** 必须走审批。
- 不得直连数据库。'
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '有 1 条规则未编号' '部分未编号：点名条数' '部分未编号：未点名'

# ── 33.5 脆弱引用 ──
D="$TMP/cap-rule-fragile"; rm -rf "$D"; mk_cap "$D" 4 "$RULE_OK"
python3 - "$D/doc-framework/能力/流程契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('1. 登记消费者。', '1. 登记消费者（见 §2 第 1 条）。')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '脆弱引用「§2 第 N 条」' '脆弱引用：提示' '脆弱引用：未提示'

# ── 33.6 schema3 存量：RULE 校验跳过 ──
D="$TMP/cap-rule-legacy"; rm -rf "$D"
mk_cap "$D" 3 '1. 必须走审批。
2. 不得直连数据库。'
OUT=$(run "$D" check 2>&1)
assert_ngrep "$OUT" '§2 规则未编号' 'schema3：不套用 RULE 校验' 'schema3：误报未编号'
