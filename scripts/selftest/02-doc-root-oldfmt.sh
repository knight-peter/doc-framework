# 02：文档根守卫 / 探索豁免 / 应用清单必需
#
#   7. 只认中文文档根：doc-framework-en/ 与 docs-framework/ **不是**文档根（按未找到文档根报错），
#      不得落进"未初始化/缺文件"或静默降级；check/list/diff-check 三个入口都要有守卫；中文根不受误伤
#   8. 探索/ 中的开放标记不参与占位符硬校验
#   9. 档案缺「应用清单」即硬报错（无旧格式回退判据）；应用代码根重复登记 → ❌（文件归属不确定）

# ── 7：只认中文文档根（不兼容旧结构）──
# 体系不兼容旧结构：英文根/旧目录名**不是**文档根——按"未找到文档根"报错即可。
E="$TMP/en"; mkdir -p "$E/doc-framework-en/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$E/doc-framework-en/$f"; done
echo fe > "$E/doc-framework-en/standards/frontend.md"; echo be > "$E/doc-framework-en/standards/backend.md"
EN_OUT=$(run "$E" check 2>&1); EN_CODE=$?
assert_exit "$EN_CODE" "1" "英文根 doc-framework-en/：check 失败（不被当作文档根）" "英文根未被拦（exit=$EN_CODE）"
assert_grep "$EN_OUT" "未找到文档根" "英文根：报「未找到文档根 doc-framework/」" "英文根未报未找到文档根"
assert_ngrep "$EN_OUT" "不再支持英文产物命名" "英文根：已无专门的英文根兼容文案" "英文根兼容文案仍在（应随兼容路径一并删除）"

# 旧英文目录 docs-framework/：同样不是文档根
L="$TMP/en-legacy"; mkdir -p "$L/docs-framework/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$L/docs-framework/$f"; done
run "$L" check >/dev/null 2>&1 && bad "旧英文根 docs-framework/ 未被拦" || ok "旧英文根 docs-framework/：同样不是文档根（失败）"

# 英文根下 list / diff-check 同样要失败（不能只 check 拦）
run "$E" list >/dev/null 2>&1 && bad "英文根下 list 未失败" || ok "英文根下 list 也失败"
run "$E" diff-check --module order >/dev/null 2>&1 && bad "英文根下 diff-check 未失败" || ok "英文根下 diff-check 也失败"

# 中文根不受影响（回归护栏）
mk_project "$TMP/zh-ok"
run "$TMP/zh-ok" check >/dev/null 2>&1 && ok "中文根 doc-framework/ 正常通过" || bad "中文根被误伤"

# ── 8：探索/ 开放标记豁免 ──
# 回归 8：探索笔记里的 {待验证} 是记录内容本身，不是待渲染占位符——否则探索产物永远红
P2="$TMP/p2"; mk_project "$P2"; mkdir -p "$P2/doc-framework/探索"
echo '结论：{待验证}。' > "$P2/doc-framework/探索/2025-01-01-权限模型.md"
run "$P2" check >/dev/null 2>&1 && ok "探索/ 中的开放标记不触发硬校验" || bad "探索/ 触发占位符硬失败"

# ── 9：不兼容旧格式——应用清单是必需节 ──
# 体系不兼容旧结构：档案缺「应用清单」即硬报错（无旧格式回退判据）
V="$TMP/v1"; mkdir -p "$V/doc-framework/"{模块/订单/计划,边界,规范,计划}
printf '# 项目档案\n## 技术栈\n- 后端: Java 17\n- 前端: Vue 3\n' > "$V/doc-framework/项目档案.md"
for f in 总契约 测试规范 接口规范; do echo "# $f" > "$V/doc-framework/$f.md"; done
echo fe > "$V/doc-framework/规范/前端开发规范.md"; echo be > "$V/doc-framework/规范/后端开发规范.md"
printf '# 2025-01-01 旧计划实施\n> 状态：已完成\n\n## 二、变更文件清单\n| 文件 | 说明 |\n|---|---|\n| src/main/A.java | 改动 |\n' > "$V/doc-framework/模块/订单/计划/2025-01-01-旧计划.md"
V_OUT=$(run "$V" check 2>&1); V_CODE=$?
assert_exit "$V_CODE" "1" "旧格式档案（无应用清单）：check 失败（不再兼容放行）" "旧格式档案未失败（exit=$V_CODE）"
assert_grep "$V_OUT" "档案缺「应用清单」节" "旧格式档案：报「档案缺应用清单节」" "旧格式档案未报缺应用清单"

# ── 9.1 重复代码根：两个应用登记同一个根 → 文件归属不确定，必须硬报 ──
# 旧实现只查「互相嵌套」，同根两份登记会静默通过；matchApp 取遍历到的第一个 = 授权边界不确定。
DUP="$TMP/dup-root"; mk_project "$DUP"
printf '| svc-order2 | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' >> "$DUP/doc-framework/项目档案.md"
DUP_OUT=$(run "$DUP" check 2>&1); DUP_CODE=$?
assert_exit "$DUP_CODE" "1" "重复代码根：check 失败（归属不确定）" "重复代码根被静默放行（exit=$DUP_CODE）"
assert_grep "$DUP_OUT" "应用代码根重复登记" "重复代码根：报「应用代码根重复登记」" "重复代码根未报出"
assert_grep "$DUP_OUT" "svc-order2" "重复代码根：点名重复的应用" "重复代码根未点名应用"
