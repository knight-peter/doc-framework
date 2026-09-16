#!/usr/bin/env python3
"""门禁夹具：把 templates/ 下**全部模板**渲染成一套完整文档骨架（模拟 AI 的接入初始化）。

用途（两个门禁用例共用，所以独立成文件而不是内联副本）：
  1. `selftest.sh` §18.1「全模板渲染闭环」——断言双括号待填字段清零、单括号记法保留；
  2. `selftest.sh` §15.2f「模板自洽」——拿渲染产物跑真实 `check`，验证模板自带的 §9 示例行
     满足它自己教的回链凭据规则。

用法：python3 scripts/selftest-render-fixture.py <框架根> <目标项目根>
输出：stdout 打印 `|` 分隔的问题清单；**空输出 = 通过**。退出码恒 0（判定交给调用方）。

渲染纪律（本轮实测总结，改夹具时别踩回去）：
  - **长 token 优先 + 迭代到不动点**：短 token（如 `{{表名}}`）会先命中长 token 的前缀，替换后残留出
    新的双括号 token；必须按长度降序替换并循环到稳定。
  - `{{框架版本}}` 是哨兵占位：取 `package.json` 的 version 填入。
  - `【…】` 是示例/可选项：填好后整段删除。
  - `{记法}` 是路径与命名记法（`{模块名}`、`{域}:{实体}:{操作}`）：落到项目实际值。
  - 只做数据替换，**不碰模板本身**。
"""
import pathlib, re, sys
FW, P = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
T = FW / 'templates'
VER = 'v' + re.search(r'"version":\s*"([^"]+)"', (FW / 'package.json').read_text(encoding='utf-8')).group(1)

