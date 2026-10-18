# 07：解析健壮性 + 安装/同步闭环
#
#  17. 解析健壮性 + 安装/同步闭环：**节名大小写不敏感**（中文节名夹大写英文词也要认，
#      否则 I2/应用清单/直改边界静默降级）/ **ADD-1 编号增量**被识别（I2 不静默失效）/
#      小节标题归一（剥离尾部连续括注组 + 去章号）/
#      **sync：marker 缺源文件条目（上游在既有 skill 目录新增文件）不得误判"本地已定制"致升级搁浅**/
#      **install：targetDirs 空值不倒进项目根** + **不再发布的幽灵技能目录被清理**
#      **sync per-skill marker：定制 skill 跳过时保留旧版本（下次仍尝试），幽灵技能被清理**

# ── 17：解析健壮性 + 安装/同步闭环 ──────────────────────────
# 17.1 节名定位的健壮性：mdSection 必须**大小写不敏感**（中文文档里夹英文词、手改大小写都要认），
#      否则 mdSection 返回 null → 上层全部**静默降级**（I2 失效、应用清单消失、直改边界为空），且不报错。
#      同时断言：英文节名**不再**被识别（见 §7）。
UNIT=$("$NODE_BIN" -e '
const p=require(process.argv[1]);
const a=p.mdSection("## 语义增量（DELTA）\nB\n## X\n","语义增量")||"";
const b=p.mdSection("## 应用清单（APP REGISTRY）\nB\n","应用清单")||"";
const c=p.mdSection("## 5. 应用落点（application footprint）\nB\n","应用落点")||"";
const r=p.appSpecSectionTitles("### 3.1 主题与适老化（本应用核心约定）\n### 3.10 dev 代理（rewrite，不是 pathRewrite）（v1.3 新增）\n");
const d=p.parseDelta("## 语义增量\n> 合并状态：待合并\n### ADDED（新增）\n| # | 目标位置 | 对象 | 内容 | 主计划 |\n|---|---|---|---|---|\n| A1 | 契约 §3 | f | c | |\n",p.NAMES.zh);
process.stdout.write([a.includes("B"),b.includes("B"),c.includes("B"),r.map(t=>t.norm).join("|"),d.nonEmpty].join(","));
' "$ROOT/scripts/lib/plan.js" 2>&1)
[ "$UNIT" = "true,true,true,主题与适老化|dev 代理,true" ] && ok "节名定位：大小写不敏感；小节标题归一（剥括注+去章号）；英文节名不再识别" || bad "节名定位异常：$UNIT"

# 17.2 sync 修复：marker 缺某个源文件条目 = 上游在既有 skill 目录里新增了文件，
#      不得被误判为"本地已定制"——否则该目录被跳过、marker 却写成新版本，
#      后续 sync 因"已是最新"整体 no-op，升级连同新文件永久搁浅（无法自愈）。
SY="$TMP/syncfix"; mkdir -p "$SY"
( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
MKR="$SY/.agents/skills/.doc-framework.json"
"$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$MKR'));m.version='v0.0.1';delete m.skills;m.files=m.files.filter(f=>f.file!=='module-review/SKILL.md');fs.writeFileSync('$MKR',JSON.stringify(m))" 2>/dev/null
OUT_SY=$( cd "$SY" && INIT_CWD="$SY" "$NODE_BIN" "$CLI" sync 2>&1 )
assert_ngrep "$OUT_SY" "跳过（本地已定制）：module-review" "sync：marker 缺条目不再误判本地定制（目录正常升级）" "sync：marker 缺条目被误判本地定制（上游新增文件随升级搁浅）"

# 17.2b sync per-skill marker：跳过一个定制 skill 时，**不能把它的版本推进到最新**
#       旧实现只有一个全局 version：定制 skill 被跳过，marker 却写成最新 → 下次 sync
#       直接"已是最新"整体 no-op，该 skill 永久搁浅。新 marker 的 skills[name].version 独立。
SM="$TMP/sync-per-skill"; mkdir -p "$SM"
( cd "$SM" && INIT_CWD="$SM" "$NODE_BIN" "$ROOT/scripts/install.js" >/dev/null 2>&1 )
SM_DIR="$SM/.agents/skills"; SM_MKR="$SM_DIR/.doc-framework.json"
echo '// local customization' >> "$SM_DIR/module-code/SKILL.md"
"$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$SM_MKR'));m.version='v0.0.1';delete m.skills;fs.writeFileSync('$SM_MKR',JSON.stringify(m))" 2>/dev/null
OUT_SM=$( cd "$SM" && INIT_CWD="$SM" "$NODE_BIN" "$CLI" sync 2>&1 )
assert_grep "$OUT_SM" "跳过（本地已定制）：module-code" "per-skill marker：定制 skill 被跳过并告警" "per-skill marker：定制 skill 未报告跳过"
SM_VER=$("$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$SM_MKR'));process.stdout.write([m.skills['module-code'].version,m.skills['module-doc'].version,m.version].join(','))" 2>&1)
PKG_VER=$("$NODE_BIN" -e "process.stdout.write('v'+require('$ROOT/package.json').version)" 2>&1)
[ "$SM_VER" = "v0.0.1,$PKG_VER,$PKG_VER" ] && ok "per-skill marker：被跳过的 skill 保留旧版本，其它 skill 升到当前版本（$SM_VER）" || bad "per-skill marker 版本推进错误：$SM_VER（期望 v0.0.1,$PKG_VER,$PKG_VER）"
OUT_SM2=$( cd "$SM" && INIT_CWD="$SM" "$NODE_BIN" "$CLI" sync 2>&1 )
assert_grep "$OUT_SM2" "跳过（本地已定制）：module-code" "per-skill marker：第二次 sync 仍会尝试该 skill（不是整体 no-op）" "per-skill marker：第二次 sync 被全局版本骗过（永久搁浅）"
# 幽灵技能：sync 也要清理旧 marker 记录过、当前源已不存在的 skill 目录（install.js 之外的第二条路径）
mkdir -p "$SM_DIR/ghost-skill"; echo x > "$SM_DIR/ghost-skill/SKILL.md"
"$NODE_BIN" -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('$SM_MKR'));m.skills['ghost-skill']={version:'v0.0.1',files:[{file:'SKILL.md',hash:'x'}]};fs.writeFileSync('$SM_MKR',JSON.stringify(m))" 2>/dev/null
( cd "$SM" && INIT_CWD="$SM" "$NODE_BIN" "$CLI" sync >/dev/null 2>&1 )
[ -d "$SM_DIR/ghost-skill" ] && bad "sync：不再发布的幽灵技能目录未清理（只清 marker 记录过的）" || ok "sync：不再发布的幽灵技能目录被清理"

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

# 17.5 install.sh（**引导器**，bash 副本）的命名/判据必须与 plan.js 一致
#   为什么这里必须有机器守卫：引导器不能依赖框架代码库（它要在 `node_modules` 存在之前跑），
#   所以"骨架目录清单"与"已初始化判据"在 install.sh 里各有一份 bash 副本——历史上这类副本
#   只靠注释"改一处同步另一处"约束，漂移的后果是**静默**的：目录骨架缺失（初始化后一串 ❌）
#   或已初始化判据认不出（引导段覆盖用户自己维护的 AGENTS.md）。
INST_SH="$ROOT/install.sh"
PLAN_DIRS="$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');const d=p.NAMES.zh.dirs;process.stdout.write([d.modules,d.boundaries,d.standards,d.plans,d.explore].join(' '))")"
INST_DIRS="$(grep -o 'mkdir -p doc-framework/[^"]*' "$INST_SH" | head -1 | sed -e 's|mkdir -p ||' -e 's|doc-framework/||g')"
[ "$INST_DIRS" = "$PLAN_DIRS" ] && ok "install.sh 骨架目录 == plan.NAMES.zh.dirs（bash 副本未漂移）" || bad "install.sh 目录副本漂移：install.sh=[$INST_DIRS] plan.js=[$PLAN_DIRS]"
PLAN_PROFILE="$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');process.stdout.write(p.NAMES.zh.profile)")"
grep -q "doc-framework/$PLAN_PROFILE" "$INST_SH" && ok "install.sh 已初始化判据 == plan 档案名（$PLAN_PROFILE）" || bad "install.sh 初始化判据漂移（plan 档案名=$PLAN_PROFILE）"
