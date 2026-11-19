#!/usr/bin/env bash
# 用例 24：L0 一致性（总契约 §4 ↔ 模块目录 ↔ §5 依赖全景图；DF-L0-001..005）
#
# 覆盖判据：
#   31.1 模块目录有契约但 §4 未登记 → ❌ 一条聚合，退出码 1；
#   31.2 §4 登记了模块但契约缺失 → ⚠️（不建档 / 子域豁免）；
#   31.3 §4 依赖边在 §5 图缺失 → ℹ️；§5 无 mermaid → 静默不误报；
#   31.4 §4「主责服务」未在档案登记 → ℹ️；
#   31.5 总契约在但 §4 解析为空 → 只出 DF-L0-005 一条（001–004 跳过）；
#   31.6 总契约缺失 → l0-index 静默（只有 skeleton 的 ❌，不刷 001）。
#
# 纪律：夹具只造 L0 需要的那份真相（§4 表 + §5 mermaid）；其它阶段的 ❌ 不参与断言。

mk_l0() {
  local d="$1"
  mk_project "$d"
  mkdir -p "$d/doc-framework/模块/订单" "$d/doc-framework/模块/库存"
  echo '# 订单契约' > "$d/doc-framework/模块/订单/契约.md"
  echo '# 库存契约' > "$d/doc-framework/模块/库存/契约.md"
  cat > "$d/doc-framework/总契约.md" <<'EOT'
# 总契约

## 4. 模块索引表（含依赖关系，/module-doc 自动回写）

| 模块名 | 业务域 | 模块文件夹 | 主责服务 | 各应用落点 | 模块形态 | 标杆参考 | 依赖的下游模块/数据 | 能力依赖 |
|--------|--------|-----------|----------|------------|----------|----------|---------------------|----------|
| 订单 | order | `doc-framework/模块/订单/` | svc-order | app-web: apps/web | 简单 CRUD | — | 库存 | — |
| 库存 | stock | `doc-framework/模块/库存/` | svc-order | — | 简单 CRUD | — | — | — |

## 5. 模块依赖全景图（由 §4 索引表渲染，按业务域分组）

```mermaid
flowchart LR
    A["订单"] -->|"扣减"| B["库存"]
```
EOT
}

D="$TMP/l0"
reset_l0() { rm -rf "$D"; mk_l0 "$D"; }

# ── 31.1 正例：两份契约都有 §4 行、§5 边齐全 → 不报 L0 问题 ──
reset_l0
OUT=$(run "$D" check 2>&1)
assert_ngrep "$OUT" '不可路由' 'L0 正例：不误报未登记' "L0 正例：误报未登记（${OUT}）"
assert_ngrep "$OUT" '登记了模块但契约不存在' 'L0 正例：不误报缺契约' 'L0 正例：误报缺契约'
assert_ngrep "$OUT" '§5 全景图缺' 'L0 正例：不误报图漂移' 'L0 正例：误报图漂移'

# ── 31.2 §4 未登记：新增模块契约 → ❌ 聚合、退出码 1 ──
mkdir -p "$D/doc-framework/模块/退货"
echo '# 退货契约' > "$D/doc-framework/模块/退货/契约.md"
OUT=$(run "$D" check 2>&1); CODE=$?
assert_grep "$OUT" '模块有契约但总契约 §4 未登记' '§4 漏登记：点名' '§4 漏登记：未点名'
assert_grep "$OUT" '退货' '§4 漏登记：列出模块名' '§4 漏登记：未列模块名'
assert_grep "$OUT" '（共 1 个）' '§4 漏登记：聚合计数' '§4 漏登记：缺聚合计数'
assert_exit "$CODE" "1" '§4 漏登记：进退出码' '§4 漏登记：未进退出码'

# ── 31.3 §4 有行、契约缺失 → ⚠️；不建档 / 子域豁免 ──
reset_l0
rm "$D/doc-framework/模块/库存/契约.md"
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '登记了模块但契约不存在：库存' '缺契约：点名库存' '缺契约：未点名库存'

# 不建档 / 子域：不要求契约文件（不误报）
reset_l0
python3 - "$D/doc-framework/总契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('| 库存 | stock | `doc-framework/模块/库存/` |',
              '| 库存 | stock | —（不建档） |')
open(p, 'w', encoding='utf-8').write(s)
PY
rm -rf "$D/doc-framework/模块/库存"
OUT=$(run "$D" check 2>&1)
assert_ngrep "$OUT" '登记了模块但契约不存在：库存' '不建档：豁免缺契约' '不建档：误报缺契约'

# ── 31.4 依赖边在 §5 缺失 → ℹ️；删掉 mermaid → 静默 ──
reset_l0
python3 - "$D/doc-framework/总契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('| 库存 | — |', '| 库存、退货 | — |')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '§5 全景图缺' '图漂移：点名' '图漂移：未点名'
assert_grep "$OUT" '订单→退货' '图漂移：列出缺的边' '图漂移：未列边'

python3 - "$D/doc-framework/总契约.md" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = re.sub(r'```mermaid[\s\S]*?```', '', s)
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_ngrep "$OUT" '§5 全景图缺' '图解析不出：静默跳过' '图解析不出：误报漂移'

# ── 31.5 主责服务未在档案登记 → ℹ️ ──
reset_l0
python3 - "$D/doc-framework/总契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('| 库存 | stock | `doc-framework/模块/库存/` | svc-order |',
              '| 库存 | stock | `doc-framework/模块/库存/` | ghost-svc |')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '「主责服务」未在档案应用清单登记：库存 → ghost-svc' '主责未登记：点名' '主责未登记：未点名'

# ── 31.6 §4 解析为空 → 只出 005；总契约缺失 → 整阶段静默 ──
reset_l0
python3 - "$D/doc-framework/总契约.md" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
s = s.replace('## 4. 模块索引表', '## 4. 模块清单')
open(p, 'w', encoding='utf-8').write(s)
PY
mkdir -p "$D/doc-framework/模块/退货"; echo '# 退货契约' > "$D/doc-framework/模块/退货/契约.md"
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '「模块索引表」解析为空' '§4 解析空：出 005' '§4 解析空：未出 005'
assert_ngrep "$OUT" '不可路由' '§4 解析空：001 让位' '§4 解析空：001 仍在刷'

reset_l0
rm "$D/doc-framework/总契约.md"
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" '缺少文件' '总契约缺失：skeleton 硬报' '总契约缺失：skeleton 未报'
assert_ngrep "$OUT" '不可路由' '总契约缺失：l0 静默' '总契约缺失：l0 仍刷 001'
assert_ngrep "$OUT" '「模块索引表」解析为空' '总契约缺失：不出 005' '总契约缺失：005 抢跑'
