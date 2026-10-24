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
assert_exit "$EN_CODE" "1" "英文根 doc-framework-en/：check 失败（不被当作文档根）" "英文根未被拦（exit=${EN_CODE}）"
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

# 7.1 --root / 向上查找：CLI 的项目根不再依赖 INIT_CWD
run "$TMP" check --root "$TMP/zh-ok" >/dev/null 2>&1 && ok "--root：从任意 cwd 指定项目根可用" || bad "--root 未生效（从 $TMP 指定 $TMP/zh-ok 失败）"
run "$TMP/zh-ok/apps/web" check >/dev/null 2>&1 && ok "子目录：向上查找 doc-framework/ 生效" || bad "子目录 check 未向上查找文档根"

# 7.1b AGENTS 永久段：缺失 / 缺标记 → check 提示（不硬拦）；doctor 报告
printf '# AGENTS\n' > "$TMP/zh-ok/AGENTS.md"
AG_OUT=$(run "$TMP/zh-ok" check 2>&1)
assert_grep "$AG_OUT" "永久段标记" "AGENTS：缺永久段标记 → check 提示" "AGENTS：缺永久段标记未提示"
DOC_JSON=$(run "$TMP/zh-ok" doctor --json 2>&1)
assert_json "$DOC_JSON" "d['ok'] is True and any(c['area']=='agents' for c in d['checks'])" "doctor：AGENTS 漂移进入报告（不硬失败）" "doctor：AGENTS 漂移未进入报告"
rm -f "$TMP/zh-ok/AGENTS.md"

# 7.2 未知选项必须报用法错误（不得静默忽略——`--modul` 会被当成无值开关，用户以为过滤生效了）
UNK_OUT=$(run "$TMP/zh-ok" list --modul 订单 2>&1); UNK_CODE=$?
assert_exit "$UNK_CODE" "1" "未知选项：list --modul 报错" "未知选项：list --modul 被静默忽略"
assert_grep "$UNK_OUT" "未识别选项" "未知选项：文案点名未识别选项" "未知选项：文案缺失"
run "$TMP/zh-ok" check --stric >/dev/null 2>&1 && bad "未知选项：check --stric 被放行" || ok "未知选项：check --stric 报错"

# 7.3 check --rules / --json：规则码与机器可读输出（CI / AI 消费）
RULES_JSON=$(run "$TMP" check --rules --json 2>&1)
assert_json "$RULES_JSON" "len(d['rules']) > 10 and all(r['id'].startswith('DF-') for r in d['rules'])" "check --rules --json：输出规则目录" "check --rules --json：规则目录缺失/格式错"
JSON_OK=$(run "$TMP/zh-ok" check --json 2>&1)
assert_json "$JSON_OK" "d['ok'] is True and d['counts']['error'] == 0 and any(e['rule'].startswith('DF-') for e in d['notes'])" "check --json：干净项目 ok=true + 规则码" "check --json：干净项目输出异常"

# ── 8：探索/ 开放标记豁免 ──
# 回归 8：探索笔记里的 {待验证} 是记录内容本身，不是待渲染占位符——否则探索产物永远红
P2="$TMP/p2"; mk_project "$P2"; mkdir -p "$P2/doc-framework/探索"
echo '结论：{待验证}。' > "$P2/doc-framework/探索/2025-01-01-权限模型.md"
run "$P2" check >/dev/null 2>&1 && ok "探索/ 中的开放标记不触发硬校验" || bad "探索/ 触发占位符硬失败"

# ── 9：不兼容旧格式——应用清单是必需节 ──
# 体系不兼容旧结构：档案缺「应用清单」即硬报错（无旧格式回退判据）
V="$TMP/v1"; mkdir -p "$V/doc-framework/"{模块/订单/计划,能力,规范,计划}
printf '# 项目档案\n## 技术栈\n- 后端: Java 17\n- 前端: Vue 3\n' > "$V/doc-framework/项目档案.md"
for f in 总契约 测试规范 接口规范; do echo "# $f" > "$V/doc-framework/$f.md"; done
echo fe > "$V/doc-framework/规范/前端开发规范.md"; echo be > "$V/doc-framework/规范/后端开发规范.md"
printf '# 2025-01-01 旧计划实施\n> 状态：已完成\n\n## 二、变更文件清单\n| 文件 | 说明 |\n|---|---|\n| src/main/A.java | 改动 |\n' > "$V/doc-framework/模块/订单/计划/2025-01-01-旧计划.md"
V_OUT=$(run "$V" check 2>&1); V_CODE=$?
assert_exit "$V_CODE" "1" "旧格式档案（无应用清单）：check 失败（不再兼容放行）" "旧格式档案未失败（exit=${V_CODE}）"
assert_grep "$V_OUT" "档案缺「应用清单」节" "旧格式档案：报「档案缺应用清单节」" "旧格式档案未报缺应用清单"

# 9.0 check --json 的硬问题形态（V 在上一段创建；干净项目 / 规则目录的 JSON 在 §7.3）
JSON_BAD=$(run "$V" check --json 2>&1)
assert_json "$JSON_BAD" "d['ok'] is False and d['counts']['error'] > 0 and any(e['rule'].startswith('DF-') for e in d['issues'])" "check --json：硬问题 ok=false + error 计数" "check --json：硬问题输出异常"

# 7.5 check --json 无文档根：也要输出 JSON（CI 不特判），规则码 DF-PRE-001
NO_DOC=$(run "$TMP" check --json 2>&1)
assert_json "$NO_DOC" "d['ok'] is False and d['issues'][0]['rule'] == 'DF-PRE-001'" "check --json：缺文档根输出结构化错误" "check --json：缺文档根输出异常"

# 7.4 template：未作为依赖安装也能取官方模板（单安装方式的关键配套）
TPL_LIST=$(run "$TMP" template --list 2>&1)
assert_grep "$TPL_LIST" "项目档案.md.tpl" "template --list：列出官方模板" "template --list：未列出模板"
TPL_DOC=$(run "$TMP" template 项目档案 2>&1)
assert_grep "$TPL_DOC" "# 项目档案" "template：打印模板内容（不带 .tpl 也能解析）" "template：模板内容/名称解析异常"

# ── 9.1 重复代码根：两个应用登记同一个根 → 文件归属不确定，必须硬报 ──
# 旧实现只查「互相嵌套」，同根两份登记会静默通过；matchApp 取遍历到的第一个 = 授权边界不确定。
DUP="$TMP/dup-root"; mk_project "$DUP"
printf '| svc-order2 | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' >> "$DUP/doc-framework/项目档案.md"
DUP_OUT=$(run "$DUP" check 2>&1); DUP_CODE=$?
assert_exit "$DUP_CODE" "1" "重复代码根：check 失败（归属不确定）" "重复代码根被静默放行（exit=${DUP_CODE}）"
assert_grep "$DUP_OUT" "应用代码根重复登记" "重复代码根：报「应用代码根重复登记」" "重复代码根未报出"
assert_grep "$DUP_OUT" "svc-order2" "重复代码根：点名重复的应用" "重复代码根未点名应用"
