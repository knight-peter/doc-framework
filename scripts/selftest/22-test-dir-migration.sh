#!/usr/bin/env bash
# 22：4.0.0 测试目录迁移报告
#
# 覆盖：
#   29.1 旧 测试报告/ 与根 test.sh 被 migrate v5 点名；
#   29.2 schema4 契约缺 测试/验收.md 被点名；
#   29.3 migrate v5 只读，不写文件。
set -uo pipefail
D="$TMP/test-dir-migration"
mk_project "$D"
mkdir -p "$D/doc-framework/模块/订单/测试报告"
echo "# 旧报告" > "$D/doc-framework/模块/订单/测试报告/v20.md"
echo "#!/usr/bin/env bash" > "$D/doc-framework/模块/订单/test.sh"
cat > "$D/doc-framework/模块/订单/契约.md" <<'EOT'
<!-- doc-framework:docstruct 4.0.0 | 文档结构版本 -->
<!-- contract-schema: 4 | 9 章；§8 指针 → 测试/验收.md；§9 生产 SQL -->
# 订单模块契约
> 模块形态：业务-CRUD ｜ 主责服务：svc-order
> **本契约拥有**：订单状态机
> **委托给**：`模块/订单/测试/验收.md`（验收场景）
> **本契约不拥有**：字段级（→ 接口.md）
## 1. 模块定位
订单。
## 2. 边界约定
无。
## 3. 数据模型
无。
## 4. 接口概览
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/list` | 列表 |
## 5. 应用落点
| 应用 | 页面结构 | 文件位置 | 权限控制方式 | 差异说明 |
|---|---|---|---|---|
| svc-order（主责） | — | `services/order/src/A.java` | 登录态 | 业务真相 |
## 6. 标杆参考
无。
## 7. 不变量
| ID | 规则 | 违反症状 | 关联接口 |
|---|---|---|---|
| INV-订单-01 | 必须校验登录态 | 返回 401 | `/list` |
## 8. 测试与验证
> 验收场景唯一事实源：`模块/订单/测试/验收.md`。
## 9. 生产环境 SQL 执行登记
| 日期 | 所属服务 | 文件 | 影响摘要 | 状态 |
|---|---|---|---|---|
| — | — | — | 无 | — |
EOT
BEFORE=$(find "$D/doc-framework/模块/订单" -type f | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256)
MIG=$(run "$D" migrate v5 --json)
AFTER=$(find "$D/doc-framework/模块/订单" -type f | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256)
assert_json "$MIG" "any(m['module']=='订单' and any('测试报告' in a for a in m['actions']) for m in d['modules'])" 'migrate v5：点名旧 测试报告/' 'migrate v5：未点名旧 测试报告/'
assert_json "$MIG" "any(m['module']=='订单' and any('test.sh' in a for a in m['actions']) for m in d['modules'])" 'migrate v5：点名根 test.sh' 'migrate v5：未点名根 test.sh'
assert_json "$MIG" "any(m['module']=='订单' and any('测试/验收.md' in a for a in m['actions']) for m in d['modules'])" 'migrate v5：点名缺 测试/验收.md' 'migrate v5：未点名缺 测试/验收.md'
MIG4=$(run "$D" migrate v4 --json)
assert_json "$MIG4" "all('升 4.0.0' not in a for m in d['modules'] for a in m['actions'])" 'migrate v4：不混入 4.0.0 动作' 'migrate v4：混入 4.0.0 动作'
[ "$BEFORE" = "$AFTER" ] && ok "migrate v5：只读（文件未变）" || bad "migrate v5：不应写文件"
