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
#  15. v2.4.0 新规则：R4 结构版本哨兵（存在且落后 → ⚠️ 进退出码；无哨兵 → 仅 1 条汇总 ℹ️ 不影响退出码）/
#      R3 契约 §9「合并」行回链（断链 / 空回链 → ❌；非 .md 反引号 token 不算引用＝误报回归；
#      旧格式无「来源」列 → 仅 ℹ️ 降级）/ 模板一律用**占位哨兵** `{{框架版本}}`（版本号只有 package.json 一个来源）
#  16. v2.5.1 §9 加固：单行 >300 字符 → ℹ️ 提示写短 / 硬校验只针对 合并·实现 行（需求·代码 旧遗留只计数）/
#      「日期-主题」计划标识（无 .md 后缀）也认 / 列数与表头不一致（表头 4 列、后段数据行 3 列）
#      → 来源按取值白名单识别：不把变更内容正文当来源、不因此漏报空凭据（假绿回归）、提示文本不混入正文 /
#      **§9 内多张表时逐表识别表头**（模板的「回链写法」说明表排在变更记录表之前 → 只认第一张表会让
#      R3 对新项目静默失效）/ **当前模板渲染出的契约必须自洽**（§9 被识别 + 示例行满足自己教的回链规则）
#  17. 解析健壮性 + 安装/同步闭环：**节名大小写不敏感**（中文节名夹大写英文词也要认，
#      否则 I2/应用清单/直改边界静默降级）/
#      **变更记录标题**与 **ADD-1 编号增量**被识别（R3/I2 不静默失效）/
#      **sync：marker 缺源文件条目（上游在既有 skill 目录新增文件）不再误判"本地已定制"导致升级搁浅**/
#      **install：targetDirs 空值不倒进项目根** + **不再发布的幽灵技能目录被清理**
#  18. 接入初始化闭环：`scripts/selftest-render-fixture.py` 把**全部模板**真渲染成一套文档骨架 →
#      **双括号待填字段清零 + 单括号记法保留 + 渲染产物过真实 check 零 ❌**（体系把"渲染模板"交给 AI，
#      此前门禁从不渲染模板，所以"漏登记占位符 / 同一 token 三义 / 短 token 吞长 token"能活很久）/
#      **待填占位符必须都在《接入指南.md》「模板 → 产出映射」登记**（漏登记 = 初始化漏填）/
#      **占位符残留报告必须带文件+个数+改法**（旧实现把整份文件的 token 挤成一行，数百字符刷屏）/
#      **残留花括号进退出码**（硬问题）/
#      **test.sh 模板单一来源**：唯一源存在且无重复副本（历史上同一产物有三份提供者，其中两份逐字节相同、靠断言强同步——那是把重复制度化，v2.6.x 合并为一份）
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

# 建一个标准多应用骨架项目
mk_project() {
  local d="$1"
  mkdir -p "$d/doc-framework/模块/订单/计划" "$d/doc-framework/边界" "$d/doc-framework/规范" "$d/doc-framework/计划" \
           "$d/apps/web" "$d/services/order/sql/change"
  cat > "$d/doc-framework/项目档案.md" <<'EOF'
# 项目档案
## 应用清单
| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |
|----------|------|--------|--------|----------|-------------|------------|
| app-web | 前端端 | Vue | ./apps/web | `规范/应用-app-web.md` | — | svc-order |
| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |
EOF
  for f in 总契约 测试规范 接口规范; do echo "# $f" > "$d/doc-framework/$f.md"; done
  echo "# 类型前端" > "$d/doc-framework/规范/类型-前端.md"
  echo "# 类型后端" > "$d/doc-framework/规范/类型-后端.md"
  echo "# app" > "$d/doc-framework/规范/应用-app-web.md"
  echo "# svc" > "$d/doc-framework/规范/应用-svc-order.md"
}

echo "==============================================="
echo "doc-framework selftest  $(date '+%F %T')"
echo "==============================================="

# ── 1/2/4：官方模板渲染的计划 ─────────────────────────
# 夹具：用出厂模板渲染出的「标准完整计划」（占位符填真实值）；模板自己过不了 check，新项目第一天就是红的
P="$TMP/p1"; mk_project "$P"
python3 - "$ROOT" "$P" <<'PYEOF'
import pathlib, re, sys
root, proj = sys.argv[1], sys.argv[2]
s = pathlib.Path(root, 'templates/计划/YYYY-MM-DD-{实施主题}.md.tpl').read_text(encoding='utf-8')

# ── v2.6.0 语法：{{字段}} 待填；单 {} 是路径/命名记法；【…】是示例，填好后删除 ──
# 顺序纪律：**先做"逐行/逐表"的特异替换，再做"逐 token"的通用替换**——否则通用替换会先吃掉
# `{{说明}}`/`{{文件路径}}`，让后面的整行匹配全部失配（这个坑本轮踩过）。
s = s.replace('> 状态：{{待审核 | 修订中 | 已批准 | 实施中 | 已完成 | 已废弃}}（审核通过后开始编码）',
              '> 状态：已批准')
# 逐应用表态：两行示例 → 真实表态（含一个「本次不改」的端，作为越界拦截靶子）
s = s.replace('| {{应用标识1}} | {{改动 / 本次不改 / 不适用}} | {{说明}} |\n'
              '| {{应用标识2}} | {{改动 / 本次不改 / 不适用}} | {{说明}} |',
              '| svc-order | 改动 | 主责 |\n| app-web | 本次不改 | 端不动 |')
# 变更文件清单：含「空格路径」与「前导 ./」两个归一化回归靶子
s = s.replace('| {{服务端应用标识}} | {{文件路径}} | {{说明}} |',
              '| svc-order | services/order/src/A.java | 主责 |\n'
              '| svc-order | services/order/src/my module/B.java | 空格路径 |\n'
              '| svc-order | ./services/order/src/C.java | 前导./ |')
