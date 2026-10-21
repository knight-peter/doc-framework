#!/usr/bin/env bash
# 20：4.0.0 测试目录（验收 / 方案 / _测试.md）健康
#
# 覆盖：
#   27.1 schema4 契约 + 测试/验收.md + 方案.md + 接口层_测试.md 通过；
#   27.2 契约 §8 残留 SC → 点名；
#   27.3 验收表/正文失配 → 点名；
#   27.4 主题测试复制 WHEN/THEN → 点名；
#   27.5 缺 测试/验收.md → 点名；
#   27.6 主题文件未登记（孤儿）→ 点名；
#   27.7 主题文件命名不是 _测试.md → 点名；
#   27.8 方案缺 SC 覆盖 → 点名；
#   27.9 报告名缺主题/「全量」→ 点名；带主题或「全量」→ 不点名；
#   27.10 表/正文同数量不同 ID → 集合不一致；
#   27.11 计划归属=测试 → 不判非法；
#   27.12 方案 >30KB / 单主题 >40KB → 体量提示；
#   27.13 6 位短 SHA / nogit 报告名合法；
#   27.14 测试/报告 是文件 → 点名不崩溃；
#   27.15 空验收 → 报缺 SC 不误报缺文件；
#   27.16 #### 历史标题 → 点名；
#   27.17 方案 §5 未知 SC → 点名；
#   27.18 方案 §6 带 测试/ 前缀 → 不误判孤儿。
set -uo pipefail
D="$TMP/test-content-dir"
mk_project "$D"
mkdir -p "$D/doc-framework/模块/订单/测试"
cat > "$D/doc-framework/模块/订单/契约.md" <<'EOT'
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
<!-- contract-schema: 4 | 9 章；§8 指针 → 测试/验收.md；§9 生产 SQL -->
# 订单模块契约
> 模块形态：业务-CRUD ｜ 主责服务：svc-order
> **本契约拥有**：订单状态机
> **委托给**：`模块/订单/测试/验收.md`（验收场景）
> **本契约不拥有**：字段级（→ 接口.md）、变更史（→ git）
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
> 验收场景 `SC-订单-NN` 的唯一事实源：`模块/订单/测试/验收.md`。
## 9. 生产环境 SQL 执行登记
| 日期 | 所属服务 | 文件 | 影响摘要 | 状态 |
|---|---|---|---|---|
| — | — | — | 无 | — |
EOT
cat > "$D/doc-framework/模块/订单/测试/验收.md" <<'EOT'
# 订单验收场景
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
<!-- test-schema: 1 | 验收场景唯一事实源 -->
## 验收场景
| ID | 场景短名 | 关联 INV | 对应接口 |
|---|---|---|---|
| SC-订单-01 | 列表 | INV-订单-01 | `/list` |
#### Scenario: SC-订单-01 列表
- **WHEN** 请求列表
- **THEN** 返回 200
EOT
cat > "$D/doc-framework/模块/订单/测试/方案.md" <<'EOT'
# 订单测试方案
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
<!-- test-schema: 1 | 测试方案 -->
## 1. 测试目标
列表可用。
## 2. 适用层与依据
| 层 | 是否适用 |
|---|---|
| 接口层 | 适用 |
## 3. 前置条件
无。
## 4. 测试账号矩阵
| 角色 | 账号 |
|---|---|
| 管理员 | admin |
## 5. 验收场景与用例对应
| 场景 | 主题文件 | 用例 |
|---|---|---|
| SC-订单-01 | `接口层_测试.md` | T1 |
## 6. 主题索引
| 主题 | 文件 | 覆盖 SC | 执行方式 |
|---|---|---|---|
| 接口层 | `接口层_测试.md` | SC-订单-01 | 自动 |
## 7. 执行方式
- 单主题：/module-test 测试/接口层_测试.md
## 8. 报告约定
- 单主题：`测试/报告/v{date}-{sha}-接口层.md`
## 9. 验证 SQL 取值
| 项 | 取值 |
|---|---|
| 所属服务 | svc-order |
| 业务主表 | t_order |
EOT
cat > "$D/doc-framework/模块/订单/测试/接口层_测试.md" <<'EOT'
# 订单 · 接口层测试
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
<!-- test-schema: 1 | 主题测试 -->
> 覆盖 SC：SC-订单-01
> 执行：/module-test 测试/接口层_测试.md
## 1. 用例
| 用例 | 对应场景 | 执行 | 步骤与断言 |
|---|---|---|---|
| T1 | SC-订单-01 | A | 请求 `/list` ⇒ 200 |
EOT
OUT=$(run "$D" check)
assert_ngrep "$OUT" 'schema4 契约 §8 只能是指针' 'schema4 正例：§8 无 SC 不报错' 'schema4 正例：误报 §8 残留 SC'
assert_ngrep "$OUT" '测试/验收.md 索引表/正文数量不一致' 'schema4 正例：验收 1:1 不报失配' 'schema4 正例：误报验收失配'

