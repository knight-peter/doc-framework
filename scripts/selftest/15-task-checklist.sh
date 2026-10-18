# 14：任务清单两类行（勾选行 / 登记行）
#
#  25. 任务清单两类行：**勾选框 ⇔ AI 可执行可验证的任务**；人工/平台侧步骤写成
#      **不带勾选框的登记行**（`- 5.2 【人工·生产】…`）⇒ 只显示、不进进度、不阻塞「已完成」。
#      覆盖：登记行不阻塞（已完成也放行）/ **勾选行照旧阻塞**（未勾选 ❌ 点名编号）/
#      矛盾写法（勾选框 + `【人工·…】`）给 ℹ️ 指路，行为与不含该标记时一致 /
#      实施中"勾选行全勾 + 还剩登记行"→ ℹ️ 可登记完成 / list「（人工步骤 N）」·show 列出登记行 /
#      围栏内的登记行不计数（**勾选行仍不跳围栏**）/ 正文提到「人工」不误报 /
#      模板·夹具·三技能·契约 §10 来源声明 同步守卫 / **「去向 / 长期家」机制退场守卫**（不得复活）

# ── 25：任务清单两类行（勾选行＝AI 任务 / 登记行＝人工步骤）──────
# 判据：**勾选框 ⇔ AI 可执行可验证的任务**；人工/平台侧步骤写成**不带勾选框的登记行**
#      （`- 5.2 【人工·生产】…`）——只显示、不阻塞；登记行不承担跨文档索引职责
#      （生产待执行 SQL 的长期家是计划 §3 的 `生产+开发` 标注 + 契约 §10）。
#      本组守：登记行不阻塞 / 勾选行照旧阻塞 / 矛盾写法（勾选框+人工标记）给 ℹ️ 指路 /
#      list·show 看得见登记行 / 围栏只对登记行跳过 / 「去向 / 长期家」机制不得复活 /
#      模板·夹具·三技能·契约 §10 来源声明 口径同步。
H25="$TMP/human"; mk_project "$H25"
echo "# 订单契约" > "$H25/doc-framework/模块/订单/契约.md"
mk_plan25() { # $1=文件名 $2=状态 $3=任务行
  cat > "$H25/doc-framework/模块/订单/计划/$1" <<EOF
# $1

> 依据模块契约：\`doc-framework/模块/订单/契约.md\`
> 计划形态：完整
> 状态：$2

## 2. 逐应用表态（授权作用域）

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 主责 |

## 语义增量（delta）

> 合并状态：无需合并

无（纯实现改动）。

## 3. 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| svc-order | services/order/src/A.java | 主责 |

## 4. 任务清单

$3
EOF
}
# A：已完成 + 勾选行全勾 + 1 项登记行（人工步骤）→ 必须放行（"计划能归档"的正例）
mk_plan25 "2026-05-01-登记行.md" "已完成" "- [x] 1.1 主责服务实现
- 5.2 【人工·生产】重新部署后端"
OUT25=$(run "$H25" check 2>&1); CODE25=$?
assert_exit "$CODE25" "0" "登记行（人工步骤）不阻塞「已完成」：check 通过" "登记行仍卡住「已完成」（exit=$CODE25）"
assert_grep "$OUT25" "人工步骤（只登记、不打勾，不阻塞归档）" "登记行：ℹ️ 报出人工步骤（不静默）" "登记行未被报出"
# B：勾选行未勾 → 照旧阻塞（勾选框＝AI 任务，未勾选是硬闸门）
mk_plan25 "2026-05-02-勾选行未勾.md" "已完成" "- [x] 1.1 主责服务实现
- [ ] 2.1 主责服务接口未实现"
OUT25B=$(run "$H25" check 2>&1); CODE25B=$?
assert_exit "$CODE25B" "1" "勾选行未勾选：仍阻塞「已完成」" "勾选行未勾选被放行（闸门失效，exit=$CODE25B）"
assert_grep "$OUT25B" "存在未勾选任务 2.1" "勾选行未勾选：❌ 点名到具体编号" "勾选行未勾选未点名"
# C：矛盾写法（勾选框 + 【人工·…】标记）→ 仍是勾选行（未勾即阻塞）+ ℹ️ 指路；旧计划零迁移
mk_plan25 "2026-05-03-矛盾写法.md" "已完成" "- [x] 1.1 主责服务实现
- [ ] 5.1 【人工·生产】重新部署后端"
OUT25C=$(run "$H25" check 2>&1); CODE25C=$?
assert_exit "$CODE25C" "1" "勾选框带人工标记：行为与 v2.9.0 一致（未勾选照旧阻塞）" "矛盾写法被静默放行（exit=$CODE25C）"
assert_grep "$OUT25C" "勾选框只留给 AI 可执行的任务：5.1" "矛盾写法：ℹ️ 指路去掉方括号" "矛盾写法未给指路"
# D：实施中 + 勾选行全勾 + 登记行 → ℹ️ 可登记「已完成」（"实施完了但生产还没做"的窗口）
mk_plan25 "2026-05-04-实施中只剩人工.md" "实施中" "- [x] 1.1 主责服务实现
- 5.2 【人工·生产】重新部署后端"
assert_grep "$(run "$H25" check 2>&1)" "任务已全部勾选（另有 1 项人工步骤）" "勾选行全勾 + 登记行：ℹ️ 可登记「已完成」" "只剩登记行时未提示可登记完成"
# E：list / show 必须看得见登记行（不阻塞 ≠ 可以看不见）
assert_grep "$(run "$H25" list --all 2>&1)" "1/1（人工步骤 1）" "list 任务列标出人工步骤数" "list 未标出人工步骤"
SHOW25=$(run "$H25" show "doc-framework/模块/订单/计划/2026-05-04-实施中只剩人工.md" 2>&1)
assert_grep "$SHOW25" "人工步骤（登记行）：5.2 【人工·生产】重新部署后端" "show 列出登记行原文" "show 未列出登记行"
assert_grep "$(run "$H25" show "doc-framework/模块/订单/计划/2026-05-03-矛盾写法.md" 2>&1)" "勾选行带人工标记（应改成登记行）：5.1" "show 标出矛盾写法" "show 未标出矛盾写法"
# F：反误报——正文提到「人工」但没有标记 → 普通勾选行，不报矛盾写法
mk_plan25 "2026-05-05-正文提到人工.md" "待审核" "- [ ] 2.1 与人工确认字段"
assert_ngrep "$(run "$H25" show "doc-framework/模块/订单/计划/2026-05-05-正文提到人工.md" 2>&1)" "勾选行带人工标记" "正文提到「人工」不算标记（不误报）" "正文提到「人工」被误判为标记"
# G：围栏里的登记行不计数（登记行的扫描跳围栏；勾选行不跳，见 §3.8 纪律）
mk_plan25 "2026-05-06-围栏示例.md" "待审核" '- [x] 1.1 主责服务实现
```text
- 9.9 【人工·生产】围栏里的示例
```'
assert_ngrep "$(run "$H25" show "doc-framework/模块/订单/计划/2026-05-06-围栏示例.md" 2>&1)" "9.9" "围栏里的登记行不计入（跳围栏）" "围栏里的登记行被计入"
# H：只有登记行（无勾选行）→ total=0，list 显示「—（人工步骤 N）」
mk_plan25 "2026-05-07-只有登记行.md" "待审核" "- 5.2 【人工·生产】重新部署后端"
assert_grep "$(run "$H25" list --all 2>&1)" "—（人工步骤 1）" "只有登记行时 list 显示「—（人工步骤 N）」" "只有登记行时 list 未显示人工步骤"
# I：纪律落地（防"只改了 check，模板 / 夹具 / 技能 / 契约 §10 来源声明 没同步"）
PT25="$ROOT/templates/计划/YYYY-MM-DD-{实施主题}.md.tpl"
if grep -q '^- 5\.2 【人工·{{执行方}}】' "$PT25" && grep -q "没有人工步骤就不写登记行" "$PT25" \
  && ! grep -q "去向：" "$PT25" && ! grep -q "{{长期家}}" "$PT25"; then
  ok "计划模板 §4：登记行记法（无勾选框、无去向）+ 准入判据（含「无人工步骤不写」）"
else
  bad "计划模板 §4 缺登记行记法 / 准入判据，或残留勾选框 / 去向"
fi
CT25="$ROOT/templates/模块/{模块名}/契约.md.tpl"
if grep -q "1) SQL" "$CT25" && grep -q "任务清单不产生本表" "$CT25"; then
  ok "契约模板 §10 抬头：声明来源＝计划 §3 的「1) SQL」表（任务清单不产生本表）"
else
  bad "契约模板 §10 抬头未声明来源（§3 SQL 表）"
fi
if grep -q "登记行" "$ROOT/skills/module-plan/SKILL.md" && grep -q "登记行" "$ROOT/skills/module-code/SKILL.md" \
  && grep -q "登记行" "$ROOT/skills/module-review/SKILL.md"; then
  ok "三技能口径同步：module-plan / module-code / module-review 都写明「登记行」"
else
  bad "技能口径未同步（登记行 只改了一处）"
fi
grep -q '(?!人工' "$ROOT/scripts/selftest-render-fixture.py" \
  && ok "渲染夹具：示例删除规则为 【人工·…】 开例外（否则渲染一次登记行就丢了标记）" || bad "渲染夹具未为 【人工·…】 开例外"
if grep -rq --include='*.js' "humanRows" "$ROOT/scripts" && grep -rq --include='*.js' "misplacedHuman" "$ROOT/scripts"; then
  ok "判据单一来源：plan.js 出 humanRows/misplacedHuman，check 侧消费"
else
  bad "登记行判据未落到 humanRows/misplacedHuman"
fi
# J：「去向 / 长期家」机制不得复活
DEAD25=""
for f in "$ROOT"/scripts/*.js "$ROOT"/scripts/*/*.js; do
  for tok in CHECKLIST_DEST_RE humanOpen blockingOpen noDestination; do
    grep -q "$tok" "$f" && DEAD25="$DEAD25 ${f#$ROOT/}:$tok"
  done
done
grep -rq --include='*.js' '缺「去向」' "$ROOT/scripts" && DEAD25="$DEAD25 scripts:缺去向判据"
[ -z "$DEAD25" ] && ok "「去向」旧机制已退场（无 DEST_RE / humanOpen / blockingOpen / noDestination / 缺去向判据）" || bad "「去向」旧机制残留：$DEAD25"
