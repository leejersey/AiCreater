# 本地 API 与候选确认 Implementation Plan

> **For agentic workers:** executing-plans 顺序执行，不启用代理或创建提交。

**Goal:** 接入 FastAPI 项目创建/编辑/排序/快照 API，以及内部候选保存和显式接受；保持编程/AI教学内容、音频复用和版本保护。

**Architecture:** 复用 PostgreSQL Store，事务内锁项目并检查 expected_revision 与 candidate.base_revision。FastAPI 只调用仓库，禁止接受任意执行代码、客户端数据库地址、生成配置密钥。仅本地127.0.0.1:8000服务，严格 Host/Origin 和请求大小/时间限制。候选生成任务不在本轮执行；仅内部方法可保存候选，API只读/接受，不提供假202。

**Tech Stack:** 已安装 FastAPI 0.128.0、uvicorn 0.40.0、psycopg、现有验证器和真实临时 PostgreSQL 测试。

## 文件与步骤

- [x] services/tests/test_api.py：真实PG+TestClient验证创建不生成视频、严格字段/版本/大小/Host/Origin、编辑、排序、快照、候选过期与显式接受、错误不回显输入。
- [x] services/tests/test_projects.py：内部候选测试，创建候选不改场景、旧候选保留、音频复用与needs_voice/needs_timing状态。
- [x] services/projects/schema.sql：source_text列、scene_candidates表与needs_timing状态；向已存在本地表做幂等迁移，不删数据。
- [x] services/projects/store.py：创建纯文案草稿、保存/读取/接受候选；空项目不能建快照。候选ID固定目标场景名，内容走既有草稿/完整DSL校验。
- [x] services/api/app.py：create_app(store可注入)、lifespan初始化、公开类型模型、统一去敏错误、只开放已实现接口。
- [x] services/api/local.py：本地Host/Origin白名单，累计请求体≤512KiB、15s预算，避免仅检查Content-Length或一次读入无限请求。
- [x] 测试runner同时运行两组PG集成测试；README/开发契约/requirements记录功能和剩余任务。

## 不变式

编辑/候选接受总在项目锁内，场景与项目revision一同递增；接受候选增加generated_revision，不增加user_revision。候选base过期返回409且保留候选，不覆盖用户编辑。

同口播且相同元素ID/cue/order可以复用既有音频、字幕与动画，完整DSL需再次验证。同口播但结构/cue改变时保留音频，删除动画并标记needs_timing；口播改变清空配音/字幕/动画/时长，标记needs_voice。均不自动请求供应商。

候选只能由内部方法写入，source_job_id暂可空用于内部人工验证；未来Worker必须绑定真实任务，接任务表时增加引用约束。本轮不声称已经实现LLM任务、候选自动生成、配音恢复、任务队列或Web编辑器。

## 核验

先运行新增测试确认缺失API/候选方法，再补实现。`python3 services/tests/run_project_tests.py` 使用专属临时PG；其后 `npm run test:workflow`、`npm test`、`npm run typecheck`。新测试全部不调用付费服务。

## 实施结果

- FastAPI接口、内部候选仓库、needs_timing和source_text幂等迁移已实现；原有本地项目/快照不删除，CLI仍可用。
- 27项真实PG仓库/API集成测试、36项非PG Python测试、71项TS测试、类型检查和Python编译检查通过，共134项实际通过。普通工作流跳过27项PG，已用临时容器单独跑完，不把跳过计为成功。
- API启动配置路径及DB健康查询有测试；数据库不可用时health返回503。测试通过TestClient/ASGI执行，尚未做长期TCP服务/浏览器端到端验收。
- 本地边界同时校验实际peer、Host和Origin，不能仅伪造Host绕过；还测了无Content-Length分块累计限额、错误Content-Length、15s接收预算和CORS预检。仅回环来源可访问，无公网/多租户鉴权。
- 请求错误不回显输入值或额外字段名；DSL错误输出去敏path/code/message。发现dict[Any]能绕过Pydantic字符串Unicode检查、导致Node stdin UnicodeEncodeError；已在仓库共享草稿/DSL边界检查UTF-8 JSON，使导入/编辑/内部候选返回validation并回滚，而不是启动子进程后报500。
- 候选创建不改场景；候选在用户编辑后晚到仍保存，但不能覆盖新revision。接受仅替换目标场景并推进generated_revision。相同口播与cue保留合法音频/时间；cue变化保留音频但needs_timing；口播变化needs_voice。两种未ready状态都阻止快照。
- 临时PG容器已清理；未启动用户长期服务或调用付费供应商。已有示例视频不重新渲染，业务更改不涉及画面模板。

剩余：真实任务执行/取消/重试/attempt隔离、候选自动生成和source_job外键、配音/时间重算、内部renderer快照接口、S3/MinIO和Next.js教学编辑器。当前不开放生成/配音/渲染任务入口，不返回虚假202。

