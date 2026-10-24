#!/usr/bin/env bash
# ============================================================
# doc-framework 维护者自检（核心回归，需 node >= 22）
# 用法：bash scripts/selftest.sh
#       NODE_BIN=/path/to/node bash scripts/selftest.sh   # 指定 node
#
# 结构：本文件 = **runner**（环境 + 执行顺序 + 汇总），用例在 scripts/selftest/ 下：
#   harness.sh              断言助手 + mk_project 夹具（判据无关，先于全部用例 source）
#   01..17-*.sh             用例文件，**文件名序号即执行顺序**；每个文件头部写明它覆盖的判据编号
#
# 三条纪律：
#   1. 新增用例 → 写进对应编号文件（或新建 NN-*.sh 占位）；**不要**改本文件的顺序逻辑；
#   2. 用例之间共享 `$TMP`、`$ROOT`、`$CLI`；夹具用完即可弃，不依赖前序文件的残留状态；
#   3. 断言一律用 assert_* / ok / bad，禁止裸 `printf | grep -q`（pipefail 下 SIGPIPE 竞态会假红）。
#
# 覆盖的判据清单 = 各用例文件头部的编号条目（原集中在脚本头的 70 行清单已随文件分散，
# 与用例同处一地，改判据时不会漏改清单）。
# ============================================================
set -uo pipefail

# CI / 干净 HOME 下没有 git 身份：selftest 里的临时仓库 commit 不能依赖开发机配置
export GIT_AUTHOR_NAME="doc-framework selftest"
export GIT_AUTHOR_EMAIL="selftest@example.invalid"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

# 变量后接中文一律写 ${VAR}：Bash 3.2 在 UTF-8 locale 下会把多字节首字节并进变量名
# （macOS CI 实测：$EN_CODE） 被解析成变量名 EN_CODE\xef ⇒ unbound variable）

NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "❌ 找不到 node（可用 NODE_BIN=/path/to/node 指定）"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/scripts/cli.js"
SELFDIR="$ROOT/scripts/selftest"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0

# shellcheck source=selftest/harness.sh
. "$SELFDIR/harness.sh"

echo "==============================================="
echo "doc-framework selftest  $(date '+%F %T')"
echo "==============================================="

# 按文件名序号执行（零填充保证字典序 == 执行序）；每个文件前打印一行，便于定位失败归属。
#
# ⚠️ EXPECTED_FILES 是**登记值**：新增/删除/改名用例文件时必须同步改这一行。
#    它补的是"整份文件被移出执行序列"这个缺口——那种情况下断言下限会**跟着文件一起变小**，
#    自推导守卫单独用会静默放行（实测过）。多一个数字换来"少跑一段必报红"。
EXPECTED_FILES=23
FILES=("$SELFDIR"/[0-9][0-9]-*.sh)
if [ "${#FILES[@]}" -ne "$EXPECTED_FILES" ]; then
  bad "用例文件数 ${#FILES[@]} ≠ 登记值 ${EXPECTED_FILES}（有文件被删除/改名？新增用例请同步 EXPECTED_FILES）"
fi
for f in "${FILES[@]}"; do
  VERDICTS_BEFORE=$((PASS + FAIL))
  printf '── %s\n' "$(basename "$f")"
  # shellcheck disable=SC1090
  . "$f"
  [ $((PASS + FAIL)) -gt "$VERDICTS_BEFORE" ] || bad "$(basename "$f")：未产生任何断言（整段被跳过？）"
done

# 断言下限自推导：统计全部用例文件里的 `ok "` 直调点，减去 harness 内 4 个助手的转发调用。
MIN_ASSERTIONS=$(($(grep -h -c 'ok "' "$SELFDIR"/*.sh | awk '{s+=$1} END{print s+0}') - 4))
if [ "$PASS" -lt "$MIN_ASSERTIONS" ]; then
  echo "❌ 只执行了 $PASS 条断言（基线 ≥ ${MIN_ASSERTIONS}）——脚本后段可能被跳过，请重跑"
  FAIL=$((FAIL+1))
fi

echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