# 前端端 app-web 本次不改 → 不得在清单里登记它的文件（否则 check 硬报错，这是对的）
s = s.replace('\n| {{前端端应用标识}} | {{文件路径}} | {{说明}} |', '')
s = s.replace('| {{文件路径}} | {{说明}} |', '| doc-framework/边界/订单边界.md | 边界更新 |')
s = s.replace('`{{服务代码根}}/sql/change/{{YYYY-MM-DD}}_{{模块}}_{{说明}}.sql`',
              'services/order/sql/change/2025-01-02_order_ddl.sql')

# 其余字段：逐 token 填真值
VAL = {
 'YYYY-MM-DD': '2025-01-02', '实施主题': '订单改造',
 '标杆模块': 'order', '代码路径': 'services/order/src',
 '需求背景与目标描述': '订单模块需要新增导出接口，并支持按订单号过滤。',
 '应用标识1': 'svc-order', '应用标识2': 'app-web',
 '改动 / 本次不改 / 不适用': '改动', '说明': '主责',
 'x.y': '3.1', '表/章节': '订单表', '字段/状态/接口/落点/场景': '字段 orderNo',
 '目标语义': '新增可选过滤参数', '对象': 'orderNo', '现值': '无', '目标值': 'string',
 '理由': '列表需按单号查询',
 '本模块管什么、不管什么；与相邻模块的边界': '管导出与过滤；不管库存。',
 '初始状态': '草稿', '下一状态': '已提交', '动作': '提交',
 '调用谁 / 被谁调用 / 共享的状态机或权限域；跨模块接口的字段与语义（此时该模块尚无契约，接口语义以此为准）': '被 app-web 调用。',
 '场景名': 'SC-1', '前置': '登录', '期望': '返回文件流',
 '服务代码根': 'services/order', '模块': 'order', '文件路径': 'services/order/src/A.java',
 '任务': '实施', '决策1': '复用列表权限', '决策2': '不新增状态',
 '变更类型': '兼容（新增接口）', '验收项': '导出可用', '待确认项': '导出格式',
 '所属服务': 'svc-order', '服务端应用标识': 'svc-order', '前端端应用标识': 'app-web',
}
for k, v in VAL.items():
    s = s.replace('{{%s}}' % k, v)
# 单括号记法：也落到项目实际值（不是照抄）
for k, v in {'{文档根}': 'doc-framework', '{模块名}': '订单', '{主题}': '导出',
             '{域}': 'order', '{实体}': 'order', '{操作}': 'list'}.items():
    s = s.replace(k, v)
s = s.replace('{{框架版本}}', 'v' + '2.6.0')   # 哨兵：填框架版本（渲染时从 package.json 取）
s = re.sub(r'【[^】\n]*】', '', s)
left = sorted(set(re.findall(r'\{\{[^{}\n]*\}\}', s)))
assert not left, '渲染后仍残留双花括号字段：%s' % left
# 在清单节插入代码围栏（示例路径不得进白名单）
s = s.replace('## 4. 任务清单', '```text\napps/不存在的应用/demo.js\n```\n\n## 4. 任务清单')
pathlib.Path(proj, 'doc-framework/模块/订单/计划/2025-01-02-订单改造.md').write_text(s, encoding='utf-8')
PYEOF
# 清单里点到的文件必须在工作区真实存在（含空格路径），否则 fileList 对账基准不成立
mkdir -p "$P/services/order/src/my module" && echo x > "$P/services/order/src/my module/B.java" && echo x > "$P/services/order/src/C.java"
echo "# 订单契约" > "$P/doc-framework/模块/订单/契约.md"

# 回归 1：模板自带的说明性路径/标题行不得被当成本计划要改的文件——照抄模板即红，等于劝退新用户
if run "$P" check >/dev/null 2>&1; then ok "官方模板渲染的计划：check 通过（文档路径/SQL/标题行不误报）"; else bad "官方模板渲染的计划：check 失败"; run "$P" check | sed 's/^/     /'; fi

# 回归 2/4：fileList 是 diff-check 白名单的唯一来源，多一条误报、少一条漏报；空格路径与前导 ./ 都必须归一
FL=$(run "$P" show doc-framework/模块/订单/计划/2025-01-02-订单改造.md --json 2>/dev/null | python3 -c "import json,sys;print('\n'.join(json.load(sys.stdin)['fileList']))")
echo "$FL" | grep -q "不存在的应用" && bad "代码围栏示例路径泄漏进白名单" || ok "代码围栏示例路径未进白名单"
echo "$FL" | grep -q "^services/order/src/my module/B.java$" && ok "含空格路径按整格解析" || bad "含空格路径被拆散/丢失"
echo "$FL" | grep -q "^services/order/src/C.java$" && ok "前导 ./ 路径已归一化" || bad "前导 ./ 未归一化"

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
if printf '%s' "$CHECK_OUT" | grep -q "计划无法解析"; then ok "坏计划被显式报出（非静默）"; else bad "坏计划被静默忽略"; fi
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
[ "$EN_CODE" = "1" ] && ok "英文根 doc-framework-en/：check 显式失败（不再当未初始化）" \
  || bad "英文根未显式失败（exit=$EN_CODE）"
printf '%s' "$EN_OUT" | grep -q "不再支持英文产物命名" \
  && ok "英文根报错文案含「不再支持英文产物命名」+ 迁移方向" || bad "英文根报错文案不可操作：$EN_OUT"

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
printf '%s' "$(run "$CP" check 2>&1)" | grep -q "遗留的英文文档根" \
  && ok "英文根与中文根并存：提示清理遗留目录" || bad "并存场景未提示清理遗留英文根"

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

