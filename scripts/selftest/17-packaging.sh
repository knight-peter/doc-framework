# 16：分发包形态冒烟（v3 单安装入口；GitHub tag / git 依赖）
#
#  27. 包内容（package.json files）脱离仓库后仍可安装：
#      - 项目无 package.json，`node <pkg>/scripts/cli.js install` 可铺 skill/骨架/引导；
#      - `template` 从包内模板输出；`sync` 可用；`doctor` 报告健康；
#      - 包内不应出现 install.sh / postinstall（单安装入口）。

PKG="$TMP/pkg"; PROJ="$TMP/pack-proj"
mkdir -p "$PKG/scripts" "$PROJ"
cp "$ROOT/package.json" "$PKG/"
cp -R "$ROOT/skills" "$ROOT/templates" "$ROOT/docs" "$PKG/"
mkdir -p "$PKG/scripts/commands" "$PKG/scripts/checks" "$PKG/scripts/lib"
cp "$ROOT/scripts/cli.js" "$PKG/scripts/"
cp "$ROOT/scripts/commands/"*.js "$PKG/scripts/commands/"
cp "$ROOT/scripts/checks/"*.js "$PKG/scripts/checks/"
cp "$ROOT/scripts/lib/"*.js "$PKG/scripts/lib/"

# 模拟分发包内容：不应有 install.sh / install.js
[ -x "$PKG/scripts/cli.js" ] && ok "包内 CLI 可执行（bin 权限）" || bad "包内 CLI 不可执行（npm bin 会 Permission denied）"
[ -e "$PKG/install.sh" ] && bad "包内仍有 install.sh" || ok "包内无 install.sh"
[ -e "$PKG/scripts/install.js" ] && bad "包内仍有 scripts/install.js" || ok "包内无 scripts/install.js"
POSTINSTALL=$("$NODE_BIN" -e "const p=require('$PKG/package.json');process.stdout.write(String(!!(p.scripts&&p.scripts.postinstall)))" 2>&1)
[ "$POSTINSTALL" = "false" ] && ok "包内 package.json 无 postinstall" || bad "包内仍有 postinstall：$POSTINSTALL"
PRIVATE=$("$NODE_BIN" -e "const p=require('$PKG/package.json');process.stdout.write(String(p.private))" 2>&1)
[ "$PRIVATE" = "true" ] && ok "包内 package.json 保持 private（不发布 npm）" || bad "包内 package.json 未保持 private：$PRIVATE"

INST_OUT=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" install 2>&1 ); INST_CODE=$?
assert_exit "$INST_CODE" "0" "包安装：无 package.json 的项目 install 成功" "包安装：install 失败（exit=${INST_CODE}）"
[ -d "$PROJ/.agents/skills/module-code" ] && ok "包安装：skill 落地" || bad "包安装：skill 未落地"
[ -f "$PROJ/doc-framework/README.md" ] && ok "包安装：骨架 README 就位" || bad "包安装：骨架未就位"
[ -f "$PROJ/接入指南.md" ] && ok "包安装：接入指南就位" || bad "包安装：接入指南缺失"
assert_grep "$INST_OUT" "已安装 skill" "包安装：输出安装去向" "包安装：输出缺少安装去向"

TPL=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" template 项目档案 2>&1 )
assert_grep "$TPL" "# 项目档案" "template：从包内模板输出" "template：包内模板不可用"
SYNC_OUT=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" sync 2>&1 ); SYNC_CODE=$?
assert_exit "$SYNC_CODE" "0" "sync：包安装后可用" "sync：包安装后失败（exit=${SYNC_CODE}）"
DOC_JSON=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" doctor --json 2>&1 )
assert_json "$DOC_JSON" "d['ok'] is True and any(c['area']=='install' for c in d['checks']) == False" "doctor：包安装后无 install 错误" "doctor：包安装后 install 报告异常"

# 已初始化项目再跑 install：只刷新 skill，不得改写文档 / AGENTS（文档资产永不回灌）
printf '# 项目档案\n' > "$PROJ/doc-framework/项目档案.md"
H_GUIDE_BEFORE=$(shasum -a 256 "$PROJ/接入指南.md" | cut -d' ' -f1)
H_AGENTS_BEFORE=$(shasum -a 256 "$PROJ/AGENTS.md" | cut -d' ' -f1)
( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" install >/dev/null 2>&1 )
REINSTALL_OUT=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" install 2>&1 )
assert_ngrep "$REINSTALL_OUT" "下一步" "已初始化项目：install 不再提示初始化" "已初始化项目：install 仍提示初始化"
assert_grep "$(cat "$PROJ/doc-framework/README.md")" "npx doc-framework template" "引导 README：模板来源为 npx template" "引导 README：模板来源未更新"
H_GUIDE_AFTER=$(shasum -a 256 "$PROJ/接入指南.md" | cut -d' ' -f1)
H_AGENTS_AFTER=$(shasum -a 256 "$PROJ/AGENTS.md" | cut -d' ' -f1)
[ "$H_GUIDE_BEFORE" = "$H_GUIDE_AFTER" ] && ok "已初始化项目：install 不改写《接入指南》" || bad "已初始化项目：《接入指南》被 install 改写"
[ "$H_AGENTS_BEFORE" = "$H_AGENTS_AFTER" ] && ok "已初始化项目：install 不改写 AGENTS.md" || bad "已初始化项目：AGENTS.md 被 install 改写"
