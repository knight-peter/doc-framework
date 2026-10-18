# 05：解析稳健性与闸门口径 + 探索记录生命周期
#
#  14. 解析稳健性与闸门口径：无反引号的「依据模块契约」不误判首次建模 / 计划放进计划目录子目录
#      不可绕过 I2 / 加粗字段名（**状态**：）可解析 / 单段路径（package.json）进白名单 /
#      diff-check 缺状态硬报错 / --staged 不并入未跟踪文件 / 首次建模缺「计划形态」行按非完整硬报错 /
#      建档兜底要求增量非空 / 标「已合并」但契约缺失硬报错 / 主计划列 n/a 视为空 /
#      list --state 中文枚举 / 中文占位符残留 / 应用类型中英词表取并集 / 已废弃计划的 I4 出口提示 /
#      混排目录布局（modules/…/plans/）不得成为盲区 /
#      嵌套目录**非日期前缀**的计划按 `isPlanLike` 纳入 I2（改名不能绕过）/
#      表态按**表头列**定位 + 精确枚举（`无需改动` 不得被判成「改动」；未知值 check/diff-check 硬报）
#      头部字段只读文件头前 30 行（正文「状态/计划形态」不参与）；无「计划形态」行的旧计划缺节只 ℹ️
#  21. 探索记录生命周期：`list --explore` 聚合 探索/（探索中+已定案）与 探索/归档/（已使用+已作废），
#      解析头部 状态/结论去向/已被 三行；--state 过滤（只认四个中文枚举，无别名）；
#      与计划过滤选项互斥报错；--json 输出 experimental 结构