# 27.2 契约 §8 残留 SC
cp "$D/doc-framework/模块/订单/契约.md" "$D/contract.bak"
python3 - "$D/doc-framework/模块/订单/契约.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('## 8. 测试与验证\n>', '## 8. 测试与验证\n| ID | 场景 |\n|---|---|\n| SC-订单-01 | 列表 |\n#### Scenario: SC-订单-01 列表\n- **WHEN** x\n- **THEN** y\n>')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" 'schema4 契约 §8 只能是指针' '契约 §8 残留 SC：点名' '契约 §8 残留 SC：未点名'
cp "$D/contract.bak" "$D/doc-framework/模块/订单/契约.md"

# 27.3 验收表/正文失配 + 27.4 主题复制 WHEN/THEN + 27.8 方案缺 SC
cp "$D/doc-framework/模块/订单/测试/验收.md" "$D/acc.bak"
cp "$D/doc-framework/模块/订单/测试/方案.md" "$D/plan.bak"
cp "$D/doc-framework/模块/订单/测试/接口层_测试.md" "$D/topic.bak"
python3 - "$D/doc-framework/模块/订单/测试/验收.md" "$D/doc-framework/模块/订单/测试/方案.md" "$D/doc-framework/模块/订单/测试/接口层_测试.md" <<'PY'
import sys
acc, plan, topic = sys.argv[1:4]
s=open(acc,encoding='utf-8').read()
s=s.replace('| SC-订单-01 | 列表 | INV-订单-01 | `/list` |','| SC-订单-01 | 列表 | INV-订单-01 | `/list` |\n| SC-订单-02 | 缺失正文 | INV-订单-01 | `/list` |')
open(acc,'w',encoding='utf-8').write(s)
p=open(plan,encoding='utf-8').read().replace('SC-订单-01','SC-订单-99')
open(plan,'w',encoding='utf-8').write(p)
t=open(topic,encoding='utf-8').read().replace('| T1 | SC-订单-01 | A | 请求 `/list` ⇒ 200 |','| T1 | SC-订单-01 | A | 请求 `/list` ⇒ 200 |\n- **WHEN** 请求\n- **THEN** 200')
open(topic,'w',encoding='utf-8').write(t)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/验收.md 索引表/正文数量不一致' '验收表/正文失配：点名' '验收表/正文失配：未点名'
assert_grep "$OUT" '主题测试复制了 WHEN/THEN' '主题复制 WHEN/THEN：点名' '主题复制 WHEN/THEN：未点名'
assert_grep "$OUT" '测试/方案.md §5 未覆盖' '方案缺 SC 覆盖：点名' '方案缺 SC 覆盖：未点名'
cp "$D/acc.bak" "$D/doc-framework/模块/订单/测试/验收.md"
cp "$D/plan.bak" "$D/doc-framework/模块/订单/测试/方案.md"
cp "$D/topic.bak" "$D/doc-framework/模块/订单/测试/接口层_测试.md"

# 27.5 缺 测试/验收.md
mv "$D/doc-framework/模块/订单/测试/验收.md" "$D/acc.moved"
OUT=$(run "$D" check)
assert_grep "$OUT" 'schema4 契约缺 测试/验收.md' '缺 测试/验收.md：点名' '缺 测试/验收.md：未点名'
mv "$D/acc.moved" "$D/doc-framework/模块/订单/测试/验收.md"

