# T8 显式实验后端

## 开启边界

`create_app(..., teaching_plan=True, teaching_provider=callback)`显式开启。默认False，不初始化新表、不替换旧visual路由，也不重启当前工作台。独立DeepSeek适配已实现，网络测试仍为MockTransport，不代表实际供应商验收。

开启但未配置provider时可查看任务，执行返回503且不占模型槽。公共`POST /run`仅向持久化planning队列提交；queued/running返回202，已有终态返回200且不虚报排队。模型仅由明确启用的workflow worker调用；同步`TeachingWorkbench.run`保留为开发辅助，不对HTTP暴露。

## 项目范围接口

前缀`/api/projects/{project_id}/teaching-tasks`：

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| POST | 空路径 | 从服务端章节生成快照；需要scene_id、expected_revision、幂等UUID、timing_mode、confirmed和max_requests=2；返回201 prepared，不派发模型 |
| GET | 空路径 | 最近50条根任务的安全摘要，no-store |
| GET | `/readiness` | 项目鉴权后的实验就绪状态；不启动服务、不派发请求 |
| GET | `/{teaching_id}` | 真实阶段、消息、额度和当前性；不返回原始响应或令牌 |
| POST | `/{teaching_id}/run` | 空JSON请求；沿用该根任务原确认及双槽，不新建收费任务 |
| POST | `/{teaching_id}/cancel` | 空JSON请求；停止新派发，已有数据保留 |

不接受客户端brief、source、SVG、坐标、运行时路径或附加预算。复用全局登录/项目所有权依赖，根ID还需匹配URL中的项目；跨项目返回404，未登录401。

## 快照与采用

`chapter_snapshot`复用原有draft_input/measured_input，支持估时画面和已有配音实测cue；绑定brief/cue、timing_mode、章节版本、媒体元数据及指纹。模型不生成口播或绝对时间。

准备时先做免费Node上下文校验。请求占位时统一先锁项目再锁根任务，并在同一事务中核对当前章节快照，防止检查后内容改变却新派发。已登记的在途请求可能在用户编辑后返回；响应保留，但实验工作台会将旧输入标为stale，不采用为当前结果。

根元数据没有替代实际音频文件校验。音轨和字幕装配仍未接入；无声视频状态由实际容器产物及摘要校验决定，`accepted`保持false，不把artifact缓存当成已生成视频。

## 状态反馈

- prepared：任务已准备，未派发模型。
- plan-queued：仅登记后台任务，尚未占用模型请求槽；等待超过两分钟且执行器心跳不可用时停止，健康但忙碌的执行器不会仅因排队时间被判失败。
- planning/revising：已有请求槽，等待相应结果，不重复派发。
- response-cached：响应已保存，等待宿主检查。
- revision-pending：程序已保存定向修订条件，尚未派发新请求。
- artifact-cached：画面数据已保存，不是视频完成。
- blocked：请求结果未知、已失败或程序检查未通过；保留数据、不追加调用。
- stale/cancelled：输入已经变化或任务取消，不继续派发。

can_run只针对当前可继续的阶段，不把未知结果提示成付费重试按钮。响应不包含prompt、snapshot、payload、dispatch_token、源码或内部文件路径。真实渲染及百分比还没有接入，不展示虚构进度。

## 删除保护与默认兼容

旧Store删除项目/章节时，仅在新表存在的情况下检查dispatched/unknown请求；这些状态仍可能返回，不能删除其收尾账本。迟到成功会先缓存响应再更新状态，结束后用户仍可按旧确认流程删除，级联清理数据。

unknown不等于供应商结束或退费；不自动清空它来放行删除。在真实供应商接入时仍需补齐请求收尾、取消回执及归档/结算策略。旧模式无新账本的项目照常读取和删除。

## 验证

本轮9项新API测试使用真实TestClient、临时PostgreSQL、真实Node编排及fake provider。覆盖准备/运行/刷新不多调用、默认关闭、登录和跨项目、严格预算与字段、章节过期、取消、缺执行器503、敏感响应不泄漏以及在途/未知状态删除保护。

