# 12：文档落后检查（契约 ↔ 代码）
#
#  23. 文档落后检查：基线 = 契约/接口.md 最后提交的较晚者；基线之后落点路径（§5「文件位置」∩
#      应用代码根）有新提交且提交信息无「契约:无需变更」→ 提示。
#      覆盖：空范围不报 / 未回写报出（默认 ℹ️ 不进退出码）/ --strict 升 ⚠️ 进退出码 /
#      **trailer 提交自身豁免** / 文档提交推进基线转绿 / **文档有未提交改动跳过** /
#      非 git 目录跳过 / §5 无文件位置跳过 / **§5 路径两种写法**（应用根相对与仓库根相对都能解析）
#  23.8-23.10 契约健康（阶段 2.4）：§5 落点路径不存在 / 落点登记到别的应用 / 落点应用未登记；
#      `--strict` 把前两类升为 ⚠️ 进退出码（默认 ℹ️）

# ── 23：文档落后检查（契约是否还对得上当前代码）──
# 判据：基线 = 契约/接口.md 最后提交的较晚者；基线之后落点路径（§5「文件位置」∩ 应用代码根）
#       有新提交且提交信息无「契约:无需变更」→ 提示（查"漏回写"，不是"已存在的行有没有凭据"）。
DS="$TMP/docsync"; mk_project "$DS"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 页面结构 | 文件位置 |\n|------|----------|----------|\n| svc-order（主责） | — | `services/order/src/OrderController.java` |\n| app-web | 列表页 | `views/order/List.vue` |\n' > "$DS/doc-framework/模块/订单/契约.md"
printf '# 接口\n' > "$DS/doc-framework/模块/订单/接口.md"
mkdir -p "$DS/services/order/src" "$DS/apps/web/views/order"
echo v1 > "$DS/services/order/src/OrderController.java"; echo v1 > "$DS/apps/web/views/order/List.vue"
( cd "$DS" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
OUT_D1=$(run "$DS" check 2>&1); CODE_D1=$?
assert_ngrep "$OUT_D1" "文档可能落后" "文档落后：基线后无落点提交 → 不报" "文档落后：空范围误报"
assert_exit "$CODE_D1" "0" "文档落后：空范围退出码 0" "文档落后：空范围影响退出码（exit=${CODE_D1}）"
# 23.1 基线后落点有新提交（无 trailer）→ 报；§5 两种路径写法都覆盖（svc-order=仓库根相对，app-web=应用根相对）
echo v2 >> "$DS/services/order/src/OrderController.java"
( cd "$DS" && git add -A && git commit -qm "feat(order): 加过滤" ) >/dev/null 2>&1
OUT_D2=$(run "$DS" check 2>&1); CODE_D2=$?
assert_grep "$OUT_D2" "文档可能落后于代码" "文档落后：基线后落点提交被报出（含明细）" "文档落后：漏回写未报出"
assert_exit "$CODE_D2" "0" "文档落后：默认 ℹ️ 不进退出码" "文档落后：默认级别影响了退出码（exit=${CODE_D2}）"
OUT_D3=$(run "$DS" check --strict 2>&1); CODE_D3=$?
assert_grep "$OUT_D3" "⚠️ 文档可能落后于代码" "文档落后：--strict 升为 ⚠️" "文档落后：--strict 未升级"
assert_exit "$CODE_D3" "1" "文档落后：--strict 进退出码" "文档落后：--strict 未进退出码（exit=${CODE_D3}）"
# 23.2 trailer 提交自身豁免（豁免是逐提交的，不清空更早的提交）
echo v3 >> "$DS/services/order/src/OrderController.java"
( cd "$DS" && git add -A && git commit -qm "fix(order): 微调" -m "契约：无需变更" ) >/dev/null 2>&1
OUT_D4=$(run "$DS" check 2>&1)
assert_grep "$OUT_D4" "有 1 个落点代码提交未回写" "文档落后：trailer 提交被豁免（只剩早前 1 个）" "文档落后：trailer 豁免失效"
# 23.3 文档提交推进基线 → 转绿（漏回写的恢复路径 = 补一次对账提交）
echo "<!-- 对账回写 -->" >> "$DS/doc-framework/模块/订单/契约.md"
( cd "$DS" && git add -A && git commit -qm "docs(order): 对账回写" ) >/dev/null 2>&1
OUT_D5=$(run "$DS" check 2>&1)
assert_ngrep "$OUT_D5" "文档可能落后" "文档落后：文档提交推进基线后转绿" "文档落后：文档提交后仍误报"
# 23.4 文档有未提交改动 → 跳过（"module-doc 改完契约还没提交"是常态窗口，不跳过必误报）
echo "<!-- 未提交 -->" >> "$DS/doc-framework/模块/订单/契约.md"
OUT_D6=$(run "$DS" check 2>&1)
assert_grep "$OUT_D6" "文档有未提交改动" "文档落后：文档未提交改动 → 跳过 + ℹ️" "文档落后：未提交改动未跳过"
( cd "$DS" && git checkout -q -- doc-framework/模块/订单/契约.md )
# 23.5 应用根相对路径写法（app-web 的 `views/order/List.vue` 拼应用根后命中）
echo v2 >> "$DS/apps/web/views/order/List.vue"
( cd "$DS" && git add -A && git commit -qm "feat(web): 按钮" ) >/dev/null 2>&1
OUT_D7=$(run "$DS" check 2>&1)
assert_grep "$OUT_D7" "文档可能落后于代码" "文档落后：应用根相对路径拼应用代码根后命中" "文档落后：应用根相对路径静默失效（pathspec 匹配不到）"
# 23.6 非 git 目录 → 整阶段跳过（check 的 git 降级：只 ℹ️ 不 ❌）
NG="$TMP/docsync-nogit"; mk_project "$NG"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 文件位置 |\n|------|----------|\n| svc-order（主责） | `services/order/src/X.java` |\n' > "$NG/doc-framework/模块/订单/契约.md"
OUT_D8=$(run "$NG" check 2>&1); CODE_D8=$?
assert_grep "$OUT_D8" "不是 git 仓库" "文档落后：非 git 目录 → 跳过 + ℹ️" "文档落后：非 git 目录未降级"
assert_exit "$CODE_D8" "0" "文档落后：非 git 不影响退出码" "文档落后：非 git 影响退出码（exit=${CODE_D8}）"
# 23.7 §5 无「文件位置」列 → 跳过 + ℹ️
NP="$TMP/docsync-nopaths"; mk_project "$NP"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 页面结构 |\n|------|----------|\n| svc-order（主责） | — |\n' > "$NP/doc-framework/模块/订单/契约.md"
( cd "$NP" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
OUT_D9=$(run "$NP" check 2>&1)
assert_grep "$OUT_D9" "§5 无可解析的文件位置" "文档落后：§5 无文件位置 → 跳过 + ℹ️" "文档落后：无路径未跳过"

# 23.8 契约健康：§5 落点存在性 / 归属 / 应用登记（I1 的最低成本机器化）
#      病根：doc-sync 只把 §5 路径当 git pathspec；路径写错时匹配不到任何文件 → 检查静默失效。
CH="$TMP/contract-health"; mk_project "$CH"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 页面结构 | 文件位置 | 权限控制方式 | 差异说明 |\n|------|----------|----------|--------------|----------|\n| svc-order（主责） | — | `services/order/src/Missing.java` | 注解 | 业务真相 |\n| app-web | 列表页 | `views/order/List.vue` | 指令 | — |\n' > "$CH/doc-framework/模块/订单/契约.md"
CH_OUT=$(run "$CH" check 2>&1); CH_CODE=$?
assert_exit "$CH_CODE" "0" "契约健康：默认 ℹ️ 不影响退出码" "契约健康：默认级别影响退出码（exit=${CH_CODE}）"
assert_grep "$CH_OUT" "契约 §5 落点路径不存在" "契约健康：§5 路径不存在 → 提示" "契约健康：§5 路径不存在未提示"
assert_grep "$CH_OUT" "Missing.java" "契约健康：点名不存在的路径" "契约健康：未点名路径"
CH_STRICT=$(run "$CH" check --strict 2>&1); CH_STRICT_CODE=$?
assert_exit "$CH_STRICT_CODE" "1" "契约健康：--strict 升 ⚠️ 进退出码" "契约健康：--strict 未进退出码"
assert_grep "$CH_STRICT" "⚠️ 契约 §5 落点路径不存在" "契约健康：--strict 文案带 ⚠️" "契约健康：--strict 文案未升级"
mkdir -p "$CH/services/order/src" "$CH/apps/web/views/order"
echo x > "$CH/services/order/src/Missing.java"; echo x > "$CH/apps/web/views/order/List.vue"
CH_OK=$(run "$CH" check 2>&1)
assert_ngrep "$CH_OK" "契约 §5 落点路径不存在" "契约健康：路径补齐后提示消失" "契约健康：路径补齐后仍报不存在"

# 23.9 契约健康：§5 登记到别的应用根下 → 归属错误（即使文件存在）
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 文件位置 |\n|------|----------|\n| svc-order（主责） | `apps/web/foreign.js` |\n' > "$CH/doc-framework/模块/订单/契约.md"
echo x > "$CH/apps/web/foreign.js"
CH_OWN=$(run "$CH" check 2>&1)
assert_grep "$CH_OWN" "契约 §5 落点路径不在应用代码根内" "契约健康：落点写到别的应用 → 归属告警" "契约健康：落点写错应用未告警"

# 23.10 契约健康：§5 应用未在档案登记 → 提示（不猜代码根）
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 文件位置 |\n|------|----------|\n| svc-ghost | `services/ghost/A.java` |\n' > "$CH/doc-framework/模块/订单/契约.md"
CH_APP=$(run "$CH" check 2>&1)
assert_grep "$CH_APP" "落点应用未在档案应用清单登记" "契约健康：未登记应用 → 提示" "契约健康：未登记应用未提示"
