# 后端开发规范

> 全局后端编码约定。维护：随框架升级或约定变化而更新；模块契约只写模块特有内容，通用规则引用本文件。
> **渲染义务（初始化时）**：本文件所有 `{占位符}` 必须替换为项目实际值（后端技术栈、代码根目录、主键策略、分页约定、标杆模块等），替换后不得残留任何 `{...}`；可用 `doc-framework check` 扫描占位符残留验证。

## 零、引用与优先级（唯一入口，防双维护）

- **本文件**：doc-framework 体系入口（速查索引），`/module-doc` 导航区与 `/module-review` 按此引用；
- **详细模板**：`{文档根}/standards/后端开发规范.md`（项目原始规范，如存在）；
- **全局编码约束**：{全局约束文件}（如 `{文档根}/standards/后端开发规范.md` 附 A 或 `.claude/CLAUDE.backend.md`，按项目实际；不存在则本文件直接承载约束要点）；
- **冲突判定**：{全局约束文件}（全局约束） > `{文档根}/standards/后端开发规范.md`（详细模板） > 本文件（速查索引）；
- **纪律**：本文件只做索引与摘要，详细内容一律引用原始规范，**禁止在本文件复制全文**（避免双维护漂移）。

## 一、分层与目录

- 分层结构：Controller → Service → Mapper → 数据库（{如 Spring Boot + MyBatis}）；
- 目录约定：按项目档案"目录约定"（{后端代码根目录}）；
- 每模块必须创建的文件清单（约 12 个）：DDL、菜单 SQL、实体、Mapper 接口、Mapper XML、Service 接口、Service 实现、Query/Create/Update Request、Response、Controller（细节以项目原始规范为准）；
- SQL 变更脚本：`sql/change/YYYY-MM-DD-{模块}_{说明}.sql`（不修改历史建表脚本）。

## 二、命名

- 类/文件：PascalCase（如 `{XxxEntity}`、`I{Xxx}Service`、`{Xxx}Mapper`）；
- 接口权限标识：`{域}:{实体}:{操作}`（`list/query/add/edit/remove/export/view`）；
- 数据库表：snake_case；字段：snake_case；主键：`{实体}_id`；
- 枚举类：`XxxStatusEnum` / `XxxAuditResultEnum`（状态/结果等），放 `{api模块}/enums/`。

## 三、权限体系

- 后端：接口级权限注解全覆盖（{如 `@PreAuthorize("@ss.hasPermi('{域}:{实体}:{操作}')")`}）；
- 写操作校验：{权限校验模型}（如 岗位优先 + 单位/关系兜底，按项目实际；详见模块契约 §4.3）；
- 列表数据权限：按用户/单位/上级单位过滤（详见模块契约与档案通用约定）。

## 四、通用约定

- 主键：{主键策略}（新增表按档案约定，不擅自改变全局策略；如雪花 ID `IdUtils.nextId()`）；
- 软删除：`del_flag`（`0` 存在 / `2` 删除），查询/更新 SQL 必须携带 del_flag 条件；
- 审计字段：{审计字段}（如 `create_by/create_time/update_by/update_time`，创建/更新时自动填充）；
- 乐观锁：`version`（更新 SQL `version = version + 1`，WHERE 携带 `version = #{version}`，0 行影响抛并发冲突）；
- 分页：{分页约定}（如 PageHelper：`startPage()` + `getDataTable()`，请求 `pageNum/pageSize`）；
- 事务：多表写操作必须事务（`@Transactional`）；
- 响应：统一 `AjaxResult<T>` / `TableDataInfo`（分页），错误文案可直接展示给用户，不暴露堆栈。

## 五、全局约束索引（详细见 {全局约束文件}）

| 约束域 | 关键点 | 详细章节 |
|--------|--------|----------|
| 依赖注入 | 构造器注入（`@RequiredArgsConstructor` + final），禁止字段注入 | {全局约束文件} §1 |
| 分层对象 | Controller/Service/Mapper 各层对象职责，Request/Response 不直接暴露实体 | {全局约束文件} §2 |
| 命名约定 | 类/方法/变量/常量命名 | {全局约束文件} §3 |
| 数据库批量操作 | 批量插入/更新/删除/校验写法，禁止循环单条 | {全局约束文件} §4 |
| 枚举使用 | `XxxStatusEnum` 命名、持久化 code、比较方式 | {全局约束文件} §5 |
| 日期时间 | `LocalDate`/`LocalDateTime` 类型对应、时区、格式化 | {全局约束文件} §6 |
| 事务 | `@Transactional` 边界、自调用解决方案、传播行为 | {全局约束文件} §7 |
| 主键生成 | 主键策略（如雪花 ID），禁止数据库自增（历史遗留除外） | {全局约束文件} §8 |
| 逻辑删除 | `del_flag`（0/2），查询/更新必带条件 | {全局约束文件} §9 |
| 对象转换 | Converter 层 Entity ↔ Request/Response 转换 | {全局约束文件} §10 |
| 应用日志 | 日志级别、埋点规范 | {全局约束文件} §11 |

## 六、标杆模板

- {标杆模块1}：{代码路径}（{参考点，如标准 CRUD 十二件套}）；
- {标杆模块2}：{代码路径}（{参考点，如工作流审批流接入}）。
