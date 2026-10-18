# 15：读取失败不得崩栈、也不得丢问题（阶段返回值的结构性回归）
#
#  26. 读取失败（EACCES / EISDIR / ENOENT）必须降级为一条带 errno 的 ❌，**绝不抛 Node 栈**，
#      且同一次运行里其它已收集的问题照旧报出（issues 不得丢失）。
#      病根（历史缺陷，两次复发）：阶段函数从共享 ctx 解构时漏一个字段 → ReferenceError 中断
#      check，表现为"改了权限反而什么都报不出来"（假绿）。修法是结构性的（阶段返回 { issues, notes }），
#      本条把该结构钉死；判据登记见 docs/设计文档.md §6.3（check 规则表）与 §7.5（解析稳健性）。
#      v3 P0 扩展：必需文件 / 必需目录 / 模块契约（doc-sync）/ 普通 .md（占位符·规范层）
#      的读取失败都走同一份探针 → 去重后一条 ❌，不允许 existsSync 为真就假绿。

RU="$TMP/unreadable"; mk_project "$RU"
rm -f "$RU/doc-framework/接口规范.md"        # 制造一条普通的硬问题
chmod 000 "$RU/doc-framework/项目档案.md"    # 制造不可读路径（EACCES）
RU_OUT="$(run "$RU" check 2>&1)"; RU_CODE=$?
chmod 644 "$RU/doc-framework/项目档案.md"    # 立即恢复权限，避免影响 trap 清理
assert_exit "$RU_CODE" 1 "读取失败：check 干净退出（exit 1）" "读取失败：退出码异常（exit=$RU_CODE）"
assert_grep "$RU_OUT" "无法读取" "读取失败降级为一条 ❌（不抛栈）" "读取失败未降级报出"
assert_grep "$RU_OUT" "缺少文件：doc-framework/接口规范.md" "读取失败不影响其它问题（issues 未丢失）" "读取失败把已收集的问题一起吞了"
assert_ngrep "$RU_OUT" "ReferenceError\|TypeError\|at Object\." "读取失败无 Node 栈" "读取失败吐了 Node 栈"

# 15.2 必需文件不可读（总契约）：existsSync 为真不等于可读，不得假绿
chmod 000 "$RU/doc-framework/总契约.md"
TOTAL_OUT=$(run "$RU" check 2>&1); TOTAL_CODE=$?
chmod 644 "$RU/doc-framework/总契约.md"
assert_exit "$TOTAL_CODE" "1" "不可读总契约：check 失败（不假绿）" "不可读总契约仍通过（假绿）"
assert_grep "$TOTAL_OUT" "无法读取" "不可读总契约：降级为可读告警" "不可读总契约：未报无法读取"
assert_grep "$TOTAL_OUT" "总契约.md" "不可读总契约：点名具体文件" "不可读总契约：未点名文件"
assert_ngrep "$TOTAL_OUT" "ReferenceError\|TypeError\|at Object\." "不可读总契约：无 Node 栈" "不可读总契约：吐了 Node 栈"

# 15.3 必需目录不可读（模块/）：readdir 失败同样要报，不能静默跳过整棵子树
chmod 000 "$RU/doc-framework/模块"
DIR_OUT=$(run "$RU" check 2>&1); DIR_CODE=$?
chmod 755 "$RU/doc-framework/模块"
assert_exit "$DIR_CODE" "1" "不可读模块目录：check 失败（不假绿）" "不可读模块目录仍通过（假绿）"
assert_grep "$DIR_OUT" "无法读取" "不可读模块目录：降级为可读告警" "不可读模块目录：未报无法读取"
assert_ngrep "$DIR_OUT" "ReferenceError\|TypeError\|at Object\." "不可读模块目录：无 Node 栈" "不可读模块目录：吐了 Node 栈"

# 15.4 模块契约不可读：doc-sync 不能把它当成"模块没有契约"而静默跳过
( cd "$RU" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
mkdir -p "$RU/doc-framework/模块/订单"
printf '# 订单契约\n## 5. 应用落点\n\n| 应用 | 文件位置 |\n|---|---|\n| svc-order | services/order/A.java |\n' > "$RU/doc-framework/模块/订单/契约.md"
chmod 000 "$RU/doc-framework/模块/订单/契约.md"
CONTRACT_OUT=$(run "$RU" check 2>&1); CONTRACT_CODE=$?
chmod 644 "$RU/doc-framework/模块/订单/契约.md"
assert_exit "$CONTRACT_CODE" "1" "不可读模块契约：check 失败（doc-sync 不静默跳过）" "不可读模块契约仍通过（doc-sync 静默跳过）"
assert_grep "$CONTRACT_OUT" "无法读取" "不可读模块契约：降级为可读告警" "不可读模块契约：未报无法读取"
assert_grep "$CONTRACT_OUT" "契约.md" "不可读模块契约：点名文件" "不可读模块契约：未点名文件"
assert_ngrep "$CONTRACT_OUT" "ReferenceError\|TypeError\|at Object\." "不可读模块契约：无 Node 栈" "不可读模块契约：吐了 Node 栈"
rm -rf "$RU/doc-framework/模块/订单"

# 15.5 普通 .md 不可读（占位符 / 规范层扫描）：也必须进入同一份 unreadable 汇总
printf '# x\n' > "$RU/doc-framework/规范/不可读.md"
chmod 000 "$RU/doc-framework/规范/不可读.md"
MD_OUT=$(run "$RU" check 2>&1); MD_CODE=$?
chmod 644 "$RU/doc-framework/规范/不可读.md"
rm -f "$RU/doc-framework/规范/不可读.md"
assert_exit "$MD_CODE" "1" "不可读普通文档：check 失败（不假绿）" "不可读普通文档仍通过（假绿）"
assert_grep "$MD_OUT" "无法读取" "不可读普通文档：降级为可读告警" "不可读普通文档：未报无法读取"
assert_grep "$MD_OUT" "不可读.md" "不可读普通文档：点名文件" "不可读普通文档：未点名文件"
assert_ngrep "$MD_OUT" "ReferenceError\|TypeError\|at Object\." "不可读普通文档：无 Node 栈" "不可读普通文档：吐了 Node 栈"
