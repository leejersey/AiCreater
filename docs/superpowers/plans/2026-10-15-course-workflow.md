# Whole-course Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对已人工确认的待配音场景一次提交，复用已有有效音频，并展示整课状态与可定位的导出阻塞。

**Architecture:** 复用现有 scene/revision、Jobs._submit 输入去重、单场景 worker 和显式 retry。新增项目级事务批量提交，不增加表、worker、依赖或收费自动重试；前端沿用当前会话的逐场景 reviewKey 确认。导出提示复用 validateProject，后端冻结时仍执行完整 DSL/媒体校验。

**Tech Stack:** Next.js/React/TypeScript, FastAPI/Pydantic, PostgreSQL/psycopg, node:test/unittest.

**Boundaries:** 用户已批准执行上述方向。无首次 Git 提交，不能 worktree，不替用户创建初始提交；直接按现有文件结构工作。不启动原 PostgreSQL/Redis/API/worker，不调用收费服务。数据库停止已定位，验证使用既有 disposable PostgreSQL runner。真实新课程、预算、人工听检、发音调整继续暂缓。

### Task 1: Transactional batch voice
- [x] 在 services/tests/test_jobs.py 添加：全批原子校验、revision/归属/重复校验、仅 needs_voice、并发重复不新增、失败不自动重试与草稿不变测试；运行观察失败。
- [x] services/projects/jobs.py 提取现有 voice payload helper，新 submit_batch_voice(project_id, base_revision, scenes, confirmed) 锁项目校验全部选择后逐一复用 _submit；扫描当前 revision 的已有 voice（含终态）避免再收费。保留 submit_voice 行为和原协议。
- [x] services/api/app.py 新严格请求体（每批1–20章）scenes:[{scene_id,expected_revision}]、confirmed:true、项目 expected_revision；POST /api/projects/{id}/voice 返回安全 public_job 列表。services/tests/test_api.py 覆盖字段/付费确认/冲突/敏感数据隐藏。
- [x] list_project 在最近50条之外补当前 revision 的最新 voice 状态，让整课进度不被历史任务挤掉。
- [x] python3 services/tests/run_project_tests.py 全部通过；不执行消费者。

### Task 2: Course overview and export blockers
- [x] apps/web/tests/course.test.ts 新增纯函数与SSR测试，覆盖确认/选择/重复费用保护、失败/成功/旧任务、ready/needs_timing 复用、dirty/无场景/DSL错误定位；先红。
- [x] apps/web/lib/course.ts：currentVoiceJob，batchVoiceScenes，exportIssues；复用 validateProject（page 保留 readyVideo），不新增收费逻辑。
- [x] apps/web/app/CourseOverview.tsx：状态数量、每章已确认及待确认、仅可提交场景选择、一次付费确认入口、批量回执/失败定位、导出问题跳章。不提供一键替代人工确认或自动重试。
- [x] apps/web/app/page.tsx 接入组件、复用 dirty/busy/reviews/act/request；单场景配音仍可明确重配。导出按钮遵守同套阻塞提示。
- [x] npm test && npm run typecheck；离线 Python 单测；独立目录生产构建。

### Task 3: Review and delivery
- [x] 自审所有调用者、并发/去重/错误安全/未保存输入与跨项目状态；补回归测试。
- [x] docs/api-reference.md 与 docs/TODO.md 更新实现边界及实际测试证据；不把静态测试当真实浏览器或付费验收。
- [x] 报告交付与尚未激活服务、未做收费/听检的边界；证据见 output/workbench/course-workflow-qa/receipt.json。
