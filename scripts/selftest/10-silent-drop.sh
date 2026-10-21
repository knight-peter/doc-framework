# 09：静默丢行回归 + 对外文案（无模式字母代号）
#
#  19. 增量解析不得「静默丢行 / 丢章节」：**单花括号记法（`{penaltyId}` / `{域}:{实体}:{操作}`）不得被
#      当占位符丢弃** / **双花括号未渲染行必须显式报出**（check 硬报 + draft-contract 提示）/
#      **§1–§10 全部可映射到契约章节** / **SKILL.md §2.4 映射表与 plan.CONTRACT_CHAPTERS 单一来源守卫**
#      **目标位置「契约.md §N」带文件名写法也识别**（chapterOf 先剥 .md）
#      （设计文档 §4.2）
#  20. 对外文案不得用模式字母代号（M/B/C/A）指代 `/module-doc` 的处理方式（模式名一律中文）。
#      只抓"字母被当作模式名"的固定搭配（`方式 A` / `方案 B` / `{模块A}` / 增量行 ID `M1` / `§N.M` / mermaid 节点不算）

# ── 19：增量解析的两类「静默丢行 / 章节丢失」回归 ──────────────────────
# 两类判据：
#   ① 单花括号记法（路由参数 `{penaltyId}` / 权限标识 `{域}:{实体}:{操作}`）不是占位符——合法增量行
#      必须保留。静默丢行会让 total 变小，极端情况下整表归零 → delta.nonEmpty=false → I2 被绕过。
#   ② 双花括号未渲染行必须**显式报出**而非静默跳过；§1–§10 全部可映射到契约章节。
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
| A8 | 契约 §7 不变量与陷阱 | 约定 | 需登录态 | |
| A9 | 契约 §8.2 | 验收 | 缴纳成功 | |
| A10 | 契约 §9 变更记录 | 记录 | 追加一行 | |
| A11 | 契约 §10 生产 SQL 登记 | SQL | 加字段脚本 | |
| A13 | 契约.md §4.2 | 带文件名写法 | GET /x | |
| A12 | 契约 §4.2 | 未渲染行 | {{目标值}} | |
EOF
DC19="$(run "$B19" check --draft-contract doc-framework/模块/罚息/计划/2025-05-01-罚息缴纳.md 2>&1)"
grep -q '增量 12 项' <<< "$DC19"  && ok "增量解析：单花括号记法行未被丢弃（12 项，含 {penaltyId}/{域}）"  || { bad "增量解析：含 {penaltyId}/{域} 的合法行被静默丢弃"; printf '%s\n' "$DC19" | sed 's/^/     /'; }
assert_grep "$DC19" 'A4 ADDED' "增量解析：路由参数 {penaltyId} 行保留" "增量解析：{penaltyId} 行丢失"
assert_grep "$DC19" 'A5 ADDED' "增量解析：权限标识 {域}:{实体}:{操作} 行保留" "增量解析：{域} 行丢失"
assert_grep "$DC19" '未渲染占位符' "增量解析：双花括号行被显式报出（不再静默丢行）" "增量解析：双花括号行被静默跳过"
assert_ngrep "$DC19" 'A12' "增量解析：未渲染行未计入增量" "增量解析：未渲染行被计入增量"
assert_grep "$DC19" 'A13 ADDED' "章节映射：契约.md §4.2 这种带文件名写法被识别" "章节映射：契约.md §4.2 未识别"
assert_grep "$DC19" '契约 §4 接口概览' "章节映射：契约.md 前缀归一后落到契约 §4" "章节映射：契约.md 前缀未归一"
MISSING_SEC=""
for n in 1 2 3 4 5 6 7 8 9 10; do
  grep -q "契约 §$n " <<< "$DC19" || MISSING_SEC="$MISSING_SEC §$n"
