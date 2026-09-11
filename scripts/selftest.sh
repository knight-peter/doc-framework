#!/usr/bin/env bash
# ============================================================
# doc-framework 维护者自检（核心回归，需 node >= 16）
# 用法：bash scripts/selftest.sh
#       NODE_BIN=/path/to/node bash scripts/selftest.sh   # 指定 node
#
# 覆盖的是历史上真实踩过的坑（v2.1 审查修复项），作为合并门禁：
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

echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
