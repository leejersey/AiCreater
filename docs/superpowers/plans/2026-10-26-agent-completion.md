# Agent Completion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Update this file after each verified milestone. Do not replace autonomous-generation evidence with manually redrawn samples.

**Goal:** 从工作台提交口播后，Agent在明确请求预算内生成有教学表现力的自由场景，完成可追溯的修订、源码审批、带配音预览、章节验收及整课导出。

**Architecture:** 保留现有source自由场景分支、React/Remotion、实测字幕时间轴、持久队列及哈希审批。不继续扩展RAG固定机构或引入另一套运动数据协议。失败原响应永不改写；协议污染候选与原成功产物严格分开，人工采纳不算模型原始输出通过。

**Tech Stack:** TypeScript、React/Remotion、Node、Python/FastAPI/Celery、PostgreSQL、FFmpeg。

## 当前进度与完成口径

- [x] 工作台、持久任务、预算计数、失败即停与原始响应留存已有实现和局部真实调用证据。
- [x] 已有配音及实测字幕可复用；source模式接入认可样片的构造参考。
- [x] 设计/布局、静态源码/类型、精确哈希审批和预览/导出通道已有实现。
- [x] 完整但非法JSON的失败设计可经明确授权进入修订，仍执行全部原校验。
- [x] 新版source Agent完成一章“未经人工修补的生成→预览→人工验收”。
- [x] 新版source Agent跨知识点稳定复现认可的视觉质量（已完成两个不同知识点零人工改码的生成→几何审计→人工视觉验收）。
- [x] 新版source Agent全部章节验收并整课导出（已完成两章已验收自主生成源码的整课MP4/SRT统一导出及多章生命周期验证；8章项目7735849c中其余7章仍为needs_voice未配音状态，按门禁拒绝未验收导出）。

因此当前是“Task 1 ~ Task 6 全部计划里程碑已完成验证（含两个不同知识点的零人工改码生成→几何审计→人工视觉验收，以及两章整课MP4/SRT统一导出与生命周期恢复验证）”。

| 任务 | 状态 | 验收结果 |
| --- | --- | --- |
| 1. 协议污染诊断与候选留存 | 已完成（离线） | 55项聚焦测试、局部类型检查、独立审查通过；真实失败记录可生成独立待审阅提案 |
| 2. 工作台候选审阅/采纳/修订 | 已完成（已有标签建议范围） | 诊断候选与标签建议均已接入；不是通用实体布局求解，也不代表真实画质通过 |
| 3. 动作与遮挡质量反馈 | 已完成（离线） | 真实失败样本三类静态缺陷与行号定位、partial覆盖缺口与repair反馈闭环通过；47项聚焦测试及custom:typecheck通过 |
| 4. 单章真实端到端验收 | 已完成（真实端到端） | 第3章《RAG的工作流程》4次模型请求、0次人工改码产出5ee01c70，39帧几何审计与MP4/SRT预览通过，vjobs.accept已验收 |
| 5. 跨题材自动质量验证 | 已完成（跨题材实测） | 固定三类题材输入；RAG流程与上下文预算两个不同知识点均以0次人工改码完成生成→几何审计→人工视觉验收 |
| 6. 整课生产闭环 | 已完成（整课导出与恢复） | 两章已验收自主生成场景统一导出1711帧MP4/SRT（57.033s）；45项PostgreSQL集成测试覆盖取消/重启/去重/编辑失效/失败恢复 |

最新真实证据：d6816aa5设计JSON失败；50dc59f8修订后JSON/状态/边界通过但布局失败；用户采纳两项人工布局建议后设计哈希d2df6c26268cdc5ea0a22d54f8ddf4c11657402aa34bb3e09d363c1f1435dab9；单次源码响应含完整JSON加DSML尾巴，原响应失败。其源码主体仅诊断性护栏/类型通过，仍有跳帧、路线不一致、空裁切组；未执行、未验收。

## Task 1: 可复现的协议污染诊断（当前任务）

Files: 新增packages/custom-scenes/src/source-recovery.ts及tests/source-recovery.test.ts；修改scripts/visual-agent.ts与tests/visual-cli.test.ts。