# 27.6 孤儿主题 + 27.7 非 _测试.md 命名
cp "$D/doc-framework/模块/订单/测试/方案.md" "$D/plan.bak2"
cp "$D/doc-framework/模块/订单/测试/接口层_测试.md" "$D/doc-framework/模块/订单/测试/孤儿_测试.md"
python3 - "$D/doc-framework/模块/订单/测试/方案.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('| 接口层 | `接口层_测试.md` | SC-订单-01 | 自动 |','| 接口层 | `接口层_测试.md` | SC-订单-01 | 自动 |\n| 孤儿 | `未登记_测试.md` | SC-订单-01 | 自动 |')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '未被测试/方案.md §6 索引（孤儿）' '孤儿主题：点名' '孤儿主题：未点名'
rm "$D/doc-framework/模块/订单/测试/孤儿_测试.md"
cp "$D/doc-framework/模块/订单/测试/接口层_测试.md" "$D/doc-framework/模块/订单/测试/接口层.md"
cp "$D/plan.bak2" "$D/doc-framework/模块/订单/测试/方案.md"
OUT=$(run "$D" check)
assert_grep "$OUT" '不是可执行主题测试（缺少 _测试.md 后缀）' '主题命名不是 _测试.md：点名' '主题命名不是 _测试.md：未点名'
rm "$D/doc-framework/模块/订单/测试/接口层.md"

# 27.9 报告命名：必须带主题或「全量」；只有日期+短SHA → 点名（note，不硬红）
REPORT_DIR="$D/doc-framework/模块/订单/测试/报告"
mkdir -p "$REPORT_DIR"
touch "$REPORT_DIR/v2026-10-21-abc1234.md"
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/报告/.*命名不符合' '报告缺主题/全量：点名' '报告缺主题/全量：未点名'
rm "$REPORT_DIR/v2026-10-21-abc1234.md"
touch "$REPORT_DIR/v2026-10-21-abc1234-接口层.md" "$REPORT_DIR/v2026-10-21-abc1234-全量.md"
OUT=$(run "$D" check)
assert_ngrep "$OUT" '测试/报告/.*命名不符合' '报告带主题/全量：不点名' '报告带主题/全量：误报'
rm -rf "$REPORT_DIR"

# 27.10 验收表/正文同数量但 ID 不同 → 集合不一致（不能只比数量）
cp "$D/doc-framework/模块/订单/测试/验收.md" "$D/acc.bak3"
python3 - "$D/doc-framework/模块/订单/测试/验收.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('#### Scenario: SC-订单-01 列表', '#### Scenario: SC-订单-02 列表')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '索引表/正文 ID 集合不一致' '验收同数量不同 ID：点名' '验收同数量不同 ID：未点名'
cp "$D/acc.bak3" "$D/doc-framework/模块/订单/测试/验收.md"

# 27.11 计划归属=测试：不得被判非法（4.0.0 新枚举）
mkdir -p "$D/doc-framework/模块/订单/计划"
cat > "$D/doc-framework/模块/订单/计划/2026-01-01-测试归属.md" <<'EOT'
# 2026-01-01 测试归属
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：待审核
> 文档影响：测试
## 1. 需求与思路
测试验收补充。
## 2. 逐应用表态
| 应用 | 表态 | 说明 |
|---|---|---|
| svc-order | 改动 | 测试验收补充 |
## 语义增量
> 合并状态：待合并
### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 | 归属 |
|---|---|---|---|---|---|
| A1 | 测试/验收.md | SC | 补一条验收 | | 测试 |
## 3. 变更文件清单
- `services/order/src/A.java`
## 4. 任务清单
- [ ] 1.1 补验收
## 7. 验收标准
| # | 验收项 | 对应契约场景 |
|---|---|---|
| 1 | 补验收 | SC-订单-01 |
EOT
OUT=$(run "$D" check)
assert_ngrep "$OUT" '语义增量「归属」值非法或缺失' '计划归属=测试：不判非法' '计划归属=测试：仍判非法'
rm -f "$D/doc-framework/模块/订单/计划/2026-01-01-测试归属.md"

# 27.12 方案 >30KB、单主题 >40KB → 体量提示
cp "$D/doc-framework/模块/订单/测试/方案.md" "$D/plan.size.bak"
python3 - "$D/doc-framework/模块/订单/测试/方案.md" <<'PY'
import sys
p=sys.argv[1]; open(p,'a',encoding='utf-8').write('\n' + 'x'*31000 + '\n')
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/方案.md 总量 .* >30KB' '方案 >30KB：点名' '方案 >30KB：未点名'
cp "$D/plan.size.bak" "$D/doc-framework/模块/订单/测试/方案.md"

