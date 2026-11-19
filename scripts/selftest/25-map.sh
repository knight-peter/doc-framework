#!/usr/bin/env bash
# 用例 25：map 路径反查 + §5 覆盖报告（只读；不读源码）
#
# 覆盖判据：
#   32.1 命中：路径 → 模块/契约/§5 行号/应用规范/§7 INV，退出码 0；
#   32.2 同深度多命中：两处都列 + 「交叉覆盖」提示（不替用户裁决）；
#   32.3 未命中：提示两个出口，退出码仍为 0（报告不是门禁）；
#   32.4 --uncovered：计数与构造值一致；--app 过滤；应用根为 `.` 时排除文档根；
#   32.5 非 git 仓库：一条 ℹ️ 跳过、退出码 0；
#   32.6 --json 稳定字段（path/app/covered/matches[module,scopeLine,invariants]）。

mk_map() {
  local d="$1"
  mk_project "$d"
  mkdir -p "$d/doc-framework/模块/订单" "$d/doc-framework/模块/库存"
  mkdir -p "$d/apps/web/src/views/order" "$d/apps/web/src/views/stock" "$d/services/order/src/main/java/order"
  echo x > "$d/apps/web/src/views/order/list.vue"
  echo x > "$d/apps/web/src/views/stock/list.vue"
  echo x > "$d/apps/web/src/util.js"
  echo x > "$d/services/order/src/main/java/order/A.java"
  cat > "$d/doc-framework/模块/订单/契约.md" <<'EOT'
# 订单契约

<!-- contract-schema: 5 -->

> **本契约拥有**：订单语义

## 5. 应用落点

| 应用 | 文件位置 | 说明 |
|------|----------|------|
| app-web | `src/views/order/` | 订单页 |
| svc-order | `src/main/java/order/` | 订单服务 |

## 7. 不变量与陷阱

| ID | 不变量 | 违反症状 |
|---|---|---|
| INV-订单-01 | 金额不得为负 | 负数入账 |
EOT
  cat > "$d/doc-framework/模块/库存/契约.md" <<'EOT'
# 库存契约

<!-- contract-schema: 5 -->

> **本契约拥有**：库存语义

## 5. 应用落点

| 应用 | 文件位置 | 说明 |
|------|----------|------|
| app-web | `src/views/stock/` | 库存页 |
EOT
}

D="$TMP/map"
rm -rf "$D"; mk_map "$D"

# ── 32.1 命中 ──
OUT=$(run "$D" map apps/web/src/views/order/list.vue 2>&1); CODE=$?
assert_grep "$OUT" '模块：订单' 'map 命中：模块' 'map 命中：未点名模块'
assert_grep "$OUT" '§5  ：第 11 行' 'map 命中：§5 行号' 'map 命中：行号不对'
assert_grep "$OUT" '规范：doc-framework/规范/应用-app-web.md' 'map 命中：应用规范' 'map 命中：缺应用规范'
assert_grep "$OUT" 'INV-订单-01' 'map 命中：§7 不变量' 'map 命中：缺不变量'
assert_exit "$CODE" "0" 'map 命中：退出码 0' 'map 命中：退出码非 0'

# ── 32.2 同深度多命中 ──
python3 - "$D/doc-framework/模块/库存/契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('`src/views/stock/`', '`src/views/order/`')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" map apps/web/src/views/order/list.vue 2>&1)
assert_grep "$OUT" '模块：订单' '多命中：列出订单' '多命中：缺订单'
assert_grep "$OUT" '模块：库存' '多命中：列出库存' '多命中：缺库存'
assert_grep "$OUT" '同深度命中 2 处' '多命中：交叉覆盖提示' '多命中：缺交叉覆盖提示'

# ── 32.3 未命中 ──
OUT=$(run "$D" map apps/web/src/util.js 2>&1); CODE=$?
assert_grep "$OUT" '未被任何契约 §5 覆盖' '未命中：点名' '未命中：未点名'
assert_exit "$CODE" "0" '未命中：退出码 0（报告不是门禁）' '未命中：退出码非 0'

# ── 32.4 --uncovered：计数 / --app / 文档根排除 ──
( cd "$D" && git init -q && git add -A )
OUT=$(run "$D" map --uncovered 2>&1); CODE=$?
assert_grep "$OUT" '覆盖：2 / 4' 'uncovered：计数' "uncovered：计数不对（${OUT}）"
assert_grep "$OUT" 'apps/web/src' 'uncovered：按目录聚合' 'uncovered：缺目录聚合'
assert_exit "$CODE" "0" 'uncovered：退出码 0' 'uncovered：退出码非 0'

OUT=$(run "$D" map --uncovered --app svc-order 2>&1)
assert_grep "$OUT" '覆盖：1 / 1' 'uncovered：--app 过滤' "uncovered：--app 过滤不对（${OUT}）"

python3 - "$D/doc-framework/项目档案.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('| ./apps/web |', '| . |')
open(p, 'w', encoding='utf-8').write(s)
PY
( cd "$D" && git add -A )
OUT=$(run "$D" map --uncovered --json 2>&1)
assert_json "$OUT" "not any('doc-framework/' in f for f in d['files'])" \
  'uncovered：应用根为 . 时排除文档根' 'uncovered：文档根被算成未覆盖'

# ── 32.5 非 git 仓库 ──
D2="$TMP/map-nogit"
rm -rf "$D2"; mk_map "$D2"
OUT=$(run "$D2" map --uncovered 2>&1); CODE=$?
assert_grep "$OUT" '不是 git 仓库' '非 git：提示跳过' '非 git：未提示'
assert_exit "$CODE" "0" '非 git：退出码 0' '非 git：退出码非 0'

# ── 32.6 --json 稳定字段 ──
OUT=$(run "$D2" map apps/web/src/views/order/list.vue --json 2>&1)
assert_json "$OUT" "d['covered'] is True and d['matches'][0]['module']=='订单' and isinstance(d['matches'][0]['invariants'], list)" \
  'json：字段稳定' 'json：字段缺失/漂移'
assert_json "$OUT" "d['matches'][0]['spec'].endswith('应用-app-web.md')" \
  'json：应用规范路径' 'json：应用规范路径不对'

# ── 32.7 用法错误 ──
OUT=$(run "$D2" map 2>&1); CODE=$?
assert_exit "$CODE" "1" '无参数：用法错误退出码 1' '无参数：退出码不为 1'
OUT=$(run "$D2" map --uncovered apps/web/x.js 2>&1); CODE=$?
assert_exit "$CODE" "1" '--uncovered 带路径：退出码 1' '--uncovered 带路径：未拒绝'
