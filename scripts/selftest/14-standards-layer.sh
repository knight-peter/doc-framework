# 13：规范层归属判据
#
#  24. 规范层归属判据：**变更痕迹**（标题版本标记 / 日期+动词 / 来源= / 已作废——
#      反误报：裸日期与 `YYYY-MM-DD-*.md` 文件引用不报；只扫 规范/ 与 边界/，探索·计划不扫）/
#      **跨应用同题**（小节标题剥离尾部括注组归一后出现在 ≥2 份应用规范 → 提示上移 边界/）/
#      小节越界（单节 >80 行 / 小节数 >8 → 建议分册）/ **索引↔分册一致**（指向不存在 → 恒 ⚠️；
#      未被索引 → ℹ️）

# ── 24：规范层归属判据 ──
SD2="$TMP/stdlayer"; mk_project "$SD2"
SP1="$SD2/doc-framework/规范/应用-app-web.md"
SP2="$SD2/doc-framework/规范/应用-svc-order.md"
cat >> "$SP1" <<'EOF'
## 3. 栈特有约定
### 3.7 共享 UI 原语（v1.1 新增）
- 某约定（2026-10-09 修正，来源=实现）；该写法已作废；
- 引用 `doc/2026-07-08-页面目录分层规范.md`（文件引用，不报）；自 2026-10-01 起生效（裸日期，不报）。
### 3.1 主题与适老化（本应用核心约定）
- x
EOF
printf '## 3. 栈特有约定\n\n### 3.1 主题与适老化\n\n- y\n' >> "$SP2"
OUT_Z1=$(run "$SD2" check 2>&1); CODE_Z1=$?
assert_grep "$OUT_Z1" "规范层疑似变更痕迹" "规范层：变更痕迹（版本标记/日期+动词/来源=/已作废）被报出" "规范层：变更痕迹未报出"
assert_grep "$OUT_Z1" "跨应用共享主题「主题与适老化」" "规范层：跨应用同题（剥离括注后同题）→ 提示上移边界" "规范层：跨应用同题未报出"
CNT_Z1=$(printf '%s' "$OUT_Z1" | grep -c "正文含日期痕迹")
assert_exit "$CNT_Z1" "1" "规范层：日期痕迹按文件聚合（文件引用/裸日期未误报）" "规范层：日期痕迹计数异常（${CNT_Z1}）——文件引用或裸日期被误报"
assert_exit "$CODE_Z1" "0" "规范层：默认 ℹ️ 不进退出码" "规范层：默认级别影响退出码（exit=${CODE_Z1}）"
# 24.1 单节 >80 行 → 建议分册；小节数未越界不报
{ echo; echo "### 3.9 超长主题"; for i in $(seq 1 90); do echo "- 行 $i"; done; } >> "$SP1"
OUT_Z2=$(run "$SD2" check 2>&1)
assert_grep "$OUT_Z2" "（>80）" "规范层：单节 >80 行 → 建议分册" "规范层：单节行数越界未报出"
assert_ngrep "$OUT_Z2" "个 ### 小节" "规范层：小节数未越界不报" "规范层：小节数误报"
# 24.2 小节数 >8 → 建议分册
for n in 2 3 4 5 6 7 8 9 10; do printf '### 3.%s 主题%s\n- x\n' "$n" "$n" >> "$SP2"; done
OUT_Z3=$(run "$SD2" check 2>&1)
assert_grep "$OUT_Z3" "个 ### 小节（>8）" "规范层：小节数 >8 → 建议分册" "规范层：小节数越界未报出"
# 24.3 索引 ↔ 分册：指向不存在 → 恒 ⚠️；未被索引 → ℹ️
printf '\n- 主题索引：`规范/app-web-埋点.md`\n' >> "$SP1"
echo "# 构建" > "$SD2/doc-framework/规范/app-web-构建.md"
OUT_Z4=$(run "$SD2" check 2>&1); CODE_Z4=$?
assert_grep "$OUT_Z4" "主题索引指向不存在的分册" "规范层：索引断链 → ⚠️" "规范层：断链索引未报出"
assert_grep "$OUT_Z4" "未被应用规范 §3 主题索引收录" "规范层：存在分册但未被索引 → ℹ️" "规范层：未索引分册未提示"
assert_exit "$CODE_Z4" "1" "规范层：索引断链恒 ⚠️ 进退出码" "规范层：索引断链未进退出码（exit=${CODE_Z4}）"
# 24.4 扫描范围：边界/ 纳入；探索/ 不扫（头部日期合法）
printf '# 边界\n\n（2026-10-09 修正，来源=实现）\n' > "$SD2/doc-framework/边界/工作流边界.md"
mkdir -p "$SD2/doc-framework/探索"
printf '# 探索\n\n（2026-10-09 修正，来源=实现）\n' > "$SD2/doc-framework/探索/2026-10-09-x.md"
OUT_Z5=$(run "$SD2" check 2>&1)
assert_grep "$OUT_Z5" "边界/工作流边界.md（正文含日期痕迹" "规范层：边界文档纳入扫描" "规范层：边界文档漏扫"
assert_ngrep "$OUT_Z5" "探索/2026-10-09-x.md" "规范层：探索记录不扫（头部日期合法）" "规范层：探索记录被误扫"
# 24.5 单份应用规范出现同题不触发"跨应用"（判据 c 要求 ≥2 份）
SD3="$TMP/stdsingle"; mk_project "$SD3"
printf '## 3. 栈特有约定\n\n### 3.1 主题与适老化\n\n- x\n' >> "$SD3/doc-framework/规范/应用-app-web.md"
OUT_Z6=$(run "$SD3" check 2>&1)
assert_ngrep "$OUT_Z6" "跨应用共享主题" "规范层：单份应用规范的同题不触发跨应用判据" "规范层：单份同题误报"
# 24.6 模板自洽：渲染产物（契约 §9 指针 + 边界无 §5 + 应用规范索引化 + 分册 JOB）过真实 check，
#      不得触发规范层判据（模板必须满足它自己教的规则——否则新项目第一天就是红的）
TT2="$TMP/tpl-std"; python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$TT2" >/dev/null 2>&1
OUT_T2=$(run "$TT2" check 2>&1)
assert_ngrep "$OUT_T2" "主题索引指向不存在的分册" "模板自洽：渲染出的索引与分册一一对应（无断链 ⚠️）" "模板自洽：渲染产物索引断链（分册 JOB 缺失或索引引用错误）"
assert_ngrep "$OUT_T2" "未被应用规范 §3 主题索引收录" "模板自洽：分册均被索引" "模板自洽：分册未被索引"
assert_ngrep "$OUT_T2" "规范层疑似变更痕迹" "模板自洽：规范层模板不含变更痕迹（四不写自洽）" "模板自洽：模板自身含变更痕迹（四不写不自洽）"
assert_grep "$(cat "$TT2/doc-framework/模块/order/契约.md")" "本模块的变更历史不在本文件" "模板自洽：契约 §9 为指针形态" "模板自洽：契约 §9 未换成指针形态"
assert_ngrep "$(cat "$TT2/doc-framework/边界/工作流边界.md")" "## 5. 变更记录" "模板自洽：边界模板无 §5 变更记录" "模板自洽：边界模板仍含 §5 变更记录"
assert_ngrep "$(cat "$TT2/doc-framework/规范/应用-app-web.md")" "技术栈特有检查项" "模板自洽：应用规范 §6 已删除" "模板自洽：应用规范仍含 §6"
# 24.7 trailer 单一来源守卫：plan.TRAILERS 常量与 AGENTS 永久段一致（AGENTS 是给人读的权威源，各 SKILL.md 引用不复述）
UNIT24=$("$NODE_BIN" -e '
const p=require(process.argv[1]);const fs=require("fs");
const t=fs.readFileSync(process.argv[2],"utf-8");
const ok=[p.TRAILERS.module,p.TRAILERS.plan,p.TRAILERS.contract,p.TRAILER_NO_CHANGE].every(k=>t.includes(k));
process.stdout.write(String(ok && t.includes("模块:{模块名}") && t.includes("计划:{计划标识}") && t.includes("契约:无需变更")));
' "$ROOT/scripts/lib/plan.js" "$ROOT/templates/AGENTS.md.tpl" 2>&1)
[ "$UNIT24" = "true" ] && ok "trailer 单一来源：常量与 AGENTS 永久段一致" || bad "trailer 单一来源漂移：$UNIT24"
# 24.8 文本守卫：module-doc §3.1 第 5 步的回写范围是枚举清单（含 边界/、排除应用规范、不得出现"全部下游文档"）
MDOC="$ROOT/skills/module-doc/SKILL.md"
grep -q "枚举清单" "$MDOC" && grep -q "边界/" "$MDOC" && ok "文本守卫：module-doc 回写范围为枚举清单（含 边界/）" || bad "文本守卫：回写范围未枚举化"
grep -q "全部下游文档" "$MDOC" && bad "文本守卫：回写范围回归为「全部下游文档」（应用规范无界膨胀的根因复活）" || ok "文本守卫：「全部下游文档」表述已清除"
grep -q "不含应用规范" "$MDOC" && ok "文本守卫：枚举清单明确排除应用规范" || bad "文本守卫：枚举清单未排除应用规范"
# 24.9 六个 SKILL.md + **用户可见文案（cli.js / plan.js）** 不得要求向契约 §9 追加行（留痕归 git trailer）
#      扫描范围含 cli.js：`check --draft-contract` 打印的"合并/建档九步"是**直接给人/AI 读的流程指令**，
#      死引用会主动误导。
#      模式只抓**祈使式**（"§9 记「…」""§9 追加…"）；叙述 / 说明性写法不在守卫范围。
for f in "$ROOT"/skills/*/SKILL.md "$ROOT"/scripts/*.js "$ROOT"/scripts/*/*.js; do
  grep -q "§9 追加\|§9 记一行\|§9 记「\|契约 §9 一行\|§9 变更记录追加\|写入 §9\|记入 §9" "$f" && bad "§9 记账残留：${f#$ROOT/} 仍要求向契约 §9 追加行" || ok "§9 记账动作已从 ${f#$ROOT/} 清除"
done
# 24.10 templates / skills 不得出现「§9 记账 / §9 回链凭据 / §9 只记结论」类表述——
#       留痕归 git trailer；模板里的死引用会**随每个新项目初始化传播错误指引**
#       （合法表述：「§9 不再追加任何行」「§9 只剩指针」「不在契约 §9」——不匹配下列模式）
DEAD9=""
for f in $(find "$ROOT/templates" -name '*.tpl') "$ROOT"/skills/*/SKILL.md; do
  # `§9 才是长期真相` 属死引用：§9 只是指针节，长期真相是登记表本身
  grep -qE "契约 §9 记|契约 §9 登记|§9 的回链凭据|§9 回链凭据|§9 只记结论|§9 才是长期真相|§9 才是真相" "$f" && DEAD9="$DEAD9 ${f#$ROOT/}"
done
[ -z "$DEAD9" ] && ok "P0 防回归：templates/skills 无 §9 记账类死引用" || bad "§9 记账类死引用残留：$DEAD9"
# 24.11 description 长度守卫：frontmatter description **每会话常驻**，不得膨胀成"正文缩微版"
#       （框架硬规则是「仅 /命令 显式触发」，description 只回答"干什么 + 关键边界 + 怎么触发"；机制细节归正文）
DESC_BAD=""
for f in "$ROOT"/skills/*/SKILL.md; do
  sk=$(basename "$(dirname "$f")")
  n=$(python3 -c "
import re, sys
t = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'^description: (.*)\$', t, re.M)
print(len(m.group(1)) if m else 0)
" "$f")
  lim=400; [ "$sk" = "module-plan" ] && lim=450
  [ "$n" -gt "$lim" ] && DESC_BAD="$DESC_BAD $sk($n>$lim)"
done
[ -z "$DESC_BAD" ] && ok "description 长度守卫：常驻描述未膨胀（≤400，module-plan ≤450）" || bad "description 超长（每会话常驻）：$DESC_BAD"
# 24.12 module-review 检查项 ID 完整性：1..34 连续、无重复、无跳号。
#       只守"集合完整性"这条**真会出错**的判据；**跨节顺序不做守卫**：ID 是交叉引用的稳定标识
#       （#32/#33 被多处引用），重排会波及 2 个文件 + §12.1 的冻结记录，且零上下文收益——有意保留现状。
MR="$ROOT/skills/module-review/SKILL.md"
IDS=$(grep -oE '^\| [0-9]+ \|' "$MR" | tr -dc '0-9\n' | sort -n | tr '\n' ' ')
EXP=$(seq 1 34 | tr '\n' ' ')
[ "$IDS" = "$EXP" ] && ok "module-review 检查项 ID 完整（1–34 连续、无重复、无跳号）" || bad "module-review 检查项 ID 异常：[$IDS]"
# 24.13 实施计划只呈现「最新方案」——四个被删的节不得复活，§1 必须是「需求与思路」（人读层），
#       解析器也不得再解析「回写清单」
#       （修订史/决策史归 git 与探索记录；回写动作的唯一权威是 module-code §5——见 docs/设计文档.md §8.1）
PT="$ROOT/templates/计划/YYYY-MM-DD-{实施主题}.md.tpl"
DEADP=""
for sec in "## 0. 修订记录" "## 6. 关键设计决策" "## 10. 里程碑" "## 11. 回写清单"; do
  grep -qF "$sec" "$PT" && DEADP="$DEADP [$sec]"
done
[ -z "$DEADP" ] && ok "P0 防回归：计划模板无 修订记录/关键设计决策/里程碑/回写清单 四节" || bad "计划模板已删的节复活：$DEADP"
grep -q "^## 1. 需求与思路" "$PT" && ok "计划模板首页是人读层：§1 需求与思路（两种形态都必填）" || bad "计划模板缺 §1 需求与思路（人读层）"
grep -q "secWriteback" "$ROOT/scripts/lib/plan.js" && bad "计划解析器仍在解析「回写清单」（死字段）" || ok "计划解析器不再解析「回写清单」"
# 24.13b 单一来源守卫：① 建模补充只有 M1–M2（边界归 §1.4、图归 §1.3）；
#        ② 任务清单纪律必须写明"测试归 /module-test"（测试项写进计划会卡死归档）
grep -qE "^### M3 |^### M[0-9]+ (边界|状态机|页面结构|图)" "$PT" && bad "计划模板建模补充出现 M3 或「边界/状态机/页面结构/图」类小节（边界归 §1.4、图归 §1.3）" || ok "计划模板建模补充为 M1–M2（依赖 / 验收；无边界节、无图节）"
grep -q "module-test" "$PT" && grep -q "测试 / 验证任务不写进来" "$PT" && ok "计划模板任务清单纪律：测试归 /module-test，任务不含测试项" || bad "计划模板任务清单纪律缺「测试不写进任务清单」"
# 24.13c 图的唯一落点：模板里**所有** ```mermaid 块必须在 §1.3 的范围内（一处画、人读与建档两用）
MT=$(grep -c '^```mermaid' "$PT"); MIN13=$(sed -n '/^### 1\.3 /,/^### 1\.4 /p' "$PT" | grep -c '^```mermaid')
{ [ "$MT" -gt 0 ] && [ "$MT" = "$MIN13" ]; } && ok "P0 防回归：模板所有 mermaid 图集中在 §1.3（唯一落点）" || bad "模板出现 §1.3 之外的 mermaid 图（落点分裂：总 $MT / §1.3 内 ${MIN13}）"
# 24.13d 测试文档「一处定义、多处引用」——模块 测试.md 只填**实例**，不得复制
#        ① 契约 §8.2 的验收场景正文（WHEN/THEN）、② 测试规范 §4 的 SQL 骨架；
#        测试规范（**项目级**）也不得出现模块级 {{…}} 占位符（项目级文档装不下模块级取值）。
#        （理由见 docs/设计文档.md §12.1）
TMT="$ROOT/templates/模块/{模块名}/测试.md.tpl"; TGD="$ROOT/templates/测试规范.md.tpl"
TDUP=""
grep -qE '^[[:space:]]*-[[:space:]]+\*\*(WHEN|THEN)\*\*' "$TMT" && TDUP="$TDUP [测试.md 复制了契约 §8.2 场景正文]"
grep -qE '^(SELECT|FROM) ' "$TMT" && TDUP="$TDUP [测试.md 复制了测试规范 §4 SQL 骨架]"
for tok in '业务主表' '业务主数据' '业务主表/关联表' '服务' '过滤字段' '过滤值' '流程引擎库' '流程key'; do
  grep -qF "{{$tok}}" "$TGD" && TDUP="$TDUP [测试规范 又出现模块级占位符 {{$tok}}]"
done
[ -z "$TDUP" ] && ok "测试文档单一来源：测试.md 只填实例（无场景正文 / 无 SQL 骨架），测试规范 无模块级占位符" || bad "测试文档重复内容复活：$TDUP"
# 24.14 SQL「执行环境」列：只有**含生产**的 SQL 才该登记契约 §10（生产发布时要人工再执行一遍）。
#       缺标注 ⇒ §10 会把「仅开发」的造数/修数脚本也登进去，上线待办表失去判别力 ⇒ 必须提示（ℹ️，不拦）。
SQ="$TMP/sqlenv"; mk_project "$SQ"
echo "# 订单契约" > "$SQ/doc-framework/模块/订单/契约.md"
cat > "$SQ/doc-framework/模块/订单/计划/2026-03-01-加字段.md" <<'EOF'
# 2026-03-01 加字段实施

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：轻量
> 状态：已批准

## 2. 逐应用表态（授权作用域）

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 加导出字段 |

## 3. 变更文件清单

### 1) SQL（按服务分目录）

| 文件 | 所属服务 | 说明 |
|------|----------|------|
| `services/order/sql/change/2026-03-01_order_ddl.sql` | svc-order | 加字段 |
EOF
assert_grep "$(run "$SQ" check 2>&1)" "缺「执行环境」标注" "SQL 行缺执行环境标注 → ℹ️ 提示（防误登契约 §10）" "SQL 缺执行环境标注未提示"
# 标了执行环境（哪怕只是「仅开发」）→ 不再提示：解析器认得这一列，不再当"缺标注"
rm "$SQ/doc-framework/模块/订单/计划/2026-03-01-加字段.md"
cat > "$SQ/doc-framework/模块/订单/计划/2026-03-02-修数据.md" <<'EOF'
# 2026-03-02 修数据实施

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：轻量
> 状态：已批准

## 2. 逐应用表态（授权作用域）

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 修数据 |

## 3. 变更文件清单

### 1) SQL（按服务分目录）

| 文件 | 所属服务 | 执行环境 | 说明 |
|------|----------|----------|------|
| `services/order/sql/change/2026-03-02_order_fix.sql` | svc-order | 仅开发 | 造数 |
EOF
assert_ngrep "$(run "$SQ" check 2>&1)" "缺「执行环境」标注" "SQL 标了执行环境（仅开发，不登契约 §10）→ 不再提示" "标了执行环境仍提示"

# 24.15 判据 d 的阈值只有一个实现来源（checks/standards.js），文档是它的**人读复述**——
#      阈值改了忘改文档 = 文档与门禁口径不符（读者按文档预期，实际不报）。
STD_L="$(grep -o 'STD_SECTION_MAX_LINES = [0-9]*' "$ROOT/scripts/checks/standards.js" | grep -o '[0-9]*')"
STD_C="$(grep -o 'STD_SECTION_MAX_COUNT = [0-9]*' "$ROOT/scripts/checks/standards.js" | grep -o '[0-9]*')"
grep -q "> $STD_L 行" "$ROOT/docs/设计文档.md" && ok "判据 d 阈值与设计文档一致（单节 > $STD_L 行）" || bad "单节阈值与文档不一致（实现=${STD_L}）"
grep -q "小节数 > $STD_C" "$ROOT/docs/设计文档.md" && ok "判据 d 阈值与设计文档一致（小节数 > ${STD_C}）" || bad "小节数阈值与文档不一致（实现=${STD_C}）"
