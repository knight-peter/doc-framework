# 05：增量表解析与归档边界（契约模型续）
#
#  13.（续）MODIFIED 表列位 / 纯行写法兼容 / 轻量计划不得含非空增量 / 旧格式硬报错 /
#      I2 归档兜底（不可用 计划/归档 或 计划/archive 绕过）/ 归档位置识别 /
#      I3 文案（值无法识别 vs 缺失）/ I6 单元格内含竖线不丢列

M="$TMP/model-inc"; mk_contract_model "$M"

# 13.10 MODIFIED 表列数（现值 + 目标值 两列）不得错位 —— 回归"目标值被当成主计划"导致 I3 漏判
mkdir -p "$M/doc-framework/模块/复核/计划"; echo "# 复核契约" > "$M/doc-framework/模块/复核/契约.md"
for n in 1 2; do cat > "$M/doc-framework/模块/复核/计划/2025-03-1${n}-改字段.md" <<'EOF'
# 2025-03-1X 改字段实施

> 依据模块契约：`doc-framework/模块/复核/契约.md`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### MODIFIED（修改）
| # | 目标位置 | 对象 | 现值 | 目标值 | 主计划 |
|---|----------|------|------|--------|--------|
| M1 | 接口.md §3.A1 | list 返回字段 | 无 | exportStatus | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 改字段 |
EOF
done
MJSON=$(run "$M" show doc-framework/模块/复核/计划/2025-03-11-改字段.md --json 2>/dev/null)
assert_json "$MJSON" "bool(d['delta']['modified']) and d['delta']['modified'][0]['leadPlan']=='' and d['delta']['modified'][0]['detail']=='无 → exportStatus'" "MODIFIED 表：主计划列取最后一列（现值→目标值 不错位）" "MODIFIED 表列错位（目标值被当成主计划）"
assert_grep "$(run "$M" check 2>&1)" "未回指主计划" "I3：两份仅含 MODIFIED 的增量计划 → 硬报错" "I3 对 MODIFIED-only 计划漏判"
rm -rf "$M/doc-framework/模块/复核"

# 13.11 兼容：`依据模块契约` 写成纯行（非引用块）也必须解析并通过契约引用校验
mkdir -p "$M/doc-framework/模块/兼容/计划"; echo "# 兼容契约" > "$M/doc-framework/模块/兼容/契约.md"
cat > "$M/doc-framework/模块/兼容/计划/2025-03-13-纯行写法.md" <<'EOF'
# 2025-03-13 纯行写法实施

依据模块契约：`doc-framework/模块/兼容/契约.md`
计划形态：完整
状态：已批准

## 2. 逐应用表态

| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | 服务端实现 |
| app-web | 本次不改 | 无端侧改动 |

## 语义增量（delta）
> 合并状态：无需合并

无（纯实现改动）

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | 改 |
EOF
run "$M" check >/dev/null 2>&1 && ok "兼容：依据字段纯行写法（非引用块）仍解析通过" || { bad "纯行写法的依据字段解析失败（兼容性回归）"; run "$M" check | sed 's/^/     /'; }
rm -rf "$M/doc-framework/模块/兼容"

# 13.12 轻量计划不得含**非空**语义增量（形态判错要拦；空节/纯实现说明不算）
mkdir -p "$M/doc-framework/模块/轻量越界/计划"
cat > "$M/doc-framework/模块/轻量越界/计划/2025-03-14-轻量带增量.md" <<'EOF'
# 2025-03-14 轻量带增量实施

> 计划形态：轻量
> 状态：已批准

## 二、逐应用表态（白名单）
| 应用 | 表态 | 说明 |
|------|------|------|
| svc-order | 改动 | x |

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 订单主表 | 字段 x | int | |

## 三、变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
assert_grep "$(run "$M" check 2>&1)" "轻量计划不得含非空" "轻量计划带非空增量 → 硬报错（形态判错）" "轻量计划带增量未拦"
rm -rf "$M/doc-framework/模块/轻量越界"

# 13.14 旧格式计划（有「计划形态：完整」、无「依据模块契约」/无增量节）→ 硬报错
mkdir -p "$M/doc-framework/模块/旧版/计划"
cat > "$M/doc-framework/模块/旧版/计划/2025-03-16-旧版计划.md" <<'EOF'
# 2025-03-16 旧版计划实施

> 计划形态：完整
> 状态：已批准

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
OLD_OUT=$(run "$M" check 2>&1)
assert_grep "$OLD_OUT" "缺「依据模块契约」" "旧格式计划（无依据字段）：硬报错（不再兼容放行）" "旧格式计划未报缺依据"
assert_grep "$OLD_OUT" "缺「语义增量」节" "旧格式计划（无增量节）：硬报错" "旧格式计划未报缺增量节"
rm -rf "$M/doc-framework/模块/旧版"

