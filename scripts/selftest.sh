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
#   7. 英文模式 doc-framework-en/ 骨架校验通过；旧英文目录 docs-framework/ 兼容并提示改名
#   8. 探索/ 中的开放标记不参与占位符硬校验
#   9. v1.x 旧项目（无应用清单/旧格式计划）check 通过
#  10. 直改通道 diff-check --module：边界=契约 §5 落点（落点内通过 / 落点外拦截）
#  11. 轻量计划形态：合规通过、缺表态硬报错；list --stale 命中停滞计划
#  12. 英文模式全链路：App registry / Per-app stance / Changed files 映射解析 + 直改边界
#  13. 契约模型 v2.2：语义增量 / 合并状态三值 / I2（含归档兜底，不可用 archive 绕过）/ I3 主计划列 /
#      首次建模形态与分档校验 / 依据探索记录哨兵（含纯行写法兼容）/ 轻量计划不得含非空增量 /
#      MODIFIED 表列位 / 合并状态带日期与无法识别的文案 / v2.1 存量计划免迁移 / 生命周期全绿
#  14. 审查加固（解析稳健性与闸门口径）：无反引号的「依据模块契约」不误判首次建模 / 计划放进计划目录
#      子目录不可绕过 I2 / 加粗字段名（**状态**：）可解析 / 单段路径（package.json）进白名单 /
#      diff-check 缺状态硬报错 / --staged 不并入未跟踪文件 / 首次建模缺「计划形态」行按非完整硬报错 /
#      建档兜底要求增量非空 / 标「已合并」但契约缺失硬报错 / 主计划列 n/a 视为空 /
#      英文模式 --state 与标识符式占位符 / 应用类型中英词表取并集 / 已废弃计划的 I4 出口提示 /
#      混排目录布局（modules/…/plans/）不再静默盲区
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
P="$TMP/p1"; mk_project "$P"
python3 - "$ROOT" "$P" <<'PY'
import pathlib, re, sys
root, proj = sys.argv[1], sys.argv[2]
tpl = pathlib.Path(root, 'templates/计划/YYYY-MM-DD-{实施主题}.md.tpl').read_text(encoding='utf-8')
s = tpl
s = s.replace('> 状态：{待审核 | 修订中 | 已批准 | 实施中 | 已完成 | 已废弃}（审核通过后开始编码）', '> 状态：已批准')
# v2.2：完整计划必须引用**已存在**的契约（check 新增校验）→ 指向项目里真实存在的契约
s = s.replace('> 依据模块契约：`{文档根}/模块/{模块名}/契约.md`', '> 依据模块契约：`doc-framework/模块/订单/契约.md`')
s = s.replace('| {svc-main} | 改动 / 本次不改 / 不适用 | {说明} |', '| svc-order | 改动 | 主责 |\n| app-web | 本次不改 | 端不动 |')
s = s.replace('| {svc-bff} | 改动 / 本次不改 / 不适用 | {说明} |', '')
s = s.replace('| {app-web} | 改动 / 本次不改 / 不适用 | {说明} |', '')
s = s.replace('| {app-mobile} | 改动 / 本次不改 / 不适用 | {说明} |', '')
s = s.replace('| {svc-main} | {文件路径} | {说明} |', '| svc-order | services/order/src/A.java | 主责 |\n| svc-order | services/order/src/my module/B.java | 空格路径 |\n| svc-order | ./services/order/src/C.java | 前导./ |')
s = s.replace('| {svc-bff} | {文件路径} | {说明} |', '')
s = s.replace('| {app-web} | {文件路径} | {说明} |', '')
s = s.replace('| {app-mobile} | {文件路径} | {说明} |', '')
s = s.replace('| {文件路径} | {说明} |', '| doc-framework/边界/订单边界.md | 边界更新 |')
s = s.replace('{服务代码根}/sql/change/YYYY-MM-DD_{模块}_{说明}.sql', 'services/order/sql/change/2025-01-02_order_ddl.sql')
# 渲染剩余占位符 + 在清单节插入代码围栏（示例路径不得进白名单）
s = re.sub(r'\{[^{}\n]*\}', 'X', s)
s = s.replace('## 四、任务清单', '```text\napps/不存在的应用/demo.js\n```\n\n## 四、任务清单')
pathlib.Path(proj, 'doc-framework/模块/订单/计划/2025-01-02-订单改造.md').write_text(s, encoding='utf-8')
PY
mkdir -p "$P/services/order/src/my module" && echo x > "$P/services/order/src/my module/B.java" && echo x > "$P/services/order/src/C.java"
echo "# 订单契约" > "$P/doc-framework/模块/订单/契约.md"

