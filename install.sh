# ============================================================
# contract-framework 一键安装脚本（方式 B）
# 用法：curl -fsSL https://raw.githubusercontent.com/{账号}/contract-framework/main/install.sh | bash
# 行为：
#   1. clone 仓库到临时目录
#   2. 解析目标 skill 目录（配置 > 探测 > 默认，与 install.js 一致）
#   3. 复制 skills/ 到目标目录 + 写版本标记
#   4. 复制 接入指南.md 到项目根（已初始化项目跳过）
#   5. 写入/更新 AGENTS.md（已初始化项目跳过引导段）
#   6. 清理临时目录，项目根不留仓库
# ============================================================
set -euo pipefail

REPO_URL="${CONTRACT_FRAMEWORK_REPO:-git@github.com:{账号}/contract-framework.git}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log()  { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

echo "==============================================="
echo "contract-framework 安装开始：$(date '+%F %T')"
echo "==============================================="

# 1. clone 到临时目录
git clone --depth 1 "$REPO_URL" "$TMP_DIR/cf" >/dev/null 2>&1 || { echo "clone 失败：$REPO_URL"; exit 1; }
CF_DIR="$TMP_DIR/cf"

# 2. 解析目标 skill 目录
TARGET_DIRS=""
if [ -f "contract-framework.config.json" ]; then
  TARGET_DIRS=$(python3 -c "
import json
cfg = json.load(open('contract-framework.config.json'))
td = cfg.get('targetDirs', [])
print('\n'.join(td) if isinstance(td, list) else td)
" 2>/dev/null || true)
fi
if [ -z "$TARGET_DIRS" ]; then
  for d in .agents/skills .claude/skills .cursor/skills; do
    if [ -d "$d" ]; then TARGET_DIRS="$d"; break; fi
  done
fi
TARGET_DIRS="${TARGET_DIRS:-.agents/skills}"

# 3. 复制 skills/ + 写版本标记
for dir in $TARGET_DIRS; do
  mkdir -p "$dir"
  cp -R "$CF_DIR/skills/"* "$dir/"
  cat > "$dir/.contract-framework.json" <<EOF
{
  "source": "$REPO_URL",
  "version": "v1.0.0",
  "installedAt": "$(date '+%Y-%m-%d')"
}
EOF
  log "已安装 skill 到：$dir"
done

# 4. 已初始化检测（doc/项目档案.md 或 docs/profile.md 存在则跳过引导）
if [ -f "doc/项目档案.md" ] || [ -f "docs/profile.md" ]; then
  warn "检测到项目已接入（档案已存在），跳过接入指南与 AGENTS.md 引导段写入"
else
  cp "$CF_DIR/templates/接入指南.md.tpl" "接入指南.md"
  log "已生成项目根《接入指南.md》，下一步：对 AI 说\"初始化项目\""

  # 5. 写入/更新 AGENTS.md（引导段 + 永久段）
  python3 - "$CF_DIR/templates/AGENTS.md.tpl" <<'PY'
import sys, pathlib
tpl = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
# 渲染占位符（安装时保持默认中文模式）
tpl = tpl.replace('{文档根}', 'doc').replace('{文档语言}', '中文')
path = pathlib.Path('AGENTS.md')
if path.exists():
    content = path.read_text(encoding='utf-8')
    if 'CONTRACT-FRAMEWORK-BEGIN' not in content:
        path.write_text(content.rstrip() + '\n\n' + tpl, encoding='utf-8')
else:
    path.write_text(tpl, encoding='utf-8')
PY
  log "已写入/更新 AGENTS.md（含接入引导段，初始化完成后由 AI 移除）"
fi

echo "==============================================="
echo "安装完成。项目根不留仓库（临时目录已清理）"
echo "下一步：对 AI 说\"初始化项目\"，AI 将按《接入指南.md》执行接入初始化"
echo "==============================================="
