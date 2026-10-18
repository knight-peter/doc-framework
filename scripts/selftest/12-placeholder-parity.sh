# 11：18.5 占位符口径对拍（JS ↔ python 夹具）
#
#  18.5 的跨语言对拍：JS 侧口径 = lib/plan.js findPlaceholders，python 侧 = selftest-render-fixture.py check_hits。

# ── 防「静默跳过」（必须放在最后）───────────────────────────────
# 已观测到：bash 读到脚本后段时**整段跳过**（本节之前的部分照跑），却照样打印 PASS ——
# "少跑一段还报绿"比失败更危险（假绿）。该现象时序相关（加 `bash -x`、或改输出重定向即不复现），
# 根因在 bash 侧、无法在脚本内根治，所以这里用**断言数下限**硬拦：少跑就报错。
# 断言数下限**从脚本自推导**（统计 `ok "` 直调点，再减去 assert_* 四个助手体内的转发调用）——
# 新增用例即自动抬基线，不会再出现"加了用例忘调 MIN、少跑一段仍报绿"的双写漂移。
# 18.5 占位符口径对拍（计划 5.5）：check 的 findPlaceholders（cli.js）与 fixture 的 check_hits
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