# ── 10：直改通道（diff-check --module：边界 = 契约 §5 应用落点）──
D="$TMP/direct"; mk_project "$D"; mkdir -p "$D/apps/mobile"
# 追加第三个应用（落点表里没有它 → 必须被拦）
printf '| app-mobile | 前端端 | uniapp | apps/mobile | `规范/应用-app-mobile.md` | — | svc-order |\n' >> "$D/doc-framework/项目档案.md"
echo "# app" > "$D/doc-framework/规范/应用-app-mobile.md"
cat > "$D/doc-framework/模块/订单/契约.md" <<'EOF'
# 订单 契约
## 5. 应用落点
| 应用 | 页面结构 | 文件位置 | 权限控制方式 | 差异说明 |
|------|----------|----------|--------------|----------|
| svc-order（主责） | — | order/OrderController.java | @PreAuthorize | 业务真相 |
| app-web | 列表页 | views/order/… | v-hasPermi | — |
EOF
( cd "$D" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
echo x > "$D/apps/web/in.js"
run "$D" diff-check --module 订单 >/dev/null 2>&1 && ok "直改通道：落点内改动通过（应用级边界）" || bad "直改通道误报越界（落点内）"
echo y > "$D/apps/mobile/out.js"
if run "$D" diff-check --module 订单 >/dev/null 2>&1; then
  bad "直改通道漏报：落点外应用被改却通过"
else
  ok "直改通道拦截落点外应用的改动"
fi

# ── 11：轻量计划形态 + 停滞计划清单 ──
# 回归 11：轻量形态是给小改动开的出口，表态+清单齐全就该放行；否则大家一律标「完整」，形态失去意义
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
if printf '%s' "$CHECK_OUT" | grep -q "轻量计划缺「逐应用表态」"; then ok "轻量计划缺表态被硬报出"; else bad "轻量计划缺表态未硬报出"; fi
rm "$D/doc-framework/模块/订单/计划/2025-01-03-缺表态.md"
# list --stale 是「哪些计划停着没动」的巡检入口；形态字段解析不出来就不知道该催谁
LIST_JSON=$(run "$D" list --stale 1 --json 2>/dev/null)
if printf '%s' "$LIST_JSON" | grep -q '"shape": "轻量"'; then ok "list --stale 命中停滞计划并标出形态"; else bad "list --stale 未命中停滞计划/未标形态"; fi

# ── 12：轻量计划全链路（应用清单 / 轻量计划 / diff-check / 直改边界）──
# 中文根 + 轻量计划：表态=改动 ∩ 清单 = 白名单；落点外应用必须被拦（应用级边界）
LZ="$TMP/light-full"
mkdir -p "$LZ/doc-framework/模块/订单/计划" "$LZ/doc-framework/边界" "$LZ/doc-framework/规范" "$LZ/doc-framework/计划" \
         "$LZ/apps/web/src" "$LZ/apps/mobile/src" "$LZ/services/order/src"
for f in 总契约 测试规范 接口规范; do echo "# $f" > "$LZ/doc-framework/$f.md"; done
cat > "$LZ/doc-framework/项目档案.md" <<'EOF'
# 项目档案
## 应用清单
| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |
|----------|------|--------|--------|----------|-------------|------------|
| app-web | 前端端 | Vue | apps/web | `规范/应用-app-web.md` | — | svc-order |
| app-mobile | 前端端 | uniapp | apps/mobile | `规范/应用-app-mobile.md` | — | svc-order |
| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |
EOF
echo x > "$LZ/doc-framework/规范/类型-前端.md"
echo x > "$LZ/doc-framework/规范/类型-后端.md"
for a in app-web app-mobile svc-order; do echo x > "$LZ/doc-framework/规范/应用-$a.md"; done
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
run "$LZ" diff-check doc-framework/模块/订单/计划/2025-01-02-文案微调.md >/dev/null 2>&1 \
  && ok "轻量计划：白名单对账通过（表态=改动 / 清单命中）" || bad "轻量计划白名单对账失败"
echo x > "$LZ/apps/mobile/src/b.js"
if run "$LZ" diff-check --module 订单 >/dev/null 2>&1; then
  bad "直改通道漏报落点外应用（契约 §5 未生效）"
else
  ok "契约 §5 应用落点作为直改边界生效"
fi
LZ_JSON=$(run "$LZ" list --json 2>/dev/null)
if printf '%s' "$LZ_JSON" | grep -q '"module": "订单"' && printf '%s' "$LZ_JSON" | grep -q '"shape": "轻量"'; then
  ok "list 解析出模块名与形态（轻量）"
else
  bad "list 未解析出模块名/形态"
fi

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
mk_plan "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md" 已完成 待合并 "$DELTA_ROW" n
printf '%s' "$(run "$M" check 2>&1)" | grep -q "语义增量未合并" && ok "I2：已完成但增量待合并 → 硬报错" || bad "I2 未硬报出"
sed -i.bak 's/> 合并状态：待合并/> 合并状态：已合并（2025-03-03）/' "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md" && rm -f "$M"/doc-framework/模块/订单/计划/*.bak
run "$M" check >/dev/null 2>&1 && ok "I2：翻成「已合并」后 check 通过" || { bad "I2 已合并后仍失败"; run "$M" check | sed 's/^/     /'; }

# 13.2 空增量（纯实现改动）+ 无需合并 + 已完成 → 通过（I2 的"增量非空"限定）
mk_plan "$M/doc-framework/模块/订单/计划/2025-03-03-纯实现.md" 已完成 无需合并 '' n
run "$M" check >/dev/null 2>&1 && ok "I2：空增量 + 无需合并 → 通过" || { bad "空增量被误报"; run "$M" check | sed 's/^/     /'; }

# 13.3 I3：同模块两份「主计划」列为空的非空增量 → 硬报错
mkdir -p "$M/doc-framework/模块/结算/计划"; echo "# 结算契约" > "$M/doc-framework/模块/结算/契约.md"
for n in 01 02; do
  sed 's|模块/订单/契约.md|模块/结算/契约.md|' "$M/doc-framework/模块/订单/计划/2025-03-02-增量待合并.md" \
    > "$M/doc-framework/模块/结算/计划/2025-03-${n}-拆分计划.md"
done
printf '%s' "$(run "$M" check 2>&1)" | grep -q "未回指主计划" && ok "I3：两份主计划为空的增量计划 → 硬报错" || bad "I3 未硬报出"
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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "必须是「完整」形态" && ok "首次建模：轻量形态 → 硬报错" || bad "轻量首次建模未硬报出"

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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "契约已存在" && ok "首次建模：契约已存在 → 硬报错（走存量路径）" || bad "契约已存在的首次建模未硬报出"
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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "缺「依据探索记录」" && ok "首次建模：依据探索记录为空 → 硬报错" || bad "缺依据探索记录未硬报出"
rm -rf "$M/doc-framework/模块/归档"

# 13.8 语义增量 → 合并状态参与 I2（中文形态；英文产物命名已下线，原英文用例见 §7 的报错断言）
cat > "$M/doc-framework/模块/订单/计划/2025-03-08-增量.md" <<'EOF'
# 2025-03-08 增量计划

> 依据模块契约：`doc-framework/模块/订单/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单表 | 字段 x | int | |

## 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| svc-order | services/order/src/A.java | x |
EOF
printf '%s' "$(run "$M" check 2>&1)" | grep -q "语义增量未合并" && ok "语义增量：合并状态=待合并 参与 I2" || bad "合并状态未参与 I2"
rm -f "$M/doc-framework/模块/订单/计划/2025-03-08-增量.md"

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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "首次建模计划但该模块契约已存在" && bad "建档前误报「契约已存在」" || ok "首次建模：未建档时点不报「契约已存在」"
echo "# 流水契约" > "$M/doc-framework/模块/流水/契约.md"
printf '%s' "$(run "$M" check 2>&1)" | grep -q "首次建模计划但该模块契约已存在" && ok "首次建模：契约出现但增量未落账 → 报「契约已存在」（防绕过 M）" || bad "契约已出现却未报错"
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
if printf '%s' "$MJSON" | grep -q '"leadPlan": ""' && printf '%s' "$MJSON" | grep -q '无 → exportStatus'; then
  ok "MODIFIED 表：主计划列取最后一列（现值→目标值 不错位）"
else
  bad "MODIFIED 表列错位（目标值被当成主计划）"
fi
printf '%s' "$(run "$M" check 2>&1)" | grep -q "未回指主计划" && ok "I3：两份仅含 MODIFIED 的增量计划 → 硬报错" || bad "I3 对 MODIFIED-only 计划漏判"
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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "轻量计划不得含非空" && ok "轻量计划带非空增量 → 硬报错（形态判错）" || bad "轻量计划带增量未拦"
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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "归档计划「已完成」但语义增量未合并" && ok "I2：中文归档目录（计划/归档/）未合并增量 → 仍硬报错（不可用归档绕过）" || bad "中文归档目录绕过未被拦（I2 兜底缺失）"
# 归档计划不得被当成在途计划扫回来（否则归档动作反而污染 list/体检）
printf '%s' "$(run "$M" list --all 2>&1)" | grep -q "2025-03-17-绕过" && bad "归档计划被当成在途计划列出（archived 判定失效）" || ok "归档计划不进在途清单（archived 判定生效）"
rm -rf "$M/doc-framework/模块/归档绕过"

# 13.15b 归档位置识别（v2.6.0：只有中文一套命名——归档目录固定 `计划/归档/`，无历史别名）
mkdir -p "$M/doc-framework/模块/归档位/计划/归档"; echo "# 归档位契约" > "$M/doc-framework/模块/归档位/契约.md"
cp "$M/doc-framework/模块/归档绕过/计划/归档/2025-03-17-绕过.md" /tmp/.df-arch-probe 2>/dev/null || true
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
printf '%s' "$ARCH" | grep -q '"hit":1,"inFlight":0,"archived":true' \
  && ok "归档位置识别：计划/归档/ 下不被当成在途计划枚举" || bad "归档位置识别异常：$ARCH"
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
if printf '%s' "$PJSON" | grep -q 'ACTIVE|INACTIVE' && printf '%s' "$PJSON" | grep -q '"leadPlan": ""'; then
  ok "增量表单元格含竖线（反引号包裹）→ 不丢列、不误当主计划"
else
  bad "增量表含竖线时丢列/错位"
fi
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
run "$R" check >/dev/null 2>&1 && ok "无反引号的「依据模块契约」正常识别（不再误判首次建模）" \
  || { bad "无反引号引用被误判为首次建模"; run "$R" check | sed 's/^/     /'; }

# 13.19 计划放进计划目录的自建子目录（计划/done/）不得绕过体检与 I2
mkdir -p "$R/doc-framework/模块/订单/计划/done"
sed 's/> 状态：已批准/> 状态：已完成/; s/> 合并状态：待合并/> 合并状态：待合并/' \
  "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md" > "$R/doc-framework/模块/订单/计划/done/2025-04-03-子目录计划.md"
rm -f "$R/doc-framework/模块/订单/计划/2025-04-02-无引号引用.md"
printf '%s' "$(run "$R" check 2>&1)" | grep -q "语义增量未合并" \
  && ok "子目录里的计划仍纳入体检（I2 不可用子目录绕过）" || bad "子目录计划逃过 I2 体检"
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
if printf '%s' "$BOLD" | grep -q '"state": "已批准"' && printf '%s' "$BOLD" | grep -q '"mergeState": "已合并"'; then
  ok "加粗字段名可解析（状态 / 合并状态）"
else
  bad "加粗字段名解析不到（state/mergeState 为空）"
fi
# 13.21 单段路径（package.json）必须进白名单（应用代码根为 . 时会自相矛盾）
printf '%s' "$BOLD" | grep -q '"package.json"' \
  && ok "单段路径进变更文件清单（package.json）" || bad "单段路径被静默丢弃"
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
run "$R" diff-check doc-framework/模块/订单/计划/2025-04-06-staged口径.md --staged >/dev/null 2>&1 \
  && ok "--staged 只检查已暂存内容（未跟踪文件不参与）" || bad "--staged 仍并入未跟踪文件"
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
printf '%s' "$(run "$R" check 2>&1)" | grep -q "必须是「完整」形态" \
  && ok "首次建模缺「计划形态」行 → 按非完整硬报错" || bad "首次建模 shape=null 被静默放行"

# 13.25 空增量的首次建模计划：只提示"该标无需合并"，不再重复报「已实施但未建档」
sed 's/> 状态：已批准/> 计划形态：完整\n> 状态：已完成/; /^| A1 |/d' \
  "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md" > "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-07-无形态.md"
if printf '%s' "$(run "$R" check 2>&1)" | grep -q "已实施但未建档"; then
  bad "空增量的首次建模计划重复报「已实施但未建档」（根因应与 I2 合并）"
else
  ok "建档兜底要求增量非空（空增量不重复报未建档）"
fi

# 13.26 标「合并状态=已合并」但契约不存在 → 落账无据，必须硬报错
sed 's/> 合并状态：待合并/> 合并状态：已合并/; s|^| |; s|^ ||' \
  "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md" > "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md"
rm -f "$R/doc-framework/模块/查询/计划/2025-04-08-空增量首次建模.md"
# 补一条非空增量行（"已合并却无契约"只在增量非空时才成立）
python3 - "$R/doc-framework/模块/查询/计划/2025-04-09-假合并.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); s = p.read_text(encoding='utf-8')
s = s.replace('|---|----------|------|------|--------|\n',
              '|---|----------|------|------|--------|\n| A1 | 契约 §3.1 查询主表 | 字段 x | tinyint(1) | |\n')
p.write_text(s, encoding='utf-8')
PY
printf '%s' "$(run "$R" check 2>&1)" | grep -q "落账无据" \
  && ok "首次建模计划标「已合并」但契约缺失 → 硬报错（假合并）" || bad "假合并（已合并但无契约）被放行"
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
printf '%s' "$(run "$R" check 2>&1)" | grep -q "未回指主计划" \
  && ok "主计划列 n/a 视为空 → I3 生效（英文模式不漏判）" || bad "主计划列 n/a 被当成真实回指（I3 漏判）"
rm -rf "$R/doc-framework/模块/结算"

# 13.28 list --state 用中文枚举（唯一枚举集）
run "$R" list --state 已批准 >/dev/null 2>&1 \
  && ok "list --state 接受中文枚举" || bad "list --state 不认中文枚举"
# 13.29 占位符残留：中文模式只报含中日韩字符的（避免误报英文代码片段里的 `{...}`）——
#       标识符式 `{AppName}` 在中文模式下**有意不报**（英文产物命名已下线，不再有该模式）
cp "$R/doc-framework/规范/应用-app-web.md" "$TMP/app-web.bak"
printf '# 应用规范\n\n{应用名称} 的页面结构\n' > "$R/doc-framework/规范/应用-app-web.md"
printf '%s' "$(run "$R" check 2>&1)" | grep -q "占位符未渲染" \
  && ok "占位符残留：中文占位符被报出" || bad "中文占位符静默通过"
cp "$TMP/app-web.bak" "$R/doc-framework/规范/应用-app-web.md"

# 13.30 应用类型关键词：中文登记值触发类型层规范校验；英文关键词已随别名移除（不再识别）
RT="$TMP/type-cn"; mk_project "$RT"
rm -f "$RT/doc-framework/规范/类型-前端.md"
printf '%s' "$(run "$RT" check 2>&1)" | grep -q "类型-前端" \
  && ok "应用类型：中文登记（前端端）触发类型层规范校验" || bad "中文应用类型漏校验"
AT=$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write([p.appTypeMatches(p.NAMES.zh,'前端端','front'),p.appTypeMatches(p.NAMES.zh,'frontend','front')].join(','))" 2>&1)
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
printf '%s' "$(run "$R" check 2>&1)" | grep -q "已废弃计划建议" && bad "标无需合并后仍提示废弃出口" || ok "废弃计划标 无需合并 后不再提示"
rm -rf "$R/doc-framework/模块/退货"

# ── 15：R3 契约 §9 回链凭据 与 R4 结构版本哨兵（v2.4.0 起；v2.5.x 扩充）──
# 15.1 R4：哨兵存在但落后 → ⚠️ 进退出码（文档明确声明旧结构却跑在新框架上）
S="$TMP/sentinel"; mk_project "$S"
printf '# 项目档案\n<!-- doc-framework:docstruct v2.2.0 | x -->\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$S/doc-framework/项目档案.md"
CP="$S/doc-framework/模块/订单/契约.md"
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 来源 | 变更内容 |\n|------|------|----------|\n| 2026-09-10 | 代码 | 提炼；@a1b2c3d |\n| 2026-09-11 | 合并 | 落账；口径统一；2026-09-11 订单改造 @a1b2c3d |\n| 2026-09-12 | 合并 | 落账（旧写法指归档计划 `doc-framework/计划/归档/2026-09-12-已清理.md`） |\n| 2026-09-13 | 合并 | 落账但**未写回链凭据**，token `ACT_RE_PROCDEF.KEY_` 不算凭据 |\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S=$(run "$S" check 2>&1); CODE_S=$?
printf '%s' "$OUT_S" | grep -q "文档结构版本落后于框架" && ok "R4：哨兵落后于框架 → ⚠️ 报出" || bad "R4：哨兵落后未报出"
[ "$CODE_S" = "1" ] && ok "R4：哨兵落后进退出码（exit 1）" || bad "R4：哨兵落后未影响退出码（exit=$CODE_S）"
printf '%s' "$OUT_S" | grep -q "缺回链凭据" && ok "R3：缺回链凭据的行被硬报出" || bad "R3：空凭据未报出"
printf '%s' "$OUT_S" | grep -q "回链的计划文件不在工作区" && ok "R3：旧写法指向已清理的计划 → 只 ℹ️ 提示（不硬报）" || bad "R3：旧写法死链未提示"
printf '%s' "$OUT_S" | grep -q "已校验 4 条" && ok "R3：逐行校验计数正确（含全部来源）" || bad "R3：行数计数异常"

# 15.2 R3 反例（误报回归）：非路径反引号 token 不得被当成引用
rm -f "$S/doc-framework/模块/订单/契约.md"
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 来源 | 变更内容 |\n|------|------|----------|\n| 2026-09-11 | 合并 | 落账（计划 `doc-framework/计划/2026-09-11-在.md`），变量 `CHARGE_FEE_BATCH` → `Process_CHARGE_FEE_BATCH`，表 `ACT_RE_PROCDEF.KEY_`；@a1b2c3d |\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S2=$(run "$S" check 2>&1)
printf '%s' "$OUT_S2" | grep -q "缺回链凭据" && bad "R3 误报：非 .md 反引号 token 被当成凭据/或误判为空" || ok "R3 误报回归：非 .md 反引号 token 不算凭据，且行有 @SHA 即视为已回链"

# 15.2b R3 篇幅提示：单行过长（抄了计划正文）→ ℹ️ 提示"精简为结论+理由一句话"
LONG=$(python3 -c "print('详'*400)")
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 来源 | 变更内容 |\n|------|------|----------|\n| 2026-09-11 | 合并 | %s；@a1b2c3d |\n\n## 10. 生产环境 SQL 执行登记\n' "$LONG" > "$CP"
OUT_S3=$(run "$S" check 2>&1)
printf '%s' "$OUT_S3" | grep -q "行超过 300 字符" && ok "R3：超长行（疑似抄计划正文）→ ℹ️ 提示精简" || bad "R3：超长行未提示"

# 15.2c R3：计划标识不带 .md 后缀也认（真实项目常见写法）＋ 旧来源（需求/代码）无凭据不硬报
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 来源 | 变更内容 |\n|------|------|----------|\n| 2026-09-10 | 需求 | 旧版批量登记，无凭据 |\n| 2026-09-11 | 代码 | 模式 B 对账，无凭据 |\n| 2026-09-12 | 合并 | 落账（计划 `2026-09-12-订单改造`，/module-code） |\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S4=$(run "$S" check 2>&1)
printf '%s' "$OUT_S4" | grep -q "缺回链凭据" && bad "R3 误报：反引号内的「日期-主题」计划标识未识别为凭据" || ok "R3：计划标识（无 .md 后缀）被识别为凭据"
printf '%s' "$OUT_S4" | grep -q "旧版遗留：来源为 需求/代码" && ok "R3：来源 需求/代码 的无凭据行只计数提示（不回填、不硬报）" || bad "R3：旧来源豁免未生效"

# 15.2d R3 列序错位回归（真实项目教训）：表头 4 列（日期|版本|来源|变更内容），数据行中途漏了「版本」变 3 列。
#      死套表头列序会把**变更内容正文**读成来源 → 提示文本撑成上千字符，且该行悄悄绕过"空凭据"硬校验（假绿）。
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 版本 | 来源 | 变更内容 |\n|------|------|------|----------|\n| 2026-09-11 | v1.0 | 代码 | 逆向提炼；@a1b2c3d |\n| 2026-09-12 | 实现 | 未写凭据的落账 |\n| 2026-09-13 | 实现 | 正文不得被当成来源的登记项，计划已清理 `计划/2026-01-01-已清理.md` @a1b2c3d |\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S5=$(run "$S" check 2>&1)
printf '%s' "$OUT_S5" | grep -q "来源=实现）" && ok "R3 列序错位：3 列数据行仍识别出来源=实现（不把正文当来源）" || bad "R3 列序错位：来源被读成正文"
printf '%s' "$OUT_S5" | grep -q "缺回链凭据" && ok "R3 列序错位：真实来源=实现 的空凭据行未被漏报" || bad "R3 列序错位：空凭据行被漏报（假绿）"
printf '%s' "$OUT_S5" | grep -q "列数与表头不一致" && ok "R3：列数与表头不一致 → ℹ️ 提示补正表格" || bad "R3：列数不一致未提示"
printf '%s' "$OUT_S5" | grep -q "正文不得被当成来源" && bad "R3：提示文本混入了整行正文" || ok "R3：提示文本只带短标签，未混入正文"
printf '%s' "$OUT_S5" | grep -q "已校验 3 条" && ok "R3 列序错位：三行都进了校验计数" || bad "R3 列序错位：行数计数异常"

# 15.2e R3 多表回归：§9 里说明表排在变更记录表**之前**（v2.5.0+ 契约模板的真实形态）。
#      只认第一张表的表头 → 整节被判"无「来源」列"，R3 对新项目**静默失效**。
printf '# 订单契约\n## 9. 变更记录\n\n| 场景 | 回链写法 | 为什么 |\n|------|----------|--------|\n| 有计划通道 | `2026-09-08 主题 @a1b2c3d` | SHA 不随文件消失 |\n\n| 日期 | 来源 | 变更内容 |\n|------|------|----------|\n| 2026-09-11 | 合并 | 落账但未写凭据 |\n\n## 10. 生产环境 SQL 执行登记\n' > "$CP"
OUT_S6=$(run "$S" check 2>&1)
printf '%s' "$OUT_S6" | grep -q "无「来源」列" && bad "R3 多表：说明表在前 → 变更记录表被静默跳过（R3 对新项目失效）" || ok "R3 多表：§9 说明表在前不影响后续变更记录表的校验"
printf '%s' "$OUT_S6" | grep -q "缺回链凭据" && ok "R3 多表：变更记录表的空凭据行仍被硬报出" || bad "R3 多表：变更记录表未被校验"
printf '%s' "$OUT_S6" | grep -q "已校验 1 条" && ok "R3 多表：只统计带「来源」列的那张表（说明表不计）" || bad "R3 多表：行数统计异常"

# 15.2f 模板自洽：契约模板**渲染后** §9 必须被识别，且渲染出的示例行本身不得违反它教的回链规则
#      （必须走真实渲染路径——手写 `{模块名}`→字面量 的旧做法在 v2.6.0 双括号语法下不再成立）
TT="$TMP/tpl9"; mk_project "$TT"
python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$TT" >/dev/null 2>&1
OUT_T=$(run "$TT" check 2>&1)
printf '%s' "$OUT_T" | grep -q "无「来源」列" && bad "模板自洽：契约模板 §9 被判「无来源列」（R3 对新项目失效）" || ok "模板自洽：契约模板 §9 被正确识别（说明表在前不干扰）"
printf '%s' "$OUT_T" | grep -q "缺回链凭据" && bad "模板自洽：模板自带示例行不满足它自己教的回链规则" || ok "模板自洽：渲染出的示例行满足回链凭据规则"
printf '%s' "$OUT_T" | grep -q "已校验 3 条" && ok "模板自洽：3 行示例（代码/合并/实现）都进了校验" || bad "模板自洽：示例行未被校验"


# 15.3 R4：完全没有哨兵（v2.4.0 之前的文档）→ 只 1 条汇总 ℹ️，不进退出码
N="$TMP/nosentinel"; mk_project "$N"
printf '# 项目档案\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$N/doc-framework/项目档案.md"
OUT_N=$(run "$N" check 2>&1); CODE_N=$?
CNT_N=$(printf '%s' "$OUT_N" | grep -c "未标记「文档结构版本」")
[ "$CNT_N" = "1" ] && ok "R4：无哨兵只报 1 条汇总 ℹ️（不重复 5 份文档）" || bad "R4：无哨兵提示条数异常（$CNT_N）"
[ "$CODE_N" = "0" ] && ok "R4：无哨兵不进退出码（老项目不被门禁逼改文档）" || bad "R4：无哨兵错误地影响退出码（exit=$CODE_N）"

# 15.4 R3 降级：契约 §9 无「来源」列（旧格式）→ 只 ℹ️ 跳过，不硬报
L="$TMP/legacy9"; mk_project "$L"
printf '# 项目档案\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$L/doc-framework/项目档案.md"
printf '# 订单契约\n## 9. 变更记录\n\n| 日期 | 变更 | 原因 |\n|------|------|------|\n| 2026-09-11 | 改了点东西 | 测试 |\n' > "$L/doc-framework/模块/订单/契约.md"
OUT_L=$(run "$L" check 2>&1); CODE_L=$?
printf '%s' "$OUT_L" | grep -q "无「来源」列，跳过回链校验" && ok "R3：旧格式契约（无来源列）只 ℹ️ 跳过" || bad "R3：旧格式契约未降级放行"
[ "$CODE_L" = "0" ] && ok "R3：旧格式契约不影响退出码" || bad "R3：旧格式契约错误地硬报（exit=$CODE_L）"

# 15.5 哨兵：五份模板一律用**占位哨兵** `{{框架版本}}` —— 版本号只有 package.json 一个来源。
#      此前 5 份模板各自硬编码版本，发版要手改 6 处、漏一处 R4 就炸（本轮之前一直是人工同步）。
TPL_BAD=""
for t in 总契约 接口规范 测试规范 项目档案 "计划/YYYY-MM-DD-{实施主题}"; do
  grep -q 'doc-framework:docstruct {{框架版本}}' "$ROOT/templates/$t.md.tpl" || TPL_BAD="$TPL_BAD $t"
done
[ -z "$TPL_BAD" ] && ok "哨兵：五份模板均为占位哨兵 {{框架版本}}（版本号只有 package.json 一个来源）" \
  || bad "哨兵：未用占位哨兵的模板：$TPL_BAD"

# 15.5b 占位哨兵不得被判"落后"（它声明的是"随框架版本"，无从比较）
SD="$TMP/sentinel-ph"; mk_project "$SD"
printf '# 项目档案\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n\n## 应用清单\n| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n|---|---|---|---|---|---|---|\n| svc-order | 后端服务 | Java | services/order | `规范/应用-svc-order.md` | mysql | — |\n' > "$SD/doc-framework/项目档案.md"
printf '# 总契约\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/总契约.md"
printf '# 测试规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/测试规范.md"
printf '# 接口规范\n<!-- doc-framework:docstruct {{框架版本}} | x -->\n' > "$SD/doc-framework/接口规范.md"
printf '%s' "$(run "$SD" check 2>&1)" | grep -q "文档结构版本落后" \
  && bad "占位哨兵被误判落后（会把模板产物一律判红）" || ok "占位哨兵不判落后（渲染前也不误报）"

# 15.5c 注入真实版本后，**旧版本仍必须被判落后**（R4 本体没被削弱）
printf '# 总契约\n<!-- doc-framework:docstruct v2.2.0 | x -->\n' > "$SD/doc-framework/总契约.md"
printf '%s' "$(run "$SD" check 2>&1)" | grep -q "文档结构版本落后" \
  && ok "注入的旧哨兵仍被判落后（R4 判据未被占位哨兵削弱）" || bad "R4 判据被削弱：旧哨兵未报落后"


# ── 17：英文模式解析健壮性 + 安装/同步闭环（审查修复回归）──────────
# 17.1 节名定位的健壮性：mdSection 必须**大小写不敏感**（中文文档里夹英文词、手改大小写都要认），
#      否则 mdSection 返回 null → 上层全部**静默降级**（I2 失效、应用清单消失、直改边界为空），且不报错。
#      同时断言：英文节名**不再**被识别（英文产物命名已下线，见 §7）。
UNIT=$("$NODE_BIN" -e '
const p=require(process.argv[1]);
const a=p.mdSection("## 语义增量（DELTA）\nB\n## X\n","语义增量")||"";
const b=p.mdSection("## 应用清单（APP REGISTRY）\nB\n","应用清单")||"";
const c=p.mdSection("## 5. 应用落点（application footprint）\nB\n","应用落点")||"";
const r=p.parseContractMergeRows("## 9. 变更记录\n\n| 日期 | 来源 | 结论与理由 | 回链凭据 |\n|---|---|---|---|\n| d | 合并 | x | y @abc |\n");
const d=p.parseDelta("## 语义增量\n> 合并状态：待合并\n### ADDED（新增）\n| # | 目标位置 | 对象 | 内容 | 主计划 |\n|---|---|---|---|---|\n| A1 | 契约 §3 | f | c | |\n",p.NAMES.zh);
process.stdout.write([a.includes("B"),b.includes("B"),c.includes("B"),r.rows.length,d.nonEmpty].join(","));
' "$ROOT/scripts/lib/plan.js" 2>&1)
[ "$UNIT" = "true,true,true,1,true" ] && ok "节名定位：大小写不敏感；英文节名不再识别（已下线）" || bad "节名定位异常：$UNIT"

# 17.2 sync 修复：marker 缺某个源文件条目 = 上游在既有 skill 目录里新增了文件，
#      不得被误判为"本地已定制"——否则该目录被跳过、marker 却写成新版本，
#      后续 sync 因"已是最新"整体 no-op，升级连同新文件永久搁浅（无法自愈）。
SY="$TMP/syncfix"; mkdir -p "$SY"
( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
MKR="$SY/.agents/skills/.doc-framework.json"
"$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$MKR'));m.version='v0.0.1';m.files=m.files.filter(f=>f.file!=='module-review/SKILL.md');fs.writeFileSync('$MKR',JSON.stringify(m))" 2>/dev/null
OUT_SY=$( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$CLI" sync 2>&1 )
printf '%s' "$OUT_SY" | grep -q "跳过（本地已定制）：module-review" && bad "sync：marker 缺条目被误判本地定制（上游新增文件随升级搁浅）" || ok "sync：marker 缺条目不再误判本地定制（目录正常升级）"

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
[ -z "$RENDER_OUT" ] && ok "全模板渲染闭环：15 份模板渲染后双括号清零、记法保留、产物过 check" \
  || bad "全模板渲染闭环失败：$RENDER_OUT"


# 18.2 check 的占位符残留输出必须可定位：带文件路径 + 个数 + 改法提示。
#      （历史实现把该文件全部 token 挤在一行，输出长达数百字符，真实问题被刷屏淹没）
PO="$TMP/ph-noise"; mk_project "$PO"
printf '# 总契约\n\n| 模块 | 说明 |\n|---|---|\n| {模块A} | {一句话说明} |\n' > "$PO/doc-framework/总契约.md"
OUT_PO=$(run "$PO" check 2>&1); CODE_PO=$?
printf '%s' "$OUT_PO" | grep -q '总契约.md' \
  && ok "占位符残留：报告带文件路径" || bad "占位符残留：报告未带文件路径"
printf '%s' "$OUT_PO" | grep -q '占位符未渲染（' \
  && ok "占位符残留：报告带个数（便于判断工作量）" || bad "占位符残留：报告未带个数"
printf '%s' "$OUT_PO" | grep -q '改法：' \
  && ok "占位符残留：报告带改法提示（替换或删除示例行）" || bad "占位符残留：报告缺改法提示"
# 占位符残留是**硬问题**：模板渲染不干净必须让退出码为 1（否则 CI 静默放过"新项目第一天就是红的"）
[ "$CODE_PO" = "1" ] && ok "占位符残留进退出码（模板没渲染干净必须红）" \
  || bad "占位符残留未进退出码（exit=$CODE_PO）——初始化残缺会被静默放过"

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

# ── 防「静默跳过」（必须放在最后）───────────────────────────────
# 已观测到：bash 读到脚本后段时**整段跳过**（本节之前的部分照跑），却照样打印 PASS ——
# "少跑一段还报绿"比失败更危险（假绿）。该现象时序相关（加 `bash -x`、或改输出重定向即不复现），
# 根因在 bash 侧、无法在脚本内根治，所以这里用**断言数下限**硬拦：少跑就报错。
# ⚠️ 新增用例后请同步上调 MIN_ASSERTIONS。
MIN_ASSERTIONS=103
if [ "$PASS" -lt "$MIN_ASSERTIONS" ]; then
  echo "❌ 只执行了 $PASS 条断言（基线 ≥ $MIN_ASSERTIONS）——脚本后段可能被跳过，请重跑"
  FAIL=$((FAIL+1))
fi

echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
