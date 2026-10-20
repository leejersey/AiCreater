# Version History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户明确“实现”；无委派授权/出生HEAD/初次提交授权，直接当前工作区，不创建虚假worktree/commit。

**Goal:** 只读分页查看冻结版本与旧稿，不改当前输入或数据。
**Architecture:** Store有界摘要SELECT、一个GET route，复用已有get_version。独立VersionHistory组件按project.id隔离，列表/详情请求序号和卸载防护；无新表/Schema/媒体/任务。
**Tech Stack:** PostgreSQL/FastAPI/Python unittest；已有Next16/React/Node tsx test。日期“未记录”，不迁移。

### Task1 后端红绿
Files: services/projects/store.py, services/api/app.py, services/tests/test_projects.py, services/tests/test_api.py。
- [x] 写失败测试：空/不存在/UUID、旧theme/冻结内容、50+页项目隔离与cursor上下界、列表无profile/DSL，读取六表不变与无jobs。
- [x] `python3 services/tests/run_project_tests.py`观察RED：Store缺list_versions/API404而非200。
- [x] Store.list_versions(project_id,before_revision=None)：identifier、revision及<=2147483647；检查项目存在；SELECT id/project_id/revision/COALESCE(dsl->>'theme','tech_explainer') theme/jsonb_array_length(dsl->'scenes') scene_count，以project_id及optionalcursor约束，ORDER BY revision DESC LIMIT51；输出50及next_before_revision。
- [x] API导入Query，GET /api/projects/{project_id}/versions query int|None ge1 le2147483647；返回Store方法。原POST/get_version不变。
- [x] 同命令GREEN；SQL测试51条可直接在隔离DB插入已验证snapshot，避免51次媒体验证，无常驻写入。

### Task2 前端红绿
Files: apps/web/app/VersionHistory.tsx, apps/web/app/page.tsx, apps/web/tests/versions.test.ts。
- [x] 先写SSR tests：折叠历史面板只读时间未知；详情展示旧稿/代码/全场景JSON且React转义，不展示profile/可编辑输入/执行按钮；既有editor测试不变。npx tsx --test apps/web/tests/versions.test.ts RED模块不存在。
- [x] 读Next本地client-component文档，再实现小组件。摘要/详情独立状态，展开才GET、刷新/更多、请求epoch及unmount guard；后返回版本须id/project_id一致。加载/错误保留已加载列表/当前编辑，分页去重；不接收save/onDirty/Player或设置当前project。组件key=project.id。
- [x] page.tsx仅import/插入，旧编辑及轮询不改。未热加载API时面板GET404清晰失败，不自动重试/写入，其他编辑正常。
- [x] npx tsx --test apps/web/tests/versions.test.ts GREEN，npm test、npm run typecheck、npm run web:build；异步竞态源审，真实dirty/乱序浏览器验收需后续API重载授权，不伪称SSR测试完整事件行为。

### Task3 回归与交付
Files: README.md, docs/TODO.md, docs/MVP开发契约.md, docs/mvp-follow-up.md, output/workbench/version-history-qa/receipt.json。
- [x] python3 -m unittest discover -s services/tests -v；py_compile，所有临时DB/API/Jobs及Node回归。自审boundedqueries、日期不假造、GET无sideeffects、error/cross-project/旧接口兼容/dirty保护。无代理审查。
- [x] 记录实际counts/code hashes/no migration/no收费；不更改原receipt或冻结JSON，不重启常驻服务、不启动收费任务。
- [x] 更新文档：代码完成≠API激活；新route使用需新的单次reload授权。用户授权后另行独立副本真实浏览器查看旧r1、未保存输入保留、刷新/更多/晚响应及原行/media/jobs守卫。本轮只代码及隔离测试，不以过去连线维护授权启用。

自审：Spec已获实现指令；时间unknown明确，分页解决读取体积，组件使用现有request/house details。50+测试不调用provider，不增加抽象/依赖/新页面。常驻表schema不得改。没有Git HEAD，不提供合并/提交成功声明。

## 执行记录

代码范围完成，自审通过：94隔离DB/API/Jobs、164离线Python、187Node、typecheck/build；Node首个内容test误以为demo含code，核对fixture无code后独立加code展示fixture，未改组件来迎合错误测试。额外测试缺theme旧版默认、当前原稿改后旧稿保持。列表六表只读，旧GET/POST回归无变化。

仅源码/隔离测试/文档写入。实际常驻API还是旧route（405）未重载；只读守卫中web安全检查拒绝non_loopback_listener，查明3000为rtc_demo_nodejs外部服务，未停止或请求它；其他原行/媒体/73对象/容器/消费者及58attempts均未变。真实UI/dirty/异步事件未验收。

- [x] 用户确认3000空闲并明确允许本web启动/API重载，隔离副本真实旧r1/dirty/刷新通过；50+2/错误保留52/空列表/晚详情关闭与切项目晚列表采用浏览器受控传输验证，不插入新版本，实际SQL分页在临时DB验证。原六表/媒体/对象/容器/队列与58attempts不变；见output/workbench/version-history-activation/receipt.json。此前端口阻塞/405仅为代码阶段历史，当前loopback工作台可用、GET200；没有新feature代码、收费或未来维护授权。

