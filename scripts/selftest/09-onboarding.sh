# 08：接入初始化闭环（模板渲染夹具）
#
#  18. 接入初始化闭环：`scripts/selftest-render-fixture.py` 把**全部模板**真渲染成一套文档骨架 →
#      **双括号待填字段清零 + 单括号记法保留 + 渲染产物过真实 check 零 ❌** /
#      **字段级判据：模板待填占位符必须在渲染夹具 `selftest-render-fixture.py` 的 BASE 取值表登记**
#      （漏登记 → 渲染后双括号残留 → 本组红）；**《接入指南》「渲染要点」是人读摘要、不承担机检职责** /
#      **清单级判据：《接入指南》「模板 → 产出映射」必须覆盖 `templates/` 下全部可渲染模板** /
#      **占位符残留报告必须带文件+个数+改法** / **残留花括号进退出码**（硬问题）/
#      **总契约模块表单表**：§4 索引 + 依赖同表、§5 仅全景图（不得恢复 §5.1 矩阵 / 被谁依赖列）/
#      **test.sh 模板单一来源**：唯一源存在且无重复副本

# ── 18：接入初始化闭环（模板 → 占位符文档化 → check 输出可读）────────
# 本组覆盖接入初始化的两类判据：
#   **字段级** = 渲染后双括号必须清零（取值登记表是夹具 BASE，见 18.1）——残留即红；
#   **清单级** = 《接入指南》「模板 → 产出映射」必须登记每份可渲染模板（见 18.4）。
INIT_TPL="$ROOT/templates"
GUIDE_TPL="$INIT_TPL/接入指南.md.tpl"

