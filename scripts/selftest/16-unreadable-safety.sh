# 15：读取失败不得崩栈、也不得丢问题（阶段返回值的结构性回归）
#
#  26. 读取失败（EACCES / EISDIR / ENOENT）必须降级为一条带 errno 的 ❌，**绝不抛 Node 栈**，
#      且同一次运行里其它已收集的问题照旧报出（issues 不得丢失）。
#      病根（历史缺陷，两次复发）：阶段函数从共享 ctx 解构时漏一个字段 → ReferenceError 中断
#      check，表现为"改了权限反而什么都报不出来"（假绿）。修法是结构性的（阶段返回 { issues, notes }），
#      本条把该结构钉死；判据登记见 docs/设计文档.md §6.3（check 规则表）与 §7.5（解析稳健性）。

RU="$TMP/unreadable"; mk_project "$RU"
rm -f "$RU/doc-framework/接口规范.md"        # 制造一条普通的硬问题
chmod 000 "$RU/doc-framework/项目档案.md"    # 制造不可读路径（EACCES）
RU_OUT="$(run "$RU" check 2>&1)"; RU_CODE=$?
chmod 644 "$RU/doc-framework/项目档案.md"    # 立即恢复权限，避免影响 trap 清理
assert_exit "$RU_CODE" 1 "读取失败：check 干净退出（exit 1）" "读取失败：退出码异常（exit=$RU_CODE）"
assert_grep "$RU_OUT" "无法读取" "读取失败降级为一条 ❌（不抛栈）" "读取失败未降级报出"
assert_grep "$RU_OUT" "缺少文件：doc-framework/接口规范.md" "读取失败不影响其它问题（issues 未丢失）" "读取失败把已收集的问题一起吞了"
assert_ngrep "$RU_OUT" "ReferenceError\|TypeError\|at Object\." "读取失败无 Node 栈" "读取失败吐了 Node 栈"