if run "$P" check >/dev/null 2>&1; then ok "官方模板渲染的计划：check 通过（文档路径/SQL/标题行不误报）"; else bad "官方模板渲染的计划：check 失败"; run "$P" check | sed 's/^/     /'; fi

FL=$(run "$P" show doc-framework/模块/订单/计划/2025-01-02-订单改造.md --json 2>/dev/null | python3 -c "import json,sys;print('\n'.join(json.load(sys.stdin)['fileList']))")
echo "$FL" | grep -q "不存在的应用" && bad "代码围栏示例路径泄漏进白名单" || ok "代码围栏示例路径未进白名单"
echo "$FL" | grep -q "^services/order/src/my module/B.java$" && ok "含空格路径按整格解析" || bad "含空格路径被拆散/丢失"
echo "$FL" | grep -q "^services/order/src/C.java$" && ok "前导 ./ 路径已归一化" || bad "前导 ./ 未归一化"

# ── 3：./ 代码根 + 「本次不改」应用被改 → diff-check 必须报错 ──
( cd "$P" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
echo forbidden > "$P/apps/web/forbidden.js"
if run "$P" diff-check doc-framework/模块/订单/计划/2025-01-02-订单改造.md >/dev/null 2>&1; then
  bad "diff-check 漏报：表态「本次不改」的应用被改却通过"
else
  ok "diff-check 正确拦截「本次不改」应用的越界改动"
fi
rm -f "$P/apps/web/forbidden.js"

# ── 5：坏计划（同名目录）必须显式报错 ──
mkdir -p "$P/doc-framework/计划/坏计划.md"
CHECK_OUT=$(run "$P" check 2>&1)
# 先捕获再匹配：避免 pipefail 下 grep -q 提前退出造成 SIGPIPE 竞态（误判为失败）
if printf '%s' "$CHECK_OUT" | grep -q "计划无法解析"; then ok "坏计划被显式报出（非静默）"; else bad "坏计划被静默忽略"; fi
rmdir "$P/doc-framework/计划/坏计划.md"

# ── 6：传目录 → 干净报错（无 Node 栈） ──
OUT=$(run "$P" show doc-framework/模块 2>&1); CODE=$?
if [ "$CODE" = "1" ] && ! echo "$OUT" | grep -q "at Object"; then ok "show 传目录：干净报错 exit 1"; else bad "show 传目录未干净处理（exit=$CODE）"; fi

# ── 7：英文模式（根目录名 doc-framework-en/）+ 旧英文目录兼容 ──
E="$TMP/en"; mkdir -p "$E/doc-framework-en/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$E/doc-framework-en/$f"; done
echo fe > "$E/doc-framework-en/standards/frontend.md"; echo be > "$E/doc-framework-en/standards/backend.md"
run "$E" check >/dev/null 2>&1 && ok "英文模式 doc-framework-en/ 骨架校验通过" || bad "英文模式 check 失败"

# 旧英文目录 docs-framework/：仍可通过，但必须提示改名（提示项不影响退出码）
L="$TMP/en-legacy"; mkdir -p "$L/docs-framework/"{modules,boundaries,standards,plans}
for f in profile.md contract.md testing-guide.md api-guide.md; do echo "# $f" > "$L/docs-framework/$f"; done
echo fe > "$L/docs-framework/standards/frontend.md"; echo be > "$L/docs-framework/standards/backend.md"
LEGACY_OUT=$(run "$L" check 2>&1); LEGACY_CODE=$?
if [ "$LEGACY_CODE" = "0" ] && printf '%s' "$LEGACY_OUT" | grep -q "doc-framework-en"; then
  ok "旧英文目录 docs-framework/ 兼容通过并提示改名"
else
  bad "旧英文目录兼容失败（exit=$LEGACY_CODE）"
fi

# ── 8：探索/ 开放标记豁免 ──
P2="$TMP/p2"; mk_project "$P2"; mkdir -p "$P2/doc-framework/探索"
echo '结论：{待验证}。' > "$P2/doc-framework/探索/2025-01-01-权限模型.md"
run "$P2" check >/dev/null 2>&1 && ok "探索/ 中的开放标记不触发硬校验" || bad "探索/ 触发占位符硬失败"

# ── 9：v1.x 旧项目向后兼容 ──
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
LIST_JSON=$(run "$D" list --stale 1 --json 2>/dev/null)
if printf '%s' "$LIST_JSON" | grep -q '"shape": "轻量"'; then ok "list --stale 命中停滞计划并标出形态"; else bad "list --stale 未命中停滞计划/未标形态"; fi

# ── 12：英文模式全链路（英文节名映射：应用清单 / 计划 / diff-check / --module）──
# 中文模式靠 节名 解析，英文模式靠 App registry / Per-app stance / Changed files 等映射解析
EN="$TMP/en-full"
mkdir -p "$EN/doc-framework-en/"{modules/order/plans,boundaries,standards,plans} "$EN/apps/web/src" "$EN/apps/mobile/src" "$EN/services/order/src"
for f in contract.md testing-guide.md api-guide.md; do echo "# $f" > "$EN/doc-framework-en/$f"; done
cat > "$EN/doc-framework-en/profile.md" <<'EOF'
# Project profile
## App registry
| App ID | Type | Stack | Code root | Spec file | Database | Depends on |
|--------|------|-------|-----------|-----------|----------|------------|
| app-web | frontend | Vue | apps/web | `standards/app-app-web.md` | — | svc-order |
| app-mobile | frontend | uniapp | apps/mobile | `standards/app-app-mobile.md` | — | svc-order |
| svc-order | backend | Java | services/order | `standards/app-svc-order.md` | mysql | — |
EOF
echo x > "$EN/doc-framework-en/standards/type-frontend.md"
echo x > "$EN/doc-framework-en/standards/type-backend.md"
for a in app-web app-mobile svc-order; do echo x > "$EN/doc-framework-en/standards/app-$a.md"; done
cat > "$EN/doc-framework-en/modules/order/contract.md" <<'EOF'
# Order contract
## 5. Application footprint
| App | Pages | Files | Permission | Notes |
|-----|-------|-------|------------|-------|
| svc-order (primary) | — | order/OrderController.java | @PreAuthorize | source of truth |
| app-web | list page | views/order/… | v-hasPermi | — |
EOF
cat > "$EN/doc-framework-en/modules/order/plans/2025-01-02-copy-tweak.md" <<'EOF'
# 2025-01-02 Copy tweak

> Module contract: `doc-framework-en/modules/order/contract.md`
> Plan shape: light
> Status: approved

## 2. Per-app stance
| App | Stance | Note |
|-----|--------|------|
| app-web | change | copy only |

## 3. Changed files
| File | Note |
|------|------|
| apps/web/src/list.js | copy |

## 4. Task list
- [ ] 1.1 tweak copy
EOF
( cd "$EN" && git init -q && git add -A && git commit -qm base ) >/dev/null 2>&1
echo "=== EN 全链路" >/dev/null
run "$EN" check >/dev/null 2>&1 && ok "英文模式：应用清单 + 计划解析通过（check）" || { bad "英文模式 check 失败"; run "$EN" check | sed 's/^/     /'; }
echo x >> "$EN/apps/web/src/list.js"
run "$EN" diff-check doc-framework-en/modules/order/plans/2025-01-02-copy-tweak.md >/dev/null 2>&1 \
  && ok "英文模式：计划白名单对账通过（表态 change / 清单命中）" || bad "英文模式计划白名单对账失败"
echo x > "$EN/apps/mobile/src/b.js"
if run "$EN" diff-check --module order >/dev/null 2>&1; then
  bad "英文模式：直改通道漏报落点外应用（Application footprint 未生效）"
else
  ok "英文模式：契约 Application footprint 作为直改边界生效"
fi
EN_JSON=$(run "$EN" list --json 2>/dev/null)
if printf '%s' "$EN_JSON" | grep -q '"module": "order"' && printf '%s' "$EN_JSON" | grep -q '"shape": "轻量"'; then
  ok "英文模式：list 解析出模块名与形态"
else
  bad "英文模式：list 未解析出模块名/形态"
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

# 13.8 英文模式：Delta / Merge state 解析并参与 I2
cat > "$EN/doc-framework-en/modules/order/plans/2025-03-08-delta.md" <<'EOF'
# 2025-03-08 Delta plan

> Module contract: `doc-framework-en/modules/order/contract.md`
> Plan shape: full
> Status: completed

## Delta
> Merge state: pending

### ADDED
| # | Target | Object | Content | Lead plan |
|---|--------|--------|---------|-----------|
| A1 | contract §3.1 order table | field x | int | |

## Changed files
| File | Note |
|------|------|
| apps/web/src/list.js | x |
EOF
printf '%s' "$(run "$EN" check 2>&1)" | grep -q "语义增量未合并" && ok "英文模式：Merge state 解析并参与 I2" || bad "英文模式 Merge state 未生效"
rm -f "$EN/doc-framework-en/modules/order/plans/2025-03-08-delta.md"

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

# 13.13 B1 回归：合并状态带日期（含混排英文值 + 日期）必须识别为已合并，不得误报 I2
mkdir -p "$M/doc-framework/模块/日期/计划"; echo "# 日期契约" > "$M/doc-framework/模块/日期/契约.md"
cat > "$M/doc-framework/模块/日期/计划/2025-03-15-带日期.md" <<'EOF'
# 2025-03-15 带日期实施

> 依据模块契约：`doc-framework/模块/日期/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：merged（2025-01-02）

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 日期主表 | 字段 x | int | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
run "$M" check >/dev/null 2>&1 && ok "B1：合并状态=merged（日期）识别为已合并，I2 不误报" || { bad "带日期的合并状态被误判（B1 回归）"; run "$M" check | sed 's/^/     /'; }

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

# 13.15 I2 归档兜底：把"已完成 + 未合并增量"移进 archive，不得因此逃过校验
mkdir -p "$M/doc-framework/模块/归档绕过/计划/archive"; echo "# 归档绕过契约" > "$M/doc-framework/模块/归档绕过/契约.md"
cat > "$M/doc-framework/模块/归档绕过/计划/archive/2025-03-17-绕过.md" <<'EOF'
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
printf '%s' "$(run "$M" check 2>&1)" | grep -q "归档计划「已完成」但语义增量未合并" && ok "I2：归档计划未合并增量 → 仍硬报错（不可用归档绕过）" || bad "归档绕过未被拦（I2 兜底缺失）"
rm -rf "$M/doc-framework/模块/归档绕过"

# 13.16 I3 文案：合并状态值无法识别时，报错要指向"值无法识别"而非"缺失"
mkdir -p "$M/doc-framework/模块/乱写/计划"; echo "# 乱写契约" > "$M/doc-framework/模块/乱写/契约.md"
sed 's|模块/日期/|模块/乱写/|; s|> 合并状态：merged（2025-01-02）|> 合并状态：随便写|' \
  "$M/doc-framework/模块/日期/计划/2025-03-15-带日期.md" > "$M/doc-framework/模块/乱写/计划/2025-03-18-乱写.md"
printf '%s' "$(run "$M" check 2>&1)" | grep -q "合并状态值无法识别" && ok "I3：合并状态值无法识别 → 专门文案（非"缺失"）" || bad "乱写的合并状态文案未区分"
rm -rf "$M/doc-framework/模块/乱写" "$M/doc-framework/模块/日期"

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

# 13.28 英文模式：list --state 接受英文枚举（能力对齐）
run "$EN" list --state approved >/dev/null 2>&1 \
  && ok "英文模式 list --state approved 可用" || bad "英文模式 --state 只认中文枚举"
# 13.29 英文模式：标识符式占位符 {AppName} 必须报残留（旧实现只报含中文者 → 静默通过）
cp "$EN/doc-framework-en/standards/app-app-web.md" "$TMP/app-web.bak"
printf '# app spec\n\n{AppName} 的页面结构\n' > "$EN/doc-framework-en/standards/app-app-web.md"
printf '%s' "$(run "$EN" check 2>&1)" | grep -q "占位符未渲染" \
  && ok "英文模式占位符 {AppName} 被报出" || bad "英文模式占位符静默通过"
cp "$TMP/app-web.bak" "$EN/doc-framework-en/standards/app-app-web.md"

# 13.30 应用类型中英混排（中文根登记 frontend）也要触发类型层规范校验
RT="$TMP/type-mix"; mk_project "$RT"
sed -i.bak 's/| app-web | 前端端 |/| app-web | frontend |/' "$RT/doc-framework/项目档案.md"
rm -f "$RT"/doc-framework/项目档案.md.bak "$RT/doc-framework/规范/类型-前端.md"
printf '%s' "$(run "$RT" check 2>&1)" | grep -q "类型-前端" \
  && ok "应用类型中英词表取并集（frontend 触发类型层规范校验）" || bad "中英混排的应用类型漏校验"

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

# 13.32 混排目录布局：中文根里放在英文目录名（modules/…/plans/）的计划也要被枚举到
mkdir -p "$R/doc-framework/模块/混排" "$R/doc-framework/modules/混排/plans"
echo "# 混排契约" > "$R/doc-framework/模块/混排/契约.md"
cat > "$R/doc-framework/modules/混排/plans/2025-06-02-英文目录名计划.md" <<'EOF'
# 2025-06-02 英文目录名计划

> 依据模块契约：`doc-framework/模块/混排/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）

> 合并状态：待合并

### ADDED（新增）

| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 混排主表 | 字段 x | tinyint(1) | |

## 变更文件清单

| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 主责 |
EOF
printf '%s' "$(run "$R" check 2>&1)" | grep -q "语义增量未合并" \
  && ok "混排布局（modules/…/plans/）的计划仍被枚举（不再是静默盲区）" || bad "混排布局下的计划静默不可见"
rm -rf "$R/doc-framework/modules" "$R/doc-framework/模块/混排"

echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