相关Python回归54项通过，含原项目删除、归档章节及T7闭环。日志`/tmp/aicreater-teaching-workbench-final-tests.log`。独立只读复核指出的unknown删除保护缺口已先RED再修复并实测迟到响应路径。

未启用当前服务器实验flag，未迁移当前课程数据库，未调用模型/TTS，未运行渲染器。渲染队列/租约、真实传输适配和T9盲测仍未完成，T8不标整体完成。

## 独立前端

显式访问`/courses/<project-id>/teaching`，原默认工作台不变。实验未启用时显示不可用，不回退到自由源码。创建前确认根任务最多2次模型额度；使用sessionStorage保存输入版本对应的幂等键，模糊网络失败后不会自动重新创建或重发run。轮询仅GET；页面刷新不自动执行。

根任务base_revision是创建时项目版本，不是章节版本；展示与恢复以服务端current为准。异步run提交后可独立取消；响应缓存、未知结果、已停止和数据产物均不显示为视频完成。现有可播放视频仍在原工作台，未覆盖或删除。

## 实验渲染与媒体接口（2026-10-29）

- `POST /api/projects/{project_id}/teaching-tasks/{teaching_id}/render`只接受空JSON，从服务器冻结缓存入队，返回根任务真实状态。API不执行渲染，queued记录由独立worker领取；重复提交仍受原子claim保护，终态不重跑。不允许客户端提供输出路径、源码或额度。
- `GET/HEAD .../{teaching_id}/video`沿用项目账号鉴权，再验证根任务范围、成功记录、固定任务目录、文件及视频摘要；支持Range和`?download=true`。文件缺失或摘要不符会拒绝播放并反馈不可用，不返回内部路径。响应禁止缓存。
- 根任务合并render-queued/rendering/preview-ready/render-blocked，video_ready来自可用渲染产物；accepted仍false。取消或输入过期时不采用新结果，已有成功历史预览仍可按项目权限查看。
- 前端一次额度确认后串接计划和无声渲染；只有明确artifact-ready结果且can_render时才自动提交。刷新仅读取，失败不隐式重试。播放器先展示当前成功预览；当前失败则保留标明历史版本的旧预览。实测配音选项暂禁用，旧工作台不变。

独立worker已接入现有Celery render lane，由`AICREATER_TEACHING_RENDER_WORKER=1`显式启用，默认关闭。每次轮询先尝试领取旧visual/workflow任务，再尝试teaching；这是领取优先级，不承诺多worker全局串行互斥。PostgreSQL保管queued记录，worker重启后可继续领取；running/interrupted不重领。当前API默认teaching_plan=false，未替用户启用、启动worker或迁移当前课程。

可显式用`python -m services.visual.teaching_worker --once --public <媒体目录>`验证一次领取；DATABASE_URL必须已在进程环境中配置，命令不读取dotenv、不迁移数据库、不调用配音或模型。容器名称由渲染任务UUID确定，Docker label及本地execution.json记录同一身份，不含token或密钥。创建失败时不删除可能已存在的同名容器，归属不明保留interrupted围栏。

worker现会核销匹配执行nonce的最终cleanup.json凭据，自动把已确认收尾的interrupted登记为execution-cleaned并解除删除围栏；中断状态不变，不发布成片、不重跑。无凭据的SIGKILL孤儿容器主动收尾、音轨绑定及真实供应商仍未交付。详见`docs/teaching-render-queue.md`收尾凭据核销一节。

验证：13项API回归通过（临时PostgreSQL、替身provider/worker），覆盖范围、Range/HEAD/下载、损坏/缺失文件拒绝、重复提交与失败无重试。另显式启用一次真实API→后台→容器→鉴权媒体集成测试通过（计划provider仍为替身，零真实模型/TTS）；日志`/tmp/aicreater-teaching-media-api-final.log`、`/tmp/aicreater-teaching-real-media-api.log`。

