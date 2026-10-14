#!/usr/bin/env bash
# ============================================================
# doc-framework 维护者自检（核心回归，需 node >= 16）
# 用法：bash scripts/selftest.sh
#       NODE_BIN=/path/to/node bash scripts/selftest.sh   # 指定 node
#
# 覆盖的是历史上真实踩过的坑（v2.1 / v2.2 审查修复项），作为合并门禁：
#   1. 官方计划模板渲染后 check 通过（清单里的文档路径/标题行不得误报）
#   2. 清单节内代码围栏中的示例路径不得进入白名单
#   3. 代码根 ./apps/x 归一化；表态「本次不改」的应用被改 → diff-check 必须报错
#   4. 含空格的路径按整格解析，不被空白拆散
#   5. 坏计划（同名目录）必须显式报错，不得静默通过
#   6. show/diff-check 传目录 → 干净报错，不得抛 Node 栈
#   7. 英文文档根已下线（v2.6.0）：doc-framework-en/ 与旧名 docs-framework/ 必须**显式报错 + 给迁移方向**，
#      不得落进"未初始化/缺文件"或静默降级；check/list/diff-check 三个入口都要有守卫；中文根不受误伤
#   8. 探索/ 中的开放标记不参与占位符硬校验
#   9. v1.x 旧项目（无应用清单/旧格式计划）check 通过
#  10. 直改通道 diff-check --module：边界=契约 §5 落点（落点内通过 / 落点外拦截）
#  11. 轻量计划形态：合规通过、缺表态硬报错；list --stale 命中停滞计划
#  12. 轻量计划全链路：应用清单 + 轻量计划解析 + 白名单对账 + 契约 §5 直改边界
#  13. 契约模型 v2.2：语义增量 / 合并状态三值 / I2（含归档兜底，不可用 计划/归档 或 计划/archive 绕过）/
#      I3 主计划列 /
#      首次建模形态与分档校验 / 依据探索记录哨兵（含纯行写法兼容）/ 轻量计划不得含非空增量 /
#      MODIFIED 表列位 / 合并状态带日期与无法识别的文案 / v2.1 存量计划免迁移 / 生命周期全绿
#  14. 审查加固（解析稳健性与闸门口径）：无反引号的「依据模块契约」不误判首次建模 / 计划放进计划目录
#      子目录不可绕过 I2 / 加粗字段名（**状态**：）可解析 / 单段路径（package.json）进白名单 /
#      diff-check 缺状态硬报错 / --staged 不并入未跟踪文件 / 首次建模缺「计划形态」行按非完整硬报错 /
#      建档兜底要求增量非空 / 标「已合并」但契约缺失硬报错 / 主计划列 n/a 视为空 /
#      list --state 中文枚举 / 中文占位符残留 / 应用类型中英词表取并集（数据兼容别名）/ 已废弃计划的 I4 出口提示 /
#      混排目录布局（modules/…/plans/）不再静默盲区
#  15. R4 结构版本哨兵（存在且落后 → ⚠️ 进退出码；无哨兵 → 仅 1 条汇总 ℹ️ 不影响退出码）/
#      模板一律用**占位哨兵** `{{框架版本}}`（版本号只有 package.json 一个来源）/
#      占位哨兵不判落后、注入旧哨兵仍判落后
#  16.（已随 v2.8.0 下线）原 R3 契约 §9 回链凭据校验——它只查"已存在的 §9 行有没有写凭据"，
#      **漏写不报**，机器价值≈0；判据升级为类目 23 的「文档落后检查」（依 git 历史，漏回写可发现）。
#      相关断言全部移除（parseContractMergeRows / SOURCE_VALUES / isSourceValue 同步删除）。
#  17. 解析健壮性 + 安装/同步闭环：**节名大小写不敏感**（中文节名夹大写英文词也要认，
#      否则 I2/应用清单/直改边界静默降级）/ **ADD-1 编号增量**被识别（I2 不静默失效）/
#      小节标题归一（剥离尾部连续括注组 + 去章号）/
#      **sync：marker 缺源文件条目（上游在既有 skill 目录新增文件）不再误判"本地已定制"导致升级搁浅**/
#      **install：targetDirs 空值不倒进项目根** + **不再发布的幽灵技能目录被清理**
#  18. 接入初始化闭环：`scripts/selftest-render-fixture.py` 把**全部模板**真渲染成一套文档骨架 →
#      **双括号待填字段清零 + 单括号记法保留 + 渲染产物过真实 check 零 ❌**（体系把"渲染模板"交给 AI，
#      此前门禁从不渲染模板，所以"漏登记占位符 / 同一 token 三义 / 短 token 吞长 token"能活很久）/
#      **待填占位符必须都在《接入指南.md》「模板 → 产出映射」登记**（漏登记 = 初始化漏填）/
#      **占位符残留报告必须带文件+个数+改法**（旧实现把整份文件的 token 挤成一行，数百字符刷屏）/
#      **残留花括号进退出码**（硬问题）/
#      **test.sh 模板单一来源**：唯一源存在且无重复副本（历史上同一产物有三份提供者，其中两份逐字节相同、靠断言强同步——那是把重复制度化，v2.6.x 合并为一份）
#  19. 增量解析不再「静默丢行 / 丢章节」：**单花括号记法（`{penaltyId}` / `{域}:{实体}:{操作}`）不得被
#      当占位符丢弃**（旧 `includes('{')` 会丢行，工具只报"增量 N 项"不报错；极端情况下 delta.nonEmpty
#      =false → I2 被绕过）/ **双花括号未渲染行必须显式报出**（check 硬报 + draft-contract 提示）/
#      **§1–§10 全部可映射到契约章节**（旧 chapterOf 只认 §3/4/5/8）/
#      **SKILL.md §2.4 映射表与 plan.CONTRACT_CHAPTERS 单一来源守卫**（防再次漂移，设计文档 §4.2）
#  20. 对外文案不得再用模式字母代号（M/B/C/A）：v2.2 的 A（需求驱动，已废）/ B（代码对账）/ C（产物补齐）/
#      M（合并增量）是 `/module-doc` 处理方式的历史代号；模式名早已改中文，但正文残留过
#      "B 的触发条件…" / "归 /module-doc M" —— 用户读到完全无语义（真实反馈）。
#      只抓"字母被当作模式名"的固定搭配（`方式 A` / `方案 B` / `{模块A}` / 增量行 ID `M1` / `§N.M` / mermaid 节点不算）
#  21. 探索记录生命周期：`list --explore` 聚合 探索/（探索中+已定案）与 探索/归档/（已使用+已作废），
#      解析头部 状态/结论去向/已被 三行；--state 过滤（旧写法 已废弃 按别名识别为 已作废）；
#      与计划过滤选项互斥报错；--json 输出 experimental 结构
#  22. 计划批准入口「调用即批准」（v2.7.1）：计划的「已批准」有两个入口——用户确认；或 `/module-code`
#      执行「待审核」计划时先登记「已批准」再实施（module-code §0.3 是唯一权威）。守卫三件事：
#      **权威节存在且唯一** / **module-plan 状态约定回指它** / **工具闸门没被偷偷放宽**
#      （`diff-check` 仍只放行文件里写明的 已批准·实施中——skill 侧的登记不构成对工具的豁免）/
#      模板同步（总契约 / AGENTS / 接入指南 / 计划模板）
#  23. 文档落后检查（v2.8.0 起**取代 R3 §9 回链凭据校验**）：基线 = 契约/接口.md 最后提交的较晚者；
#      基线之后落点路径（§5「文件位置」∩ 应用代码根）有新提交且提交信息无「契约:无需变更」→ 提示。
#      覆盖：空范围不报 / 未回写报出（默认 ℹ️ 不进退出码）/ --strict 升 ⚠️ 进退出码 /
#      **trailer 提交自身豁免** / 文档提交推进基线转绿 / **文档有未提交改动跳过**（改完未提交窗口必误报）/
#      非 git 目录跳过 / §5 无文件位置跳过 / **§5 路径两种写法**（应用根相对与仓库根相对都能解析，
#      否则 pathspec 匹配不到文件 → 检查静默失效）
#  24. 规范层归属判据（v2.8.0，plan §2.9）：**变更痕迹**（标题版本标记 / 日期+动词 / 来源= / 已作废——
#      反误报：裸日期与 `YYYY-MM-DD-*.md` 文件引用不报；只扫 规范/ 与 边界/，探索·计划不扫）/
#      **跨应用同题**（小节标题剥离尾部括注组归一后出现在 ≥2 份应用规范 → 提示上移 边界/）/
#      小节越界（单节 >80 行 / 小节数 >8 → 建议分册）/ **索引↔分册一致**（指向不存在 → 恒 ⚠️；
#      未被索引 → ℹ️——有机器校验的索引才不会腐坏）
# ============================================================
set -uo pipefail

NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "❌ 找不到 node（可用 NODE_BIN=/path/to/node 指定）"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/scripts/cli.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok()  { printf '  ✅ %s\n' "$*"; PASS=$((PASS+1)); }
bad() { printf '  ❌ %s\n' "$*"; FAIL=$((FAIL+1)); }
run() { ( cd "$1" && shift && "$NODE_BIN" "$CLI" "$@" ); }

# ── 断言助手：统一「先捕获再匹配」口径（避免 pipefail 下 grep -q 的 SIGPIPE 竞态误判）──
# $1=待查输出 $2=模式 $3=命中(或不等于期望)时的 ok 文案 $4=未命中(或等于期望)时的 bad 文案
assert_grep()  { if printf '%s' "$1" | grep -q -- "$2"; then ok "$3"; else bad "$4"; fi; }
assert_ngrep() { if printf '%s' "$1" | grep -q -- "$2"; then bad "$4"; else ok "$3"; fi; }
# $1=实际退出码 $2=期望退出码 $3=相等时的 ok 文案 $4=不等时的 bad 文案
assert_exit()  { if [ "$1" = "$2" ]; then ok "$3"; else bad "$4"; fi; }
# $1=json 文本 $2=对解析结果 d 的布尔表达式（python3）$3=成立时的 ok 文案 $4=不成立的 bad 文案
assert_json()  { if printf '%s' "$1" | python3 -c "import json,sys;d=json.load(sys.stdin);sys.exit(0 if ($2) else 1)" 2>/dev/null; then ok "$3"; else bad "$4"; fi; }

