#!/usr/bin/env bash
# 18：契约内容健康（v4 contract-content 阶段）
#
# 覆盖：
#   26.1 v4 契约（所有权 + INV + SC 1:1）不报所有权/SC 缺失；
#   26.2 缺所有权声明 → 点名；
#   26.3 §1–§8 历史痕迹 → 点名；
#   26.4 §8.2 索引表/正文失配 → 点名；
#   26.5 audit --json 能把模块与 §7 体量输出成机器可读；
#   26.6 委托文件不存在 → 点名；
#   26.7 新契约出现 TRAP → 点名；
#   26.8 新边界出现 SC/Scenario → 点名。
set -uo pipefail
D="$TMP/contract-content"
mk_project "$D"
mkdir -p "$D/doc-framework/边界"
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
## 7. 不变量
### 7.1 不变量（必须 / 不得）
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
## 10. 生产环境 SQL 执行登记
| 日期 | 所属服务 | 文件 | 影响摘要 | 状态 |
|---|---|---|---|---|
| — | — | — | 无 | — |
EOT
OUT=$(run "$D" check)
assert_ngrep "$OUT" '缺「本契约拥有' 'v4 契约有所有权声明：不报缺失' 'v4 契约仍报缺所有权'
assert_ngrep "$OUT" '§8.2 索引表/正文数量不一致' 'v4 契约 SC 1:1：不报失配' 'v4 契约仍报 SC 失配'

# 坏契约：去所有权 + 历史痕迹 + 重复 SC ID
python3 - "$D/doc-framework/模块/订单/契约.md" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
s=s.replace('> **本契约拥有**：订单状态机\n','')
s=s.replace('> **委托给**：`边界/工作流边界.md`（流程）\n','')
s=s.replace('> **本契约不拥有**：字段级（→ 接口.md）\n','')
s=s.replace('| INV-订单-01 | 必须校验登录态 | 返回 401 | `/list` |','| INV-订单-01 | 必须校验登录态（2026-10-01 订正） | 返回 401 | `/list` |')
s=s.replace('| SC-订单-01 | 列表 | `/list` |','| SC-订单-01 | 列表 | `/list` |\n| SC-订单-01 | 重复 | `/list` |')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '缺「本契约拥有' '缺所有权声明：check 点名' '缺所有权声明：未点名'
assert_grep "$OUT" '历史痕迹' '历史痕迹：check 点名' '历史痕迹：未点名'
assert_grep "$OUT" '§8.2 ID 重复' 'SC ID 重复：check 点名' 'SC ID 重复：未点名'

# 委托文件不存在（必须有完整所有权声明，才会进入委托路径；插在 §1 前）
python3 - "$D/doc-framework/模块/订单/契约.md" <<'PY'
import sys
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
s=s.replace('## 1. 模块定位', '> **本契约拥有**：订单状态机\n> **委托给**：`边界/不存在.md`\n> **本契约不拥有**：字段级\n## 1. 模块定位', 1)
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '委托给」指向的文件不存在' '委托文件不存在：check 点名' '委托文件不存在：未点名'

# 新契约禁止 TRAP（D9）
cp "$D/doc-framework/模块/订单/契约.md" "$D/contract.bak"
python3 - "$D/doc-framework/模块/订单/契约.md" <<'PY'
import sys, re
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
s=re.sub(r'(\| INV-订单-01 \|[^\n]*\n)', r'\1| TRAP-订单-01 | 首帧为空 | 异步 | 等待 |\n', s, count=1)
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '新契约出现 TRAP' '新契约 TRAP：check 点名' '新契约 TRAP：未点名'
cp "$D/contract.bak" "$D/doc-framework/模块/订单/契约.md"

# 新边界禁止 SC/Scenario（D5）
cat > "$D/doc-framework/边界/坏边界.md" <<'EOT'
# 坏边界
<!-- boundary-schema: 2 | 能力契约 -->
## 6. 验收归属
| ID | 场景短名 |
|---|---|
| SC-坏-01 | 通过 |
#### Scenario: SC-坏-01 通过
- **WHEN** x
- **THEN** y
EOT
OUT=$(run "$D" check)
assert_grep "$OUT" '边界出现 §6 验收场景' '边界 Scenario：check 点名' '边界 Scenario：未点名'
assert_grep "$OUT" '边界出现 SC 表/正文' '边界 SC：check 点名' '边界 SC：未点名'
rm "$D/doc-framework/边界/坏边界.md"

# 文档影响=无契约变更，但仍有非“不写契约”增量 → 硬报错
mkdir -p "$D/doc-framework/模块/订单/计划"
cat > "$D/doc-framework/模块/订单/计划/2026-01-03-无变更.md" <<'EOT'
# 2026-01-03 无变更测试
<!-- doc-framework:docstruct 3.1.1 | 文档结构版本 -->
> 计划形态：完整
> 状态：已批准
> 文档影响：无契约变更（仅样式）
> 依据模块契约：`模块/订单/契约.md`
## 1. 需求与思路
仅样式。
## 2. 逐应用表态
| 应用 | 表态 | 说明 |
|---|---|---|
| app-web | 改动 | 样式 |
## 语义增量
> 合并状态：待合并
### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 | 归属 |
|---|---|---|---|---|---|
| A1 | 契约 §7 | 不变量 | 新增 | | 模块契约 |
## 3. 变更文件清单
- `app-web/src/a.css`
## 4. 任务清单
- [ ] 改样式
EOT
OUT=$(run "$D" check)
assert_grep "$OUT" '文档影响=无契约变更，但仍有' '文档影响/增量不一致：check 点名' '文档影响/增量不一致：未点名'
rm "$D/doc-framework/模块/订单/计划/2026-01-03-无变更.md"

# audit 机器可读
JSON=$(run "$D" audit --json)
assert_json "$JSON" "any(m['module']=='订单' and m['s7Bytes']>0 for m in d['modules'])" 'audit --json：输出模块与 §7 体量' 'audit --json：缺模块/体量'

# migrate v4 只读报告：动作清单可机器读，且不写文件
filehash() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}
BEFORE=$(filehash "$D/doc-framework/模块/订单/契约.md")
MIG=$(run "$D" migrate v4 --json)
AFTER=$(filehash "$D/doc-framework/模块/订单/契约.md")
assert_json "$MIG" "any(m['module']=='订单' and m['actions'] for m in d['modules'])" 'migrate v4 --json：输出动作清单' 'migrate v4 --json：缺动作'
[ "$BEFORE" = "$AFTER" ] && ok "migrate v4：只读（契约未变）" || bad "migrate v4：不应写文件"
