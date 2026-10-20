# Execution Timeline Implementation Plan

> Inline executing-plans; approved by user continuation. No agents authorized; no Git repository/worktree. Follow test-driven-development.

**Goal:** 教学执行/等待时间线贯通生成、配音、编辑、预览与导出。
**Architecture:** Scene.timeline(1–3 lanes, duration_ms) + Element.event; cue controls visibility independently from illustrative milliseconds. Shared schema and Node/Python checks, existing motion and immutable versions.
**Tech Stack:** Existing TypeScript/Ajv/React/Remotion and Python/jsonschema/PostgreSQL.

- [x] packages/video-schema/tests/timeline.test.ts先红：相邻/跨轨允许、同轨重叠/未知/重复/空轨道/边界/非法字段拒绝，Node/Python一致；schema.json、validate.ts、validate.py及生成types.ts实现后绿。
- [x] timeline-view.test.ts先红；新增packages/video-components/src/TimelineLesson.tsx，按帧决定可见事件、短事件标记和精确区间。layout.ts跳过普通卡片；Video.tsx接入组件及字体宽度校验。
- [x] services/tests/test_timeline.py先红；更新storyboard/store/jobs/worker白名单、providers提示、apps/web/lib/editor.ts；验证草稿/配音/编辑保留，原文与无执行边界不变。
- [x] examples/lessons/timeline.json手写串行/异步假设案例，复用scripts/create-demo.ts --timeline制作本地音频。导出和代表帧检查，不付费调用。
- [x] npm test、typecheck、test:workflow、真实PostgreSQL测试；升级模板teaching:4前检查自有PID/活动任务，真实API编辑/队列导出/下载SHA；README和MVP契约记录实际验证与未验证项。

## 验证记录

- Node133/133通过；TypeScript通过；workflow总136，63个数据库用例跳过后单独临时PostgreSQL运行63/63通过。
- examples/lessons/timeline.json串行/异步假设场景；demo:create --timeline生成636帧本地say短语级样例，不调用收费服务。最终队列导出约21.2秒、1080P30 H264/AAC和SRT。
- 字体预加载含数字/单位/图例，窄事件保持原始比例并用实心执行/空心等待标记。代表帧发现零刻度与说明重叠，新增失败用例后将tick.top从244修正至270；回归与最终图像通过。
- 自有PID和无活动任务检查后安全升级API、workflow/render及beat，保持solo单槽及原卷。工作台HTTP编辑保存重开保留timeline/narration/captions，新冻结/渲染、RustFS上传、下载MP4/SRT SHA均通过。
- 同revision/profile重复冻结、渲染会幂等复用旧版本，首次试图重新渲染得到相同ID，不能作为修复后证据。接受明确示意标签编辑产生新revision后，断言新version/jobID，实际queued→running→succeeded。原结果保留，workbench-v2元数据已注明未修复；最终为output/timeline-demo-qa/workbench-v3.mp4和同名SRT。
- 最新project_id=838b2932-d7ce-4434-9524-3497b956f09a；version_id=ca34da7f-c842-4cf2-a166-6031bf51f906；render_job_id=25e40d69-ff71-4539-855d-22a5e8c29bc8。output/workbench/services.json记录最新进程及产物。
- 浏览器实际播放/暂停、出现事件和5个270px刻度通过，output/timeline-demo-qa/workbench-preview.png保留；代表帧async-v3.png确认零刻度清楚且执行不并行。Tabbit已finish并保留页面；既有注入属性开发hydration警告未隐藏。
- 未跑本轮Next生产构建、云端生成或ASR/字词同步听检、20例批量验收。未新增依赖或收费调用；完整2–3分钟长课及分镜确认/表单仍待开发验收。无Git，未提交；无授权agent，主会话自检。

保持旧六类项目及导出，不篡改旧profile。示意耗时不是视频时长，不承诺CPU并行/性能数据；不做新表单、自由拖拽、真实profiler或自动技术事实证明。
