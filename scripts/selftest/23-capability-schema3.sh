#!/usr/bin/env bash
# 23：能力契约 schema3 健康（人读层/无验收归属/§6 关联代码/消费者/主责/旧目录）
#
# 覆盖：
#   29.1 schema3 合规 → check 通过；
#   29.2 出现「验收归属」→ ❌；
#   29.3 出现 §7 关联代码 → note（应为 §6）；
#   29.4 §1 出现消费者表 → note；
#   29.5 §1 超 800B → note；
#   29.6 §1 缺「不做什么」→ note；
#   29.7 缺 §6 关联代码 → note；
#   29.8 总契约 §7 消费者 <2 → note；
#   29.9 总契约 §7 主责与能力契约头部不一致 → note；
#   29.10 旧目录 边界/ 存在 → ❌；
#   29.11 migrate v6 输出目录/文件/内容动作（只读）。
set -uo pipefail
D="$TMP/cap-schema3"
mk_project "$D"
CAP="$D/doc-framework/能力/工作流契约.md"
TOTAL="$D/doc-framework/总契约.md"

cat > "$TOTAL" <<'EOT'
# 总契约
## 7. 能力契约索引
| 能力 | 契约 | 主责 | 消费者 | 变更影响 |
|---|---|---|---|---|
| 工作流 | `能力/工作流契约.md` | svc-order | app-web、svc-order | 入口 |
EOT

cat > "$CAP" <<'EOT'
# 工作流契约
<!-- capability-schema: 3 | 能力契约 -->
> 文档类型：能力契约 ｜ 主责：svc-order
## 1. 能力说明（人读层）
- **是什么**：跨模块流程集成。
- **为什么需要**：避免各端各自回写流程状态。
- **不做什么**：不含流程设计器。
- **谁在用**：见 `总契约.md` §7。
## 2. 统一约定
1. 流程定义集中登记。
## 3. 接入 Checklist
1. 登记流程 key。
## 4. 常见陷阱
1. 不要在端上回写状态。
## 5. 失败模式与降级
| 场景 | 判据 | 返回/表现 | 消费方应当 |
|---|---|---|---|
| 无令牌 | 无 | 401 | 重新登录 |
## 6. 关联代码
- `services/order/src/A.java`（入口）
EOT

OUT=$(run "$D" check 2>&1)
CODE=$?
assert_exit "$CODE" "0" "schema3 合规：check 通过" "schema3 合规：check 失败（${CODE}）"
assert_ngrep "$OUT" "❌" "schema3 合规：无 ❌" "schema3 合规：出现 ❌（${OUT}）"

cp "$CAP" "$TMP/cap.bak"
printf '\n## 6. 验收归属\n\n| 验收主题 | 归属 |\n|---|---|\n| 流程 | `模块/订单/测试/验收.md` |\n' >> "$CAP"
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "能力契约出现验收归属/验收场景" "验收归属：check 点名" "验收归属：未点名"
cp "$TMP/cap.bak" "$CAP"

python3 - "$CAP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('## 6. 关联代码', '## 7. 关联代码')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "schema3 能力契约章节应为 §1–§6" "§7 章节：note" "§7 章节：未提示"
cp "$TMP/cap.bak" "$CAP"

python3 - "$CAP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('- **谁在用**：见 `总契约.md` §7。', '| 消费者 | 说明 |\n|---|---|\n| svc-order | 主责 |')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "能力契约 §1 不应重复消费者表" "§1 表：note" "§1 表：未提示"
cp "$TMP/cap.bak" "$CAP"

python3 - "$CAP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('- **不做什么**：不含流程设计器。', '- **不做什么**：' + '不含流程设计器；' * 80)
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "§1 人读层超 800B" "§1 超 800B：note" "§1 超 800B：未提示"
cp "$TMP/cap.bak" "$CAP"

python3 - "$CAP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('- **不做什么**：不含流程设计器。', '- **范围**：流程集成。')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "§1 缺「不做什么」" "§1 缺不做什么：note" "§1 缺不做什么：未提示"
cp "$TMP/cap.bak" "$CAP"

python3 - "$CAP" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('## 6. 关联代码\n- `services/order/src/A.java`（入口）\n', '')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "能力契约缺 §6 关联代码" "缺 §6 关联代码：note" "缺 §6 关联代码：未提示"
cp "$TMP/cap.bak" "$CAP"

python3 - "$TOTAL" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read().replace('| app-web、svc-order |', '| svc-order |')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "能力契约消费者 <2" "消费者 <2：note" "消费者 <2：未提示"

python3 - "$TOTAL" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace('| 工作流 | `能力/工作流契约.md` | svc-order | svc-order |', '| 工作流 | `能力/工作流契约.md` | 模块/登录 | app-web、svc-order |')
open(p, 'w', encoding='utf-8').write(s)
PY
OUT=$(run "$D" check 2>&1)
assert_grep "$OUT" "能力契约主责与能力契约头部不一致" "主责不一致：note" "主责不一致：未提示"

mkdir -p "$D/doc-framework/边界"
cat > "$D/doc-framework/边界/旧边界.md" <<'EOT'
# 旧边界
<!-- boundary-schema: 2 | 能力契约 -->
## 6. 验收归属
| 主题 | 归属 |
|---|---|
| 流程 | `模块/订单/测试/验收.md` |
EOT
OUT=$(run "$D" check 2>&1)
CODE=$?
assert_grep "$OUT" "旧目录 边界/ 已废弃" "旧目录：check 点名" "旧目录：未点名"
assert_exit "$CODE" "1" "旧目录：进退出码" "旧目录：未进退出码"

MIG=$(run "$D" migrate v6 --json 2>&1)
assert_json "$MIG" "any('git mv 边界 能力' in a for b in d['capabilities'] for a in b['actions'])" \
  'migrate v6：输出目录更名动作' 'migrate v6：缺目录更名动作'
assert_json "$MIG" "any('旧契约.md' in a for b in d['capabilities'] for a in b['actions'])" \
  'migrate v6：输出文件更名动作' 'migrate v6：缺文件更名动作'
