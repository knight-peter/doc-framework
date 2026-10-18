# 16：npm 包形态冒烟（v3 单安装方式）
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

# 模拟 npm 包内容：不应有 install.sh / install.js
[ -e "$PKG/install.sh" ] && bad "包内仍有 install.sh" || ok "包内无 install.sh"
[ -e "$PKG/scripts/install.js" ] && bad "包内仍有 scripts/install.js" || ok "包内无 scripts/install.js"
POSTINSTALL=$("$NODE_BIN" -e "const p=require('$PKG/package.json');process.stdout.write(String(!!(p.scripts&&p.scripts.postinstall)))" 2>&1)
[ "$POSTINSTALL" = "false" ] && ok "包内 package.json 无 postinstall" || bad "包内仍有 postinstall：$POSTINSTALL"

INST_OUT=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" install 2>&1 ); INST_CODE=$?
assert_exit "$INST_CODE" "0" "包安装：无 package.json 的项目 install 成功" "包安装：install 失败（exit=$INST_CODE）"
[ -d "$PROJ/.agents/skills/module-code" ] && ok "包安装：skill 落地" || bad "包安装：skill 未落地"
[ -f "$PROJ/doc-framework/README.md" ] && ok "包安装：骨架 README 就位" || bad "包安装：骨架未就位"
[ -f "$PROJ/接入指南.md" ] && ok "包安装：接入指南就位" || bad "包安装：接入指南缺失"
assert_grep "$INST_OUT" "已安装 skill" "包安装：输出安装去向" "包安装：输出缺少安装去向"

TPL=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" template 项目档案 2>&1 )
assert_grep "$TPL" "# 项目档案" "template：从包内模板输出" "template：包内模板不可用"
SYNC_OUT=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" sync 2>&1 ); SYNC_CODE=$?
assert_exit "$SYNC_CODE" "0" "sync：包安装后可用" "sync：包安装后失败（exit=$SYNC_CODE）"
DOC_JSON=$( cd "$PROJ" && "$NODE_BIN" "$PKG/scripts/cli.js" doctor --json 2>&1 )
assert_json "$DOC_JSON" "d['ok'] is True and any(c['area']=='install' for c in d['checks']) == False" "doctor：包安装后无 install 错误" "doctor：包安装后 install 报告异常"