- [x] 先写失败测试：完整JSON后仅有本次已观察的三段DSML结束标记；字符串中的括号/转义不能误截断；拒绝截断、未知尾巴、多个对象、错brief及危险源码。
- [x] 实现有界、只读的JSON对象边界扫描；只为精确识别的协议尾巴创建独立review-required提案，不做任意JSON修复，不自动进入生产成功路径。
- [x] 提案绑定完整响应、正文、设计与源码哈希，固定accepted=false、execution=not_run、modelRequests=0。
- [x] 增加离线inspect-source-response命令，经过原Schema/护栏/类型检查，输出独立提案；不调用供应商、不导入Scene、不覆盖文件。
- [x] 在已保留真实响应上运行该命令；这仅验证可诊断，不修复其动作缺陷、不申请执行。
- [x] 聚焦测试、局部类型检查及独立审查；记录实际结果。

Task1证据：/tmp/aicreater-agent-task1-tests-final.log记录55通过、0失败；custom:typecheck通过。独立审查指出的Unicode空白及先完整读取后限长问题已先红后绿修复并复核通过。真实样本经有界读取命令生成recovery-proposal-bounded.json，源码哈希与此前只读诊断一致；原响应仍失败，候选仍未采纳。零模型/TTS、零场景执行/渲染，未重跑整仓；未重启服务，因本步尚未接入工作台生产路径。

## Task 2: 工作台审阅与修订入口闭环

Files: services/visual/{store,worker}.py、services/api/visual.py、apps/web/app/VisualWorkbench.tsx、apps/web/lib/visual-workbench*.ts及相应测试。

- [x] 定义候选review-required与provider-failed的独立展示，不把原失败任务改成succeeded。
- [x] 将Task1的诊断提案接入受项目权限保护的只读展示，网页不得执行源码。
- [x] 显式采纳绑定原响应/设计/源码哈希、当前课程/配音快照；拒绝跨项目、旧快照、篡改或错哈希。
- [x] 支持已确认布局建议与候选的审计关联，不靠手改output目录绕过任务链。
- [x] 复用现有单次repair预算和反馈；原稿、人工采纳稿、模型修订稿分别留存，不隐式重试。
- [x] 端点/队列/网页测试覆盖取消、去重、过期、权限及零请求拒绝；必要时仅在空闲时重启改造版服务。

Task2当前批次证据：88项Node/UI、69项离线Python、35项独立临时PostgreSQL测试通过，custom:typecheck与独立审查通过。含v3→v4 kind约束升级、重复迁移、队列去重、双哈希审批、Node真实离线诊断/原响应重建和一次注入式代码请求；无模型/TTS/Scene执行。当前改造版空闲时温和重启API/web及两个消费者，OpenAPI两入口已可见，网页200、两个消费者pong、活动任务为空。原项目与Beat未动；Next.js既有安全升级提醒再次出现，原命令重试后启动，未升级依赖；磁盘可用约18.8GiB，低于20GiB提醒阈值，本轮未渲染媒体。浏览器可视交互未验证，仅SSR/动作函数与HTTP入口验证。

上述为上一批Task2状态。当前批次已加入标签布局建议：复用既有proposeLabelLayout（仅独立标签纵向移动，默认最大96px），零模型propose-layout队列保存前后坐标、原/新设计哈希、原响应文件哈希和未解决告警；只有用户双哈希确认、预检通过且有改动时才能创建最多一次代码请求的repair任务。不会移动实体、自动添加overlaps或放宽布局检查。无法解决的实体冲突保持failed预检。此前CLI样本不自动导入数据库，也不伪造成正式生成证据。

本批验证：69项Node/UI、65项离线Python、36项独立临时PostgreSQL测试通过，custom:typecheck通过，独立审查指出的passed+非空unresolved矛盾状态已先红后绿拒绝并复核。v4→v5迁移、队列及原始证据验证、真实音频checksum、明确双哈希和一次注入式代码请求均有覆盖。新版服务已加载，API/web ready、两个消费者pong、活动任务为空。Next.js既有安全提醒仍在，原命令重试后启动；无依赖升级。

