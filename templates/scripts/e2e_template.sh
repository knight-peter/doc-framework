#!/usr/bin/env bash
# ============================================================
# {模块名} 端到端自动测试（共享模板，复制到模块文件夹后按模块修改）
# 依赖：bash + curl + python3（解析 JSON）
# 用法：
#   bash doc-framework/模块/{模块名}/test.sh
# 参数化：每个服务端应用一个 BASE_URL（如 BASE_URL_SVC_MAIN / BASE_URL_SVC_BFF）
#         / 上下文参数（PROJECT_ID/BIDDING_ID，示例）/ FILLER_USER/PWD / AUDIT_USER/PWD
# 说明：本脚本只创建测试数据，不做任何删除操作，数据保留供人工复核。
# ============================================================
set -uo pipefail

# ── 模块参数（复制后必改）──────────────────────────────
MODULE_NAME="{模块名}"                                # 模块名
PROCESS_KEY="{流程key}"                               # 工作流流程定义 key（无工作流可留空）
# 多服务地址：每个涉及的服务端应用一个 BASE_URL（按契约 §5 应用落点表；单服务模块只保留一个）
BASE_URL_SVC_MAIN=${BASE_URL_SVC_MAIN:-http://localhost:8081}   # 主责服务
BASE_URL_SVC_BFF=${BASE_URL_SVC_BFF:-http://localhost:8082}     # 聚合层（无聚合层可删除）
PROJECT_ID=${PROJECT_ID:-0}                        # 上下文参数 1（示例：项目 id；按接口.md 调整）
BIDDING_ID=${BIDDING_ID:-0}                        # 上下文参数 2（示例：招标 id；按接口.md 调整）
FILLER_USER=${FILLER_USER:-''}                        # 填报账号（提交）
FILLER_PWD=${FILLER_PWD:-'Aa@123456'}
AUDIT_USER=${AUDIT_USER:-''}                          # 审批账号（审核）
AUDIT_PWD=${AUDIT_PWD:-'Aa@123456'}
# 业务接口路径（复制后按 {模块名}/接口.md 修改，标注服务归属）
API_LIST="/{module-path}/list"                       # 主责服务
API_SUBMIT="/{module-path}/submit"                   # 主责服务
API_AUDIT="/{module-path}/audit-pass"                # 主责服务
API_BFF_TODO="/bff/{module-path}/todo"               # 聚合层（编排层断言用，无聚合层可删除）
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
echo "${MODULE_NAME} 自动测试  开始：$(date '+%F %T')"
echo "主责服务: ${BASE_URL_SVC_MAIN} | 聚合层: ${BASE_URL_SVC_BFF} | 上下文1: ${PROJECT_ID} | 上下文2: ${BIDDING_ID}"
echo "（只创建测试数据，不删除任何记录，保留供人工复核）"
echo "==============================================="

# ── 接口层 用例 1：提交启动流程（主责服务）─────────────
FILLER_TOKEN=$(login "$BASE_URL_SVC_MAIN" "$FILLER_USER" "$FILLER_PWD")
if [ -z "$FILLER_TOKEN" ]; then bad "登录失败：$FILLER_USER"; else ok "登录成功：$FILLER_USER"; fi

# 提交请求体：按 {模块名}/接口.md 提交接口实际字段拼装（projectId/biddingId 仅为示例）
SUBMIT_BODY="{\"projectId\":${PROJECT_ID},\"biddingId\":${BIDDING_ID}}"
SUBMIT_RESP=$(api "$BASE_URL_SVC_MAIN" "$FILLER_TOKEN" POST "$API_SUBMIT" "$SUBMIT_BODY")
NEW_ID=$(echo "$SUBMIT_RESP" | json "d.get('data',{}).get('id','')")
if [ -n "$NEW_ID" ]; then ok "提交成功，id=$NEW_ID"; else bad "提交失败：$SUBMIT_RESP"; fi

# ── 接口层 用例 2：审批通过（工作流模块）────────────────
if [ -n "$AUDIT_USER" ]; then
  AUDIT_TOKEN=$(login "$BASE_URL_SVC_MAIN" "$AUDIT_USER" "$AUDIT_PWD")
  if [ -z "$AUDIT_TOKEN" ]; then bad "登录失败：$AUDIT_USER"; else ok "登录成功：$AUDIT_USER"; fi

  # 从工作台待办取 taskId（如需）
  TASK_RESP=$(api "$BASE_URL_SVC_MAIN" "$AUDIT_TOKEN" POST "/getPersonalTodo" \
    "{\"processDefinitionKey\":\"${PROCESS_KEY}\"}")
  TASK_ID=$(echo "$TASK_RESP" | json "d.get('data',{}).get('rows',[{}])[0].get('taskId','')")

  AUDIT_RESP=$(api "$BASE_URL_SVC_MAIN" "$AUDIT_TOKEN" POST "$API_AUDIT" \
    "{\"id\":\"${NEW_ID}\",\"taskId\":\"${TASK_ID}\",\"remark\":\"自动测试通过\"}")
  if echo "$AUDIT_RESP" | grep -q '"200"\|success'; then ok "审批通过"; else bad "审批失败：$AUDIT_RESP"; fi
fi

# ── 编排层 用例：聚合一致性（跨服务，如适用）────────────
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
