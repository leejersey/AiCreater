# 冻结版本历史只读浏览

## 目标与当前状态

用户已确认书面设计并明确“实现”；代码/隔离回归完成后用户明确允许激活；3000再次验证空闲，loopback本工作台启动、新GET200，独立副本dirty/刷新与受控分页/晚响应验收完成，原数据/任务不变。之前外部端口阻塞为历史事实，未操作外部项目。只读查看现有冻结版本的编号、主题、场景数量和旧稿/场景内容。不是创建更多快照、回滚、比较、预览旧视频或触发任务。

核对发现：`services/projects/schema.sql`中的project_versions只有id/project_id/revision/dsl/profile，没有创建时间。**首批界面明确显示“创建时间未记录”**，不从UUID、渲染任务、文件mtime或迁移时间猜测日期；本方案不改表、不回填、不重写旧版本。若必须给今后新版本记录准确时间，应另行确认nullable创建时间迁移（旧版仍未知），不混入本次实现。

## 方案取舍

推荐小型只读面板：现有表查摘要，复用已有GET版本详情，分批加载。不新建页面或通用表格；不在列表传整份DSL/profile。

备选准确时间迁移会扩大旧接口/数据库锁及旧验收hash影响；回滚/差异比较还涉及当前revision、音频与恢复规则。首批均不做。旧版视频预览需要处理历史资产读取，亦不在“查看旧稿”范围。

## 后端

新增 `GET /api/projects/{project_id}/versions?before_revision=<positive integer>`；复用Store连接、UUID及错误处理。先检查项目存在，不加载当前场景全文：错误UUID依现有400语义，项目不存在404，已有项目无版本返回空列表。

以project_id约束查询，revision倒序。固定每页50条，取51条判断下一页，返回 `{items: [{id, project_id, revision, theme, scene_count}], next_before_revision: integer|null}`。下一页仅revision小于上一页最后一条，使用现有UNIQUE(project_id,revision)索引；不提供无限limit/offset。参数正整数且不超过PostgreSQLinteger上限2147483647，避免越界数据库错误；全部SQL参数绑定。不按创建时间排序。

主题/场景数从冻结DSL派生，不读当前project.config；缺theme的旧版按原tech_explainer默认展示。只查询摘要、不验证或重存旧DSL、不访问音频/对象存储、不插入version/job，不返回profile/原稿/服务配置于列表。

详情复用 `GET /api/versions/{version_id}`，现有响应不改。前端只使用id/project_id/revision/dsl，不展示profile或调用历史媒体接口；确认详情的project_id与所选项目一致。旧版GET依原有单用户安全边界，本功能不声称新增多用户鉴权。

## 前端

在 `apps/web/app/page.tsx` 的当前项目区加折叠“版本历史（只读）”，采用现有details/button/pre/hint样式，小组件隔离其加载/详情状态。无新的布局风格选择/拖拽/弹窗。展开才请求首批，提供刷新及加载更多；列表显示r编号、主题、场景数和时间未记录说明。

点击版本查看冻结旧稿：场景顺序、类型、口播、代码（若有）及步骤详情折叠JSON，保留cue/edges/状态等完整场景数据但不展示profile；内容通过React文本/JSON展示，不注入HTML或执行代码。可关闭详情。不更换当前Player、所选场景、Project对象、reviews或编辑表单。

当前dirty可浏览历史；不要求丢弃未保存输入，不修改dirty/onDirty。按project.id隔离组件，列表/分页/详情各防旧响应覆盖新选择；切项目或卸载后不写过期状态。重复点击受该组件loading保护，错误/404保留已加载列表与当前编辑并明确显示；下一页结果去重、不静默退回另一项目。刷新重取首批，保留属于当前项目的只读详情（不覆写表单）。冻结导出后可手动刷新历史，不添加高频轮询。

## 范围与调用点

后端：services/projects/store.py摘要方法；services/api/app.py新GET与有界query参数；对应services/tests/test_projects.py、services/tests/test_api.py。前端：apps/web/app/page.tsx接入只读组件、该组件及必要的局部类型/加载逻辑和Node测试。文档：README、MVP契约、TODO、follow-up更新。

无SQL/Schema/媒体/provider/worker修改，无新依赖或通用抽象，无编辑恢复端点。旧get_version/create_version及render调用保持原形。当前常驻API非热加载；实现后若需启用新GET，重载必须另获单次授权，不沿用连线维护窗口。

## 验收

- 隔离DB/API：空列表、未知项目/UUID、有界cursor（零/负/越界/非整数）、项目隔离、50+分页稳定无遗漏重复、摘要不含DSL/profile、旧theme正确；读前后项目/版本/六表不变，无新jobs。
- 编辑后历史仍显示冻结原稿/主题；已有版本详情响应与旧导出不改。正常生成/配音/导出路线回归不受影响。
- 前端：静态结构/只读内容转义、空/加载/错误、加载更多/刷新、晚返回请求/切项目不串数据、缺日期明确未知；当前dirty与表单内容保留，不触发任何PATCH/POST或播放器替换。
- 常规：完整离线Python、临时DB/API/Jobs、Node/typecheck/web build。无需LLM/TTS；真实浏览器仅在授权激活后的独立副本验证“有未保存输入→查看旧r1→输入仍保留”、刷新/翻页及错误显示，原件/六表旧行/音频/任务计数守卫。无新增MP4。

## 自审及设计门禁

- [x] 已核对Store/schema/API/page及现有不可变约束、No commits yet状态。
- [x] 用户已同意只读历史方向，复用现有组件，不需要新视觉方案；本次仅文本设计，不开浏览器。
- [x] 明确无日期数据/不能推测，选不迁移最小方案，分页避免大DSL列表。
- [x] 自审旧接口、数据流、错误与测试边界；无委派授权，不启动独立审查代理；无初始提交授权，不commit。
- [x] 用户审阅并以“实现”确认首批时间“未记录”。
- [x] 已写实施计划/TDD并完成代码与回归；没有数据库/服务/收费改动。
- [x] 用户确认端口可用并明确允许；仅本web启动/API重载，真实dirty与受控分页/晚响应验证完成，见output/workbench/version-history-activation/receipt.json；未处理外部项目，不继承为未来维护授权。

未完成/风险：没有真实创建日期；详情读取不等于旧版可重新渲染或媒体仍可下载。不做回滚/对比/旧视频预览。人工0.5秒听检、nums/20收费组与异地备份仍按原TODO暂缓，不借历史功能自动推进。