# 项目级取值（一个多应用工作区：前端 app-web + 后端 svc-order）
BASE = {
 'app-1': 'app-web', 'app-web': 'app-web', '类型-1': '前端端', '技术栈-1': 'Vue 3 / Vite',
 '代码根-1': 'apps/web', '数据库/存储-1': '—', '依赖的应用-1': 'svc-order',
 'app-2': 'svc-order', 'svc-main': 'svc-order', 'svc-bff': 'svc-order', 'app-mobile': 'app-web',
 '类型-2': '后端服务', '技术栈-2': 'Java 17 / Spring Boot 3', '代码根-2': 'services/order',
 '数据库/存储-2': 'mysql: order_db', '依赖的应用-2': '—',
 '工作流引擎': '无', '主键策略': '雪花ID（服务端生成）', '软删除约定': 'del_flag 0/2',
 '审计字段': 'create_by/create_time/update_by/update_time', '业务域清单': 'order',
 '分页约定': 'pageNum/pageSize + total', '形态': '简单 CRUD', '形态1': '简单 CRUD', '形态2': '审批流',
 'app': 'svc-order', '标杆模块': 'order', '标杆模块1': 'order', '代码路径': 'services/order/src',
 '标杆代码路径': 'services/order/src/main/java/order', '参考点': 'OrderController',
 '检查项-1': '继承统一 Controller 基类', '检查项-2': '构造器注入',
 '应用名称': 'app-web', '应用标识': 'app-web', '涉及应用标识': 'app-web',
 '前端端 / 后端服务 / 聚合层(BFF) / 共享库': '前端端', '代码根路径': 'apps/web',
 '数据库/存储': '—', '依赖的应用': 'svc-order', '应用内结构': 'views/order/ + api/order/',
 '模块文件清单': '页面 + api 文件', '栈特有约定': '组合式 API', '权限控制方式': 'v-hasPermi 指令',
 '路由机制': 'vue-router 动态路由', '请求封装': 'axios 实例 + 拦截器',
 '组件库与列表页模式': 'Element Plus 表格族', '依赖注入/注解风格': '构造器注入',
 '检查项1': '按钮权限指令控制', '检查项2': '列表页布局组件', '覆盖项': '无',
 '全局默认': '—', '本应用': '—', '理由': '无覆盖', '后端上传接口前缀': '/api',
 '写操作校验模型': '岗位优先 + 单位兜底', '实体类名': 'Order',
 '认证方式': 'JWT', '权限校验模型': '岗位优先 + 单位兜底',
 '业务主表/关联表': 't_order', '业务主数据': 't_order', '业务主表': 't_order',
 '服务': 'svc-order', '过滤字段': 'order_no', '过滤值': 'SO20260101',
 '流程key': 'orderFlow', '流程引擎库': 'order_flow',
 '业务域': 'order', '一句话说明': '订单业务域', '一句话说明2': '',
 '前端应用1': 'app-web', '前端应用2': '（无）', '聚合层应用': '（无）', '主责服务': 'svc-order',
 '模块名': 'order', '各应用落点': 'svc-order: services/order/src', '模块形态': '简单 CRUD',
 '标杆参考': '—', '边界依赖': '—', '依赖的下游模块/数据': '—', '被谁依赖': '—',
 '契约路径': 'doc-framework/模块/order/契约.md', '业务域1': 'order', '业务域2': 'order',
 '模块A': 'order', '模块B': 'inventory', '模块A、模块B': 'order、inventory', '依赖说明': '扣减库存',
 '流程名': '下单', '涉及模块': 'order、inventory', '涉及应用': 'svc-order',
 '触发/入口': 'POST /order/submit', '角色/模块（应用）': 'app-web', '动作': '提交',
 '模块（应用）': 'svc-order', 'svc-main: 路径; app-web: 路径; app-mobile: 路径': 'svc-order: services/order/src',
 # 模块四件套 / 边界 / 探索 / AGENTS 专用
 '主责任务落点文件': 'services/order/src/main/java/order/OrderController.java',
 '落点文件': 'apps/web/src/views/order/List.vue', '落点应用': 'app-web',
 '落点应用1': 'svc-order', '落点应用2': 'app-web',
 '页面结构': '列表页 + 审批弹窗', '差异说明': '无', '与标杆的差异说明': '无差异',
 '模块定位': '订单模块，负责创建/查询/提交。', '上游依赖': '（无）', '本模块组件': 'OrderService',
 '下游依赖': '（无）', '数据流': '调用', '不做的边界1': '不管库存扣减', '不做的边界2': '不管支付',
 'BF编号': '无', '内部步骤': '校验参数', '初始状态': '草稿', '状态A': '草稿', '状态B': '已提交',
 '触发动作': '提交', '驳回动作': '驳回', '终态': '已完成', 'code': '0', '枚举名': '草稿',
 '说明': '说明', '资源路径': 'order', '动作路径': 'submit', '接口A': '/order/submit',
 '接口B': '/order/list', '状态变化': '置为已提交', '状态不变，仅写业务字段': '不变',
 '优先校验': '岗位校验', '兜底校验': '单位校验', '操作': 'list', '校验值': '岗位=审核员',
 '兜底值': '单位=本单位', '字段名': 'id', '类型': 'bigint', '主键策略2': '—',
 '陷阱或约定1': '订单号唯一', '陷阱或约定2': '删除为软删除', '验收项': '订单可提交',
 '预期结果': '状态变为已提交', '场景短名': '提交订单', '触发条件与动作': '填报账号提交订单',
 '可观测结果': '主表 status=待审核', '结论一句话': '新增导出接口', '计划标识 @提交SHA': '2026-01-02-订单导出 @a1b2c3d',
 '需求 / 代码 / 实现 / 合并': '合并', '需求 / 代码': '代码',
 '提炼或补建的结论一句话': '初始化时从代码提炼标杆契约', '凭据': '初始化 @a1b2c3d',
 '增量一句话摘要': '新增导出接口并支持过滤', '小改结论一句话': '列表文案调整',
 '计划标识 @提交SHA': '2026-01-02-订单导出 @a1b2c3d', '@提交SHA': '@a1b2c3d', 'YYYY-MM-DD': '2026-01-02', '所属服务': 'svc-order',
 '影响摘要': '订单表新增 order_no 索引', '待执行 / 已执行': '已执行',
 '接口名': '订单列表', '错误码': '400', '场景': '参数错误', '提示文案': '参数不合法',
 '消费方': 'app-web', '模块目标': '—', '模块定位一句话': '—',
 '测试目标': '提交启动流程、逐节点审核', '适用 / 不适用': '适用',
 '依据': '不适用', '各服务地址': 'svc-order: http://localhost:8081',
 '流程定义状态': 'orderFlow 已部署', '表结构状态': 't_order 字段已存在', '权限要求': '填报/审批账号各一',
 '角色1': '填报', '账号1': 'filler', '姓名1': '张三', '角色岗位1': '填报员', '说明1': '提交人',
 '角色2': '审批', '账号2': 'auditor', '姓名2': '李四', '角色岗位2': '审批员', '说明2': '审核人',
 '用例名': '提交订单', '接口基础路径': 'order',
 '场景描述': '提交订单', '编号': '1', '项目测试类路径 / SQL': 'OrderFlowTest#submitOrder',
 '能力': '工作流', '接入方式': '引入工作流引擎', '规则1': '流程定义集中登记', '规则2': '状态归属主责服务',
 '步骤1': '登记流程定义', '步骤2': '接入审批接口', '陷阱1': '驳回后状态回草稿', '陷阱2': '重提复用流程实例',
 '变更内容': '新增超时自动驳回', '探索主题': '订单导出方案', '涉及应用': 'svc-order',
 '交接出口': '/module-plan order', '背景与问题': '导出数据量增长', '做法': '服务端流式导出',
 '改动面': 'Controller + Service', '风险': '大文件内存占用', '冲突点': '无',
 '选定方案': 'A', '选定理由': '复用既有权限体系', '被否理由': 'B 方案需新增上传服务',
 '对契约的影响': '契约 §4 新增导出接口', '未决问题1': '导出格式', '未决问题2': '是否需要异步',
 '拟新增模块名': 'export', '职责与边界': '只管导出，不管数据权限', '调用关系': '被 order 调用',
 '共享项': '共享订单状态机', 'N': '14', 'n': '1',
 '字段': 'id', '是/否': '是', '表名': 't_order', '边界文档路径': '边界/工作流边界.md',
 '权限模型': '岗位优先 + 单位兜底', '弹窗 / 上传 / 下载': '审批弹窗 → 上传 → 下载',
 'PASS/FAIL + 留痕': 'PASS', 'PASS/FAIL/跳过': 'PASS', '关键路径': '登录 → 列表 → 审批弹窗',
 '断言': '聚合结果与主责服务一致', '断言内容': '主表状态反写', '步骤': '主责服务写入 → 调聚合层接口',
 '脚本/手动': '脚本', '遗留问题': '无', '预期': '状态变为已提交',
 '探索中 | 已定案 | 已废弃': '已定案',
 '待审核 | 修订中 | 已批准 | 实施中 | 已完成 | 已废弃': '已批准',
 '改动 / 本次不改 / 不适用': '改动',
 'x.y': '3.1', '表/章节': '订单表', '字段/状态/接口/落点/场景': '字段 orderNo',
 '目标语义': '新增可选过滤参数', '对象': 'orderNo', '现值': '无', '目标值': 'string',
 '下一状态': '已提交', '任务': '实施', '决策1': '复用列表权限', '决策2': '不新增状态',
 '前置': '登录', '场景名': '提交订单', '期望': '返回文件流', '服务代码根': 'services/order',
 '实施主题': '订单导出', '变更类型': '兼容（新增接口）', '验收项': '导出可用', '待确认项': '导出格式',
 '需求背景与目标描述': '订单模块需要新增导出接口。',
 '本模块管什么、不管什么；与相邻模块的边界': '管导出与过滤；不管库存。',
 '调用谁 / 被谁调用 / 共享的状态机或权限域；跨模块接口的字段与语义（此时该模块尚无契约，接口语义以此为准）': '被 app-web 调用。',
}