# 13.15 I2 归档兜底：把"已完成 + 未合并增量"移进归档目录（中文 `计划/归档/`），不得因此逃过校验
mkdir -p "$M/doc-framework/模块/归档绕过/计划/归档"; echo "# 归档绕过契约" > "$M/doc-framework/模块/归档绕过/契约.md"
cat > "$M/doc-framework/模块/归档绕过/计划/归档/2025-03-17-绕过.md" <<'EOF'
# 2025-03-17 绕过实施

> 依据模块契约：`doc-framework/模块/归档绕过/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 绕过主表 | 字段 x | int | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
assert_grep "$(run "$M" check 2>&1)" "归档计划「已完成」但语义增量未合并" "I2：中文归档目录（计划/归档/）未合并增量 → 仍硬报错（不可用归档绕过）" "中文归档目录绕过未被拦（I2 兜底缺失）"
# 归档计划不得被当成在途计划扫回来（否则归档动作反而污染 list/体检）
assert_ngrep "$(run "$M" list --all 2>&1)" "2025-03-17-绕过" "归档计划不进在途清单（archived 判定生效）" "归档计划被当成在途计划列出（archived 判定失效）"
rm -rf "$M/doc-framework/模块/归档绕过"

# 13.15b 归档位置识别（归档目录固定 `计划/归档/`，无别名）
mkdir -p "$M/doc-framework/模块/归档位/计划/归档"; echo "# 归档位契约" > "$M/doc-framework/模块/归档位/契约.md"
cat > "$M/doc-framework/模块/归档位/计划/归档/2025-03-20-已归档.md" <<'EOF'
# 2025-03-20 已归档实施

> 依据模块契约：`doc-framework/模块/归档位/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：无需合并

### ADDED（新增）

（无）

## 变更文件清单

| 应用 | 文件 | 说明 |
|------|------|------|
| svc-order | services/order/src/A.java | x |
EOF
ARCH=$("$NODE_BIN" -e "const p=require('$ROOT/scripts/lib/plan.js');const lex=p.NAMES.zh;const a='$M/doc-framework/模块/归档位/计划/归档/2025-03-20-已归档.md';const id=p.planIdentity('$M',a,lex);const hit=p.collectArchivedPlans('$M/doc-framework',lex).filter(f=>f.includes('已归档'));const inFlight=p.collectPlanPaths('$M/doc-framework',lex).filter(f=>f.includes('已归档'));process.stdout.write(JSON.stringify({hit:hit.length,inFlight:inFlight.length,archived:id.archived}))" 2>&1)
assert_json "$ARCH" "d['hit']==1 and d['inFlight']==0 and d['archived'] is True" "归档位置识别：计划/归档/ 下不被当成在途计划枚举" "归档位置识别异常：$ARCH"
rm -rf "$M/doc-framework/模块/归档位"

# 13.16 I3 文案：合并状态值无法识别时，报错要指向"值无法识别"而非"缺失"
mkdir -p "$M/doc-framework/模块/乱写/计划"; echo "# 乱写契约" > "$M/doc-framework/模块/乱写/契约.md"
cat > "$M/doc-framework/模块/乱写/计划/2025-03-18-乱写.md" <<'EOF'
# 2025-03-18 乱写实施

> 依据模块契约：`doc-framework/模块/乱写/契约.md`
> 计划形态：完整
> 状态：已完成

## 语义增量（delta）
> 合并状态：随便写

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.1 乱写主表 | 字段 x | int | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
grep -q "合并状态值无法识别" <<< "$(run "$M" check 2>&1)" && ok "I3：合并状态值无法识别 → 专门文案（非"缺失"）" || bad "乱写的合并状态文案未区分"
rm -rf "$M/doc-framework/模块/乱写"


# 13.17 I6：增量表单元格内含竖线（反引号包裹的枚举）不得丢列/错位
mkdir -p "$M/doc-framework/模块/竖线/计划"; echo "# 竖线契约" > "$M/doc-framework/模块/竖线/契约.md"
cat > "$M/doc-framework/模块/竖线/计划/2025-03-19-竖线.md" <<'EOF'
# 2025-03-19 竖线实施

> 依据模块契约：`doc-framework/模块/竖线/契约.md`
> 计划形态：完整
> 状态：已批准

## 语义增量（delta）
> 合并状态：待合并

### ADDED（新增）
| # | 目标位置 | 对象 | 内容 | 主计划 |
|---|----------|------|------|--------|
| A1 | 契约 §3.3 枚举 | 状态枚举 | `ACTIVE|INACTIVE` | |

## 变更文件清单
| 文件 | 说明 |
|------|------|
| services/order/src/A.java | x |
EOF
PJSON=$(run "$M" show doc-framework/模块/竖线/计划/2025-03-19-竖线.md --json 2>/dev/null)
assert_json "$PJSON" "bool(d['delta']['added']) and d['delta']['added'][0]['detail']=='ACTIVE|INACTIVE' and d['delta']['added'][0]['leadPlan']==''" "增量表单元格含竖线（反引号包裹）→ 不丢列、不误当主计划" "增量表含竖线时丢列/错位"
rm -rf "$M/doc-framework/模块/竖线"
