#!/usr/bin/env bash
# ============================================================
# {模块名} 工作流端到端自动测试（共享模板，复制到模块文件夹后按模块修改）
# 依赖：bash + curl + python3（解析 JSON）
# 用法：
#   bash doc-framework/模块/{模块名}/test.sh
# 参数化：BASE_URL / 上下文参数（PROJECT_ID/BIDDING_ID，示例）/ FILLER_USER/PWD / AUDIT_USER/PWD
# 说明：本脚本只创建测试数据，不做任何删除操作，数据保留供人工复核。
# ============================================================
set -uo pipefail

# ── 模块参数（复制后必改）──────────────────────────────
MODULE_NAME="{模块名}"                                # 模块名
PROCESS_KEY="{流程key}"                               # 工作流流程定义 key（无工作流可留空）
BASE_URL=${BASE_URL:-http://localhost:8082}
PROJECT_ID=${PROJECT_ID:-0}                        # 上下文参数 1（示例：项目 id；按接口.md 调整）
BIDDING_ID=${BIDDING_ID:-0}                        # 上下文参数 2（示例：招标 id；按接口.md 调整）
FILLER_USER=${FILLER_USER:-''}                        # 填报账号（提交）
FILLER_PWD=${FILLER_PWD:-'Aa@123456'}
AUDIT_USER=${AUDIT_USER:-''}                          # 审批账号（审核）
AUDIT_PWD=${AUDIT_PWD:-'Aa@123456'}
# 业务接口路径（复制后按 {模块名}/接口.md 修改）
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

api() { # api <token> <method> <path> <body?>
  local token="$1" method="$2" path="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "${BASE_URL}${path}" -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" -d "$body" 2>/dev/null
  else
    curl -s -X "$method" "${BASE_URL}${path}" -H "Authorization: Bearer $token" 2>/dev/null
  fi
}

echo "==============================================="
echo "${MODULE_NAME} 工作流自动测试  开始：$(date '+%F %T')"
echo "环境: ${BASE_URL} | 上下文1: ${PROJECT_ID} | 上下文2: ${BIDDING_ID}"
echo "（只创建测试数据，不删除任何记录，保留供人工复核）"
echo "==============================================="

# ── 用例 1：提交启动流程 ─────────────────────────────
FILLER_TOKEN=$(login "$FILLER_USER" "$FILLER_PWD")
if [ -z "$FILLER_TOKEN" ]; then bad "登录失败：$FILLER_USER"; else ok "登录成功：$FILLER_USER"; fi

# 提交请求体：按 {模块名}/接口.md 提交接口实际字段拼装（projectId/biddingId 仅为示例）
SUBMIT_BODY="{\"projectId\":${PROJECT_ID},\"biddingId\":${BIDDING_ID}}"
SUBMIT_RESP=$(api "$FILLER_TOKEN" POST "$API_SUBMIT" "$SUBMIT_BODY")
NEW_ID=$(echo "$SUBMIT_RESP" | json "d.get('data',{}).get('id','')")
if [ -n "$NEW_ID" ]; then ok "提交成功，id=$NEW_ID"; else bad "提交失败：$SUBMIT_RESP"; fi

# ── 用例 2：审批通过（工作流模块）────────────────────
if [ -n "$AUDIT_USER" ]; then
  AUDIT_TOKEN=$(login "$AUDIT_USER" "$AUDIT_PWD")
  if [ -z "$AUDIT_TOKEN" ]; then bad "登录失败：$AUDIT_USER"; else ok "登录成功：$AUDIT_USER"; fi

  # 从工作台待办取 taskId（如需）
  TASK_RESP=$(api "$AUDIT_TOKEN" POST "/getPersonalTodo" \
    "{\"processDefinitionKey\":\"${PROCESS_KEY}\"}")
  TASK_ID=$(echo "$TASK_RESP" | json "d.get('data',{}).get('rows',[{}])[0].get('taskId','')")

  AUDIT_RESP=$(api "$AUDIT_TOKEN" POST "$API_AUDIT" \
    "{\"id\":\"${NEW_ID}\",\"taskId\":\"${TASK_ID}\",\"remark\":\"自动测试通过\"}")
  if echo "$AUDIT_RESP" | grep -q '"200"\|success'; then ok "审批通过"; else bad "审批失败：$AUDIT_RESP"; fi
fi

# ── 汇总 ──────────────────────────────────────────────
echo "==============================================="
echo "结果：PASS=$PASS  FAIL=$FAIL"
echo "测试数据保留（id=$NEW_ID），供人工复核"
echo "==============================================="
exit $((FAIL > 0 ? 1 : 0))