TRANS = [('{文档根}', 'doc-framework'), ('{模块名}', 'order'), ('{主题}', '导出'),
         ('{域}', 'order'), ('{实体}', 'order'), ('{操作}', 'list'), ('{能力}', '工作流'),
         ('{层级}', 'order'), ('{模块}', 'order'), ('{计划路径}', 'doc-framework/模块/order/计划/x.md')]


def render(text, extra):
    """渲染纪律：**长 token 优先**，且**迭代到不动点**——否则 `{{表名}}` 会被 `{{表名/章节}}`
    之类的短 token 先命中，替换后残留出新的双括号 token（夹具实测踩过）。"""
    text = text.replace('{{框架版本}}', VER)
    m = dict(BASE); m.update(extra)
    pairs = sorted(m.items(), key=lambda kv: -len(kv[0]))
    for _ in range(8):
        before = text
        for k, v in pairs:
            text = text.replace('{{%s}}' % k, v)
        if text == before:
            break
    text = re.sub(r'【[^】\n]*】', '', text)
    for k, v in TRANS:
        text = text.replace(k, v)
    return text, sorted(set(re.findall(r'\{\{[^{}\n]*\}\}', text)))


# check 口径：剥围栏 → 剥行内代码 → 去双括号 token → 含中日韩的残留就是硬问题
def check_hits(text):
    nf = re.sub(r'```[\s\S]*?```', '', text)
    ni = re.sub(r'`[^`\n]*`', '', nf)
    nfld = re.sub(r'\{\{[^{}\n]*\}\}', '', ni)
    return sorted({x for x in re.findall(r'\{[^{}\n]+\}', nfld) if re.search('[\u4e00-\u9fff]', x)})


