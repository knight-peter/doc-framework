# 12：文档落后检查（契约 ↔ 代码）
#
#  23. 文档落后检查：基线 = 契约/接口.md 最后提交的较晚者；基线之后落点路径（§5「文件位置」∩
#      应用代码根）有新提交且提交信息无「契约:无需变更」→ 提示。
#      覆盖：空范围不报 / 未回写报出（默认 ℹ️ 不进退出码）/ --strict 升 ⚠️ 进退出码 /
#      **trailer 提交自身豁免** / 文档提交推进基线转绿 / **文档有未提交改动跳过** /
#      非 git 目录跳过 / §5 无文件位置跳过 / **§5 路径两种写法**（应用根相对与仓库根相对都能解析）

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
assert_exit "$CODE_D1" "0" "文档落后：空范围退出码 0" "文档落后：空范围影响退出码（exit=$CODE_D1）"
# 23.1 基线后落点有新提交（无 trailer）→ 报；§5 两种路径写法都覆盖（svc-order=仓库根相对，app-web=应用根相对）
echo v2 >> "$DS/services/order/src/OrderController.java"
( cd "$DS" && git add -A && git commit -qm "feat(order): 加过滤" ) >/dev/null 2>&1
OUT_D2=$(run "$DS" check 2>&1); CODE_D2=$?
assert_grep "$OUT_D2" "文档可能落后于代码" "文档落后：基线后落点提交被报出（含明细）" "文档落后：漏回写未报出"
assert_exit "$CODE_D2" "0" "文档落后：默认 ℹ️ 不进退出码" "文档落后：默认级别影响了退出码（exit=$CODE_D2）"
OUT_D3=$(run "$DS" check --strict 2>&1); CODE_D3=$?
assert_grep "$OUT_D3" "⚠️ 文档可能落后于代码" "文档落后：--strict 升为 ⚠️" "文档落后：--strict 未升级"
assert_exit "$CODE_D3" "1" "文档落后：--strict 进退出码" "文档落后：--strict 未进退出码（exit=$CODE_D3）"
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
assert_exit "$CODE_D8" "0" "文档落后：非 git 不影响退出码" "文档落后：非 git 影响退出码（exit=$CODE_D8）"
# 23.7 §5 无「文件位置」列 → 跳过 + ℹ️
NP="$TMP/docsync-nopaths"; mk_project "$NP"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 页面结构 |\n|------|----------|\n| svc-order（主责） | — |\n' > "$NP/doc-framework/模块/订单/契约.md"
( cd "$NP" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
OUT_D9=$(run "$NP" check 2>&1)
assert_grep "$OUT_D9" "§5 无可解析的文件位置" "文档落后：§5 无文件位置 → 跳过 + ℹ️" "文档落后：无路径未跳过"
