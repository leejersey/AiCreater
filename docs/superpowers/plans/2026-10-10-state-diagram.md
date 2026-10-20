# State Diagram Implementation Plan

> Inline execution using executing-plans; user approved spec. No subagents authorized, no Git repository/worktree available.

**Goal:** 数组/对象/栈完整教学快照贯通现有生成、配音、编辑和导出。
**Architecture:** 新Scene.structure与Element.items/active_item_ids；共享schema及语义校验，复用按帧当前步骤选择。纯文本和完整快照，不执行程序。
**Tech Stack:** Existing React/Remotion, TypeScript/Ajv, Python/jsonschema.

## Tasks
- [x] 先写packages/video-schema/tests/state.test.ts：三种结构、空/六项、重复/非法引用/索引、旧模板、seek、布局。运行npx tsx --test对应测试确认红。
- [x] 修改schema.json、src/validate.ts、validate.py并npm run schema:types；Node/Python返回相同合法/非法结果。state_scene和code_scene均严格递增cue与开始帧。
- [x] 创建StateLesson.tsx；把activeStepAtFrame从CodeLesson移至motion.ts共享，保持旧导出兼容；Video接入字体/实际宽度校验，layout普通卡片跳过state。
- [x] 更新storyboard.py/store.py/jobs.py/worker.py白名单、editor.ts草稿类型；写离线状态草稿/装配/保留与提示测试。time_scene已完整深拷贝，无须改。
- [x] 复用create-demo.ts制作本地数组/对象/栈样例，导出与关键帧审阅；模板版本teaching:3，保持旧项目/档案。
- [x] 全套npm test、npm run typecheck、npm run test:workflow、run_project_tests.py；无活动任务时升级自有常驻进程并导入本地样例，实际编辑/冻结/队列导出。更新README/契约/计划。

## Verification record
- Schema/语义/seek/状态保留与分镜请求测试均先红后绿；共享按帧步骤函数保留CodeLesson旧导出。三个手写样例的值按固定数组/对象/栈操作离线核对，不运行模型代码。
- 最终npm test 108/108、typecheck通过；workflow 132个测试中70离线运行、62跳过，run_project_tests.py随后真实PostgreSQL 62/62通过（82.3秒）。
- 本地say样例903帧/30.1秒导出output/state-demo.mp4与SRT；三种结构、出栈为空以及各6项中文压力图检查通过。字体实际测出栈标签267.7px超出260px，先增加失败断言、再校准共享keyWidth=320，真实重渲染通过。
- 无外部付费调用。已升级自有API/worker/beat并保留卷/旧档案；导入workbench状态图项目fc3a2bed-bb86-4513-bc38-0717cd357256，实际HTTP编辑/重开/音频保留、新版本渲染任务完成、RustFS下载MP4/SRT SHA通过。产物output/state-demo-qa/workbench.mp4与SRT，进程/项目记录在output/workbench/services.json和state.json。
- macOS默认prefork初始化崩溃使已入队任务停留queued。确认原任务未claim、进程归属与无其他活动任务后，以solo单槽重启自有workers，原任务running→succeeded，没有新建或重复执行付费任务；test_queue_pool先红后绿。任务自身子进程/超时边界保持。
- 真实Tabbit工作台播放→空数组→暂停及下载入口可见，截图output/state-demo-qa/workbench-preview.png；页面保留、任务已finish。Tabbit注入html属性的hydration警告单独记录，不用忽略警告掩盖。生产Next构建本轮未重跑。
- 无Git仓库，未提交或用worktree；未授权子代理，全部本会话完成。

## Limits
不加依赖/嵌套/树/表单/执行时间线/自动语义证明。无收费请求。保存失败不能丢草稿；部署前必须检查活动任务与PID归属，不删用户卷和旧结果；teaching:2旧快照需新冻结，不能改原profile。