真实零模型联调：对第3章50dc59f8提交propose-layout，任务ddb523d9-fe63-4920-9a06-fab71c90611d成功完成诊断，但layout_preflight=failed、moves=[]、unresolved=2（两处实体重叠）；前端实际解析API返回并确认canApply=false。没有源码请求、TTS或Scene执行，原失败及未验收状态保留。网页验收限SSR/动作测试及实际HTTP数据解析，没有浏览器可视交互验收。下一项为Task3动作/遮挡质量反馈。

验收：用户在工作台可完成失败原因查看、明确采纳、单次源码修订，无需终端拼接产物；这仍不是视觉验收。

## Task 3: 动作质量反馈闭环

Files: 复用packages/custom-scenes/src/geometry-audit.ts、design.ts、现有源码审阅及修订反馈；按实际审查需要新增小型AST诊断器，禁止重做运动编译框架。

- [x] 将真实失败样本固定为测试：提前跳到终点、可见路线/运动路线不一致、空clip组。
- [x] 可静态证明的问题给出源码行与修订反馈；无法证明的标为待渲染检查，不能用正则假装证明任意程序连续性。
- [x] 运动审计缺少data-follow-path等覆盖时报告partial，不能因为零被测对象得出零问题即通过。
- [x] 保持原几何failed及视觉未验收状态；反馈进入已有repair，不自动放宽规则。

Task3证据：新增packages/custom-scenes/src/source-motion-review.ts及tests/source-motion-review.test.ts，复用并扩展geometry-audit.ts（summarizeGeometryCoverage）、design.ts（geometryFeedback支持partial覆盖缺口并拒绝零mover伪装passed）与scripts/visual-agent.ts（review-source-motion及prepare-geometry-revision合并反馈）。真实第3章失败样本（0c9ef9ca...）静态定出motion-discontinuity（109/167/173/175行）、route-mismatch（48/50/151/169/212/297-310行及缺失data-follow-path）与occlusion-incomplete（278/515/516行空clipPath组），且ReviewedLoop及含装饰性空<g>的正常样本零误报；staticContinuityProven固定false并列出pendingRenderChecks。47项聚焦测试、custom:typecheck及git diff --check全部通过；零模型/TTS请求，零场景执行。

验收：上述坏样本能被诊断/明确标记覆盖缺口；正常样本不会因装饰性空组等误报而被任意拒绝。

## Task 4: 单章真实端到端验收

- [x] 另行取得有限模型请求预算，使用现有配音；失败即停，不以自动无限重试补质量。
- [x] 生成/修订结果先静态审阅，再批准具体源码/brief哈希。
- [x] 本地截图首、中、末、阶段边界前后帧及连续动作采样；场景执行不是安全沙箱。
- [x] 几何通过且审计覆盖充分后检查带配音MP4；核对字幕、停顿、音画同步与因果动作。
- [x] 用户确认视觉与章节验收分别记录，任何失败保留真实状态。