# 建一个标准多应用骨架项目
# $1=目录；其余参数为应用元组 `标识:类型:技术栈:代码根:数据库/存储:依赖的应用`（缺省 =
#   "app-web:前端应用:Vue:./apps/web:—:svc-order" "svc-order:后端服务:Java:services/order:mysql:—"）
mk_project() {
  local d="$1"; shift
  local apps=("$@")
  [ "${#apps[@]}" -eq 0 ] && apps=("app-web:前端应用:Vue:./apps/web:—:svc-order" "svc-order:后端服务:Java:services/order:mysql:—")
  mkdir -p "$d/doc-framework/模块/订单/计划" "$d/doc-framework/边界" "$d/doc-framework/规范" "$d/doc-framework/计划" "$d/services/order/sql/change"
  {
    printf '# 项目档案\n## 应用清单\n'
    printf '| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n'
    printf '|----------|------|--------|--------|----------|-------------|------------|\n'
    local t id typ stack root store dep
    for t in "${apps[@]}"; do
      IFS=':' read -r id typ stack root store dep <<< "$t"
      mkdir -p "$d/${root#./}"
      printf '| %s | %s | %s | %s | `规范/应用-%s.md` | %s | %s |\n' "$id" "$typ" "$stack" "$root" "$id" "$store" "$dep"
      echo "# $id" > "$d/doc-framework/规范/应用-$id.md"
    done
  } > "$d/doc-framework/项目档案.md"
  for f in 总契约 测试规范 接口规范; do echo "# $f" > "$d/doc-framework/$f.md"; done
  echo "# 类型前端" > "$d/doc-framework/规范/类型-前端.md"
  echo "# 类型后端" > "$d/doc-framework/规范/类型-后端.md"
}

echo "==============================================="
echo "doc-framework selftest  $(date '+%F %T')"
echo "==============================================="

# ── 1/2/4：官方模板渲染的计划 ─────────────────────────
# 夹具：用出厂模板渲染出的「标准完整计划」（占位符填真实值）；模板自己过不了 check，新项目第一天就是红的
# 渲染交给 fixture.py 的 --plan-only 模式：取值单一来源（fixture BASE + 计划作业），本条只给**差异覆盖**。
# 顺序纪律：**特异整行替换（overlay.lines）先于 token 替换**（fixture 内保证）——否则通用替换会先吃掉
# `{{说明}}`/`{{文件路径}}`，让后面的整行匹配全部失配（这个坑本轮踩过）。
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
  "需求背景与目标描述": "订单模块需要新增导出接口，并支持按订单号过滤。",
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

# ── 7：英文文档根已下线 → 必须显式报错（不是"未初始化"，也不是静默降级）──
# 回归 7：v2.6.0 起只支持中文产物命名。存量英文根项目（doc-framework-en/、旧名 docs-framework/）
# 若被当成"未初始化"或"缺文件"，用户会看到几十行"缺少文件"而找不到病因；必须一条明确报错 + 迁移方向。
E="$TMP/en"; mkdir -p "$E/doc-framework-en/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$E/doc-framework-en/$f"; done
echo fe > "$E/doc-framework-en/standards/frontend.md"; echo be > "$E/doc-framework-en/standards/backend.md"
EN_OUT=$(run "$E" check 2>&1); EN_CODE=$?
assert_exit "$EN_CODE" "1" "英文根 doc-framework-en/：check 显式失败（不再当未初始化）" "英文根未显式失败（exit=$EN_CODE）"
printf '%s' "$EN_OUT" | grep -q "不再支持英文产物命名"  && ok "英文根报错文案含「不再支持英文产物命名」+ 迁移方向" || bad "英文根报错文案不可操作：$EN_OUT"

# 旧英文目录 docs-framework/：同样显式失败（历史名也不静默兼容）
L="$TMP/en-legacy"; mkdir -p "$L/docs-framework/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$L/docs-framework/$f"; done
LEGACY_OUT=$(run "$L" check 2>&1); LEGACY_CODE=$?
if [ "$LEGACY_CODE" = "1" ] && printf '%s' "$LEGACY_OUT" | grep -q "不再支持英文产物命名"; then
  ok "旧英文根 docs-framework/：显式失败并提示迁移"
else
  bad "旧英文根未显式失败（exit=$LEGACY_CODE）"
fi

# 并存场景：中文根已就位、英文根还留着 → 必须提示清理（否则遗留目录永远无人提示）
CP="$TMP/coexist"; mk_project "$CP"; mkdir -p "$CP/doc-framework-en"; echo x > "$CP/doc-framework-en/profile.md"
printf '%s' "$(run "$CP" check 2>&1)" | grep -q "遗留的英文文档根"  && ok "英文根与中文根并存：提示清理遗留目录" || bad "并存场景未提示清理遗留英文根"

# 英文根下 list/show/diff-check 同样要报错，不能只 check 有守卫
run "$E" list >/dev/null 2>&1 && bad "英文根下 list 未报错" || ok "英文根下 list 也显式报错"
run "$E" diff-check --module order >/dev/null 2>&1 && bad "英文根下 diff-check 未报错" || ok "英文根下 diff-check 也显式报错"

# 中文根不受影响（回归护栏：守卫不能误伤正常项目）
mk_project "$TMP/zh-ok"
run "$TMP/zh-ok" check >/dev/null 2>&1 && ok "中文根 doc-framework/ 正常通过（守卫未误伤）" || bad "中文根被英文根守卫误伤"

# ── 8：探索/ 开放标记豁免 ──
# 回归 8：探索笔记里的 {待验证} 是记录内容本身，不是待渲染占位符——否则探索产物永远红
P2="$TMP/p2"; mk_project "$P2"; mkdir -p "$P2/doc-framework/探索"
echo '结论：{待验证}。' > "$P2/doc-framework/探索/2025-01-01-权限模型.md"
run "$P2" check >/dev/null 2>&1 && ok "探索/ 中的开放标记不触发硬校验" || bad "探索/ 触发占位符硬失败"

# ── 9：v1.x 旧项目向后兼容 ──
# 回归 9：v1.x 存量项目（无应用清单、旧格式计划）必须照样通过——升级框架不能逼人先补文档才能提交
V="$TMP/v1"; mkdir -p "$V/doc-framework/"{模块/订单/计划,边界,规范,计划}
printf '# 项目档案\n## 技术栈\n- 后端: Java 17\n- 前端: Vue 3\n' > "$V/doc-framework/项目档案.md"
for f in 总契约 测试规范 接口规范; do echo "# $f" > "$V/doc-framework/$f.md"; done
echo fe > "$V/doc-framework/规范/前端开发规范.md"; echo be > "$V/doc-framework/规范/后端开发规范.md"
printf '# 2025-01-01 旧计划实施\n> 状态：已完成\n\n## 二、变更文件清单\n| 文件 | 说明 |\n|---|---|\n| src/main/A.java | 改动 |\n' > "$V/doc-framework/模块/订单/计划/2025-01-01-旧计划.md"
run "$V" check >/dev/null 2>&1 && ok "v1.x 旧项目（无应用清单/旧格式计划）check 通过" || bad "v1.x 旧项目 check 失败"

# ── 10/11：轻量计划形态 + 停滞计划清单（直改通道用例已并入 §12，避免同一判据两处夹具）──
# 回归 11：轻量形态是给小改动开的出口，表态+清单齐全就该放行；否则大家一律标「完整」，形态失去意义
D="$TMP/direct"; mk_project "$D"
cat > "$D/doc-framework/模块/订单/计划/2025-01-02-文案小改.md" <<'EOF'
# 2025-01-02 文案小改实施

> 计划形态：轻量
> 状态：已批准

## 二、逐应用表态（白名单）
| 应用 | 表态 | 说明 |
|------|------|------|
| app-web | 改动 | 订单列表文案 |

## 三、变更文件清单
| 文件 | 说明 |
|------|------|
| apps/web/in.js | 文案 |
EOF
run "$D" check >/dev/null 2>&1 && ok "轻量计划 check 通过（表态+清单齐全）" || bad "轻量计划 check 失败"
# 轻量可以省章节，但不能省「逐应用表态」——没了表态，白名单无从对账，等于放行任意改动
cat > "$D/doc-framework/模块/订单/计划/2025-01-03-缺表态.md" <<'EOF'
# 2025-01-03 缺表态实施

> 计划形态：轻量
> 状态：已批准

## 三、变更文件清单
| 文件 | 说明 |
|------|------|
| apps/web/in.js | 文案 |
EOF
CHECK_OUT=$(run "$D" check 2>&1)
assert_grep "$CHECK_OUT" "轻量计划缺「逐应用表态」" "轻量计划缺表态被硬报出" "轻量计划缺表态未硬报出"
rm "$D/doc-framework/模块/订单/计划/2025-01-03-缺表态.md"
# list --stale 是「哪些计划停着没动」的巡检入口；形态字段解析不出来就不知道该催谁
LIST_JSON=$(run "$D" list --stale 1 --json 2>/dev/null)
assert_json "$LIST_JSON" "any(p.get('shape')=='轻量' for p in d['plans'])" "list --stale 命中停滞计划并标出形态" "list --stale 未命中停滞计划/未标形态"

# ── 12：轻量计划全链路（应用清单 / 轻量计划 / diff-check / 直改边界）──
# 中文根 + 轻量计划：表态=改动 ∩ 清单 = 白名单；落点外应用必须被拦（应用级边界）
LZ="$TMP/light-full"
mk_project "$LZ" "app-web:前端应用:Vue:apps/web:—:svc-order" "app-mobile:前端应用:uniapp:apps/mobile:—:svc-order" "svc-order:后端服务:Java:services/order:mysql:—"
mkdir -p "$LZ/apps/web/src" "$LZ/apps/mobile/src" "$LZ/services/order/src"
cat > "$LZ/doc-framework/模块/订单/契约.md" <<'EOF'
# 订单契约
## 5. 应用落点
| 应用 | 页面结构 | 文件位置 | 权限控制方式 | 差异说明 |
|------|----------|----------|--------------|----------|
| svc-order（主责） | — | order/OrderController.java | @PreAuthorize | 业务真相 |
| app-web | 列表页 | views/order/… | v-hasPermi | — |
EOF
cat > "$LZ/doc-framework/模块/订单/计划/2025-01-02-文案微调.md" <<'EOF'
# 2025-01-02 文案微调

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：轻量
> 状态：已批准