JOBS = [
 ('项目档案.md.tpl', 'doc-framework/项目档案.md', {}),
 ('总契约.md.tpl', 'doc-framework/总契约.md', {}),
 ('测试规范.md.tpl', 'doc-framework/测试规范.md', {}),
 ('接口规范.md.tpl', 'doc-framework/接口规范.md', {}),
 ('规范/类型-前端.md.tpl', 'doc-framework/规范/类型-前端.md', {}),
 ('规范/类型-后端.md.tpl', 'doc-framework/规范/类型-后端.md', {}),
 ('规范/应用-{应用标识}.md.tpl', 'doc-framework/规范/应用-app-web.md', {}),
 ('规范/应用-{应用标识}.md.tpl', 'doc-framework/规范/应用-svc-order.md',
  {'应用名称': 'svc-order', '应用标识': 'svc-order', '前端端 / 后端服务 / 聚合层(BFF) / 共享库': '后端服务',
   '代码根路径': 'services/order', '数据库/存储': 'mysql: order_db'}),
 ('模块/{模块名}/契约.md.tpl', 'doc-framework/模块/order/契约.md', {}),
 ('模块/{模块名}/接口.md.tpl', 'doc-framework/模块/order/接口.md', {}),
 ('模块/{模块名}/测试.md.tpl', 'doc-framework/模块/order/测试.md', {}),
 ('模块/{模块名}/test.sh.tpl', 'doc-framework/模块/order/test.sh', {}),
 ('边界/{能力}边界.md.tpl', 'doc-framework/边界/工作流边界.md', {}),
 ('探索/YYYY-MM-DD-{主题}.md.tpl', 'doc-framework/探索/2026-01-02-订单导出方案.md', {}),
 ('计划/YYYY-MM-DD-{实施主题}.md.tpl', 'doc-framework/模块/order/计划/2026-01-02-订单导出.md',
  {'应用标识1': 'svc-order', '应用标识2': 'app-web', '服务端应用标识': 'svc-order',
   '前端端应用标识': 'app-web', '文件路径': 'services/order/src/A.java', '说明': '主责'}),
]

bad = []
for tpl, out, extra in JOBS:
    src = (T / tpl).read_text(encoding='utf-8')
    # 「无覆盖则整行删除」的示例行，按指引删除
    src = re.sub(r'\n\| \{\{覆盖项\}\}.*\|\n', '\n', src)
    text, left = render(src, extra)
    if left:
        bad.append('%s 双括号残留 %s' % (out, left))
    hits = check_hits(text)
    if hits:
        bad.append('%s 单括号残留(会被 check 报) %s' % (out, hits))
    (P / out).parent.mkdir(parents=True, exist_ok=True)
    (P / out).write_text(text, encoding='utf-8')

# 计划模板渲染出的成品要能被 show 解析出白名单（渲染是否"语义可用"的抽查）
plan = (P / 'doc-framework/模块/order/计划/2026-01-02-订单导出.md')
plan_txt = plan.read_text(encoding='utf-8')
# 断言按「行内包含」判定（模板标题带章号，如 `## 2. 逐应用表态（授权作用域）`）
for must in ['> 状态：已批准', '> 计划形态：完整', '> 合并状态：待合并',
             '逐应用表态（授权作用域）', '变更文件清单', '任务清单（实施时逐项勾选）']:
    if must not in plan_txt:
        bad.append('计划渲染产物缺少关键行：%s' % must)
# 渲染产物要落到真实的文档骨架里 → 补上 check 要求的目录，再跑一次真实 check
for d in ['doc-framework/计划', 'doc-framework/边界', 'doc-framework/规范', 'doc-framework/模块', 'doc-framework/探索']:
    (P / d).mkdir(parents=True, exist_ok=True)
# 初始化收尾：删掉引导文件（否则 check 报"未清理"，那是正确行为、与本用例无关）
for f in ['doc-framework/README.md', '接入指南.md']:
    fp = P / f
    if fp.exists():
        fp.unlink()
agents = P / 'AGENTS.md'
if agents.exists():
    import re as _re
    agents.write_text(_re.sub(r'<!-- ↓↓↓ 接入引导段.*?接入引导段结束 ↑↑↑ -->\n', '', agents.read_text(encoding='utf-8'), flags=_re.S), encoding='utf-8')
print('|'.join(bad))
