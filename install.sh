# ============================================================
# doc-framework 一键安装脚本（方式 B）
# 用法：curl -fsSL https://raw.githubusercontent.com/knight-peter/doc-framework/main/install.sh | bash
# 行为：
#   1. clone 仓库到临时目录
#   2. 解析目标 skill 目录（配置 > 探测 > 默认，与 install.js 一致）
#   3. 复制 skills/ 到目标目录 + 写版本标记
#   4. 复制 接入指南.md 到项目根（已初始化项目跳过）
#   5. 写入/更新 AGENTS.md（已初始化项目跳过引导段）
#   6. 清理临时目录，项目根不留仓库
# ============================================================
set -euo pipefail

REPO_URL="${DOC_FRAMEWORK_REPO:-git@github.com:knight-peter/doc-framework.git}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log()  { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

echo "==============================================="
echo "doc-framework 安装开始：$(date '+%F %T')"
echo "==============================================="

# 1. clone 到临时目录
git clone --depth 1 "$REPO_URL" "$TMP_DIR/cf" >/dev/null 2>&1 || { echo "clone 失败：$REPO_URL"; exit 1; }
CF_DIR="$TMP_DIR/cf"

# 2. 解析目标 skill 目录
TARGET_DIRS=""
if [ -f "doc-framework.config.json" ]; then
  TARGET_DIRS=$(python3 -c "
import json
cfg = json.load(open('doc-framework.config.json'))
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

# 3. 复制 skills/ + 写版本标记（版本动态读取，与 install.js / sync 判断保持一致）
CF_VERSION=$(python3 -c "import json; print(json.load(open('$CF_DIR/package.json'))['version'])")
for dir in $TARGET_DIRS; do
  mkdir -p "$dir"
  cp -R "$CF_DIR/skills/"* "$dir/"
  cat > "$dir/.doc-framework.json" <<EOF
{
  "source": "$REPO_URL",
  "version": "v${CF_VERSION}",
  "installedAt": "$(date '+%Y-%m-%d')"
}
EOF
  log "已安装 skill 到：$dir"
done

# 4. 已初始化检测（doc-framework/项目档案.md 或 docs-framework/profile.md 存在则跳过引导；兼容 v1.0.4 及以前的 doc/ docs/ 旧目录名）
if [ -f "doc-framework/项目档案.md" ] || [ -f "docs-framework/profile.md" ] || [ -f "doc/项目档案.md" ] || [ -f "docs/profile.md" ]; then
  warn "检测到项目已接入（档案已存在），跳过接入指南与 AGENTS.md 引导段写入"
else
  # 4.1 预置 doc-framework 目录骨架（防初始化遗漏；内容由 AI 按接入指南+模板渲染）
  mkdir -p doc-framework/模块 doc-framework/边界 doc-framework/规范 doc-framework/计划
  cat > doc-framework/README.md <<'EOF'
# doc-framework（待初始化）

本目录为 doc-framework 文档体系骨架，由安装脚本预置。

请对 AI 说"初始化项目"，AI 将按项目根《接入指南.md》执行接入初始化：
从模板目录（见 AGENTS.md 模板来源标记）渲染生成 项目档案.md / 总契约.md / 测试规范.md / 接口规范.md / 规范/前后端开发规范.md 等骨架文档。

初始化完成后：本 README 与 接入指南.md 一并删除。
EOF
  cp "$CF_DIR/templates/接入指南.md.tpl" "接入指南.md"
  log "已生成项目根《接入指南.md》，下一步：对 AI 说\"初始化项目\""

  # 5. 写入/更新 AGENTS.md（引导段 + 永久段）
  python3 - "$CF_DIR/templates/AGENTS.md.tpl" <<'PY'
import sys, pathlib
tpl = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
# 渲染占位符（安装时保持默认中文模式）
tpl = tpl.replace('{文档根}', 'doc-framework').replace('{文档语言}', '中文')
path = pathlib.Path('AGENTS.md')
if path.exists():
    content = path.read_text(encoding='utf-8')
    if 'CONTRACT-FRAMEWORK-BEGIN' not in content:
        path.write_text(content.rstrip() + '\n\n' + tpl, encoding='utf-8')
else:
    path.write_text(tpl, encoding='utf-8')
PY
  # 方式 B：记录模板来源标记（仓库地址 + 版本），供初始化时 AI 拉取模板
  python3 - "$CF_VERSION" "$REPO_URL" <<'PY'
import sys, pathlib
version, repo = sys.argv[1], sys.argv[2]
path = pathlib.Path('AGENTS.md')
content = path.read_text(encoding='utf-8')
marker = f"\n<!-- doc-framework 模板来源标记（方式 B，初始化时 AI 按此拉取模板） -->\n- 模板仓库: {repo}\n- 模板版本: v{version}\n"
if '模板来源标记' not in content:
    path.write_text(content.rstrip() + marker, encoding='utf-8')
PY
  log "已写入/更新 AGENTS.md（含接入引导段，初始化完成后由 AI 移除）"
fi

echo "==============================================="
echo "安装完成。项目根不留仓库（临时目录已清理）"
echo "下一步：对 AI 说\"初始化项目\"，AI 将按《接入指南.md》执行接入初始化"
echo "==============================================="