# ── 13.18-13.30：代码审查加固（解析稳健性 / 枚举兜底 / 闸门口径）──
R="$TMP/review"; mk_project "$R"
mkdir -p "$R/services/order/src" "$R/doc-framework/模块/订单/计划" "$R/doc-framework/探索"
echo x > "$R/services/order/src/A.java"
echo "# 订单契约" > "$R/doc-framework/模块/订单/契约.md"
echo "# 探索" > "$R/doc-framework/探索/2025-04-01-新模块.md"
( cd "$R" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1

# 13.18 未加反引号的「依据模块契约」不得被误判成"首次建模计划"（否则连锁误报 3 条 ❌）
cat > "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md" <<'EOF'
# 2025-04-02 无引号引用

> 依据模块契约：doc-framework/模块/订单/契约.md
> 计划形态：完整
> 状态：已批准

## 2. 逐应用表态

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 服务端实现 |
| app-web | 本次不改 | 无端侧改动 |


## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
run "$R" check >/dev/null 2>&1 && ok "无反引号的「依据模块契约」正常识别（不再误判首次建模）"  || { bad "无反引号引用被误判为首次建模"; run "$R" check | sed 's/^/     /'; }

# 13.19 计划放进计划目录的自建子目录（计划/done/）不得绕过体检与 I2
mkdir -p "$R/doc-framework/模块/订单/计划/done"
sed 's/> 状态：已批准/> 状态：已完成/; s/> 合并状态：待合并/> 合并状态：待合并/'  "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md" > "$R/doc-framework/模块/订单/计划/done/2025-04-03-子目录计划.md"
rm -f "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md"
grep -q "语义增量未合并" <<< "$(run "$R" check 2>&1)"  && ok "子目录里的计划仍纳入体检（I2 不可用子目录绕过）" || bad "子目录计划逃过 I2 体检"
rm -rf "$R/doc-framework/模块/订单/计划/done"

# 13.19b 嵌套目录 + **非日期前缀** 的已完成计划也不得绕过 I2（不能用改文件名绕过唯一硬校验）
#       同时：同目录里的随手笔记不得被当成计划报错（isPlanLike 只认计划结构）。
mkdir -p "$R/doc-framework/模块/订单/计划/杂项"
cat > "$R/doc-framework/模块/订单/计划/杂项/未合并报告.md" <<'EOF'
# 未合并报告

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | int | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
printf '# 杂项\n\n今天讨论导出功能，不是计划。\n' > "$R/doc-framework/模块/订单/计划/杂项/随手笔记.md"
NESTED_OUT=$(run "$R" check 2>&1)
assert_grep "$NESTED_OUT" "语义增量未合并" "嵌套非日期前缀计划纳入体检（I2 不可用改名绕过）" "嵌套非日期计划逃过 I2 体检"
assert_grep "$NESTED_OUT" "未合并报告" "嵌套非日期计划被点名报出" "嵌套非日期计划未被点名"
assert_ngrep "$NESTED_OUT" "随手笔记" "非计划笔记不被当成计划报错（isPlanLike 只认计划结构）" "随手笔记被误当成计划"
assert_grep "$(run "$R" list --all 2>&1)" "未合并报告" "嵌套非日期计划进入 list（不再静默不可见）" "嵌套非日期计划在 list 中不可见"
rm -rf "$R/doc-framework/模块/订单/计划/杂项"

# 13.19c 表态按**表头列**定位：列序 `应用 | 说明 | 表态` 时，`本次不改` 不得被读成「改动」。
#       旧实现写死 cells[1] 且用 includes('改动') → `无端侧改动` 被当成改动，diff-check 放行越界。
S="$TMP/stance-order"; mk_project "$S"
echo "# 订单契约" > "$S/doc-framework/模块/订单/契约.md"
mkdir -p "$S/services/order/src"
cat > "$S/doc-framework/模块/订单/计划/2025-07-01-列序.md" <<'EOF'
# 2025-07-01 列序

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已批准

## 2. 逐应用表态

| 应用 | 说明 | 表态 |
|------|------|------|
| svc-order | 服务端实现 | 改动 |
| app-web | 无端侧改动 | 本次不改 |

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | int | |

## 3. 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| svc-order | services/order/src/A.java | 主责 |
EOF
( cd "$S" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
run "$S" check >/dev/null 2>&1 && ok "表态列序：check 通过（按表头定位表态列）" || { bad "表态列序：check 失败"; run "$S" check | sed 's/^/     /'; }
echo x > "$S/apps/web/forbidden.js"
DIFF_ORDER=$(run "$S" diff-check doc-framework/模块/订单/计划/2025-07-01-列序.md 2>&1); CODE_ORDER=$?
assert_exit "$CODE_ORDER" "1" "表态列序：本次不改的应用被改 → diff-check 拦截" "表态列序：本次不改被放行（反向授权）"
assert_grep "$DIFF_ORDER" "本次不改" "表态列序：拦截文案点名本次不改" "表态列序：拦截文案未点名"

# 13.19d 否定写法不授权：`无需改动` 旧实现被子串命中成「改动」；归一化后必须是 unknown + 硬报。
S2="$TMP/stance-neg"; mk_project "$S2"
echo "# 订单契约" > "$S2/doc-framework/模块/订单/契约.md"
cat > "$S2/doc-framework/模块/订单/计划/2025-07-02-否定.md" <<'EOF'
# 2025-07-02 否定

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已批准

## 2. 逐应用表态

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 服务端 |
| app-web | 无需改动 | 明确不用改 |

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | int | |

## 3. 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
( cd "$S2" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
NEG_OUT=$(run "$S2" check 2>&1); NEG_CODE=$?
assert_exit "$NEG_CODE" "1" "否定表态 `无需改动`：check 硬报（不再当成改动）" "否定表态被当成改动放行"
assert_grep "$NEG_OUT" "表态值无法识别" "否定表态：check 点名「表态值无法识别」" "否定表态未点名"
NEG_DIFF=$(run "$S2" diff-check doc-framework/模块/订单/计划/2025-07-02-否定.md 2>&1); NEG_DIFF_CODE=$?
assert_exit "$NEG_DIFF_CODE" "1" "否定表态：diff-check 拒绝授权" "否定表态被 diff-check 放行"
assert_grep "$NEG_DIFF" "无法识别的表态值" "否定表态：diff-check 文案正确" "否定表态：diff-check 文案缺失"
NEG_JSON=$(run "$S2" show doc-framework/模块/订单/计划/2025-07-02-否定.md --json 2>/dev/null)
assert_json "$NEG_JSON" "next(s for s in d['stances'] if s['app']=='app-web')['stance']=='未识别'" "否定表态：show 显示未识别" "否定表态：show 仍显示改动"

# 13.19e 头部字段只读文件头：正文里的「状态 / 计划形态」不能改写计划
#       旧实现的状态正则带一个全局 fallback，正文一句「状态：已完成」就能把计划状态改掉；
#       计划形态正则也是全文匹配，正文写「计划形态：轻量」会把完整计划误判成轻量。
H="$TMP/header-only"; mk_project "$H"
echo "# 订单契约" > "$H/doc-framework/模块/订单/契约.md"
cat > "$H/doc-framework/模块/订单/计划/2025-08-01-旧格式.md" <<'EOF'
# 2025-08-01 旧格式

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 状态：已批准

## 1. 需求与思路

正文里随手一句：计划形态：轻量

## 3. 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
H_JSON=$(run "$H" show doc-framework/模块/订单/计划/2025-08-01-旧格式.md --json 2>/dev/null)
assert_json "$H_JSON" "d['shape'] is None and d['hasShapeLine'] is False" "头部字段：正文「计划形态：轻量」不改计划形态" "正文计划形态污染了头部解析"
H_OUT=$(run "$H" check 2>&1); H_CODE=$?
assert_exit "$H_CODE" "0" "旧格式计划（无「计划形态」行）：缺增量/表态只提示，不刷红" "旧格式计划被升级刷红（exit=$H_CODE）"
assert_grep "$H_OUT" "旧格式计划" "旧格式计划：给出 ℹ️ 迁移提示" "旧格式计划：未给迁移提示"

H2="$TMP/header-state"; mk_project "$H2"
echo "# 订单契约" > "$H2/doc-framework/模块/订单/契约.md"
cat > "$H2/doc-framework/模块/订单/计划/2025-08-02-正文状态.md" <<'EOF'
# 2025-08-02 正文状态

> 依据模块契约：`doc-framework/模块/订单/契约.md`

## 1. 需求与思路

正文里随手一句：状态：已完成

## 3. 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
H2_JSON=$(run "$H2" show doc-framework/模块/订单/计划/2025-08-02-正文状态.md --json 2>/dev/null)
assert_json "$H2_JSON" "d['state'] is None" "头部字段：正文「状态：已完成」不算计划状态" "正文状态改写了计划状态"

# 13.20 加粗字段名（> **状态**：/ > **合并状态**：）必须能解析
cat > "$R/doc-framework/模块/订单/计划/2025-04-04-加粗字段.md" <<'EOF'
# 2025-04-04 加粗字段

> **依据模块契约**：`doc-framework/模块/订单/契约.md`
> **计划形态**：完整
> **状态**：已批准

## 语义增量（delta）

> **合并状态**：已合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
| package.json | 单段路径 |
EOF
BOLD=$(run "$R" show doc-framework/模块/订单/计划/2025-04-04-加粗字段.md --json 2>/dev/null)
assert_json "$BOLD" "d['state']=='已批准' and d['mergeState']=='已合并'" "加粗字段名可解析（状态 / 合并状态）" "加粗字段名解析不到（state/mergeState 为空）"
# 13.21 单段路径（package.json）必须进白名单（应用代码根为 . 时会自相矛盾）
assert_json "$BOLD" "'package.json' in d['fileList']" "单段路径进变更文件清单（package.json）" "单段路径被静默丢弃"
rm -f "$R/doc-framework/模块/订单/计划/2025-04-04-加粗字段.md"

# 13.22 diff-check：计划缺状态字段 → 必须硬报错（提交前闸门不能放行）
cat > "$R/doc-framework/模块/订单/计划/2025-04-05-无状态.md" <<'EOF'
# 2025-04-05 无状态

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
NO_STATE=$(run "$R" diff-check doc-framework/模块/订单/计划/2025-04-05-无状态.md 2>&1); NS_CODE=$?
if [ "$NS_CODE" = "1" ] && grep -q "未解析到状态字段" <<< "$NO_STATE"; then
  ok "diff-check：计划缺状态 → 硬报错（不再 ⚠️ 放行）"
else
  bad "diff-check 放行了缺状态的计划（exit=$NS_CODE）"
fi
rm -f "$R/doc-framework/模块/订单/计划/2025-04-05-无状态.md"

# 13.23 --staged 只有"将要提交的内容"：未跟踪（未 git add）的新文件不得卡住 pre-commit
cat > "$R/doc-framework/模块/订单/计划/2025-04-06-staged口径.md" <<'EOF'
# 2025-04-06 staged 口径

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已批准

## 逐应用表态
| 应用 | 表态 | 说明 |
|------|------|------|
| app-web | 改动 | 只改 web |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| apps/web/untracked-new.js | 未 add 的新文件 |
EOF
echo x > "$R/apps/web/untracked-new.js"          # 未跟踪、未 stage
run "$R" diff-check doc-framework/模块/订单/计划/2025-04-06-staged口径.md --staged >/dev/null 2>&1  && ok "--staged 只检查已暂存内容（未跟踪文件不参与）" || bad "--staged 仍并入未跟踪文件"
rm -f "$R/apps/web/untracked-new.js" "$R/doc-framework/模块/订单/计划/2025-04-06-staged口径.md"

# 13.24 首次建模计划缺「计划形态」行（shape=null）→ 必须按"非完整"硬报错
mkdir -p "$R/doc-framework/模块/查询/计划"
cat > "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md" <<'EOF'
# 2025-04-07 无形态

> 依据探索记录：`doc-framework/探索/2025-04-01-新模块.md`
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 查询主表 | 字段 x | tinyint(1) | |

## 建模补充

### M1 边界

x

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/New.java | 新文件 |
EOF
grep -q "必须是「完整」形态" <<< "$(run "$R" check 2>&1)"  && ok "首次建模缺「计划形态」行 → 按非完整硬报错" || bad "首次建模 shape=null 被静默放行"

# 13.25 空增量的首次建模计划：只提示"该标无需合并"，不再重复报「已实施但未建档」
sed 's/> 状态：已批准/> 计划形态：完整\n> 状态：已完成/; /^| A1 |/d'  "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md" > "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md"
if grep -q "已实施但未建档" <<< "$(run "$R" check 2>&1)"; then
  bad "空增量的首次建模计划重复报「已实施但未建档」（根因应与 I2 合并）"
else
  ok "建档兜底要求增量非空（空增量不重复报未建档）"
fi

# 13.26 标「合并状态=已合并」但契约不存在 → 落账无据，必须硬报错
sed 's/> 合并状态：待合并/> 合并状态：已合并/' "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md" > "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
# 补一条非空增量行（"已合并却无契约"只在增量非空时才成立）
python3 - "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding='utf-8')
s = s.replace('|---|----------|------|------|--------|\n',
              '|---|----------|------|------|--------|\n| A1 | 契约 §3.1 查询主表 | 字段 x | tinyint(1) | |\n')
p.write_text(s, encoding='utf-8')
PY
grep -q "落账无据" <<< "$(run "$R" check 2>&1)"  && ok "首次建模计划标「已合并」但契约缺失 → 硬报错（假合并）" || bad "假合并（已合并但无契约）被放行"
rm -rf "$R/doc-framework/模块/查询"

# 13.27 主计划列写英文空标记（n/a）视为"未回指" → I3 生效
mkdir -p "$R/doc-framework/模块/结算/计划"; echo "# 结算契约" > "$R/doc-framework/模块/结算/契约.md"
for n in 11 12; do
  cat > "$R/doc-framework/模块/结算/计划/2025-04-${n}-拆分.md" <<EOF
# 2025-04-${n} 拆分

> 依据模块契约：\`doc-framework/模块/结算/契约.md\`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 结算主表 | 字段 x | tinyint(1) | n/a |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
done
grep -q "未回指主计划" <<< "$(run "$R" check 2>&1)"  && ok "主计划列 n/a 视为空 → I3 生效（英文模式不漏判）" || bad "主计划列 n/a 被当成真实回指（I3 漏判）"
rm -rf "$R/doc-framework/模块/结算"

# 13.28 list --state 用中文枚举（唯一枚举集）
run "$R" list --state 已批准 >/dev/null 2>&1  && ok "list --state 接受中文枚举" || bad "list --state 不认中文枚举"
# 13.29 占位符残留：中文模式只报含中日韩字符的（避免误报英文代码片段里的 `{...}`）——
#       标识符式 `{AppName}` 在中文模式下**有意不报**
cp "$R/doc-framework/规范/应用-app-web.md" "$TMP/app-web.bak"
printf '# 应用规范\n\n{应用名称} 的页面结构\n' > "$R/doc-framework/规范/应用-app-web.md"
grep -q "占位符未渲染" <<< "$(run "$R" check 2>&1)"  && ok "占位符残留：中文占位符被报出" || bad "中文占位符静默通过"
cp "$TMP/app-web.bak" "$R/doc-framework/规范/应用-app-web.md"

# 13.30 应用类型关键词：中文登记值触发类型层规范校验；英文关键词已随别名移除（不再识别）
RT="$TMP/type-cn"; mk_project "$RT"
rm -f "$RT/doc-framework/规范/类型-前端.md"
grep -q "类型-前端" <<< "$(run "$RT" check 2>&1)"  && ok "应用类型：中文登记（前端应用）触发类型层规范校验" || bad "中文应用类型漏校验"
AT=$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write([p.appTypeMatches('前端应用','front'),p.appTypeMatches('frontend','front')].join(','))" 2>&1)
[ "$AT" = "true,false" ] && ok "应用类型关键词：英文 frontend 不再识别（别名已移除）" || bad "应用类型关键词残留英文识别：$AT"


# 13.31 已废弃计划：不再体检，但 I4 的「废弃出口」要提示（否则增量永远挂在"待合并"）
mkdir -p "$R/doc-framework/模块/退货/计划"; echo "# 退货契约" > "$R/doc-framework/模块/退货/契约.md"
cat > "$R/doc-framework/模块/退货/计划/2025-06-01-废弃未标出口.md" <<'EOF'
# 2025-06-01 废弃未标出口

> 依据模块契约：`doc-framework/模块/退货/契约.md`
> 计划形态：完整
> 状态：已废弃

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 退货主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
OUT31=$(run "$R" check 2>&1); CODE31=$?
if [ "$CODE31" = "0" ] && grep -q "已废弃计划建议把「合并状态」标为 无需合并" <<< "$OUT31"; then
  ok "已废弃计划提示「废弃出口」（ℹ️，不影响退出码）"
else
  bad "已废弃计划的 I4 出口未提示（exit=$CODE31）"
fi
sed -i.bak 's/> 合并状态：待合并/> 合并状态：无需合并/' "$R/doc-framework/模块/退货/计划/2025-06-01-废弃未标出口.md"
rm -f "$R"/doc-framework/模块/退货/计划/*.bak
assert_ngrep "$(run "$R" check 2>&1)" "已废弃计划建议" "废弃计划标 无需合并 后不再提示" "标无需合并后仍提示废弃出口"
rm -rf "$R/doc-framework/模块/退货"

# 13.32 list --explore：聚合 探索/ + 探索/归档/，头部三行解析，--state/别名/互斥/--json
# 注：$R 在 13.18 段已有一头部无状态的 2025-04-01-新模块.md（state=未知也照常列出），
#     故本段全程计数 = 4（新建）+ 1（旧档）= 5。
mkdir -p "$R/doc-framework/探索/归档"
cat > "$R/doc-framework/探索/2025-06-01-导出方案.md" <<'EOF'
# 2025-06-01 导出方案

> 状态：探索中
> 结论去向：无
> 涉及应用：svc-order
> 交接：无

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/2025-06-02-权限模型v2.md" <<'EOF'
# 2025-06-02 权限模型v2

> 状态：已定案
> 结论去向：已立项→doc-framework/模块/权限/计划/2025-06-03-权限.md
> 涉及应用：svc-order
> 交接：/module-plan 权限

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/归档/2025-05-01-权限模型.md" <<'EOF'
# 2025-05-01 权限模型

> 状态：已废弃
> 已被：2025-06-02-权限模型v2.md（岗位模型取代角色模型）
> 结论去向：无
> 涉及应用：svc-order
> 交接：无

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/归档/2025-05-02-旧导出.md" <<'EOF'
# 2025-05-02 旧导出

> 状态：已使用
> 结论去向：已立项→doc-framework/模块/订单/计划/2025-05-03-导出.md
> 涉及应用：svc-order
> 交接：/module-plan 订单

## 1. 背景与问题
x
EOF
OUT_E=$(run "$R" list --explore 2>&1)
grep -q "2025-06-02-权限模型v2" <<< "$OUT_E" && grep -q "进行中" <<< "$OUT_E"  && ok "list --explore：已定案在根目录显示为进行中" || bad "list --explore：漏列/位置错（已定案）"
grep -q "已被 2025-06-02-权限模型v2.md" <<< "$OUT_E"  && ok "list --explore：已废弃(旧枚举)归一为已作废并显示 已被" || bad "list --explore：旧枚举 已废弃 未按别名识别"
grep -q "共 5 份探索记录" <<< "$OUT_E"  && ok "list --explore：两侧目录并集计数正确（含无状态旧档）" || bad "list --explore：计数错误"
grep -q "未知" <<< "$OUT_E"  && ok "list --explore：无状态头的旧记录显示 未知（降级不崩溃）" || bad "list --explore：旧记录未降级为 未知"
run "$R" list --explore --state 已定案 2>/dev/null | grep -q "权限模型v2"  && ! run "$R" list --explore --state 已定案 2>/dev/null | grep -q "导出方案"  && ok "list --explore --state 过滤生效" || bad "list --explore --state 过滤失效"
run "$R" list --explore --state 已废弃 >/dev/null 2>&1 && bad "list --explore 仍接受旧枚举 已废弃（别名应已删除）" || ok "list --explore 拒绝旧枚举 已废弃（命名只一套，无别名）"
run "$R" list --explore --module 订单 >/dev/null 2>&1 && bad "list --explore 与计划选项同用未报错"  || ok "list --explore 与计划选项互斥报错"
run "$R" list --explore --state 已完成 >/dev/null 2>&1 && bad "list --explore 未知状态未报错"  || ok "list --explore 未知状态报错"
EJSON=$(run "$R" list --explore --json 2>/dev/null)
assert_json "$EJSON" "d.get('experimental') is True and any(r.get('archived') for r in d['explorations'])" "list --explore --json 输出 experimental 结构（含 archived）" "list --explore --json 结构缺失"
rm -rf "$R/doc-framework/探索"