前端298项Web回归及Web类型检查通过。独立Playwright context拦截API并使用已有真实MP4验证一次确认后三个POST、阶段轮询、1920x1080媒体解码、下载URL、刷新无POST、失败保留历史播放器及390px无横向溢出；这不是访问真实课程或真实模型。截图`/tmp/teaching-media-desktop.png`、`/tmp/teaching-media-mobile-history.png`。

本轮独立审阅子代理因额度限制未完成，不记审阅通过；已自行核对鉴权、媒体绑定、状态一致性和自动提交守卫。未据此标记T8或T9完成。

独立worker新增验证：队列/API共37项（35通过、2项显式容器用例跳过），Celery入口2项通过；另单独启用真实API入队→独立Python进程→容器→鉴权媒体用例通过，重启worker返回idle，不重新派发模型。24项容器命令/生命周期回归通过，含创建重名失败不得删除已有容器；custom:typecheck通过。日志`/tmp/aicreater-teaching-worker-tests.log`、`/tmp/aicreater-teaching-independent-worker-real.log`。计划仍用替身provider，零真实模型/TTS，不计新题盲测成功。

本轮只读复核发现的创建撞名清理风险已先复现再修复；另一轮复核未发现其他可确认问题。每轮旧任务领取优先不等于全局互斥，未引入跨所有渲染队列的全局调度锁。中断容器安全收尾仍明确未实现。

## 语义规划后台与准入（2026-10-29）

- 新`teaching_planning_jobs`以root为唯一键，API只提交；worker从冻结响应/计划/产物继续，成功后自动入渲染队列。跨阶段中断不重新派发已有模型请求；过期运行不会重领，取消会撤销规划准入，dispatched/unknown模型保护仍独立生效。
- `AICREATER_TEACHING_PLAN_WORKER=1`启用现有workflow lane的语义规划；`AICREATER_TEACHING_RENDER_WORKER=1`启用render lane。每轮先尝试旧任务领取，不改旧任务协议。
- 模型通过独立DeepSeek适配，单次HTTP、无重试/重定向、严格JSON对象及大小限制、固定脱敏错误。完整响应被本地缓存限制拒绝时记failed而非unknown，保留已用槽；外部结果未知及数据库收尾不确定仍保守保护。
- planning token/deadline与槽登记在同一事务验证，并在I/O前再验；失去所有权后不派发新请求。终态重复run返回真实状态，不虚报queued。超过两分钟未领取且所需worker/scheduler心跳不可用的规划和渲染明确停止，无后台隐式重试；健康但忙碌时继续排队，不把合法等待当基础设施失败。
- 显式工厂`services.api.app:create_teaching_app`要求独立worker/beat心跳及数据库/Redis/存储/本地镜像通过准入；缺失返回503，不占模型槽。默认`app`不变。心跳在Celery ready/init信号中启动独立线程，每10秒续租，数据库45秒过期；首次数据库故障可以后台重试，未成功登记前不视为就绪。没有使用忙碌solo不响应的ping做收费准入。
- 实验前端读取readiness，未就绪禁用新提交；规划/修订/渲染状态分开。当前生产入口未切换，没有邀请用户验收。

验证记录：66项队列/API/预算回归（64通过、2显式容器用例跳过），另2项取消/派发边界通过；26项纯离线provider/基础设施/基线检查通过；13项自有临时PG心跳测试及4项Celery接线测试通过；299项Web测试及Web类型检查通过。模拟HTTP→语义队列→真实容器→媒体的显式用例通过，但不算真实供应商或新题画质验收。日志`/tmp/teaching-background-all-final.log`、`/tmp/teaching-planning-cancellation-final.log`、`/tmp/teaching-pure-final.log`、`/tmp/teaching-health-wiring-final.log`、`/tmp/teaching-web-final.log`、`/tmp/teaching-semantic-queue-container.log`。零真实模型/TTS。完整任务状态见`docs/superpowers/plans/2026-10-29-teaching-agent-completion.md`。
