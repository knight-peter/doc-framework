# 01：官方计划模板渲染 → check/diff-check 基础口径
#
#   1. 官方计划模板渲染后 check 通过（清单里的文档路径/标题行不得误报）
#   2. 清单节内代码围栏中的示例路径不得进入白名单
#   4. 含空格的路径按整格解析，不被空白拆散
#   3. 代码根 ./apps/x 归一化；表态「本次不改」的应用被改 → diff-check 必须报错
#   5. 坏计划（同名目录）必须显式报错，不得静默通过
#   6. show/diff-check 传目录 → 干净报错，不得抛 Node 栈

# ── 1/2/4：官方模板渲染的计划 ─────────────────────────
# 夹具：用出厂模板渲染出的「标准完整计划」（占位符填真实值）；模板自己过不了 check，新项目第一天就是红的
# 渲染交给 fixture.py 的 --plan-only 模式：取值单一来源（fixture BASE + 计划作业），本条只给**差异覆盖**。
# 顺序纪律：**特异整行替换（overlay.lines）先于 token 替换**（fixture 内保证）——否则通用替换会先吃掉
# `{{说明}}`/`{{文件路径}}`，让后面的整行匹配全部失配。
P="$TMP/p1"; mk_project "$P"
cat > "$TMP/p1-overlay.json" <<'EOF'
{"lines": [
 ["> 状态：{{待审核 | 修订中 | 已批准 | 实施中 | 已完成 | 已废弃}}（审核通过后开始编码；`/module-code {计划路径}` **调用即批准**：执行「待审核」计划时自动登记为「已批准」→ 实施中 → 已完成）",
  "> 状态：已批准"],
 ["| {{应用标识1}} | {{改动 / 本次不改 / 不适用}} | {{说明}} |\n| {{应用标识2}} | {{改动 / 本次不改 / 不适用}} | {{说明}} |",
  "| svc-order | 改动 | 主责 |\n| app-web | 本次不改 | 端不动 |"],
 ["| {{服务端应用标识}} | {{文件路径}} | {{说明}} |",
  "| svc-order | services/order/src/A.java | 主责 |\n| svc-order | services/order/src/my module/B.java | 空格路径 |\n| svc-order | ./services/order/src/C.java | 前导./ |"],
 ["\n| {{前端应用标识}} | {{文件路径}} | {{说明}} |", ""],
 ["| {{文件路径}} | {{说明}} |", "| doc-framework/边界/订单边界.md | 边界更新 |"],
 ["`{{服务代码根}}/sql/change/{{YYYY-MM-DD}}_{{模块}}_{{说明}}.sql`",
  "services/order/sql/change/2025-01-02_order_ddl.sql"],
 ["## 4. 任务清单", "```text\napps/不存在的应用/demo.js\n```\n\n## 4. 任务清单"]
],
 "vals": {
  "YYYY-MM-DD": "2025-01-02", "实施主题": "订单改造",
  "需求与证据": "订单模块需要新增导出接口，并支持按订单号过滤。",
  "实施后结果": "运营可在订单列表页一键导出 Excel。",
  "思路": "先加后端导出接口，再挂前端按钮。",
  "不做什么": "不改列表接口既有出参。",
  "本计划特有落账项": "无",
  "理由": "列表需按单号查询", "场景名": "SC-1", "模块": "order"
 },
 "trans": {"{模块名}": "订单"}
}
EOF
RENDER_OUT=$(python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$P" \
  --plan-only "doc-framework/模块/订单/计划/2025-01-02-订单改造.md" --overlay "@$TMP/p1-overlay.json")
[ -z "$RENDER_OUT" ] || bad "计划渲染夹具：$RENDER_OUT"
# 清单里点到的文件必须在工作区真实存在（含空格路径），否则 fileList 对账基准不成立
mkdir -p "$P/services/order/src/my module" && echo x > "$P/services/order/src/my module/B.java" && echo x > "$P/services/order/src/C.java"
echo "# 订单契约" > "$P/doc-framework/模块/订单/契约.md"

# 回归 1：模板自带的说明性路径/标题行不得被当成本计划要改的文件——照抄模板即红，等于劝退新用户
if run "$P" check >/dev/null 2>&1; then ok "官方模板渲染的计划：check 通过（文档路径/SQL/标题行不误报）"; else bad "官方模板渲染的计划：check 失败"; run "$P" check | sed 's/^/     /'; fi

# 回归 2/4：fileList 是 diff-check 白名单的唯一来源，多一条误报、少一条漏报；空格路径与前导 ./ 都必须归一
FL=$(run "$P" show doc-framework/模块/订单/计划/2025-01-02-订单改造.md --json 2>/dev/null | python3 -c "import json,sys;print('\n'.join(json.load(sys.stdin)['fileList']))")
assert_ngrep "$FL" "不存在的应用" "代码围栏示例路径未进白名单" "代码围栏示例路径泄漏进白名单"
assert_grep "$FL" "^services/order/src/my module/B.java$" "含空格路径按整格解析" "含空格路径被拆散/丢失"
assert_grep "$FL" "^services/order/src/C.java$" "前导 ./ 路径已归一化" "前导 ./ 未归一化"

# ── 3：./ 代码根 + 「本次不改」应用被改 → diff-check 必须报错 ──
# 表态「本次不改」的承诺全靠这条拦截兜底；漏报＝越界代码随「只改一个服务」的计划混进提交
( cd "$P" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
echo forbidden > "$P/apps/web/forbidden.js"
if run "$P" diff-check doc-framework/模块/订单/计划/2025-01-02-订单改造.md >/dev/null 2>&1; then
  bad "diff-check 漏报：表态「本次不改」的应用被改却通过"
else
  ok "diff-check 正确拦截「本次不改」应用的越界改动"
fi
rm -f "$P/apps/web/forbidden.js"

# ── 5：坏计划（同名目录）必须显式报错 ──
# 回归 5：计划路径撞上同名目录必须显式报错——静默跳过等于这份计划完全不设防
mkdir -p "$P/doc-framework/计划/坏计划.md"
CHECK_OUT=$(run "$P" check 2>&1)
# 先捕获再匹配：避免 pipefail 下 grep -q 提前退出造成 SIGPIPE 竞态（误判为失败）
assert_grep "$CHECK_OUT" "计划无法解析" "坏计划被显式报出（非静默）" "坏计划被静默忽略"
rmdir "$P/doc-framework/计划/坏计划.md"

# ── 6：传目录 → 干净报错（无 Node 栈） ──
# 回归 6：参数误传目录要给人话报错——抛 Node 栈只会被当成框架崩了，而不是用法问题
OUT=$(run "$P" show doc-framework/模块 2>&1); CODE=$?
if [ "$CODE" = "1" ] && ! echo "$OUT" | grep -q "at Object"; then ok "show 传目录：干净报错 exit 1"; else bad "show 传目录未干净处理（exit=$CODE）"; fi
