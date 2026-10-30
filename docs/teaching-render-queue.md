# 教学计划渲染队列（离线阶段）

## 本轮实现

- `TeachingRenders`以根任务为唯一键，将已校验的artifact缓存绑定及artifact哈希固定到PostgreSQL记录；重复提交返回同一记录，不另占模型额度。
- 原子领取返回唯一执行token，进程重启后读取queued/running/终态，不把running或interrupted重新领取。根任务取消会同事务结束未领取的queued记录；已启动进程仍保留围栏直到收尾。
- 宿主执行入口只调用仓库内`teaching-render-host.ts`，不执行模型源码；复用已有Remotion、免费布局恢复及原始DOM/媒体检查，不放宽阈值或删除对象/文字。
- 成功出口重新验证产物绑定、原计划/口播/cue不变、完整采样和逐帧覆盖、invalidLogs、媒体信息与MP4摘要；Python发布前检查任务当前性、输出路径、文件摘要及执行凭证。
- 发布UPDATE使用`clock_timestamp()`和state/token/deadline联合条件，防止事务等锁跨过截止时间后仍发布成功。
- 超时或宿主信号退出无法证明后代浏览器结束时记interrupted，不自动重试、不发布视频，项目/章节删除仍被阻止。普通失败保存failed状态，诊断文件不覆盖；公开状态不泄漏日志、路径、响应或token。

## 明确边界

这还不是工作台可用的生产渲染队列。没有接API、自动worker、播放/下载路由或现有课程，也没有迁移当前数据库。最初离线账本阶段未执行Chrome；后续容器验证单独记录如下。

目前只接无声draft产物，measured配音绑定明确拒绝，不能把无声草稿说成正式教学视频。`accepted`始终false。源码自由模式和默认模式均不变。

`interrupted`恢复的是状态，不是自动续渲染。下一阶段须复用容器执行器确认进程收尾、登记可安全清理/重新调度的检查点，再连接API和工作台。当前没有清除此围栏的用户按钮，不让用户手工改库或改坐标。

原本的显式本地桥接保留为开发工具；队列默认执行入口现已改为`teaching-render-isolated.ts`，不再隐式使用本地Chrome。容器能力与队列部署/工作台接入仍分别验收。

## 验证口径

PostgreSQL测试通过仓库自有临时Docker测试器执行，不访问当前课程DB。模型provider、渲染worker和视频字节在对应测试中为显式替身，用于验证并发、围栏、路径与收尾；它们不算实际视频、自然修复或盲测通过。

Node证据校验测试同样使用合成报告：覆盖缺文件、错产物绑定、逐帧缺测、无效日志、错误媒体信息、视频摘要不符、越界输出及恢复改变语义。没有凭合成证据登记实际视觉验收。

以上是初期离线阶段口径；后续容器验证记录见下。字幕/配音完整性、工作台实际进度/取消回执、视频播放下载、服务重启恢复与最终T9新题盲测仍待完成。

## 容器适配阶段（2026-10-29）

- 独立镜像`aicreater-teaching-renderer:local`，旧`aicreater-renderer:local`标签不变；仅显式构建，不自动拉取缺失镜像。新容器入口只接`/work/job/input.json`和`/work/job/render`，无host挂载、network none、cap-drop ALL、资源限额及非root用户。
- Dockerfile补ffprobe/ffmpeg，渲染器读取镜像内的Chrome路径；容器内重验冻结产物、回传后宿主再次验证完整报告和MP4摘要。宿主和镜像版本不一致直接拒绝，不回退本地或自由源码。
- 取消先stop保留文件，finally唯一rm；remove报错后通过准确名称查询确认是否已不存在，无法确认才保守中断。末次本地复制后仍检查取消，避免取消期间返回成功凭据。
- 教学失败时尝试受限回收`failure-evidence/render`和`isolation-failure.json`，缺失/符号链接/超限不进入成功输出；原始失败不变，不覆盖早前产物。
- 独立生命周期测试覆盖teaching和旧source的创建、运行、入站/末次本地复制取消、删除确认及诊断缺失/符号链接。真实4秒容器fixture需单独启用`RUN_TEACHING_ISOLATED_TEST=1`，不调用模型/TTS，不计盲测或生产验收。

容器实测：独立镜像ID `9ba591515b8b`，旧镜像ID仍为`7db9f235883e`。显式集成测试通过，产物`output/teaching-container-IR1qGj/job/render/round-0-default/preview.mp4`：1920x1080、30fps、H.264、120帧、4.000秒、无音轨，连续报告0失败/缺帧/覆盖冲突；宿主ffprobe复查一致，采样截图已查看。结束后无此次渲染容器遗留。日志`/tmp/aicreater-teaching-container-real.log`。

这是固定结构fixture的容器运行证明，不是新题生成能力或画质基准验收；没有把手工或测试数据算成模型自动成功。

根任务实测：额外启用临时PostgreSQL集成测试，使用替身计划provider，走真实编译/缓存、幂等入队、claim、Python隔离桥、Docker、回传复验和数据库发布。结果成功，累计请求槽仍为1，重复run没有再次渲染，`accepted=false`；67帧中文固定fixture、2.233333秒、1920x1080/30fps/H.264，宿主ffprobe及截图复查通过。证据目录`output/teaching-queue-container-98c38fc00d`，日志`/tmp/aicreater-teaching-real-queue-container.log`；临时DB已销毁，不涉及当前课程或真实供应商。

