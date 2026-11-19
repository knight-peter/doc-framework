#!/usr/bin/env bash
# 用例 27：schema5 与既有闸门不打架（contract-schema 5 + capability-schema 4）
#
# 覆盖判据：
#   34.1 schema5 契约不被误判为 legacy（无「章节结构异常」❌）；
#   34.2 schema5 契约的 §8/SC 检查照常（不报「缺 SC」、audit 仍统计 SC）；
#   34.3 同一份契约标回 schema4：❌ 集合与 schema5 完全一致（无回归、无假红）；
#   34.4 schema5 契约缺「人读层」声明 → ⚠️；声明不在首行 → ℹ️；两处都合规 → 不报；
#   34.5 migrate v6 对无标记能力契约建议的目标是 `capability-schema: 4`（不是 3）。

R27="$TMP/s27"
rm -rf "$R27"
python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$R27" >/dev/null 2>&1

CON="$R27/doc-framework/模块/order/契约.md"
ACC="$R27/doc-framework/模块/order/测试/验收.md"
assert_grep "$(cat "$CON")" 'contract-schema: 5' '渲染：契约模板为 schema5' '渲染：契约模板不是 schema5'

# ── 34.1 / 34.2 schema5 正例 ──
OUT=$(run "$R27" check 2>&1)
assert_ngrep "$OUT" '契约章节结构异常（当前 .*；schema2 应为 10 章' 'schema5：不误判 legacy' "schema5：误判 legacy（${OUT}）"
assert_ngrep "$OUT" 'SC 唯一事实源）：doc-framework/模块/order/契约.md' 'schema5：不误报缺验收' "schema5：误报缺验收（${OUT}）"
assert_ngrep "$OUT" 'schema5 契约 §1 缺「人读层」' 'schema5：人读层合规不报警' 'schema5：误报人读层缺失'

OUT=$(run "$R27" audit --module order 2>&1)
assert_grep "$OUT" '1/2' 'audit：schema5 仍统计 SC（未静默漏检）' 'audit：schema5 被静默跳过'

# ── 34.3 schema4 ↔ schema5 行为一致 ──
python3 - "$CON" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(s.replace('contract-schema: 5', 'contract-schema: 4'))
PY
run "$R27" check 2>&1 | grep '❌' | sed 's/doc-framework\/模块\/order\/契约.md//' > "$TMP/s27-schema4.txt"
python3 - "$CON" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(s.replace('contract-schema: 4', 'contract-schema: 5'))
PY
run "$R27" check 2>&1 | grep '❌' | sed 's/doc-framework\/模块\/order\/契约.md//' > "$TMP/s27-schema5.txt"
if diff -q "$TMP/s27-schema4.txt" "$TMP/s27-schema5.txt" >/dev/null; then
  ok 'schema4/schema5：❌ 集合一致（行为无分叉）'
else
  bad "schema4/schema5：❌ 集合分叉（$(diff "$TMP/s27-schema4.txt" "$TMP/s27-schema5.txt" | tr '\n' ' ')）"
fi

# ── 34.4 人读层声明级别 ──
cp "$CON" "$TMP/s27-con.bak"
python3 - "$CON" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('> 人读层：本节说明模块定位与取舍；**实施时跳过**，写/审契约时必读。\n\n', '')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$R27" check 2>&1); CODE=$?
assert_grep "$OUT" 'schema5 契约 §1 缺「人读层」声明行' '缺人读层：点名' '缺人读层：未点名'
assert_exit "$CODE" "1" '缺人读层：进退出码' '缺人读层：未进退出码'

python3 - "$CON" "$TMP/s27-con.bak" <<'PY'
import sys
p, bak = sys.argv[1], sys.argv[2]
s = open(bak, encoding='utf-8').read()
s = s.replace('> 人读层：本节说明模块定位与取舍；**实施时跳过**，写/审契约时必读。\n\n', '定位补一句。\n\n> 人读层：本节说明模块定位与取舍；**实施时跳过**，写/审契约时必读。\n\n')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$R27" check 2>&1)
assert_grep "$OUT" '「人读层」声明不在 §1 首行' '声明非首行：提示' '声明非首行：未提示'

# ── 34.5 migrate v6 目标标记 ──
D27="$TMP/s27-mig"; rm -rf "$D27"
mk_project "$D27"
cat > "$D27/doc-framework/能力/流程契约.md" <<'EOT'
# 流程契约
## 1. 能力说明
- 是什么：流程
EOT
MIG=$(run "$D27" migrate v6 --json 2>&1)
assert_json "$MIG" "any('capability-schema: 4' in a for b in d['capabilities'] for a in b['actions'])" \
  'migrate v6：目标标记为 4' 'migrate v6：仍建议旧标记'