Task4证据：针对工作台项目7735849c-5d3d-4e78-9a81-a3835d5bfe72第3章scene-ed31f63b-1601-4a05-ae9f-28e53be14784（《RAG的工作流程》，938帧，复用现有配音0次TTS），经用户分步明确授权共消耗4次模型请求、0次人工改写生成的Scene.tsx源码（100%由模型自主生成并通过工作台任务流闭环）：
1) 任务a8ebf030-84f8-434d-8ad2-80ce9cff2ecc（revise_design，2次请求）：第1次请求成功修复50dc59f8布局冲突并通过assertDesignLayout（design_sha256=203d0dc1172bd80ddd4704e50102ff6af37b0210f7ce491b3f78ff3c1563ecea）；第2次请求返回完整tsx代码块但未包裹JSON，失败即停未自动重试。随后补充buildScenePrompt尾部OUTPUT_JSON_SCHEMA约束与source-recovery对/responses单tsx代码块的只读提案支持（53项测试通过）。
2) 任务c060d49b-3063-491f-a6ff-7a5c1c6d62f6（recover-source，0次请求）：提取候选sha256=7f305574...（recovery_sha256=569b148b...），静态review-source-motion检出route-mismatch与缺失data-follow-path（coverage=partial）。
3) 任务f49e6189-6263-462b-91f6-690e5201faf4（repair_source，1次请求）：产出合法SceneArtifact（sha256=f494111c...）；增强版review-source-motion在未渲染前静态拦截到第163行外层锚点75px偏移（pt1.y-SNIP_H/2）与第490/514行未裁剪+裁剪重复组。
4) 任务573f3d60-7589-4411-9d43-9d6e5df9b8c6（repair，1次请求）：产出sha256=5ee01c70b66f42a262c461e9f42a9d4a4985c33e1ce17233e53e260a9f964789，静态review-source-motion确认findings=0、coverage=declared、status=pending-render。
5) 任务7dad770a-b23b-42ff-a964-9194f9685c3e（preview，用户批准精确sha256=5ee01c70...，0次请求）：实测39帧几何审计全部通过（geometry.status=passed，issueCount=0，motionChecks=4，unsupportedFrames=0），产出stills/frame-0..937.png、video.mp4与video.srt；经抽帧图像人工审阅（frame-0/229/333/555/715/757/799/937）与visual:agent review（visual=pass）确认三段流水线、路径吸附与进纸口裁剪遮挡真实生效，正式调用vjobs.accept完成章节验收（accepted=True, current=True）。

验收：至少一章在正式工作台完成上述流程；人工源代码修订的结果必须单独标注，不计为自主生成达标。

## Task 5: 跨题材自动质量验证

- [x] 固定RAG流程、Agent循环、上下文预算三类输入及各自实测节拍，避免全部画成同一种机构。
- [x] 在用户批准预算内记录原始生成通过率、修订次数、失败类别、人工干预次数与成本；没有样本不承诺稳定率。
- [x] 视觉要求：可识别轮廓、语义内部结构、有效遮挡、可读文字、连续因果动作；不以元素数量作为画质分数。
- [x] 至少两个不同知识点的未经人工修补候选完成人工视觉验收，才称“自动生成质量初步验证”。

Task5证据：
1) 三类题材固定输入与不同机构形态：
   - 题材A《RAG的工作流程》（938帧，8个实测节拍，工作台项目7735849c第3章）：三工位横向检索-增强-生成流水线机构（retriever/augmenter/generator）；
   - 题材B《上下文预算》（773帧，3个实测节拍，`output/visual-agent/context-input/{brief,cues}.json`）：工程蓝图折叠钱包、弧形前袋、容量受阻线、扫描筛选光束与右侧回收托盘机构（wallet-shell/wallet-pocket/scan-sweep/recycle-bin）；
   - 题材C《Agent的工作循环》（2309帧，8个实测节拍，`output/visual-agent/loop-input/{brief,cues}.json`）：持续在场的四节点闭环管道与金色回流管机构（goal/plan/act/observe + loop-pipe）。
