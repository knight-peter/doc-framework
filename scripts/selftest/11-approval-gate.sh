# 10：计划批准入口「调用即批准」
#
#  22. 计划批准入口「调用即批准」：计划的「已批准」有两个入口——用户确认；或 `/module-code`
#      执行「待审核」计划时先登记「已批准」再实施（module-code §0.3 是唯一权威）。守卫三件事：
#      **权威节存在且唯一** / **module-plan 状态约定回指它** / **工具闸门没被偷偷放宽**
#      （`diff-check` 仍只放行文件里写明的 已批准·实施中——skill 侧的登记不构成对工具的豁免）/
#      模板同步（总契约 / AGENTS / 接入指南 / 计划模板）

# ── 22：计划批准入口「调用即批准」─────────────────────────────────
# 计划通道的「已批准」有两个入口——用户确认；或 `/module-code` 执行「待审核」计划时的
#   **调用即批准**（skill 先登记「已批准」再实施）。规则横跨 module-code §0.3（唯一权威）、
#   module-plan 状态约定、模板与工具闸门，最危险的漂移是**工具侧偷偷放宽**（diff-check 放行
#   「待审核」= 批准门失效且静默）。三条断言钉死：权威节存在、回指不断、闸门未放宽。
MC_AUTH="$(grep -c '^### 0\.3 调用即批准' "$ROOT/skills/module-code/SKILL.md")"
[ "$MC_AUTH" = "1" ]  && ok "调用即批准：module-code §0.3 是唯一权威节（存在且不重复）"  || bad "调用即批准：module-code SKILL.md 缺 §0.3 或重复（= $MC_AUTH）"
MP_REF="$(grep -c '/module-code §0\.3' "$ROOT/skills/module-plan/SKILL.md")"
[ "$MP_REF" -ge 1 ]  && ok "调用即批准：module-plan 状态约定回指 /module-code §0.3（批准入口不漂移）"  || bad "调用即批准：module-plan 未回指 /module-code §0.3"
# 工具闸门：只认文件里写明的可执行状态（skill 侧的登记不构成对工具的豁免）
GATE_LINE="$(grep -rc --include='*.js' -- "p.state !== '已批准' && p.state !== '实施中'" "$ROOT/scripts" | awk -F: '{s+=$NF} END{print s+0}')"
[ "$GATE_LINE" = "1" ]  && ok "调用即批准：diff-check 闸门仍只放行 已批准/实施中（未放宽到 待审核）"  || bad "调用即批准：diff-check 可执行状态判据被改动（批准门可能失效，命中 $GATE_LINE 处）"
TPL_HITS="$(grep -rl '调用即批准' "$ROOT/templates" 2>/dev/null | wc -l | tr -d ' ')"
[ "$TPL_HITS" -ge 3 ]  && ok "调用即批准：模板已同步（总契约 / AGENTS / 接入指南 / 计划模板，$TPL_HITS 份）"  || bad "调用即批准：模板未同步（仅 $TPL_HITS 份提到）"
