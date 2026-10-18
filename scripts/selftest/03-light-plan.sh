# 03：轻量计划形态与全链路（含直改通道边界）
#
#  10. 直改通道 diff-check --module：边界=契约 §5 落点（落点内通过 / 落点外拦截）
#  11. 轻量计划形态：合规通过、缺表态硬报错；list --stale 命中停滞计划
#  12. 轻量计划全链路：应用清单 + 轻量计划解析 + 白名单对账 + 契约 §5 直改边界

# ── 10/11：轻量计划形态 + 停滞计划清单（直改通道用例已并入 §12，避免同一判据两处夹具）──
# 回归 11：轻量形态是给小改动开的出口，表态+清单齐全就该放行；否则大家一律标「完整」，形态失去意义
D="$TMP/direct"; mk_project "$D"
echo "# 订单契约" > "$D/doc-framework/模块/订单/契约.md"
cat > "$D/doc-framework/模块/订单/计划/2025-01-02-文案小改.md" <<'EOF'
# 2025-01-02 文案小改实施

> 依据模块契约：`doc-framework/模块/订单/契约.md`
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
