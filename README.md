# contract-framework：契约驱动开发体系

把一套在真实全栈项目中验证过的「契约文档 + 测试文档 + 实施计划」开发体系，抽象为可跨项目复用的方法论资产。

- **核心原则**：skill 不焊死任何技术栈——方法论在本仓库，项目特定约定全部收敛到「项目档案」，skill 一切配置从档案读取。
- **技能组合**：`/文档`（contract-doc，模块四件套文档）、`/代码`（contract-code，实施计划为主实施代码）、`/检查`（contract-review，审查与回写查账）。

## 快速开始

```
① 安装          → 见下方「安装」
② 接入初始化     → 安装后项目根出现《接入指南.md》，AI 按它执行（或直接对 AI 说"初始化项目"）
③ 日常开发       → /文档 定义 → /代码 计划+实施+回写 → /检查 验证
```

## 安装

### 方式 A：npm git 依赖（推荐，适合有 package.json 的全栈项目）

```json
{
  "dependencies": {
    "contract-framework": "git+https://github.com/{账号}/contract-framework.git#v1.0.0"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["contract-framework"]
  }
}
```

`npm install` / `pnpm install` 后自动完成：

- `skills/*` → 项目级 skill 目录（`.agents/skills/` 默认，探测/配置见 install.js）
- `接入指南.md` → 项目根
- `AGENTS.md` 写入接入引导段 + 永久段（已初始化项目跳过引导段）

### 方式 B：一键安装脚本（无 package.json 的项目）

```bash
curl -fsSL https://raw.githubusercontent.com/{账号}/contract-framework/main/install.sh | bash
```

## 升级

- 方式 A：更新依赖版本后 `npm install`，或 `npx contract-framework sync`
- 方式 B：重新执行安装脚本
- 本地定制过的 skill 文件自动跳过（版本标记 + 文件对比，见 scripts/install.js）

## 目录结构

```
contract-framework/
├── README.md                ← 本文件
├── package.json             ← npm 包声明（bin + postinstall）
├── install.sh               ← 方式 B 安装脚本
├── skills/
│   ├── contract-doc/SKILL.md     ← /文档：模块四件套（契约/接口/测试/脚本）
│   ├── contract-code/SKILL.md    ← /代码：实施计划 → 实施 → 回写
│   └── contract-review/SKILL.md  ← /检查：审查 + 回写查账
├── scripts/
│   ├── install.js           ← postinstall 安装逻辑（方式 A）
│   ├── cli.js               ← `contract-framework sync` 命令
│   └── e2e_template.sh      ← 共享参数化 E2E 脚本模板
└── templates/               ← 文档模板（AI 生成文档时替换占位符）
    ├── profile.md.tpl            ← 项目档案
    ├── 接入指南.md.tpl           ← 接入初始化流程
    ├── AGENTS.md.tpl             ← 项目规则片段
    ├── 总契约.md.tpl             ← 总索引（模块索引表）
    ├── 测试规范.md.tpl           ← 通用测试方法论
    ├── 接口规范.md.tpl           ← 全局接口约定
    ├── 规范/                     ← 前后端开发规范
    ├── 边界/                     ← 跨模块能力边界
    ├── 模块/{模块名}/            ← 契约/接口/测试/test.sh 四件套
    ├── 计划/                     ← 实施计划
    └── scripts/                  ← 模板脚本资产
```
