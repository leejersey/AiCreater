# 流程连线编辑实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户已确认书面设计并要求实现；无委派/首次Git提交授权，HEAD未出生，保持当前工作区。

**Goal:** 手工增删现有节点连线，严格DAG/版本验证并保留原音频。
**Architecture:** 现有PATCH白名单加入仅flow的edges；复用草稿/最终验证、锁与失效。SceneEditor共用保存，scenePatch仅显式变化时携带flow.edges，未改边保留旧请求兼容；新增小本地表单检查，仅完整性/自连，不复制DAG。
**Tech Stack:** Python/FastAPI/PostgreSQL；已有React/Next16/TypeScript/unittest/Node tests。无新依赖/Schema/表/路由/渲染器。

### Task1 后端红绿

Files: services/tests/test_projects.py, services/tests/test_api.py, services/projects/store.py。
- [x] 增加真实临时DB测试：增删清空/no-op、ready时音轨/时轴及旧快照不变、409；非法类型/未知节点/重复/自连/环/超15/额外字段原子回滚；与口播一起编辑失效、needs_voice/needs_timing保持；API无新jobs。
- [x] `python3 services/tests/run_project_tests.py` RED有效edges被Unsupported patch拒绝。
- [x] Store仅白名单及复制字段加edges，锁内拒绝非flow.edges，其他状态/事务/验证不变。相同patch仍no-op。
- [x] 同命令GREEN；原有全部临时DB/API/Jobs tests通过。

### Task2 前端红绿

Files: apps/web/tests/editor.test.ts, apps/web/lib/editor.ts, apps/web/app/SceneEditor.tsx。
- [x] 改flow patch测试应携带edges且保留顺序，非flow不携带；本地formEdgeError节点/不完整/自连；表单SSR具有真实选项/增删按钮/共用保存。RED新字段/helper/控件缺失。
- [x] scenePatch仅flow且显式变更增加edges，未改边的旧请求不变；formEdgeError(elements,edges)返回简短中文未选齐/自连提示，未知节点以完整性拒绝。DAG权威留服务端。
- [x] SceneEditor edges状态初始化row.edges，修改触发dirty；最多15、nodes<2禁新增，空数组可存，disabled遵循busy；不自动填路径、不排序。save按JSON比较变化并传显式edges参数；高级步骤JSON切换不清edges，error保留。
- [x] `npx tsx --test apps/web/tests/editor.test.ts` GREEN，`npm test`、`npm run typecheck`、`npm run web:build`。

### Task3 自审与文档

Files: README, docs/MVP开发契约.md, docs/TODO.md, docs/mvp-follow-up.md；output/workbench/flow-edge-qa/receipt.json。
- [x] 跑离线Python回归/py_compile，源代码审查音频/派生状态、白名单/节点ID、unknown fields、无任务副作用、输入保留。无代理审查。
- [x] UI/API实际操作仅独立副本；代码阶段未擅用旧维护授权，随后用户新授权后仅重载API，完成实际保存重开/422/409/旧候选与预览，并记录新receipt。不为测试生成收费数据或导出；真实DB/TestClient充分验证保存重读事务与revision。
- [x] 更新文档支持edges、只改边保留ready/原音轨；其他ops暂停、20组/nums/听检仍暂缓。新代码hash、测试数量、运行状态/不曾重启凭据记录；不改旧验收receipt，不提交初始Git。

计划自审：已有动画绑定节点cue，改边不强制重算；Schema已覆盖完整DAG，前端只做输入完整性，避免双份实现。旧flow测试patch字段必须同步；图type不允许切换。仅DBfixture数据写入，运行服务零新任务。

## 当前交付与未完成边界

代码/TDD/自审及文档步骤完成：91隔离PG/API/Jobs、164离线Python（255总测试/91DBskip）、184Node，typecheck/build/py_compile均通过。只读原数据守卫仍58attempts/0active。实际浏览器确认新增、节点选择、自连/不完整阻存、删除及高级JSON切换，不发送PATCH。

- [x] 已获得用户单次新API重载授权并仅原模式重载API；独立副本实际保存重开、成环422回滚/输入保留、并发409保护、旧候选冲突及三条可见SVG连线预览通过。未重启web/队列/DB，未改边的旧请求兼容。新增仅1copy/9scenes/1version/1candidate，原六表旧行/原媒体配置不变，58attempts/0active，无新收费/render，证据output/workbench/flow-edge-activation/receipt.json；此维护授权不沿用。
- 新验收浏览器task连线实际保存验收/组B463A99F4FE5D422559D73DED8598178已finish确认keep=true，输出图在activation/preview.png、页面静音暂停保留供查看。实际确认放弃仅自有副本过期输入，未强制关闭；不虚构console清单。新任务收尾不改变下条历史旧tab的事实。
- 临时浏览器自身tab850334288/groupDF7ED7221532A0190157CCB4EF3B951C关闭遭EVALUATION_TIMEOUT，恢复读探针PAGE_ATTACHMENT_TIMEOUT且codeDispatched=false；finish已确认keep=true，不强关或重试变更。receipt如实标未关闭，无虚构console计数。
- 不做独立代理审查、初始Git提交或模型/配音；人工听检/nums/20收费组、异地与新增运维仍暂缓。