done
[ -z "$MISSING_SEC" ] && ok "章节映射：契约 §1–§10 全部识别" || bad "章节映射：未识别$MISSING_SEC"
assert_ngrep "$DC19" '人工定位' "章节映射：无「未识别 → 人工定位」残留" "章节映射：仍有条目落「未识别 → 人工定位」"
FULL19="$(run "$B19" check 2>&1)"
grep -q '未渲染占位符「{{…}}」被跳过' <<< "$FULL19"  && ok "check：未渲染增量的丢行不再静默（硬报出）" || bad "check：未渲染增量的丢行仍静默"
# 映射表同步守卫（设计文档 §4.2：新增章节必须同步 SKILL.md §2.4 与 chapterOf）——
# 从 SKILL.md §2.4 表里抽出 `| §N ` 的章节号，与 plan.CONTRACT_CHAPTERS 的键集合比对，防再次漂移。
SKILL_SECS="$(grep -oE '^\| §[0-9]+' "$ROOT/skills/module-doc/SKILL.md" | grep -oE '[0-9]+' | sort -n | uniq | tr '\n' ' ')"
MAP_SECS="$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write(Object.keys(p.CONTRACT_CHAPTERS).sort((a,b)=>a-b).join(' '))" | tr ' ' '\n' | sort -n | uniq | tr '\n' ' ')"
[ "$SKILL_SECS" = "$MAP_SECS" ]  && ok "章节映射单一来源：SKILL.md §2.4 与 CONTRACT_CHAPTERS 一致（${MAP_SECS}）"  || bad "章节映射漂移：SKILL.md §2.4=[$SKILL_SECS] vs CONTRACT_CHAPTERS=[$MAP_SECS]"

# 规则码唯一性（A11）：同一 id 不得登记两次——防 `--rules` 重复行与 `--json` 消费方歧义。
RULES_DUP="$("$NODE_BIN" -e "const r=require('$ROOT/scripts/checks/rules');const ids=r.describeRules().map(x=>x.id);const d=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];process.stdout.write(d.join(','))")"
[ -z "$RULES_DUP" ]  && ok "规则码唯一：RULES 无重复 id"  || bad "规则码重复：$RULES_DUP"

# 契约模板标题 ↔ CONTRACT_CHAPTERS（C1）：模板是给人写的章节来源，常量是 --draft-contract 的派发依据；
# 两侧名称不同步 = 派发到不存在的章节且不报错。
TPL_SECS="$("$NODE_BIN" -e "
const fs=require('fs'),p=require('$ROOT/scripts/lib/plan.js');
const t=fs.readFileSync('$ROOT/templates/模块/{模块名}/契约.md.tpl','utf8');
const tpl={};
for(const line of t.split('\n')){const m=line.match(/^## ([0-9]+)\. (.+)\$/); if(m) tpl[m[1]]=m[2].trim();}
const map={};
for(const [n,v] of Object.entries(p.CONTRACT_CHAPTERS)){const m=v.match(/^契约 §([0-9]+) (.+)\$/); if(m) map[m[1]]=m[2].trim();}
const bad=Object.keys({...tpl,...map}).filter(n=>tpl[n]!==map[n]).map(n=>n+':模板='+(tpl[n]||'—')+'/常量='+(map[n]||'—'));
process.stdout.write(bad.join('；'));
")"
[ -z "$TPL_SECS" ]  && ok "章节标题单一来源：契约模板与 CONTRACT_CHAPTERS 的名称一致"  || bad "章节标题漂移：$TPL_SECS"

# ── 20：对外文案不得用模式字母代号（M/B/C/A）指代 /module-doc 的处理方式 ────
# 判据：只抓"字母被当作模式名"的固定搭配，不误伤 `方式 A` / `方案 B` / `{模块A}` / mermaid 节点 /
#   增量行 ID（`A1`/`M1`/`R1`）/ 章号（`§N.M`）/ 建模补充小节（`M1–M2`）。
MODE_HITS="$( { grep -rnE '/module-doc M|由 M |供 M |M 的 |模式 [ABCM][^A-Za-z0-9]|[（(][MBC][）)]|[ABC] 的触发'  "$ROOT/skills" "$ROOT/templates" "$ROOT/README.md" "$ROOT/docs" 2>/dev/null; grep -rnE --include='*.js' '/module-doc M|由 M |供 M |M 的 |模式 [ABCM][^A-Za-z0-9]|[（(][MBC][）)]|[ABC] 的触发' "$ROOT/scripts" 2>/dev/null; } )"
[ -z "$MODE_HITS" ]  && ok "模式命名：对外文案无 M/B/C 字母代号残留"  || { bad "模式命名：仍有字母代号残留（改用中文处理方式名：合并增量 / 代码对账 / 产物补齐）"; printf '%s\n' "$MODE_HITS" | sed 's/^/     /'; }
