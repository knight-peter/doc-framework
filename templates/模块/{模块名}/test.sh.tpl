#!/usr/bin/env bash
# ============================================================
# {模块名} 端到端自动测试脚本
# 由共享模板 scripts/e2e_template.sh 复制改造：
#   1. 修改下方"模块参数"（模块名/流程key/接口路径/账号/项目ID）
#   2. 按 {模块名}/测试.md 的用例补充步骤与断言
#   3. 只创建数据，不做任何删除，数据保留供人工复核
# ============================================================
set -uo pipefail

# ── 模块参数（复制后必改）──────────────────────────────
MODULE_NAME="{模块名}"
BASE_URL=${BASE_URL:-http://localhost:8082}
PROJECT_ID=${PROJECT_ID:-0}
BIDDING_ID=${BIDDING_ID:-0}
FILLER_USER=${FILLER_USER:-''}
FILLER_PWD=${FILLER_PWD:-'Aa@123456'}
AUDIT_USER=${AUDIT_USER:-''}
AUDIT_PWD=${AUDIT_PWD:-'Aa@123456'}
API_LIST="/{module-path}/list"
API_SUBMIT="/{module-path}/submit"
API_AUDIT="/{module-path}/audit-pass"
# ------------------------------------------------------

PASS=0; FAIL=0
log()  { printf '%s\n' "$*"; }
ok()   { log "  ✅ PASS: $*"; PASS=$((PASS+1)); }
bad()  { log "  ❌ FAIL: $*"; FAIL=$((FAIL+1)); }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

login() {
  local user="$1" pwd="$2"
  curl -s -X POST "${BASE_URL}/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"$pwd\"}" 2>/dev/null \
    | json "d.get('data',{}).get('token','')"
}

api() {
  local token="$1" method="$2" path="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "${BASE_URL}${path}" -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" -d "$body" 2>/dev/null
  else
    curl -s -X "$method" "${BASE_URL}${path}" -H "Authorization: Bearer $token" 2>/dev/null
  fi
}

echo "==============================================="
echo "${MODULE_NAME} 自动测试 开始：$(date '+%F %T')"
echo "==============================================="

# ── 用例 1：提交 ──────────────────────────────────────
FILLER_TOKEN=$(login "$FILLER_USER" "$FILLER_PWD")
[ -z "$FILLER_TOKEN" ] && bad "登录失败：$FILLER_USER" || ok "登录成功：$FILLER_USER"

SUBMIT_RESP=$(api "$FILLER_TOKEN" POST "$API_SUBMIT" \
  "{\"projectId\":${PROJECT_ID},\"biddingId\":${BIDDING_ID}}")
NEW_ID=$(echo "$SUBMIT_RESP" | json "d.get('data',{}).get('id','')")
[ -n "$NEW_ID" ] && ok "提交成功，id=$NEW_ID" || bad "提交失败：$SUBMIT_RESP"

# ── 用例 2：审核（如适用）────────────────────────────
# ...按 {模块名}/测试.md 补充

# ── 汇总 ──────────────────────────────────────────────
echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "测试数据保留（id=$NEW_ID），供人工复核"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