cp "$D/doc-framework/模块/订单/测试/接口层_测试.md" "$D/topic.size.bak"
python3 - "$D/doc-framework/模块/订单/测试/接口层_测试.md" <<'PY'
import sys
p=sys.argv[1]; open(p,'a',encoding='utf-8').write('\n' + 'x'*41000 + '\n')
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '>40KB' '单主题 >40KB：点名' '单主题 >40KB：未点名'
cp "$D/topic.size.bak" "$D/doc-framework/模块/订单/测试/接口层_测试.md"

# 27.13 报告命名：6 位短 SHA / nogit 降级标记都合法
REPORT_DIR="$D/doc-framework/模块/订单/测试/报告"
mkdir -p "$REPORT_DIR"
touch "$REPORT_DIR/v2026-10-21-abc123-接口层.md" "$REPORT_DIR/v2026-10-21-nogit-全量.md"
OUT=$(run "$D" check)
assert_ngrep "$OUT" '测试/报告/.*命名不符合' '报告 6 位 SHA/nogit：不误报' '报告 6 位 SHA/nogit：误报'
rm -rf "$REPORT_DIR"

# 27.14 测试/报告 是文件 → 点名而不是抛栈
printf 'not a dir\n' > "$D/doc-framework/模块/订单/测试/报告"
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/报告 不是目录' '报告路径是文件：点名' '报告路径是文件：未点名'
rm -f "$D/doc-framework/模块/订单/测试/报告"

# 27.15 空验收 → 报缺 SC，不报缺文件
cp "$D/doc-framework/模块/订单/测试/验收.md" "$D/acc.empty.bak"
: > "$D/doc-framework/模块/订单/测试/验收.md"
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/验收.md 缺 SC 索引/正文' '空验收：报缺 SC' '空验收：未报缺 SC'
assert_ngrep "$OUT" 'schema4 契约缺 测试/验收.md' '空验收：不误报缺文件' '空验收：误报缺文件'
cp "$D/acc.empty.bak" "$D/doc-framework/模块/订单/测试/验收.md"

# 27.16 四级历史标题也要抓
cp "$D/doc-framework/模块/订单/测试/接口层_测试.md" "$D/topic.head.bak"
printf '\n#### 执行记录\n\nPASS\n' >> "$D/doc-framework/模块/订单/测试/接口层_测试.md"
OUT=$(run "$D" check)
assert_grep "$OUT" '主题测试出现历史/执行/缺陷类标题' '四级执行记录标题：点名' '四级执行记录标题：未点名'
cp "$D/topic.head.bak" "$D/doc-framework/模块/订单/测试/接口层_测试.md"

# 27.17 方案 §5 引用不存在的 SC → 点名
cp "$D/doc-framework/模块/订单/测试/方案.md" "$D/plan.sc.bak"
python3 - "$D/doc-framework/模块/订单/测试/方案.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('| SC-订单-01 | `接口层_测试.md` | T1 |', '| SC-订单-99 | `接口层_测试.md` | T1 |')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_grep "$OUT" '测试/方案.md §5 引用不存在的 SC' '方案 §5 未知 SC：点名' '方案 §5 未知 SC：未点名'
cp "$D/plan.sc.bak" "$D/doc-framework/模块/订单/测试/方案.md"

# 27.18 方案 §6 文件名带 测试/ 前缀 → 归一化后不误判孤儿
cp "$D/doc-framework/模块/订单/测试/方案.md" "$D/plan.path.bak"
python3 - "$D/doc-framework/模块/订单/测试/方案.md" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
s=s.replace('| 接口层 | `接口层_测试.md` | SC-订单-01 | 自动 |', '| 接口层 | `测试/接口层_测试.md` | SC-订单-01 | 自动 |')
open(p,'w',encoding='utf-8').write(s)
PY
OUT=$(run "$D" check)
assert_ngrep "$OUT" '未被测试/方案.md §6 索引（孤儿）' '方案 §6 带路径前缀：不误判孤儿' '方案 §6 带路径前缀：误判孤儿'
cp "$D/plan.path.bak" "$D/doc-framework/模块/订单/测试/方案.md"