## 2. 逐应用表态

| 应用 | 表态 | 说明 |
|------|------|------|
| app-web | 改动 | 仅文案 |

## 3. 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| app-web | apps/web/src/list.js | 文案 |

## 4. 任务清单
- [ ] 1.1 改文案
EOF
( cd "$LZ" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
run "$LZ" check >/dev/null 2>&1 && ok "轻量计划：应用清单 + 计划解析通过（check）" || { bad "轻量计划 check 失败"; run "$LZ" check | sed 's/^/     /'; }
echo x >> "$LZ/apps/web/src/list.js"
run "$LZ" diff-check doc-framework/模块/订单/计划/2025-01-02-文案微调.md >/dev/null 2>&1  && ok "轻量计划：白名单对账通过（表态=改动 / 清单命中）" || bad "轻量计划白名单对账失败"
# 直改通道（diff-check --module：边界 = 契约 §5 应用落点）——落点内的改动必须放行（原 §10 并入）
run "$LZ" diff-check --module 订单 >/dev/null 2>&1 && ok "直改通道：落点内改动通过（应用级边界）" || bad "直改通道误报越界（落点内）"
echo x > "$LZ/apps/mobile/src/b.js"
if run "$LZ" diff-check --module 订单 >/dev/null 2>&1; then
  bad "直改通道漏报落点外应用（契约 §5 未生效）"
else
  ok "契约 §5 应用落点作为直改边界生效"
fi
LZ_JSON=$(run "$LZ" list --json 2>/dev/null)
assert_json "$LZ_JSON" "any(p.get('module')=='订单' and p.get('shape')=='轻量' for p in d['plans'])" "list 解析出模块名与形态（轻量）" "list 未解析出模块名/形态"

# ── 13：契约模型 v2.2（语义增量 / 合并状态三值 / I2 / I3 / 首次建模分档 / 哨兵）──
M="$TMP/model"; mk_project "$M"
mkdir -p "$M/doc-framework/探索" "$M/services/order/src"
echo "# 订单契约" > "$M/doc-framework/模块/订单/契约.md"
echo "# 探索记录" > "$M/doc-framework/探索/2025-03-01-新模块探索.md"
echo x > "$M/services/order/src/A.java"

# 完整计划骨架：$1=路径 $2=状态 $3=合并状态 $4=增量行 $5=建模补充节（y/n）
mk_plan() {
  local f="$1"; shift
  {
    printf '# 2025-03-0X 计划实施\n\n'
    printf '> 依据模块契约：`doc-framework/模块/订单/契约.md`\n'
    printf '> 计划形态：完整\n'
    printf '> 状态：%s\n\n' "$1"; shift
    printf '## 语义增量（delta）\n\n> 合并状态：%s\n\n' "$1"; shift
    printf '### ADDED（新增）\n\n| # | 目标位置 | 对象 | 内容 | 主计划 |\n|---|----------|------|------|--------|\n%s\n\n' "$1"; shift
    if [ "$1" = "y" ]; then printf '## 建模补充\n\n### M1 边界\n\n{x}\n\n'; fi
    printf '## 变更文件清单\n\n| 文件 | 说明 |\n|------|------|\n| services/order/src/A.java | 主责 |\n'
  } > "$f"
}
DELTA_ROW='| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |'

# 13.1 I2：已完成 + 非空增量 + 待合并 → 硬报错；翻「已合并」→ 通过
# （原 13.8「合并状态参与 I2」与这里是同一判据同一链路，已并入本条；其英文形态用例
#   随英文产物命名下线而删除，原中文用例的 3 列清单格式由 §12 轻量计划覆盖）
mk_plan "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md" 已完成 待合并 "$DELTA_ROW" n
assert_grep "$(run "$M" check 2>&1)" "语义增量未合并" "I2：已完成但增量待合并 → 硬报错" "I2 未硬报出"
sed -i.bak 's/> 合并状态：待合并/> 合并状态：已合并（2025-03-03）/' "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md" && rm -f "$M"/doc-framework/模块/订单/计划/*.bak
run "$M" check >/dev/null 2>&1 && ok "I2：翻成「已合并」后 check 通过" || { bad "I2 已合并后仍失败"; run "$M" check | sed 's/^/     /'; }

# 13.2 空增量（纯实现改动）+ 无需合并 + 已完成 → 通过（I2 的"增量非空"限定）
mk_plan "$M/doc-framework/模块/订单/计划/2025-03-03-纯实现.md" 已完成 无需合并 '' n
run "$M" check >/dev/null 2>&1 && ok "I2：空增量 + 无需合并 → 通过" || { bad "空增量被误报"; run "$M" check | sed 's/^/     /'; }

# 13.3 I3：同模块两份「主计划」列为空的非空增量 → 硬报错
mkdir -p "$M/doc-framework/模块/结算/计划"; echo "# 结算契约" > "$M/doc-framework/模块/结算/契约.md"
for n in 01 02; do
  sed 's|模块/订单/契约.md|模块/结算/契约.md|' "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md"  > "$M/doc-framework/模块/结算/计划/2025-03-${n}-拆分计划.md"
done
assert_grep "$(run "$M" check 2>&1)" "未回指主计划" "I3：两份主计划为空的增量计划 → 硬报错" "I3 未硬报出"
rm -f "$M"/doc-framework/模块/结算/计划/2025-03-01-拆分计划.md
run "$M" check >/dev/null 2>&1 && ok "I3：回指/只剩一份后 check 通过" || { bad "I3 单份仍失败"; run "$M" check | sed 's/^/     /'; }
rm -f "$M"/doc-framework/模块/结算/计划/2025-03-02-拆分计划.md

# 13.4 首次建模 + 轻量形态 → 硬报错
mkdir -p "$M/doc-framework/模块/对账/计划"
cat > "$M/doc-framework/模块/对账/计划/2025-03-04-轻量首次建模.md" <<'EOF'
# 2025-03-04 对账首次建模实施

> 依据探索记录：`doc-framework/探索/2025-03-01-新模块探索.md`
> 计划形态：轻量
> 状态：已批准

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/Recon.java | 新增 |
EOF
assert_grep "$(run "$M" check 2>&1)" "必须是「完整」形态" "首次建模：轻量形态 → 硬报错" "轻量首次建模未硬报出"

# 13.5 首次建模 + 契约已存在 → 硬报错
mkdir -p "$M/doc-framework/模块/对账/计划"
cat > "$M/doc-framework/模块/对账/计划/2025-03-05-契约已存在.md" <<'EOF'
# 2025-03-05 对账首次建模实施

> 依据探索记录：`doc-framework/探索/2025-03-01-新模块探索.md`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|

## 建模补充
### M1 边界
{x}

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/Recon.java | 新增 |
EOF
rm -f "$M"/doc-framework/模块/对账/计划/2025-03-04-轻量首次建模.md
cp "$M/doc-framework/模块/订单/契约.md" "$M/doc-framework/模块/对账/契约.md"
assert_grep "$(run "$M" check 2>&1)" "契约已存在" "首次建模：契约已存在 → 硬报错（走存量路径）" "契约已存在的首次建模未硬报出"
rm -f "$M"/doc-framework/模块/对账/契约.md "$M"/doc-framework/模块/对账/计划/2025-03-05-契约已存在.md

# 13.6 首次建模 + 实施中 + 已落代码 → 通过（窗口期不误报）
mkdir -p "$M/doc-framework/模块/报表/计划"
cat > "$M/doc-framework/模块/报表/计划/2025-03-06-窗口期.md" <<'EOF'
# 2025-03-06 报表首次建模实施

> 依据探索记录：`doc-framework/探索/2025-03-01-新模块探索.md`
> 计划形态：完整
> 状态：实施中

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 报表主表 | 字段 y | int | |

## 建模补充
### M1 边界
{x}

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 新增（已落代码） |
EOF
run "$M" check >/dev/null 2>&1 && ok "首次建模：实施中（已有代码、契约未建档）→ 窗口期不误报" || { bad "首次建模窗口期误报"; run "$M" check | sed 's/^/     /'; }
rm -rf "$M/doc-framework/模块/报表"

# 13.7 依据探索记录：哨兵（人工降级）→ 通过；为空 → 硬报错
mkdir -p "$M/doc-framework/模块/归档/计划"
cat > "$M/doc-framework/模块/归档/计划/2025-03-07-哨兵.md" <<'EOF'
# 2025-03-07 归档首次建模实施

> 依据探索记录：无（自述）
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 归档主表 | 字段 z | int | |

## 建模补充
### M1 边界
{x}

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/Recon.java | 新增 |
EOF
run "$M" check >/dev/null 2>&1 && ok "首次建模：依据探索记录=无（自述）哨兵 → 放行（ℹ️）" || { bad "哨兵被硬报错"; run "$M" check | sed 's/^/     /'; }
sed -i.bak '/依据探索记录/d' "$M/doc-framework/模块/归档/计划/2025-03-07-哨兵.md" && rm -f "$M"/doc-framework/模块/归档/计划/*.bak
assert_grep "$(run "$M" check 2>&1)" "缺「依据探索记录」" "首次建模：依据探索记录为空 → 硬报错" "缺依据探索记录未硬报出"
rm -rf "$M/doc-framework/模块/归档"

# 13.9 正常生命周期全绿：首次建模 → 实施 → 建档（契约出现）→ 翻已合并 → check 通过
#      （回归用例：建档后计划仍判"首次建模"，若不豁免"已合并"，"契约已存在"会永久误报）
mkdir -p "$M/doc-framework/模块/流水/计划"
cat > "$M/doc-framework/模块/流水/计划/2025-03-09-首次建模.md" <<'EOF'
# 2025-03-09 流水首次建模实施

> 依据探索记录：`doc-framework/探索/2025-03-01-新模块探索.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 流水主表 | 表 flow | 新建 | |

## 建模补充
### M1 边界
{x}

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/Flow.java | 新增 |
EOF
assert_ngrep "$(run "$M" check 2>&1)" "首次建模计划但该模块契约已存在" "首次建模：未建档时点不报「契约已存在」" "建档前误报「契约已存在」"
echo "# 流水契约" > "$M/doc-framework/模块/流水/契约.md"
assert_grep "$(run "$M" check 2>&1)" "首次建模计划但该模块契约已存在" "首次建模：契约出现但增量未落账 → 报「契约已存在」（防绕过 M）" "契约已出现却未报错"
sed -i.bak 's/> 合并状态：待合并/> 合并状态：已合并（2025-03-10）/' "$M/doc-framework/模块/流水/计划/2025-03-09-首次建模.md" && rm -f "$M"/doc-framework/模块/流水/计划/*.bak
run "$M" check >/dev/null 2>&1 && ok "正常生命周期全绿：建档 + 翻已合并后 check 通过" || { bad "建档+已合并后仍失败（生命周期死锁）"; run "$M" check | sed 's/^/     /'; }
rm -rf "$M/doc-framework/模块/流水"

# 13.10 MODIFIED 表列数（现值 + 目标值 两列）不得错位 —— 回归"目标值被当成主计划"导致 I3 漏判
mkdir -p "$M/doc-framework/模块/复核/计划"; echo "# 复核契约" > "$M/doc-framework/模块/复核/契约.md"
for n in 1 2; do cat > "$M/doc-framework/模块/复核/计划/2025-03-1${n}-改字段.md" <<'EOF'
# 2025-03-1X 改字段实施

> 依据模块契约：`doc-framework/模块/复核/契约.md`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### MODIFIED（修改）
| # | 目标位置 | 对象 | 现值 | 目标值 | 主计划 |
|---|----------|------|------|--------|--------|
| M1 | 接口.md §3.A1 | list 返回字段 | 无 | exportStatus | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 改字段 |
EOF
done
MJSON=$(run "$M" show doc-framework/模块/复核/计划/2025-03-11-改字段.md --json 2>/dev/null)
assert_json "$MJSON" "bool(d['delta']['modified']) and d['delta']['modified'][0]['leadPlan']=='' and d['delta']['modified'][0]['detail']=='无 → exportStatus'" "MODIFIED 表：主计划列取最后一列（现值→目标值 不错位）" "MODIFIED 表列错位（目标值被当成主计划）"
assert_grep "$(run "$M" check 2>&1)" "未回指主计划" "I3：两份仅含 MODIFIED 的增量计划 → 硬报错" "I3 对 MODIFIED-only 计划漏判"
rm -rf "$M/doc-framework/模块/复核"

# 13.11 兼容：`依据模块契约` 写成纯行（非引用块）也必须解析并通过契约引用校验
mkdir -p "$M/doc-framework/模块/兼容/计划"; echo "# 兼容契约" > "$M/doc-framework/模块/兼容/契约.md"
cat > "$M/doc-framework/模块/兼容/计划/2025-03-13-纯行写法.md" <<'EOF'
# 2025-03-13 纯行写法实施

依据模块契约：`doc-framework/模块/兼容/契约.md`
计划形态：完整
状态：已批准

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 改 |
EOF
run "$M" check >/dev/null 2>&1 && ok "兼容：依据字段纯行写法（非引用块）仍解析通过" || { bad "纯行写法的依据字段解析失败（兼容性回归）"; run "$M" check | sed 's/^/     /'; }
rm -rf "$M/doc-framework/模块/兼容"

# 13.12 轻量计划不得含**非空**语义增量（形态判错要拦；空节/纯实现说明不算）
mkdir -p "$M/doc-framework/模块/轻量越界/计划"
cat > "$M/doc-framework/模块/轻量越界/计划/2025-03-14-轻量带增量.md" <<'EOF'
# 2025-03-14 轻量带增量实施

> 计划形态：轻量
> 状态：已批准

## 二、逐应用表态（白名单）
| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | x |

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | int | |

## 三、变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
assert_grep "$(run "$M" check 2>&1)" "轻量计划不得含非空" "轻量计划带非空增量 → 硬报错（形态判错）" "轻量计划带增量未拦"
rm -rf "$M/doc-framework/模块/轻量越界"

# 13.14 I1 回归：v2.1 存量计划（有"计划形态：完整"、无契约引用/无增量节）→ 兼容放行（仅 ℹ️）
mkdir -p "$M/doc-framework/模块/旧版/计划"
cat > "$M/doc-framework/模块/旧版/计划/2025-03-16-旧版计划.md" <<'EOF'
# 2025-03-16 旧版计划实施

> 计划形态：完整
> 状态：已批准

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
run "$M" check >/dev/null 2>&1 && ok "I1：v2.1 存量计划（无契约引用）兼容放行，不硬报错" || { bad "v2.1 存量计划被硬报错（I1 回归）"; run "$M" check | sed 's/^/     /'; }
rm -rf "$M/doc-framework/模块/旧版"

# 13.15 I2 归档兜底：把"已完成 + 未合并增量"移进归档目录（中文 `计划/归档/`），不得因此逃过校验
mkdir -p "$M/doc-framework/模块/归档绕过/计划/归档"; echo "# 归档绕过契约" > "$M/doc-framework/模块/归档绕过/契约.md"
cat > "$M/doc-framework/模块/归档绕过/计划/归档/2025-03-17-绕过.md" <<'EOF'
# 2025-03-17 绕过实施

> 依据模块契约：`doc-framework/模块/归档绕过/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 绕过主表 | 字段 x | int | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
assert_grep "$(run "$M" check 2>&1)" "归档计划「已完成」但语义增量未合并" "I2：中文归档目录（计划/归档/）未合并增量 → 仍硬报错（不可用归档绕过）" "中文归档目录绕过未被拦（I2 兜底缺失）"
# 归档计划不得被当成在途计划扫回来（否则归档动作反而污染 list/体检）
assert_ngrep "$(run "$M" list --all 2>&1)" "2025-03-17-绕过" "归档计划不进在途清单（archived 判定生效）" "归档计划被当成在途计划列出（archived 判定失效）"
rm -rf "$M/doc-framework/模块/归档绕过"

# 13.15b 归档位置识别（v2.6.0：只有中文一套命名——归档目录固定 `计划/归档/`，无历史别名）
mkdir -p "$M/doc-framework/模块/归档位/计划/归档"; echo "# 归档位契约" > "$M/doc-framework/模块/归档位/契约.md"
cat > "$M/doc-framework/模块/归档位/计划/归档/2025-03-20-已归档.md" <<'EOF'
# 2025-03-20 已归档实施

> 依据模块契约：`doc-framework/模块/归档位/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：无需合并

### ADDED（新增）

（无）

## 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| svc-order | services/order/src/A.java | x |
EOF
ARCH=$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');const lex=p.NAMES.zh;const a='$M/doc-framework/模块/归档位/计划/归档/2025-03-20-已归档.md';const id=p.planIdentity('$M',a,lex);const hit=p.collectArchivedPlans('$M/doc-framework',lex).filter(f=>f.includes('已归档'));const inFlight=p.collectPlanPaths('$M/doc-framework',lex).filter(f=>f.includes('已归档'));process.stdout.write(JSON.stringify({hit:hit.length,inFlight:inFlight.length,archived:id.archived}))" 2>&1)
assert_json "$ARCH" "d['hit']==1 and d['inFlight']==0 and d['archived'] is True" "归档位置识别：计划/归档/ 下不被当成在途计划枚举" "归档位置识别异常：$ARCH"
rm -rf "$M/doc-framework/模块/归档位"

# 13.16 I3 文案：合并状态值无法识别时，报错要指向"值无法识别"而非"缺失"
mkdir -p "$M/doc-framework/模块/乱写/计划"; echo "# 乱写契约" > "$M/doc-framework/模块/乱写/契约.md"
cat > "$M/doc-framework/模块/乱写/计划/2025-03-18-乱写.md" <<'EOF'
# 2025-03-18 乱写实施

> 依据模块契约：`doc-framework/模块/乱写/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：随便写

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 乱写主表 | 字段 x | int | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
printf '%s' "$(run "$M" check 2>&1)" | grep -q "合并状态值无法识别" && ok "I3：合并状态值无法识别 → 专门文案（非"缺失"）" || bad "乱写的合并状态文案未区分"
rm -rf "$M/doc-framework/模块/乱写"


# 13.17 I6：增量表单元格内含竖线（反引号包裹的枚举）不得丢列/错位
mkdir -p "$M/doc-framework/模块/竖线/计划"; echo "# 竖线契约" > "$M/doc-framework/模块/竖线/契约.md"
cat > "$M/doc-framework/模块/竖线/计划/2025-03-19-竖线.md" <<'EOF'
# 2025-03-19 竖线实施

> 依据模块契约：`doc-framework/模块/竖线/契约.md`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.3 枚举 | 状态枚举 | `ACTIVE|INACTIVE` | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
PJSON=$(run "$M" show doc-framework/模块/竖线/计划/2025-03-19-竖线.md --json 2>/dev/null)
assert_json "$PJSON" "bool(d['delta']['added']) and d['delta']['added'][0]['detail']=='ACTIVE|INACTIVE' and d['delta']['added'][0]['leadPlan']==''" "增量表单元格含竖线（反引号包裹）→ 不丢列、不误当主计划" "增量表含竖线时丢列/错位"
rm -rf "$M/doc-framework/模块/竖线"

# ── 13.18-13.30：代码审查加固（解析稳健性 / 枚举兜底 / 闸门口径）──
# 每条对应一次真实发现：修的是"静默误判"与"静默放行"，所以断言都要求**行为改变**，不是重复覆盖
R="$TMP/review"; mk_project "$R"
mkdir -p "$R/services/order/src" "$R/doc-framework/模块/订单/计划" "$R/doc-framework/探索"
echo x > "$R/services/order/src/A.java"
echo "# 订单契约" > "$R/doc-framework/模块/订单/契约.md"
echo "# 探索" > "$R/doc-framework/探索/2025-04-01-新模块.md"
( cd "$R" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1

# 13.18 未加反引号的「依据模块契约」不得被误判成"首次建模计划"（否则连锁误报 3 条 ❌）
cat > "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md" <<'EOF'
# 2025-04-02 无引号引用

> 依据模块契约：doc-framework/模块/订单/契约.md
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
run "$R" check >/dev/null 2>&1 && ok "无反引号的「依据模块契约」正常识别（不再误判首次建模）"  || { bad "无反引号引用被误判为首次建模"; run "$R" check | sed 's/^/     /'; }

# 13.19 计划放进计划目录的自建子目录（计划/done/）不得绕过体检与 I2
mkdir -p "$R/doc-framework/模块/订单/计划/done"
sed 's/> 状态：已批准/> 状态：已完成/; s/> 合并状态：待合并/> 合并状态：待合并/'  "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md" > "$R/doc-framework/模块/订单/计划/done/2025-04-03-子目录计划.md"
rm -f "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md"
printf '%s' "$(run "$R" check 2>&1)" | grep -q "语义增量未合并"  && ok "子目录里的计划仍纳入体检（I2 不可用子目录绕过）" || bad "子目录计划逃过 I2 体检"
rm -rf "$R/doc-framework/模块/订单/计划/done"

# 13.20 加粗字段名（> **状态**：/ > **合并状态**：）必须能解析
cat > "$R/doc-framework/模块/订单/计划/2025-04-04-加粗字段.md" <<'EOF'
# 2025-04-04 加粗字段

> **依据模块契约**：`doc-framework/模块/订单/契约.md`
> **计划形态**：完整
> **状态**：已批准

## 语义增量（delta）

> **合并状态**：已合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
| package.json | 单段路径 |
EOF
BOLD=$(run "$R" show doc-framework/模块/订单/计划/2025-04-04-加粗字段.md --json 2>/dev/null)
assert_json "$BOLD" "d['state']=='已批准' and d['mergeState']=='已合并'" "加粗字段名可解析（状态 / 合并状态）" "加粗字段名解析不到（state/mergeState 为空）"
# 13.21 单段路径（package.json）必须进白名单（应用代码根为 . 时会自相矛盾）
assert_json "$BOLD" "'package.json' in d['fileList']" "单段路径进变更文件清单（package.json）" "单段路径被静默丢弃"
rm -f "$R/doc-framework/模块/订单/计划/2025-04-04-加粗字段.md"

# 13.22 diff-check：计划缺状态字段 → 必须硬报错（提交前闸门不能放行）
cat > "$R/doc-framework/模块/订单/计划/2025-04-05-无状态.md" <<'EOF'
# 2025-04-05 无状态

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
NO_STATE=$(run "$R" diff-check doc-framework/模块/订单/计划/2025-04-05-无状态.md 2>&1); NS_CODE=$?
if [ "$NS_CODE" = "1" ] && printf '%s' "$NO_STATE" | grep -q "未解析到状态字段"; then
  ok "diff-check：计划缺状态 → 硬报错（不再 ⚠️ 放行）"
else
  bad "diff-check 放行了缺状态的计划（exit=$NS_CODE）"
fi
rm -f "$R/doc-framework/模块/订单/计划/2025-04-05-无状态.md"

# 13.23 --staged 只有"将要提交的内容"：未跟踪（未 git add）的新文件不得卡住 pre-commit
cat > "$R/doc-framework/模块/订单/计划/2025-04-06-staged口径.md" <<'EOF'
# 2025-04-06 staged 口径

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已批准

## 逐应用表态
| 应用 | 表态 | 说明 |
|------|------|------|
| app-web | 改动 | 只改 web |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| apps/web/untracked-new.js | 未 add 的新文件 |
EOF
echo x > "$R/apps/web/untracked-new.js"          # 未跟踪、未 stage
run "$R" diff-check doc-framework/模块/订单/计划/2025-04-06-staged口径.md --staged >/dev/null 2>&1  && ok "--staged 只检查已暂存内容（未跟踪文件不参与）" || bad "--staged 仍并入未跟踪文件"
rm -f "$R/apps/web/untracked-new.js" "$R/doc-framework/模块/订单/计划/2025-04-06-staged口径.md"

# 13.24 首次建模计划缺「计划形态」行（shape=null）→ 必须按"非完整"硬报错
mkdir -p "$R/doc-framework/模块/查询/计划"
cat > "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md" <<'EOF'
# 2025-04-07 无形态

> 依据探索记录：`doc-framework/探索/2025-04-01-新模块.md`
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 查询主表 | 字段 x | tinyint(1) | |

## 建模补充

### M1 边界

x

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/New.java | 新文件 |
EOF
printf '%s' "$(run "$R" check 2>&1)" | grep -q "必须是「完整」形态"  && ok "首次建模缺「计划形态」行 → 按非完整硬报错" || bad "首次建模 shape=null 被静默放行"

# 13.25 空增量的首次建模计划：只提示"该标无需合并"，不再重复报「已实施但未建档」
sed 's/> 状态：已批准/> 计划形态：完整\n> 状态：已完成/; /^| A1 |/d'  "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md" > "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md"
if printf '%s' "$(run "$R" check 2>&1)" | grep -q "已实施但未建档"; then
  bad "空增量的首次建模计划重复报「已实施但未建档」（根因应与 I2 合并）"
else
  ok "建档兜底要求增量非空（空增量不重复报未建档）"
fi

# 13.26 标「合并状态=已合并」但契约不存在 → 落账无据，必须硬报错
sed 's/> 合并状态：待合并/> 合并状态：已合并/' "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md" > "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
# 补一条非空增量行（"已合并却无契约"只在增量非空时才成立）
python3 - "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding='utf-8')
s = s.replace('|---|----------|------|------|--------|\n',
              '|---|----------|------|------|--------|\n| A1 | 契约 §3.1 查询主表 | 字段 x | tinyint(1) | |\n')
p.write_text(s, encoding='utf-8')
PY
printf '%s' "$(run "$R" check 2>&1)" | grep -q "落账无据"  && ok "首次建模计划标「已合并」但契约缺失 → 硬报错（假合并）" || bad "假合并（已合并但无契约）被放行"
rm -rf "$R/doc-framework/模块/查询"

# 13.27 主计划列写英文空标记（n/a）视为"未回指" → I3 生效
mkdir -p "$R/doc-framework/模块/结算/计划"; echo "# 结算契约" > "$R/doc-framework/模块/结算/契约.md"
for n in 11 12; do
  cat > "$R/doc-framework/模块/结算/计划/2025-04-${n}-拆分.md" <<EOF
# 2025-04-${n} 拆分

> 依据模块契约：\`doc-framework/模块/结算/契约.md\`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 结算主表 | 字段 x | tinyint(1) | n/a |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
done
printf '%s' "$(run "$R" check 2>&1)" | grep -q "未回指主计划"  && ok "主计划列 n/a 视为空 → I3 生效（英文模式不漏判）" || bad "主计划列 n/a 被当成真实回指（I3 漏判）"
rm -rf "$R/doc-framework/模块/结算"

# 13.28 list --state 用中文枚举（唯一枚举集）
run "$R" list --state 已批准 >/dev/null 2>&1  && ok "list --state 接受中文枚举" || bad "list --state 不认中文枚举"
# 13.29 占位符残留：中文模式只报含中日韩字符的（避免误报英文代码片段里的 `{...}`）——
#       标识符式 `{AppName}` 在中文模式下**有意不报**（英文产物命名已下线，不再有该模式）
cp "$R/doc-framework/规范/应用-app-web.md" "$TMP/app-web.bak"
printf '# 应用规范\n\n{应用名称} 的页面结构\n' > "$R/doc-framework/规范/应用-app-web.md"
printf '%s' "$(run "$R" check 2>&1)" | grep -q "占位符未渲染"  && ok "占位符残留：中文占位符被报出" || bad "中文占位符静默通过"
cp "$TMP/app-web.bak" "$R/doc-framework/规范/应用-app-web.md"

# 13.30 应用类型关键词：中文登记值触发类型层规范校验；英文关键词已随别名移除（不再识别）
RT="$TMP/type-cn"; mk_project "$RT"
rm -f "$RT/doc-framework/规范/类型-前端.md"
printf '%s' "$(run "$RT" check 2>&1)" | grep -q "类型-前端"  && ok "应用类型：中文登记（前端应用）触发类型层规范校验" || bad "中文应用类型漏校验"
AT=$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write([p.appTypeMatches('前端应用','front'),p.appTypeMatches('frontend','front')].join(','))" 2>&1)
[ "$AT" = "true,false" ] && ok "应用类型关键词：英文 frontend 不再识别（别名已移除）" || bad "应用类型关键词残留英文识别：$AT"


# 13.31 已废弃计划：不再体检，但 I4 的「废弃出口」要提示（否则增量永远挂在"待合并"）
mkdir -p "$R/doc-framework/模块/退货/计划"; echo "# 退货契约" > "$R/doc-framework/模块/退货/契约.md"
cat > "$R/doc-framework/模块/退货/计划/2025-06-01-废弃未标出口.md" <<'EOF'
# 2025-06-01 废弃未标出口

> 依据模块契约：`doc-framework/模块/退货/契约.md`
> 计划形态：完整
> 状态：已废弃

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 退货主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
OUT31=$(run "$R" check 2>&1); CODE31=$?
if [ "$CODE31" = "0" ] && printf '%s' "$OUT31" | grep -q "已废弃计划建议把「合并状态」标为 无需合并"; then
  ok "已废弃计划提示「废弃出口」（ℹ️，不影响退出码）"
else
  bad "已废弃计划的 I4 出口未提示（exit=$CODE31）"
fi
sed -i.bak 's/> 合并状态：待合并/> 合并状态：无需合并/' "$R/doc-framework/模块/退货/计划/2025-06-01-废弃未标出口.md"
rm -f "$R"/doc-framework/模块/退货/计划/*.bak
assert_ngrep "$(run "$R" check 2>&1)" "已废弃计划建议" "废弃计划标 无需合并 后不再提示" "标无需合并后仍提示废弃出口"
rm -rf "$R/doc-framework/模块/退货"

# 13.32 list --explore：聚合 探索/ + 探索/归档/，头部三行解析，--state/别名/互斥/--json
# 注：$R 在 13.18 段已有一头部无状态的 2025-04-01-新模块.md（state=未知也照常列出），
#     故本段全程计数 = 4（新建）+ 1（旧档）= 5。
mkdir -p "$R/doc-framework/探索/归档"
cat > "$R/doc-framework/探索/2025-06-01-导出方案.md" <<'EOF'
# 2025-06-01 导出方案

> 状态：探索中
> 结论去向：无
> 涉及应用：svc-order
> 交接：无

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/2025-06-02-权限模型v2.md" <<'EOF'
# 2025-06-02 权限模型v2

> 状态：已定案
> 结论去向：已立项→doc-framework/模块/权限/计划/2025-06-03-权限.md
> 涉及应用：svc-order
> 交接：/module-plan 权限

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/归档/2025-05-01-权限模型.md" <<'EOF'
# 2025-05-01 权限模型

> 状态：已废弃
> 已被：2025-06-02-权限模型v2.md（岗位模型取代角色模型）
> 结论去向：无
> 涉及应用：svc-order
> 交接：无

## 1. 背景与问题
x
EOF
cat > "$R/doc-framework/探索/归档/2025-05-02-旧导出.md" <<'EOF'
# 2025-05-02 旧导出

> 状态：已使用
> 结论去向：已立项→doc-framework/模块/订单/计划/2025-05-03-导出.md
> 涉及应用：svc-order
> 交接：/module-plan 订单

## 1. 背景与问题
x
EOF
OUT_E=$(run "$R" list --explore 2>&1)
printf '%s' "$OUT_E" | grep -q "2025-06-02-权限模型v2" && printf '%s' "$OUT_E" | grep -q "进行中"  && ok "list --explore：已定案在根目录显示为进行中" || bad "list --explore：漏列/位置错（已定案）"
printf '%s' "$OUT_E" | grep -q "已被 2025-06-02-权限模型v2.md"  && ok "list --explore：已废弃(旧枚举)归一为已作废并显示 已被" || bad "list --explore：旧枚举 已废弃 未按别名识别"
printf '%s' "$OUT_E" | grep -q "共 5 份探索记录"  && ok "list --explore：两侧目录并集计数正确（含无状态旧档）" || bad "list --explore：计数错误"
printf '%s' "$OUT_E" | grep -q "未知"  && ok "list --explore：无状态头的旧记录显示 未知（降级不崩溃）" || bad "list --explore：旧记录未降级为 未知"
run "$R" list --explore --state 已定案 2>/dev/null | grep -q "权限模型v2"  && ! run "$R" list --explore --state 已定案 2>/dev/null | grep -q "导出方案"  && ok "list --explore --state 过滤生效" || bad "list --explore --state 过滤失效"
run "$R" list --explore --state 已废弃 >/dev/null 2>&1  && ok "list --explore --state 接受旧枚举 已废弃（别名）" || bad "list --explore --state 不认旧枚举"
run "$R" list --explore --module 订单 >/dev/null 2>&1 && bad "list --explore 与计划选项同用未报错"  || ok "list --explore 与计划选项互斥报错"
run "$R" list --explore --state 已完成 >/dev/null 2>&1 && bad "list --explore 未知状态未报错"  || ok "list --explore 未知状态报错"
EJSON=$(run "$R" list --explore --json 2>/dev/null)
assert_json "$EJSON" "d.get('experimental') is True and any(r.get('archived') for r in d['explorations'])" "list --explore --json 输出 experimental 结构（含 archived）" "list --explore --json 结构缺失"
rm -rf "$R/doc-framework/探索"

# ── 15：R4 结构版本哨兵（v2.4.0 起）──
#      （原 R3 契约 §9 回链凭据校验已于 v2.8.0 下线——它只查"已存在的 §9 行有没有写凭据"、漏写不报；
#      判据升级为类目 23 的「文档落后检查」。此处只保留 R4 用例。）
# 15.1 R4：哨兵存在但落后 → ⚠️ 进退出码（文档明确声明旧结构却跑在新框架上）
S="$TMP/sentinel"; mk_project "$S"
printf '# 项目档案\n<!-- doc-framework:docstruct v2.2.0 | x -->\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$S/doc-framework/项目档案.md"
CP="$S/doc-framework/模块/订单/契约.md"
printf '# 订单契约\n## 9. 变更记录\n\n> 本模块的变更历史不在本文件（v2.8.0 起历史归 git）。\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S=$(run "$S" check 2>&1); CODE_S=$?
assert_grep "$OUT_S" "文档结构版本落后于框架" "R4：哨兵落后于框架 → ⚠️ 报出" "R4：哨兵落后未报出"
assert_exit "$CODE_S" "1" "R4：哨兵落后进退出码（exit 1）" "R4：哨兵落后未影响退出码（exit=$CODE_S）"
assert_ngrep "$OUT_S" "缺回链凭据" "R3 已下线：契约 §9 不再有回链凭据校验" "R3 残留：仍在校验 §9 回链凭据"
assert_ngrep "$OUT_S" "已校验" "R3 已下线：不再输出「已校验 N 条 §9 变更记录」" "R3 残留：仍在统计 §9 行数"

# 15.1b R4 计划侧哨兵：在途计划带落后哨兵 → 计入"在途计划的哨兵落后"（批次 5.1 拆分后 stageSkeleton 作用域回归钉死）
printf '<!-- doc-framework:docstruct v2.2.0 | x -->\n# 2026-09-20 订单尾建\n\n> 计划形态：完整\n> 状态：已批准\n' > "$S/doc-framework/模块/订单/计划/2026-09-20-订单尾建.md"
OUT_SP=$(run "$S" check 2>&1)
assert_grep "$OUT_SP" "在途计划的哨兵落后" "R4：在途计划哨兵落后被报出（stageSkeleton root 作用域）" "R4：在途计划哨兵落后未报出（root 未入 ctx）"

# 15.3 R4：完全没有哨兵（v2.4.0 之前的文档）→ 只 1 条汇总 ℹ️，不进退出码
N="$TMP/nosentinel"; mk_project "$N"
printf '# 项目档案\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$N/doc-framework/项目档案.md"
OUT_N=$(run "$N" check 2>&1); CODE_N=$?
CNT_N=$(printf '%s' "$OUT_N" | grep -c "未标记「文档结构版本」")
assert_exit "$CNT_N" "1" "R4：无哨兵只报 1 条汇总 ℹ️（不重复 5 份文档）" "R4：无哨兵提示条数异常（$CNT_N）"
assert_exit "$CODE_N" "0" "R4：无哨兵不进退出码（老项目不被门禁逼改文档）" "R4：无哨兵错误地影响退出码（exit=$CODE_N）"

# 15.5 哨兵：五份模板一律用**占位哨兵** `{{框架版本}}` —— 版本号只有 package.json 一个来源。
#      此前 5 份模板各自硬编码版本，发版要手改 6 处、漏一处 R4 就炸（本轮之前一直是人工同步）。
TPL_BAD=""
for t in 总契约 接口规范 测试规范 项目档案 "计划/YYYY-MM-DD-{实施主题}"; do
  grep -q 'doc-framework:docstruct {{框架版本}}' "$ROOT/templates/$t.md.tpl" || TPL_BAD="$TPL_BAD $t"
done
[ -z "$TPL_BAD" ] && ok "哨兵：五份模板均为占位哨兵 {{框架版本}}（版本号只有 package.json 一个来源）"  || bad "哨兵：未用占位哨兵的模板：$TPL_BAD"

# 15.5b 占位哨兵不得被判"落后"（它声明的是"随框架版本"，无从比较）
SD="$TMP/sentinel-ph"; mk_project "$SD"
printf '# 项目档案\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$SD/doc-framework/项目档案.md"
printf '# 总契约\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/总契约.md"
printf '# 测试规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/测试规范.md"
printf '# 接口规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/接口规范.md"
printf '%s' "$(run "$SD" check 2>&1)" | grep -q "文档结构版本落后"  && bad "占位哨兵被误判落后（会把模板产物一律判红）" || ok "占位哨兵不判落后（渲染前也不误报）"

# 15.5c 注入真实版本后，**旧版本仍必须被判落后**（R4 本体没被削弱）
printf '# 总契约\n<!-- doc-framework:docstruct v2.2.0 | x -->\n' > "$SD/doc-framework/总契约.md"
printf '%s' "$(run "$SD" check 2>&1)" | grep -q "文档结构版本落后"  && ok "注入的旧哨兵仍被判落后（R4 判据未被占位哨兵削弱）" || bad "R4 判据被削弱：旧哨兵未报落后"


# ── 17：英文模式解析健壮性 + 安装/同步闭环（审查修复回归）──────────
# 17.1 节名定位的健壮性：mdSection 必须**大小写不敏感**（中文文档里夹英文词、手改大小写都要认），
#      否则 mdSection 返回 null → 上层全部**静默降级**（I2 失效、应用清单消失、直改边界为空），且不报错。
#      同时断言：英文节名**不再**被识别（英文产物命名已下线，见 §7）。
UNIT=$("$NODE_BIN" -e '
const p=require(process.argv[1]);
const a=p.mdSection("## 语义增量（DELTA）\nB\n## X\n","语义增量")||"";
const b=p.mdSection("## 应用清单（APP REGISTRY）\nB\n","应用清单")||"";
const c=p.mdSection("## 5. 应用落点（application footprint）\nB\n","应用落点")||"";
const r=p.appSpecSectionTitles("### 3.1 主题与适老化（本应用核心约定）\n### 3.10 dev 代理（rewrite，不是 pathRewrite）（v1.3 新增）\n");
const d=p.parseDelta("## 语义增量\n> 合并状态：待合并\n### ADDED（新增）\n| # | 目标位置 | 对象 | 内容 | 主计划 |\n|---|---|---|---|---|\n| A1 | 契约 §3 | f | c | |\n",p.NAMES.zh);
process.stdout.write([a.includes("B"),b.includes("B"),c.includes("B"),r.map(t=>t.norm).join("|"),d.nonEmpty].join(","));
' "$ROOT/scripts/lib/plan.js" 2>&1)
[ "$UNIT" = "true,true,true,主题与适老化|dev 代理,true" ] && ok "节名定位：大小写不敏感；小节标题归一（剥括注+去章号）；英文节名不再识别（已下线）" || bad "节名定位异常：$UNIT"

# 17.2 sync 修复：marker 缺某个源文件条目 = 上游在既有 skill 目录里新增了文件，
#      不得被误判为"本地已定制"——否则该目录被跳过、marker 却写成新版本，
#      后续 sync 因"已是最新"整体 no-op，升级连同新文件永久搁浅（无法自愈）。
SY="$TMP/syncfix"; mkdir -p "$SY"
( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
MKR="$SY/.agents/skills/.doc-framework.json"
"$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$MKR'));m.version='v0.0.1';m.files=m.files.filter(f=>f.file!=='module-review/SKILL.md');fs.writeFileSync('$MKR',JSON.stringify(m))" 2>/dev/null
OUT_SY=$( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$CLI" sync 2>&1 )
assert_ngrep "$OUT_SY" "跳过（本地已定制）：module-review" "sync：marker 缺条目不再误判本地定制（目录正常升级）" "sync：marker 缺条目被误判本地定制（上游新增文件随升级搁浅）"

# 17.3 install.js：targetDirs 空值不得把 skill 目录与 marker 倒进项目根（应回退探测）
TD="$TMP/td-empty"; mkdir -p "$TD"; printf '{"targetDirs":""}' > "$TD/doc-framework.config.json"
( cd "$TD" && INIT_CWD="$TD" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
{ [ -d "$TD/module-code" ] || [ -f "$TD/.doc-framework.json" ]; } && bad "install：targetDirs 空值把 skill 装进项目根" || ok "install：targetDirs 空值未污染项目根（回退探测）"
[ -d "$TD/.agents/skills/module-code" ] && ok "install：targetDirs 空值回退到 .agents/skills" || bad "install：targetDirs 空值回退位置异常"

# 17.4 install.js：旧 marker 记录、当前版本已删除/改名的 skill 目录必须清理（幽灵技能 = 多加载一个技能）
GH="$TMP/ghost"; mkdir -p "$GH/.agents/skills/ghost-skill"; echo x > "$GH/.agents/skills/ghost-skill/SKILL.md"
printf '{"version":"v0.0.1","files":[{"file":"ghost-skill/SKILL.md","hash":"x"}]}' > "$GH/.agents/skills/.doc-framework.json"
( cd "$GH" && INIT_CWD="$GH" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
[ -d "$GH/.agents/skills/ghost-skill" ] && bad "install：不再发布的幽灵技能目录未被清理" || ok "install：不再发布的幽灵技能目录被移除（只清 marker 记录过的）"

# ── 18：接入初始化闭环（模板 → 占位符文档化 → check 输出可读）────────
# 背景：既有用例都用「python3 把模板占位符手填成真实值」，因此从未验证过**接入初始化的完整闭环**——
#      模板里的待填占位符没被《接入指南.md》记录、或渲染后必然残留花括号（模板自身示例文案也用花括号），
#      这两类问题都只在真实初始化时才炸（`check` 对残留花括号是**硬问题**、退出码 1），
#      而本脚本全绿、新用户拿到手第一天就是红的。本组把「模板 ↔ 指南 ↔ check 输出」钉成契约。
INIT_TPL="$ROOT/templates"
GUIDE_TPL="$INIT_TPL/接入指南.md.tpl"

# 18.1 **全模板渲染闭环**（本组最有价值的一条）：把**全部 15 份模板**用脚本真渲染成一套完整文档
#      骨架 → 断言「双括号待填字段清零」+「单括号记法不被误删」+「渲染产物过真实 check 零 ❌」。
#      为什么必须有：体系把"渲染模板"交给 AI，而此前门禁 15 个夹具全是手写 heredoc、从不渲染模板——
#      于是"指南漏登记占位符""同一 token 三义""短 token 吞长 token"这类问题能活很久（都是本轮实测发现的）。
#      语法约定（v2.6.0）：`{{字段}}` 待填（渲染后必须清零）/ `{记法}` 路径与命名记法（照原样保留）/
#      `【…】` 示例与可选项（填好后删除）/ `${…}` shell 真语法（原样保留）。
# 夹具独立成文件：§15.2f「模板自洽」也要用它（渲染真实产物再跑 check），内联会有两份副本
RENDER_OUT=$(python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$TMP/render-full")
[ -z "$RENDER_OUT" ] && ok "全模板渲染闭环：16 份模板渲染后双括号清零、记法保留、产物过 check"  || bad "全模板渲染闭环失败：$RENDER_OUT"


# 18.2 check 的占位符残留输出必须可定位：带文件路径 + 个数 + 改法提示。
#      （历史实现把该文件全部 token 挤在一行，输出长达数百字符，真实问题被刷屏淹没）
PO="$TMP/ph-noise"; mk_project "$PO"
printf '# 总契约\n\n| 模块 | 说明 |\n|---|---|\n| {模块A} | {一句话说明} |\n' > "$PO/doc-framework/总契约.md"
OUT_PO=$(run "$PO" check 2>&1); CODE_PO=$?
printf '%s' "$OUT_PO" | grep -q '总契约.md'  && ok "占位符残留：报告带文件路径" || bad "占位符残留：报告未带文件路径"
printf '%s' "$OUT_PO" | grep -q '占位符未渲染（'  && ok "占位符残留：报告带个数（便于判断工作量）" || bad "占位符残留：报告未带个数"
printf '%s' "$OUT_PO" | grep -q '改法：'  && ok "占位符残留：报告带改法提示（替换或删除示例行）" || bad "占位符残留：报告缺改法提示"
# 占位符残留是**硬问题**：模板渲染不干净必须让退出码为 1（否则 CI 静默放过"新项目第一天就是红的"）
assert_exit "$CODE_PO" "1" "占位符残留进退出码（模板没渲染干净必须红）" "占位符残留未进退出码（exit=$CODE_PO）——初始化残缺会被静默放过"

# 18.3 单一来源：`模块/{模块名}/test.sh` 的模板源只能有一份
#      历史：同一产物曾有三份提供者（`scripts/e2e_template.sh` 与 `templates/scripts/e2e_template.sh`
#      逐字节相同、加 `templates/模块/{模块名}/test.sh.tpl`），靠一条"两份必须一致"的断言强同步——
#      那是把重复制度化，不是修复（重复本可删除，却被写成了"承诺的不变量"）。
#      v2.6.x 合并为唯一源并退役同步断言，这里改成**防复活**守卫。
TS_TPL="$ROOT/templates/模块/{模块名}/test.sh.tpl"
TS_DUP=""
[ -e "$ROOT/scripts/e2e_template.sh" ] && TS_DUP="$TS_DUP scripts/e2e_template.sh"
[ -e "$ROOT/templates/scripts/e2e_template.sh" ] && TS_DUP="$TS_DUP templates/scripts/e2e_template.sh"
if [ ! -f "$TS_TPL" ]; then
  bad "test.sh 模板唯一源缺失：templates/模块/{模块名}/test.sh.tpl 不存在"
elif [ -n "$TS_DUP" ]; then
  bad "test.sh 模板出现重复副本（应并入唯一源，不另建第二份）：$TS_DUP"
else
  ok "test.sh 模板单一来源：唯一源存在且无重复副本"
fi

# ── 19：增量解析的两类「静默丢行 / 章节丢失」回归 ──────────────────────
# 背景（实际使用中踩到，工具当时只报"增量 N 项"、不报错）：
#   ① parseDelta 旧用 `includes('{')` 判"未渲染占位符"，把**单花括号记法**（路由参数 `{penaltyId}` /
#      权限标识 `{域}:{实体}:{操作}`）也当占位符 → 合法增量行被静默丢弃（total 只是变小）；
#      极端情况下整表归零 → delta.nonEmpty=false → I2 硬校验被绕过。
#   ② check --draft-contract 的 chapterOf 只认 §3/§4/§5/§8 → §1/§2/§6/§7/§9/§10 一律"未识别 → 人工定位"，
#      而 SKILL.md §2.4 映射表与工具自己的"九步"文案都列了更多章。
# 判据：单花括号行必须**保留**；双花括号行必须**显式报出**而非静默跳过；§1–§10 全部可映射。
B19="$TMP/braces"; mk_project "$B19"
mkdir -p "$B19/doc-framework/模块/罚息/计划"
cat > "$B19/doc-framework/模块/罚息/计划/2025-05-01-罚息缴纳.md" <<'EOF'
# 2025-05-01 罚息缴纳实施

> 计划形态：完整
> 状态：已批准

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §1 模块定位 | 定位 | 一句话定位 | |
| A2 | 契约 §2 边界约定 | 边界 | 不做导出 | |
| A3 | 契约 §3.1 | 罚息表 | 新增 paid_amount | |
| A4 | 契约 §4.2 | 缴纳接口 | PUT /info/penalty/{penaltyId}/paid-amount | |
| A5 | 契约 §4.2 | 权限标识 | `{域}:{实体}:{操作}` | |
| A6 | 契约 §5 | 落点 | 前端页面 | |
| A7 | 契约 §6 标杆参考 | 标杆 | 参照订单 | |
| A8 | 契约 §7 特殊约定与陷阱 | 约定 | 需登录态 | |
| A9 | 契约 §8.2 | 验收 | 缴纳成功 | |
| A10 | 契约 §9 变更记录 | 记录 | 追加一行 | |
| A11 | 契约 §10 生产 SQL 登记 | SQL | 加字段脚本 | |
| A12 | 契约 §4.2 | 未渲染行 | {{目标值}} | |
EOF
DC19="$(run "$B19" check --draft-contract doc-framework/模块/罚息/计划/2025-05-01-罚息缴纳.md 2>&1)"
printf '%s' "$DC19" | grep -q '增量 11 项'  && ok "增量解析：单花括号记法行未被丢弃（11 项，含 {penaltyId}/{域}）"  || { bad "增量解析：含 {penaltyId}/{域} 的合法行被静默丢弃"; printf '%s\n' "$DC19" | sed 's/^/     /'; }
assert_grep "$DC19" 'A4 ADDED' "增量解析：路由参数 {penaltyId} 行保留" "增量解析：{penaltyId} 行丢失"
assert_grep "$DC19" 'A5 ADDED' "增量解析：权限标识 {域}:{实体}:{操作} 行保留" "增量解析：{域} 行丢失"
assert_grep "$DC19" '未渲染占位符' "增量解析：双花括号行被显式报出（不再静默丢行）" "增量解析：双花括号行被静默跳过"
assert_ngrep "$DC19" 'A12' "增量解析：未渲染行未计入增量" "增量解析：未渲染行被计入增量"
MISSING_SEC=""
for n in 1 2 3 4 5 6 7 8 9 10; do
  printf '%s' "$DC19" | grep -q "契约 §$n " || MISSING_SEC="$MISSING_SEC §$n"
done
[ -z "$MISSING_SEC" ] && ok "章节映射：契约 §1–§10 全部识别" || bad "章节映射：未识别$MISSING_SEC"
assert_ngrep "$DC19" '人工定位' "章节映射：无「未识别 → 人工定位」残留" "章节映射：仍有条目落「未识别 → 人工定位」"
FULL19="$(run "$B19" check 2>&1)"
printf '%s' "$FULL19" | grep -q '未渲染占位符「{{…}}」被跳过'  && ok "check：未渲染增量的丢行不再静默（硬报出）" || bad "check：未渲染增量的丢行仍静默"
# 映射表同步守卫（设计文档 §4.2：新增章节必须同步 SKILL.md §2.4 与 chapterOf）——
# 从 SKILL.md §2.4 表里抽出 `| §N ` 的章节号，与 plan.CONTRACT_CHAPTERS 的键集合比对，防再次漂移。
SKILL_SECS="$(grep -oE '^\| §[0-9]+' "$ROOT/skills/module-doc/SKILL.md" | grep -oE '[0-9]+' | sort -n | uniq | tr '\n' ' ')"
MAP_SECS="$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write(Object.keys(p.CONTRACT_CHAPTERS).sort((a,b)=>a-b).join(' '))" | tr ' ' '\n' | sort -n | uniq | tr '\n' ' ')"
[ "$SKILL_SECS" = "$MAP_SECS" ]  && ok "章节映射单一来源：SKILL.md §2.4 与 CONTRACT_CHAPTERS 一致（$MAP_SECS）"  || bad "章节映射漂移：SKILL.md §2.4=[$SKILL_SECS] vs CONTRACT_CHAPTERS=[$MAP_SECS]"

# ── 20：对外文案不得再用模式字母代号（M/B/C/A）─────────────────────────
# 背景：v2.2 用 A（需求驱动，已废）/ B（代码对账）/ C（产物补齐）/ M（合并增量）指代 /module-doc 的处理方式；
#   模式名改中文后，正文里仍残留 "B 的触发条件…"、"归 /module-doc M" —— 用户读到完全无语义（真实反馈）。
# 判据：只抓"字母被当作模式名"的固定搭配，不误伤 `方式 A` / `方案 B` / `{模块A}` / mermaid 节点 /
#   增量行 ID（`A1`/`M1`/`R1`）/ 章号（`§N.M`）/ 建模补充小节（`M1–M4`）。
MODE_HITS="$(grep -rnE '/module-doc M|由 M |供 M |M 的 |模式 [ABCM][^A-Za-z0-9]|[（(][MBC][）)]|[ABC] 的触发'  "$ROOT/skills" "$ROOT/templates" "$ROOT/README.md" "$ROOT/docs" "$ROOT/scripts/cli.js" "$ROOT/scripts/lib" 2>/dev/null)"
[ -z "$MODE_HITS" ]  && ok "模式命名：对外文案无 M/B/C 字母代号残留"  || { bad "模式命名：仍有字母代号残留（改用中文处理方式名：合并增量 / 代码对账 / 产物补齐）"; printf '%s\n' "$MODE_HITS" | sed 's/^/     /'; }

# ── 22：计划批准入口「调用即批准」（v2.7.1）─────────────────────────────
# 背景：计划通道的「已批准」有两个入口——用户确认；或 `/module-code` 执行「待审核」计划时的
#   **调用即批准**（skill 先登记「已批准」再实施）。规则横跨 module-code §0.3（唯一权威）、
#   module-plan 状态约定、模板与工具闸门，最危险的漂移是**工具侧偷偷放宽**（diff-check 放行
#   「待审核」= 批准门失效且静默）。三条断言钉死：权威节存在、回指不断、闸门未放宽。
MC_AUTH="$(grep -c '^### 0\.3 调用即批准' "$ROOT/skills/module-code/SKILL.md")"
[ "$MC_AUTH" = "1" ]  && ok "调用即批准：module-code §0.3 是唯一权威节（存在且不重复）"  || bad "调用即批准：module-code SKILL.md 缺 §0.3 或重复（= $MC_AUTH）"
MP_REF="$(grep -c '/module-code §0\.3' "$ROOT/skills/module-plan/SKILL.md")"
[ "$MP_REF" -ge 1 ]  && ok "调用即批准：module-plan 状态约定回指 /module-code §0.3（批准入口不漂移）"  || bad "调用即批准：module-plan 未回指 /module-code §0.3"
# 工具闸门：只认文件里写明的可执行状态（skill 侧的登记不构成对工具的豁免）
GATE_LINE="$(grep -c "p.state !== '已批准' && p.state !== '实施中'" "$ROOT/scripts/cli.js")"
[ "$GATE_LINE" = "1" ]  && ok "调用即批准：diff-check 闸门仍只放行 已批准/实施中（未放宽到 待审核）"  || bad "调用即批准：diff-check 可执行状态判据被改动（批准门可能失效，命中 $GATE_LINE 处）"
TPL_HITS="$(grep -rl '调用即批准' "$ROOT/templates" 2>/dev/null | wc -l | tr -d ' ')"
[ "$TPL_HITS" -ge 3 ]  && ok "调用即批准：模板已同步（总契约 / AGENTS / 接入指南 / 计划模板，$TPL_HITS 份）"  || bad "调用即批准：模板未同步（仅 $TPL_HITS 份提到）"

# ── 防「静默跳过」（必须放在最后）───────────────────────────────
# 已观测到：bash 读到脚本后段时**整段跳过**（本节之前的部分照跑），却照样打印 PASS ——
# "少跑一段还报绿"比失败更危险（假绿）。该现象时序相关（加 `bash -x`、或改输出重定向即不复现），
# 根因在 bash 侧、无法在脚本内根治，所以这里用**断言数下限**硬拦：少跑就报错。
# 断言数下限**从脚本自推导**（统计 `ok "` 直调点，再减去 assert_* 四个助手体内的转发调用）——
# 新增用例即自动抬基线，不会再出现"加了用例忘调 MIN、少跑一段仍报绿"的双写漂移。
# 18.4 占位符口径对拍（计划 5.5）：check 的 findPlaceholders（cli.js）与 fixture 的 check_hits
# 必须同口径——剥围栏 / 剥行内代码 / 中日韩过滤逐项一致；唯一有意差异是 {{双括号token}} 的内层匹配
# （check 按"未渲染占位符"报出，fixture 由渲染 left 检查负责），此处钉死不回归。
cat > "$TMP/ph-corpus.md" <<'PHCEOF'
正文 {含中文} 尾
正文 {pure-english} 尾
行内 `{行内中文}` 后 {行外中文}
```text
{围栏内中文}
```
围栏外 {围栏外中文}
半角{x中文y}角
{{双括号中文}} 与 {{double-braces-en}}
纯 {{token}} 无单括号
PHCEOF
JS_PH=$("$NODE_BIN" -e "const c=require('$ROOT/scripts/cli.js');const fs=require('fs');process.stdout.write(JSON.stringify(c.findPlaceholders(fs.readFileSync('$TMP/ph-corpus.md','utf-8'),false)))")
PY_PH=$(python3 -c "
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('fx', sys.argv[1])
fx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)
print(json.dumps(fx.check_hits(open(sys.argv[2], encoding='utf-8').read()), ensure_ascii=False))
" "$ROOT/scripts/selftest-render-fixture.py" "$TMP/ph-corpus.md")
PH_VERDICT=$(PH_JS="$JS_PH" PH_PY="$PY_PH" python3 -c "
import json, os
js = set(json.loads(os.environ['PH_JS'])); py = set(json.loads(os.environ['PH_PY']))
print('OK' if js == py | {'{双括号中文}'} else f'JS={sorted(js)} PY={sorted(py)}')
")
[ "$PH_VERDICT" = "OK" ] && ok "占位符口径对拍：JS/python 单括号残留一致，{{token}} 差异钉死" || bad "占位符口径分叉：$PH_VERDICT"

# ── 23：文档落后检查（v2.8.0 起**取代 R3 契约 §9 回链凭据校验**）──
# 判据：基线 = 契约/接口.md 最后提交的较晚者；基线之后落点路径（§5「文件位置」∩ 应用代码根）
#       有新提交且提交信息无「契约:无需变更」→ 提示。R3 只查"已存在的行有没有写凭据"（漏写不报），
#       本判据查"漏回写"——这正是 R3 从结构上做不到的事。
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
# 23.2 trailer 提交自身豁免（早前无 trailer 的提交仍在清单——豁免是逐提交的，不是"清空历史"）
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

# ── 24：规范层归属判据（v2.8.0，plan §2.9）──
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
assert_exit "$CNT_Z1" "1" "规范层：日期痕迹按文件聚合（文件引用/裸日期未误报）" "规范层：日期痕迹计数异常（$CNT_Z1）——文件引用或裸日期被误报"
assert_exit "$CODE_Z1" "0" "规范层：默认 ℹ️ 不进退出码" "规范层：默认级别影响退出码（exit=$CODE_Z1）"
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
assert_exit "$CODE_Z4" "1" "规范层：索引断链恒 ⚠️ 进退出码" "规范层：索引断链未进退出码（exit=$CODE_Z4）"
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
# 24.8 文本守卫：module-doc §3.1 第 5 步的回写范围是枚举清单（含 边界/、排除应用规范、不再出现"全部下游文档"）——
#      防回归到"全部下游文档"（那是应用规范无界膨胀的结构根因，plan §2.9.1）
MDOC="$ROOT/skills/module-doc/SKILL.md"
grep -q "枚举清单" "$MDOC" && grep -q "边界/" "$MDOC" && ok "文本守卫：module-doc 回写范围为枚举清单（含 边界/）" || bad "文本守卫：回写范围未枚举化"
grep -q "全部下游文档" "$MDOC" && bad "文本守卫：回写范围回归为「全部下游文档」（应用规范无界膨胀的根因复活）" || ok "文本守卫：「全部下游文档」表述已清除"
grep -q "不含应用规范" "$MDOC" && ok "文本守卫：枚举清单明确排除应用规范" || bad "文本守卫：枚举清单未排除应用规范"
# 24.9 六个 SKILL.md 不再要求向契约 §9 追加行（留痕已改道 git trailer）
for sk in module-doc module-code module-plan module-review module-test module-explore; do
  grep -q "§9 追加\|§9 记一行\|§9 记「\|契约 §9 一行\|§9 变更记录追加" "$ROOT/skills/$sk/SKILL.md" && bad "§9 记账残留：$sk 仍要求向契约 §9 追加行" || ok "§9 记账动作已从 $sk 清除"
done

MIN_ASSERTIONS=$(($(grep -c 'ok "' "$0") - 4))
if [ "$PASS" -lt "$MIN_ASSERTIONS" ]; then
  echo "❌ 只执行了 $PASS 条断言（基线 ≥ $MIN_ASSERTIONS）——脚本后段可能被跳过，请重跑"
  FAIL=$((FAIL+1))
fi

echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
