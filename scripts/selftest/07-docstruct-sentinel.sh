# 06：R4 结构版本哨兵
#
#  15. R4 结构版本哨兵（存在且落后 → ⚠️ 进退出码；无哨兵 → 仅 1 条汇总 ℹ️ 不影响退出码）/
#      模板一律用**占位哨兵** `{{框架版本}}`（版本号只有 package.json 一个来源）/
#      占位哨兵不判落后、注入旧哨兵仍判落后
#  16. （编号保留，无独立断言——原「契约 §9 回链凭据校验」的功能由类目 23 取代）

# ── 15：R4 结构版本哨兵 ──
# 15.1 R4：哨兵存在但落后 → ⚠️ 进退出码（文档明确声明旧结构却跑在新框架上）
S="$TMP/sentinel"; mk_project "$S"
printf '# 项目档案\n<!-- doc-framework:docstruct v2.2.0 | x -->\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$S/doc-framework/项目档案.md"
CP="$S/doc-framework/模块/订单/契约.md"
printf '# 订单契约\n## 9. 变更记录\n\n> 本模块的变更历史不在本文件（v2.8.0 起历史归 git）。\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S=$(run "$S" check 2>&1); CODE_S=$?
assert_grep "$OUT_S" "文档结构版本落后于框架" "R4：哨兵落后于框架 → ⚠️ 报出" "R4：哨兵落后未报出"
assert_exit "$CODE_S" "1" "R4：哨兵落后进退出码（exit 1）" "R4：哨兵落后未影响退出码（exit=$CODE_S）"
assert_ngrep "$OUT_S" "缺回链凭据" "契约 §9 不再有回链凭据校验" "仍在校验 §9 回链凭据"
assert_ngrep "$OUT_S" "已校验" "不再输出「已校验 N 条 §9 变更记录」" "仍在统计 §9 行数"

# 15.1b R4 计划侧哨兵：在途计划带落后哨兵 → 计入"在途计划的哨兵落后"
printf '<!-- doc-framework:docstruct v2.2.0 | x -->\n# 2026-09-20 订单尾建\n\n> 计划形态：完整\n> 状态：已批准\n' > "$S/doc-framework/模块/订单/计划/2026-09-20-订单尾建.md"
OUT_SP=$(run "$S" check 2>&1)
assert_grep "$OUT_SP" "在途计划的哨兵落后" "R4：在途计划哨兵落后被报出（stageSkeleton root 作用域）" "R4：在途计划哨兵落后未报出（root 未入 ctx）"

# 15.3 R4：完全没有哨兵的文档 → 只 1 条汇总 ℹ️，不进退出码
N="$TMP/nosentinel"; mk_project "$N"
printf '# 项目档案\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$N/doc-framework/项目档案.md"
OUT_N=$(run "$N" check 2>&1); CODE_N=$?
CNT_N=$(printf '%s' "$OUT_N" | grep -c "未标记「文档结构版本」")
assert_exit "$CNT_N" "1" "R4：无哨兵只报 1 条汇总 ℹ️（不重复 5 份文档）" "R4：无哨兵提示条数异常（$CNT_N）"
assert_exit "$CODE_N" "0" "R4：无哨兵不进退出码（老项目不被门禁逼改文档）" "R4：无哨兵错误地影响退出码（exit=$CODE_N）"

# 15.5 哨兵：六份模板一律用**占位哨兵** `{{框架版本}}` —— 版本号只有 package.json 一个来源。
#      （四份全局文档 + 模块契约 + 计划模板。其中**模块契约的哨兵是声明性的**——R4 只校验四份全局文档
#        与在途计划，不逐模块校验契约，见 docs/设计文档.md §6.3 ①A；此处守"不许硬编码版本"。）
TPL_BAD=""
for t in 总契约 接口规范 测试规范 项目档案 "模块/{模块名}/契约" "计划/YYYY-MM-DD-{实施主题}"; do
  grep -q 'doc-framework:docstruct {{框架版本}}' "$ROOT/templates/$t.md.tpl" || TPL_BAD="$TPL_BAD $t"
done
[ -z "$TPL_BAD" ] && ok "哨兵：六份模板均为占位哨兵 {{框架版本}}（版本号只有 package.json 一个来源）"  || bad "哨兵：未用占位哨兵的模板：$TPL_BAD"

# 15.5b 占位哨兵不得被判"落后"（它声明的是"随框架版本"，无从比较）
SD="$TMP/sentinel-ph"; mk_project "$SD"
printf '# 项目档案\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$SD/doc-framework/项目档案.md"
printf '# 总契约\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/总契约.md"
printf '# 测试规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/测试规范.md"
printf '# 接口规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/接口规范.md"
grep -q "文档结构版本落后" <<< "$(run "$SD" check 2>&1)"  && bad "占位哨兵被误判落后（会把模板产物一律判红）" || ok "占位哨兵不判落后（渲染前也不误报）"

# 15.5c 注入真实版本后，**旧版本仍必须被判落后**（R4 本体没被削弱）
printf '# 总契约\n<!-- doc-framework:docstruct v2.2.0 | x -->\n' > "$SD/doc-framework/总契约.md"
grep -q "文档结构版本落后" <<< "$(run "$SD" check 2>&1)"  && ok "注入的旧哨兵仍被判落后（R4 判据未被占位哨兵削弱）" || bad "R4 判据被削弱：旧哨兵未报落后"