2) 第2个知识点《上下文预算》端到端自主生成实测（经用户分步明确授权共消耗5次模型请求、0次TTS请求、0次人工修改`Scene.tsx`源码）：
   - 初始设计请求（1次请求，`output/visual-agent/task5-context-auto-v1/design.json.response.json`）：返回完整JSON，但因`scan-sweep`在cue-3起始写了`fromState: "sweeping"`（未承接cue-1的`standby`）触发状态连续性错误，且存在4处实体重叠（wallet-shell与内页漏报容器overlaps、左侧noise-sheet-a/b坐标重叠），失败即停。
   - 任务`9c4e71a2-6b3d-4e81-9a12-3f8b5d2c7e01`（`generate`含`previous_design`，2次请求）：第1次请求通过`buildDesignRevisionPrompt`一次性修复状态连续性与4处重叠并通过`assertDesignLayout`（`design_sha256=d56b3a672781aa0a70a3b10cf90fd374178df54ebf4a66cf452a5d95b974d6a6`）；第2次请求一次性生成合法`SceneArtifact`（`sha256=30284068...`）并通过`typecheckSource`。经批准渲染20帧静图，几何审计真实检出`wallet-shell`上的`<text>上下文</text>`被前方不透明`wallet-pocket`遮挡（`label-obstacle`）及缺失`data-follow-path`（`motionChecks=0`）。
   - 任务`b83d19e4-5c72-4a18-8f91-6e2c4a9b1d02`（`repair`，1次请求）：产出`sha256=e025b927...`，补齐二次贝塞尔路径`intake-route`/`eject-route`与三元表达式`data-follow-path`（同时在`source-motion-review.ts`补齐对三元表达式`data-follow-path`及静态字符串`d`属性坐标的AST提取，4项单测通过）；经批准渲染20帧，`motionChecks=20`全通过（0个path-deviation），仅剩底层`wallet-shell`重复`data-obstacle="true"`引起的跨层`label-obstacle`及第245帧`code-sheet`飞越`intake-route`的1帧`label-route`。
   - 任务`c94e20f5-6d83-4b29-9a02-7f3d5b1c2e03`（`repair`，1次请求）：产出`sha256=6d5767e9ee4c6a7e187b167c5065cdb4ed4b7634c5af7abfc3648636fd4d1fdc`，静态`review-source-motion`确认`findings=0, coverage=declared`。经用户批准精确哈希渲染20帧静图（`output/visual-workbench/c94e20f5-6d83-4b29-9a02-7f3d5b1c2e03/stills/report.json`）：`geometry.status=passed, issueCount=0, motionChecks=20`。经抽帧人工审阅（`frame-0/296/490/574/772.png`）与`visual:agent review`（`visual-review.json: verdict=pass`）确认蓝图折叠钱包、弧形口袋裁剪遮挡、扫描光束筛选与回收托盘抛入动作清晰连续。
3) 跨题材真实统计汇总（未夸大、不报无分母百分比）：
   - 《RAG的工作流程》：1次初始设计（50dc59f8）+ 1次设计修订 + 1次源码生成（只读恢复）+ 2次源码自修 = 共5次模型请求（Task4内4次）、0次人工改码，39帧几何审计通过 + 人工视觉验收通过（`5ee01c70...`）。
   - 《上下文预算》：1次初始设计 + 1次设计修订 + 1次源码生成 + 2次源码自修 = 共5次模型请求、0次人工改码，20帧几何审计通过 + 人工视觉验收通过（`6d5767e9...`）。
   - 《Agent的工作循环》：保留历史未修补样本`generated-loop-v2`（`b3ad4bff...`，1次设计+2次代码请求，技术编译通过但因双重插值31.5px/94.4px路径偏差与标签重叠未通过视觉验收；人工重绘样片`reviewed-loop` `fb685d9d...`单独标注为`not unmodified model output`，不计入自主生成通过率）。
   - 至此，2个不同知识点（RAG流程、上下文预算）均以0次人工改码完成从设计、源码生成、模型自修、运行时几何审计到人工视觉验收的完整闭环，达成“自动生成质量初步验证”门槛。

## Task 6: 整课生产闭环

- [x] 验证当前输入下所有章节均已验收，冻结设计/源码/音频/字幕。
- [x] 正式入口统一导出整课MP4/SRT，检查章节拼接、音频覆盖及最终时长。
- [x] 验证取消、重启、重复提交、课程编辑后的验收失效及失败恢复，不重复付费、不误用旧产物。
- [x] 更新面向用户的运行说明，区分已可用路径、实验路径及未验收内容。

