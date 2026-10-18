# 断言助手与夹具（**判据无关**：一切"什么算通过"都属于 NN-*.sh 用例文件）
#
# 纪律：断言一律走 assert_* —— 统一「先捕获再匹配」口径，避免 `set -o pipefail` 下
#   `printf | grep -q` 的 SIGPIPE 竞态把命中误判成失败（历史 flaky 来源）。
PASS=0; FAIL=0
ok()  { printf '  ✅ %s\n' "$*"; PASS=$((PASS+1)); }
bad() { printf '  ❌ %s\n' "$*"; FAIL=$((FAIL+1)); }
run() { ( cd "$1" && shift && "$NODE_BIN" "$CLI" "$@" ); }

# ── 断言助手：统一「先捕获再匹配」口径（避免 pipefail 下 grep -q 的 SIGPIPE 竞态误判）──
# $1=待查输出 $2=模式 $3=命中(或不等于期望)时的 ok 文案 $4=未命中(或等于期望)时的 bad 文案
assert_grep()  { if grep -q -- "$2" <<< "$1"; then ok "$3"; else bad "$4"; fi; }
assert_ngrep() { if grep -q -- "$2" <<< "$1"; then bad "$4"; else ok "$3"; fi; }
# $1=实际退出码 $2=期望退出码 $3=相等时的 ok 文案 $4=不等时的 bad 文案
assert_exit()  { if [ "$1" = "$2" ]; then ok "$3"; else bad "$4"; fi; }
# $1=json 文本 $2=对解析结果 d 的布尔表达式（python3）$3=成立时的 ok 文案 $4=不成立的 bad 文案
assert_json()  { if printf '%s' "$1" | python3 -c "import json,sys;d=json.load(sys.stdin);sys.exit(0 if ($2) else 1)" 2>/dev/null; then ok "$3"; else bad "$4"; fi; }

# 建一个标准多应用骨架项目
# $1=目录；其余参数为应用元组 `标识:类型:技术栈:代码根:数据库/存储:依赖的应用`（缺省 =
#   "app-web:前端应用:Vue:./apps/web:—:svc-order" "svc-order:后端服务:Java:services/order:mysql:—"）
mk_project() {
  local d="$1"; shift
  local apps=("$@")
  [ "${#apps[@]}" -eq 0 ] && apps=("app-web:前端应用:Vue:./apps/web:—:svc-order" "svc-order:后端服务:Java:services/order:mysql:—")
  mkdir -p "$d/doc-framework/模块/订单/计划" "$d/doc-framework/边界" "$d/doc-framework/规范" "$d/doc-framework/计划" "$d/services/order/sql/change"
  {
    printf '# 项目档案\n## 应用清单\n'
    printf '| 应用标识 | 类型 | 技术栈 | 代码根 | 规范文件 | 数据库/存储 | 依赖的应用 |\n'
    printf '|----------|------|--------|--------|----------|-------------|------------|\n'
    local t id typ stack root store dep
    for t in "${apps[@]}"; do
      IFS=':' read -r id typ stack root store dep <<< "$t"
      mkdir -p "$d/${root#./}"
      printf '| %s | %s | %s | %s | `规范/应用-%s.md` | %s | %s |\n' "$id" "$typ" "$stack" "$root" "$id" "$store" "$dep"
      echo "# $id" > "$d/doc-framework/规范/应用-$id.md"
    done
  } > "$d/doc-framework/项目档案.md"
  for f in 总契约 测试规范 接口规范; do echo "# $f" > "$d/doc-framework/$f.md"; done
  echo "# 类型前端" > "$d/doc-framework/规范/类型-前端.md"
  echo "# 类型后端" > "$d/doc-framework/规范/类型-后端.md"
}

# ── 契约模型类用例的共用骨架（04 / 05 共用；夹具内容单一来源）────────────────
# 用法：mk_contract_model "$M" —— 建多应用骨架 + 订单契约 + 探索记录 + A.java，并定义
#   DELTA_ROW（一行合法增量）；mk_plan 由本文件另行定义（见下）。
mk_contract_model() {
  local d="$1"
  mk_project "$d"
  mkdir -p "$d/doc-framework/探索" "$d/services/order/src"
  echo "# 订单契约" > "$d/doc-framework/模块/订单/契约.md"
  echo "# 探索记录" > "$d/doc-framework/探索/2025-03-01-新模块探索.md"
  echo x > "$d/services/order/src/A.java"
  DELTA_ROW='| A1 | 契约 §3.1 订单主表 | 字段 x | tinyint(1) | |'
}

# 完整计划骨架：$1=路径 $2=状态 $3=合并状态 $4=增量行 $5=建模补充节（y/n）
# 纪律：本函数只写 订单 模块的计划（与 mk_contract_model 的骨架配套）。
mk_plan() {
  local f="$1"; shift
  {
    printf '# 2025-03-0X 计划实施\n\n'
    printf '> 依据模块契约：`doc-framework/模块/订单/契约.md`\n'
    printf '> 计划形态：完整\n'
    printf '> 状态：%s\n\n' "$1"; shift
    printf '## 2. 逐应用表态\n\n| 应用 | 表态 | 说明 |\n|------|------|------|\n| svc-order | 改动 | 服务端实现 |\n| app-web | 本次不改 | 无端侧改动 |\n\n'
    printf '## 语义增量（delta）\n\n> 合并状态：%s\n\n' "$1"; shift
    printf '### ADDED（新增）\n\n| # | 目标位置 | 对象 | 内容 | 主计划 |\n|---|----------|------|------|--------|\n%s\n\n' "$1"; shift
    if [ "$1" = "y" ]; then printf '## 建模补充\n\n### M1 边界\n\n{x}\n\n'; fi
    printf '## 变更文件清单\n\n| 文件 | 说明 |\n|------|------|\n| services/order/src/A.java | 主责 |\n'
  } > "$f"
}