# 18.1 **全模板渲染闭环**：把 `templates/` 的模板用脚本真渲染成一套完整文档
#      （夹具 JOBS 共 18 条渲染任务，覆盖 16 份不同模板——应用层 / 主题分册各渲染两次；AGENTS.md.tpl 与
#      接入指南.md.tpl 另有专门用例，不在此列）
#      骨架 → 断言「双括号待填字段清零」+「单括号记法不被误删」+「渲染产物过真实 check 零 ❌」。
#      语法约定：`{{字段}}` 待填（渲染后必须清零）/ `{记法}` 路径与命名记法（照原样保留）/
#      `【…】` 示例与可选项（填好后删除）/ `${…}` shell 真语法（原样保留）。
# 夹具独立成文件：§15.2f「模板自洽」也要用它（渲染真实产物再跑 check），内联会有两份副本
RENDER_OUT=$(python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$TMP/render-full")
[ -z "$RENDER_OUT" ] && ok "全模板渲染闭环：18 条渲染任务（16 份模板）后双括号清零、记法保留、产物过 check"  || bad "全模板渲染闭环失败：$RENDER_OUT"


# 18.1b 总契约模块表单表：§4 索引表与依赖列必须同表（§5 只放全景图）——防止两表并存再次漂移。
ZC_TPL="$INIT_TPL/总契约.md.tpl"
ZC_HDR=$(grep -c '^| 模块名 |' "$ZC_TPL" 2>/dev/null || true)
if [ "$ZC_HDR" = "1" ] \
   && grep -q '^| 模块名 |.*依赖的下游模块/数据 | 边界依赖 |$' "$ZC_TPL" \
   && grep -q '^## 5\. 模块依赖全景图' "$ZC_TPL" \
   && ! grep -qE '^### 5\.1|^## 5\. 模块依赖矩阵|[|] 被谁依赖 [|]' "$ZC_TPL"; then
  ok "总契约模块表单表：§4 索引 + 依赖同表，§5 仅全景图（无第二张按模块的表）"
else
  bad "总契约模块表单表：§4 索引与依赖应同表、§5 只放全景图（不得恢复 §5.1 矩阵 / 被谁依赖列）"
fi

# 18.2 check 的占位符残留输出必须可定位：带文件路径 + 个数 + 改法提示。
PO="$TMP/ph-noise"; mk_project "$PO"
printf '# 总契约\n\n| 模块 | 说明 |\n|---|---|\n| {模块A} | {一句话说明} |\n' > "$PO/doc-framework/总契约.md"
OUT_PO=$(run "$PO" check 2>&1); CODE_PO=$?
grep -q '总契约.md' <<< "$OUT_PO"  && ok "占位符残留：报告带文件路径" || bad "占位符残留：报告未带文件路径"
grep -q '占位符未渲染（' <<< "$OUT_PO"  && ok "占位符残留：报告带个数（便于判断工作量）" || bad "占位符残留：报告未带个数"
grep -q '改法：' <<< "$OUT_PO"  && ok "占位符残留：报告带改法提示（替换或删除示例行）" || bad "占位符残留：报告缺改法提示"
# 占位符残留是**硬问题**：模板渲染不干净必须让退出码为 1（否则 CI 静默放过"新项目第一天就是红的"）
assert_exit "$CODE_PO" "1" "占位符残留进退出码（模板没渲染干净必须红）" "占位符残留未进退出码（exit=${CODE_PO}）——初始化残缺会被静默放过"

# 18.3 单一来源：`模块/{模块名}/test.sh` 的模板源只能有一份（唯一源存在、历史副本不得重现）
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

# 18.4 **模板清单覆盖**：《接入指南.md》「模板 → 产出映射」必须覆盖 `templates/` 下**全部可渲染模板**。
#      不参与本判据的两份：`AGENTS.md.tpl`（无 `{{}}` 待填字段，单括号记法由 install 命令替换）、
#      `接入指南.md.tpl`（自身**原样拷贝**、不渲染）。
#      指南是接入初始化的唯一产出清单：**漏登记一份模板 = AI 初始化整份文档漏产出**（比漏一个字段严重）；
#      而指南「渲染要点」只是人读摘要（不穷举），所以字段级判据只能是 18.1 的渲染残留。
#      反向也查：指南登记的模板必须真实存在（防模板改名/删除后指南留旧名）。
#      写法归一（当前指南的三种写法）：反引号内**裸文件名**继承本行前一路径的目录（`类型-前端.md.tpl`、`类型-后端.md.tpl`）；
#      **目录前缀**写法 `templates/模块/{模块名}/` 视为覆盖其下全部模板；`templates/` 开头的完整路径直接比对。
TPLCOV=$(python3 - "$GUIDE_TPL" "$INIT_TPL" <<'PY'
import re, sys, pathlib
guide, tdir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
lines = guide.read_text(encoding='utf-8').split('\n')
head = [k for k, l in enumerate(lines) if l.strip().startswith('### 模板 → 产出映射')]
if not head:
    print('映射节「### 模板 → 产出映射」缺失'); sys.exit()
i = head[0]
end = next((k for k in range(i + 1, len(lines)) if lines[k].startswith('##')), len(lines))
covered, prefixes, lastdir = set(), set(), ''
for row in lines[i + 1:end]:
    if not row.startswith('|'):
        continue
    lastdir = ''
    for span in re.findall(r'`([^`]+)`', row):
        s = span.strip()
        if s.startswith('templates/'):
            rel = s[len('templates/'):]
            if rel.endswith('/'):
                prefixes.add(rel); continue
            if '/' in rel:
                lastdir = rel.rsplit('/', 1)[0] + '/'
            covered.add(rel)
        elif s.endswith('.tpl') and '/' not in s:
            covered.add(lastdir + s)
not_rendered = {'AGENTS.md.tpl', '接入指南.md.tpl'}
renderable = sorted(str(p.relative_to(tdir)) for p in tdir.rglob('*')
                    if p.is_file() and str(p.relative_to(tdir)) not in not_rendered)
missing = [f for f in renderable if f not in covered and not any(f.startswith(p) for p in prefixes)]
phantom = sorted(c for c in covered if not (tdir / c).is_file())
phantom += sorted(p for p in prefixes if not (tdir / p).is_dir())
if not covered and not prefixes:
    print('映射节未解析出任何来源模板（表格写法变了？）')
elif missing or phantom:
    msg = []
    if missing: msg.append('未登记来源模板：' + '、'.join(missing))
    if phantom: msg.append('登记了不存在的模板：' + '、'.join(phantom))
    print('；'.join(msg))
else:
    print('OK %d' % len(renderable))
PY
)
case "$TPLCOV" in
  OK*) ok "模板清单覆盖：${TPLCOV#OK } 份可渲染模板均在《接入指南》「模板 → 产出映射」登记" ;;
  '')  bad "模板清单覆盖：守卫未产出结果（python3 不可用或脚本异常退出，且不得静默通过）" ;;
  *)   bad "模板清单覆盖：$TPLCOV" ;;
esac

# 18.5 夹具 JOBS 必须覆盖全部可渲染模板（18.4 只查《接入指南》登记；漏进 JOBS 的模板永远不会被渲染）
JOBS_LIST=$(python3 "$ROOT/scripts/selftest-render-fixture.py" "$ROOT" "$TMP" --list-jobs | LC_ALL=C sort -u)
TPL_LIST=$(cd "$ROOT/templates" && find . -type f -name '*.tpl' | sed 's|^\./||' | LC_ALL=C sort | grep -v -E '^(AGENTS|接入指南)\.md\.tpl$')
if [ "$JOBS_LIST" = "$TPL_LIST" ]; then
  ok "渲染夹具 JOBS 覆盖全部可渲染模板（$(printf '%s' "$JOBS_LIST" | grep -c .) 份）"
else
  bad "渲染夹具 JOBS 与 templates/ 不一致：JOBS=[$JOBS_LIST] / templates=[$TPL_LIST]"
fi