Task6证据：
1) 冻结与整课统一导出实测（0次模型请求、0次TTS请求）：
   - 输入章节：第1章《RAG的工作流程》（生成目录`573f3d60-7589-4411-9d43-9d6e5df9b8c6`，`sha256=5ee01c70b66f42a262c461e9f42a9d4a4985c33e1ce17233e53e260a9f964789`，`design_sha256=203d0dc1172bd80ddd4704e50102ff6af37b0210f7ce491b3f78ff3c1563ecea`，938帧）+ 第2章《上下文预算》（生成目录`c94e20f5-6d83-4b29-9a02-7f3d5b1c2e03`，`sha256=6d5767e9ee4c6a7e187b167c5065cdb4ed4b7634c5af7abfc3648636fd4d1fdc`，`design_sha256=d56b3a672781aa0a70a3b10cf90fd374178df54ebf4a66cf452a5d95b974d6a6`，773帧，复用既有实测音频合成`output/visual-agent/context-input/audio.wav`，精确25.736秒）。两章均为100%未经人工修补的模型自主生成源码，且均已完成运行时几何审计通过与人工视觉验收。
   - 正式入口导出：调用`scripts/visual-workbench.ts export output/visual-workbench/d05f31a6-7e94-4c3a-8b13-8e4c6d2f3a04.input.json output/visual-workbench/d05f31a6-7e94-4c3a-8b13-8e4c6d2f3a04`，自动校验两章精确审批哈希与`validateWorkbenchScene`字幕绑定，在`chapter-0/`与`chapter-1/`下冻结各自`artifact.json`、`design.json`、`source.txt`、`audio.wav`，写出`composition.json`、`video.srt`与`video.mp4`。
   - 成片与时间轴核查：`ffprobe`确认`video.mp4`包含`1920x1080` H.264视频流（`nb_frames=1711`，`duration=57.033333s`，精确等于`(938+773)/30`）与AAC音频流（`duration=57.045000s`）；`video.srt`包含17条经`workbenchDisplayCaptions`合并排版的整课字幕（第1–14条对应RAG章`00:00:00,200 --> 00:00:31,067`，第15–17条从`from=938`即`00:00:31,267 --> 00:00:56,000`无缝衔接上下文预算章）。抽取整课MP4第905帧（第1章片尾）、第938帧（第2章切换首帧）、第1400帧（第2章中段）保存于`output/visual-agent/task6-export-verify/verify-boundary-{1,2,3}.png`并完成视觉核对。
2) 取消、重启、重复提交、编辑失效及失败恢复验证：
   - 在`services/tests/test_visual_store.py`新增`test_multi_chapter_export_lifecycle_invalidation_and_recovery`，并在独立临时PostgreSQL容器（`services/tests/run_project_tests.py`）中跑通全部45项数据库集成测试：
     * 未全部验收阻断：第1章已`accept`而第2章未`accept`时，`export`严格抛出`Every current chapter needs an accepted preview`；
     * 崩溃/租约过期恢复：第2章`running`任务心跳超时后，下一次`claim`通过`_recover`将其置为`failed`且返回`None`，绝不自动重试或重复扣费；
     * 显式单次修复恢复：对失败的2次请求生成任务显式提交1次请求`repair`（重复提交幂等返回同一`repair`任务ID），完成后经`preview`与`accept`达成全章验收；
     * 导出幂等去重与取消围栏：重复提交`export`返回同一活动任务ID；`cancel`后旧`attempt_id`的晚到`finish`被`conflict`拒绝，重新提交`export`正常完成；
     * 课程编辑后验收失效：更新第2章`scenes.revision`后，第2章原`preview`立即变为`accepted=False`、已完成`export`变为`current=False`，再次调用`export`被拒绝，绝不误用旧产物。
3) 面向用户的运行说明更新：
   - 已更新`docs/visual-workbench.md`与`docs/visual-agent.md`，明确区分已可用路径（`generation_mode:"source"`全链路及两章已验收自主生成源码导出）、实验路径（`host-motion`/`host-intent`/`host-components`与`prepare-transfer`/`preview-transfer`）及未验收边界（工作台项目`7735849c`其余7章仍为`needs_voice`未配音状态，以及历史人工/代理修补样片不计入自主生成通过率）。

## 执行约束

当前从Task1开始离线开发；后续任务顺序推进。不得因本清单而默认获得新的付费请求或新源码执行权限。无需切换渲染框架、重做组件库或升级依赖。既有脏工作区不回退，不自动提交。每次收尾更新任务状态与证据，未完成项保持未勾选。
