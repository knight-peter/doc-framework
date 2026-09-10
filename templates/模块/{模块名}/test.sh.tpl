#!/usr/bin/env bash
# ============================================================
# {模块名} 端到端自动测试脚本
# 由共享模板 scripts/e2e_template.sh 复制改造：
#   1. 修改下方"模块参数"（模块名/流程key/各服务 BASE_URL/接口路径/账号/上下文参数）
#   2. 按 {模块名}/测试.md 的用例补充步骤与断言（接口层 + 编排层）
#   3. 只创建数据，不做任何删除，数据保留供人工复核
# ============================================================
set -uo pipefail

# ── 模块参数（复制后必改）──────────────────────────────
MODULE_NAME="{模块名}"
# 多服务地址：每个涉及的服务端应用一个 BASE_URL（按契约 §5 应用落点表；单服务模块只保留一个）
BASE_URL_SVC_MAIN=${BASE_URL_SVC_MAIN:-http://localhost:8081}   # 主责服务 {svc-main}
BASE_URL_SVC_BFF=${BASE_URL_SVC_BFF:-http://localhost:8082}     # 聚合层 {svc-bff}（无聚合层可删除）
PROJECT_ID=${PROJECT_ID:-0}
BIDDING_ID=${BIDDING_ID:-0}
FILLER_USER=${FILLER_USER:-''}
FILLER_PWD=${FILLER_PWD:-'Aa@123456'}
AUDIT_USER=${AUDIT_USER:-''}
AUDIT_PWD=${AUDIT_PWD:-'Aa@123456'}
# 业务接口路径（按 {模块名}/接口.md 修改，标注服务归属）
API_SUBMIT="/{module-path}/submit"          # 主责服务
API_AUDIT="/{module-path}/audit-pass"       # 主责服务
API_BFF_TODO="/bff/{module-path}/todo"      # 聚合层（编排层断言用）
# ------------------------------------------------------

PASS=0; FAIL=0
log()  { printf '%s\n' "$*"; }
ok()   { log "  ✅ PASS: $*"; PASS=$((PASS+1)); }
bad()  { log "  ❌ FAIL: $*"; FAIL=$((FAIL+1)); }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

# login <base_url> <user> <pwd>
login() {
  local base="$1" user="$2" pwd="$3"
  curl -s -X POST "${base}/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"$pwd\"}" 2>/dev/null \
    | json "d.get('data',{}).get('token','')"
}

# api <base_url> <token> <method> <path> <body?>
api() {
  local base="$1" token="$2" method="$3" path="$4" body="${5:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "${base}${path}" -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" -d "$body" 2>/dev/null
  else
    curl -s -X "$method" "${base}${path}" -H "Authorization: Bearer $token" 2>/dev/null
  fi
}

echo "==============================================="
echo "${MODULE_NAME} 自动测试 开始：$(date '+%F %T')"
echo "主责服务: ${BASE_URL_SVC_MAIN} | 聚合层: ${BASE_URL_SVC_BFF}"
echo "==============================================="

# ── 接口层 用例 1：提交（主责服务）─────────────────────
FILLER_TOKEN=$(login "$BASE_URL_SVC_MAIN" "$FILLER_USER" "$FILLER_PWD")
[ -z "$FILLER_TOKEN" ] && bad "登录失败：$FILLER_USER" || ok "登录成功：$FILLER_USER"

SUBMIT_RESP=$(api "$BASE_URL_SVC_MAIN" "$FILLER_TOKEN" POST "$API_SUBMIT" \
  "{\"projectId\":${PROJECT_ID},\"biddingId\":${BIDDING_ID}}")
NEW_ID=$(echo "$SUBMIT_RESP" | json "d.get('data',{}).get('id','')")
[ -n "$NEW_ID" ] && ok "提交成功，id=$NEW_ID" || bad "提交失败：$SUBMIT_RESP"

# ── 接口层 用例 2：审核（如适用）──────────────────────
# ...按 {模块名}/测试.md 补充

# ── 编排层 用例：聚合一致性（跨服务，如适用）──────────
# 聚合结果必须与主责服务状态一致；最终一致场景轮询等待（上限 ${ORCH_MAX_WAIT:-10}s）
# ORCH_RESP=$(api "$BASE_URL_SVC_BFF" "$FILLER_TOKEN" GET "$API_BFF_TODO")
# ...按 {模块名}/测试.md 编排层用例补充断言

# ── 汇总 ──────────────────────────────────────────────
echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "测试数据保留（id=$NEW_ID），供人工复核"
echo "端层 checklist 见 ${MODULE_NAME}/测试.md（真机/浏览器冒烟，不在本脚本内）"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