本阶段回归：36项Node测试通过、2项默认跳过（需显式真实隔离开关），20项Python渲染队列/适配测试通过，另两次显式真实容器集成测试通过，局部类型检查通过。日志`/tmp/aicreater-teaching-isolated-final-unit.log`、`/tmp/aicreater-teaching-isolated-python-tests.log`及上述实际渲染日志。独立审阅发现的最后复制取消窗口已先RED复现再加检查并回归；复核无剩余P1/P2。

容器阶段之后，实验API入队、独立worker、鉴权播放与工作台视频状态已接入，新增验证见`docs/teaching-workbench-backend.md`末节。API不再使用进程内后台渲染。Celery render lane需显式开启teaching开关，默认关闭；queued可跨worker重启领取，运行结果未知的不重跑。任务UUID绑定容器名、label及execution.json，创建归属不明时不清理同名容器。安全重启收尾、配音/字幕和整课导出仍未交付；未标记T8或T9完成。

## 本轮验证记录（2026-10-29）

- 相关Python整组回归53项通过，覆盖根预算/宿主编排/API/删除兼容及本轮渲染队列；另2项发布边界（错误token/越界路径、执行中修改输入）补测通过。日志分别为`/tmp/aicreater-teaching-render-final-tests.log`和`/tmp/aicreater-teaching-render-publish-final.log`。
- 信号退出的章节删除测试复核时发现只有一章会先触发“至少保留一章”，已增加第二章、使用最新项目版本，并断言命中teaching守卫；独立复测通过，日志`/tmp/aicreater-teaching-render-signal-final.log`。
- 13项Node渲染策略/恢复/结果凭据测试通过，`npm run custom:typecheck`通过。
- 独立只读审阅发现的等锁跨deadline、queued取消不收尾、信号退出误作普通失败均先实测失败，再修改并验证。零真实模型/TTS，零新Chrome/MP4执行；fake worker产物不能记为视觉验收。

## 收尾凭据核销（2026-10-29）

- teaching执行器使用Docker create返回的完整不可变容器ID执行cp/start/inspect/stop/rm；名称不再用于删除。返回ID无效或创建归属不明时保留cleanup-unconfirmed，不操作可能存在的同名容器。
- execution.json新增每次执行的随机nonce。最终容器ID及准确名称均查无记录、所有任务目录写入结束后，才以wx写入cleanup.json；凭据包含相同jobId/name/nonce、容器ID和absent状态。容器不能向宿主任务根目录写凭据。
- scratch清理异常不再跳过容器存活确认或覆盖cleanup-unconfirmed；若容器已确认不存在但scratch清理失败，则保留凭据并报告普通失败，不把视频显示为成功。
- worker自动核销已中断任务：严格读取不超过4KB的普通JSON文件，拒绝符号链接、错任务/nonce/名称、缺失或无效凭据。项目→根任务→渲染记录按同一锁顺序核验，只有interrupted可登记execution-cleaned。保留interrupted状态、原始失败文件、accepted=false及video_ready=false，不重渲染、不重占请求额度。
- 删除守卫只对已登记execution-cleaned的interrupted记录解除；其他queued/running/interrupted及模型dispatched/unknown守卫保持不变。迟到发布仍因state/token/deadline围栏被拒绝，核销不是验收。

该检查点的边界：当时仅覆盖“执行器已经确认收尾，但数据库未记录”的自动恢复。后续新增的有归属孤儿容器清理见下节；未知归属仍保守阻止删除，未启用当前课程、当前服务或新默认模式。

验证：Python队列/API/worker整组42项（40通过、2项显式容器用例跳过），另3项最终定向验证通过，包含真实API→独立worker→Docker→媒体读取→模拟发布丢失→新worker核销、并发核销及迟到发布拒绝、坏凭据拒绝；30项Node隔离/生命周期/凭据回归通过，custom:typecheck通过。日志`/tmp/teaching-cleanup-python-green.log`、`/tmp/teaching-cleanup-verification-final.log`、`/tmp/teaching-cleanup-node-final.log`及`/tmp/teaching-cleanup-types-final.log`。独立审阅发现的scratch异常覆盖清理分类问题已修复并复核关闭。使用临时数据库及替身计划provider，零真实模型/TTS，不计画质验收或盲测成功。

## 有归属孤儿容器与语义修订

后续实现将宿主进程组、随机标识与容器标签绑定，只有确认宿主组已消失且实际存在、身份完整匹配的容器才允许主动清理。最初就查不到容器、缺少身份或 Docker 不可达的情况仍不解除围栏。真实 Docker 孤儿容器用例已通过；具体契约见 `docs/teaching-execution-ownership.md`。本轮新增实现尚无完成的独立审阅，不沿用上节历史审阅结论。

完整免费布局变体耗尽后，可将支持的文字排布诊断送入原根任务唯一剩余修订槽；不另开预算、不改生成源码。旧失败证据和新冻结产物分开存储。具体契约及合成诊断验证局限见 `docs/teaching-render-revision.md`。
