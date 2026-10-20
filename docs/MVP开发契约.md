# AI 动态知识视频平台：MVP 开发契约

状态：云端文案→配音→原生时间戳→视频已跑通；编程代码教学与 AI 流程教学样例已实现。已有 PostgreSQL 项目仓库、CLI 编辑、失效保护与不可变快照；HTTP 编辑及显式候选接受已实现；持久化任务/attempt、重生成/首次教学分镜/单场景配音/不可变版本渲染Worker、Celery/Redis调度、任务HTTP与MP4/SRT下载已实现；Next.js本地教学编辑器首版已接入，私有RustFS/S3兼容存储已接入，真实双队列教学渲染、缓存丢失恢复、匿名拒绝及容器重建持久化通过；两份完整课程已真实生成、配音、导出并获用户画面反馈确认，Python的nums读音按用户要求延期；20组和人工量化同步/预算验收尚未完成。当前后续核对见《mvp-follow-up.md》。本文细化《AI动态知识视频平台-技术架构》，冲突时以本文的首版约束为准。

## 1. 已确认范围与落地选择

首版单用户、本地部署，保留 Next.js + FastAPI + Remotion。产品必须偏向编程语言与 AI 教学，不以通用宣传短片代替教学验收。先实现文案驱动、7 类图解（视觉B后增加第8类用户确认数据图）、中文配音和字幕、在线预览、MP4/SRT 导出、单场景编辑和重生成。

三种落地方式：
- 推荐：保留完整技术路线，按垂直闭环逐步实现，先贯通手写 DSL，再接 AI 与编辑器。降低联调风险，也保留后续扩展空间。
- 仅做 Node 单体：部署少，但偏离既定 Python 工作流路线，暂不采用。
- 同时做两种生成模式和 8 类模板（初期方案，现视觉B仅增加用户确认数据图，仍不增加生成模式）：覆盖广，但内容核验、图解质量、编辑一致性同时成为风险，暂不采用。

首版不做主题研究生成、多租户、任意拖拽、多轨剪辑、AI 自由生成动画代码、跨场景转场、局部视频缓存、自动视觉模型修复。首版不声称具备技术事实自动核验能力。

模板固定为 `title_reveal`、`card_sequence`、`flow_diagram`、`code_walkthrough`、`comparison_panel`、`state_diagram`、`execution_timeline`、`data_chart`。data_chart新增于视觉B，仅显式手工确认数字，不开放模型编造或覆盖。首批教学验收覆盖 Python 循环累加和 RAG 的问题→检索→上下文→模型→答案及无可靠依据分支。单场景最多 6 个元素；全片最多 20 场景、5 分钟。输入最多 4,000 个 Unicode 码点。当前用户确认时长由内容决定，以讲解清楚为前提，通常 2–3 分钟，实际最长 5 分钟；不靠慢放、重复或扩写短稿凑时长。初期短案例时长不再作为课程目标。超限明确拒绝，不静默截断。

后续开发按完整课程→教学组件→分镜确认/表单推进。第一阶段已新增 examples/lessons/full/ 的Python循环和RAG完整文稿及核查点，共享分镜提示按教学动作切分、分开取值/累加cue、保留答案适用条件；原稿/协议/单场景重生成兼容。当时先完成离线验证；后续已真实生成并交付两份完整课程，RAG末字幕/开场及Python末字幕/开场修正获用户确认，nums读音仍延期；不承诺模型自动遵守全部语义。第二阶段已实现对比面板、数组/对象/栈状态图及执行时间线；第三阶段现已实现浏览器会话内配音前确认、时长显示及步骤/代码高亮/变量/输出表单；高级JSON保留。comparison_panel沿用elements/cue，2/4/6项依次表示左/右标题、说明、结果，不接受孤立奇数项或代码/edges。固定安全区布局和既有动画，模型提示/草稿/最终校验/编辑导出均接入。手写本地say样例与真实API/队列编辑导出通过，不把它视为完整长课或真实模型验收。当前模板版本为teaching:4，本机常驻服务已一致更新；旧项目和导出保留，旧teaching:1/2/3快照受版本保护不能在新runtime直接重渲染，需新建快照而非修改原档案。

state_diagram仅此模板允许structure={kind:array|object|stack,name}及步骤items/active_item_ids。完整快照最多6项、字段key最长12码点/value最长16码点，纯文本不执行；数组/栈索引连续，对象字段与item.id唯一，高亮必须指向当前项。空结构合法；栈列表底→顶、最后项标TOP，任意seek按帧重建，不积累操作。共享Node/Python校验、草稿/候选/配音字段保留、JSON步骤编辑、预览和导出已接入。903帧/30.1秒本地say样例及真实HTTP编辑→冻结→队列导出/下载SHA验证通过；不声称完整课程或真实分镜/字词同步通过。本机macOS prefork初始化失败后，默认单槽Celery使用solo池；耗时任务仍在现有受限子进程中执行，无额外收费调用。状态图不支持嵌套、链表、树或代码执行。

execution_timeline仅此模板允许timeline={duration_ms,lanes}及步骤event={lane_id,start_ms,end_ms,phase:execute|wait}。最多3条唯一任务轨道、6事件；整数区间0≤start<end≤duration_ms，duration_ms为1–3,600,000的示意轴。同轨半开区间不重叠、跨轨可重叠，无事件轨道拒绝。按cue揭示、任意seek直接重建，示意毫秒与配音时长独立；短事件用执行/等待不同标记，准确区间在步骤区显示。模型仅在原稿给出明确时间与假设时选择，不编造实测/加速比，不声称异步就是CPU并行。草稿、候选、配音、JSON编辑、预览及导出字段均接通。本地say串行/异步样例约21.2秒；真实HTTP编辑、不可变新快照、双队列/RustFS导出及MP4/SRT下载SHA验证通过，最终交付output/timeline-demo-qa/workbench-v3.mp4。重复相同revision/profile冻结会复用旧结果，修复后以明确标签修改产生新版本/任务，未改原快照；零计费，不视为完整长课或真实模型/字词同步验收。

分镜复核仅为工作台会话内人工操作，绑定scene ID/revision；编辑撤销，重载/切换项目清空，不能宣称服务端强制或持久人审。单场景配音与对应voice重试先复核、无未保存修改，仍须计费弹窗，不自动调用。ready使用实际帧数，待配音中文按非空白码点200–300/分钟粗估、已知场景加留白；示意毫秒不计入视频时长，超5分钟只警告，最终实际配音限制不变。步骤表单定点更新、保留cue/ID/专用字段；代码可选择行号、增删最多3变量及输出，高级JSON同源、非法输入保留并阻止切换/保存，后端schema与版本/失效保护不变。未改API/数据库/模板，不新增计费。浏览器验收发现自有旧Python样例重排遗留，已恢复第二次循环→打印顺序并新冻结导出output/forms-qa/python-correct-order.mp4，旧档案保留。

## 2. 部署与安全边界

开发服务默认仅绑定 127.0.0.1，Docker 对宿主机的业务端口也仅绑定回环地址。Celery、数据库、对象存储和 renderer 不对公网发布。MVP 不提供用户注册或登录；禁止直接把无鉴权实例暴露公网。将来对外部署必须先增加鉴权、项目归属和资产授权。

首版本地浏览器3000直连回环API8000，不增加转发层；修改请求只接受JSON，检查Origin，并拒绝非预期Host。只允许已配置的本地3000/8000来源，不使用通配CORS。对外部署时再统一同源入口并增加鉴权，不能直接开放当前无鉴权服务。

LLM、TTS 密钥只在后端环境中；不进入 DSL、前端、日志或导出快照。初期不接受用户提供的远程资产 URL。字体使用随项目打包且许可明确的本地文件；音频只能引用平台生成的资产。资产路径由 storage_key 解析，不接受任意路径；拒绝路径穿越。

签名下载地址按请求生成，禁止写入快照。渲染器只接收内部请求，持有只读资源权限；无工作流密钥，不执行用户或 LLM 提供的 JS。对实际产物检查 MIME、大小及媒体信息；音频资产上限 50 MiB。每次任务限制场景数、输出时长、重试数和总超时，防止无限调用。

## 3. DSL v1：最终可渲染契约

JSON Schema 是协议唯一来源，TypeScript 类型和 Python 验证必须匹配它。根对象和嵌套对象均拒绝未知字段；版本固定 `1.0`。不接受未来版本，不自动猜测字段。

根字段：
- `schema_version`: 字符串 `1.0`。
- `video_config`: 固定 width=1920、height=1080、fps=30、language=`zh-CN`。
- `theme`: 固定包ID而非内联主题对象。保留`tech_explainer`旧配色，新增`tech_multicolor`/`light_teaching`/`color_infographic`。所选ID和主题包版本随项目快照冻结，未知ID拒绝；不按当前UI选择重绘旧快照。
- `assets`: 数组，每项包含 `id`、`type=audio`、`storage_key`、`checksum`、`duration_ms`。checksum 为文件内容的 SHA-256。资产 ID 全片唯一。
- `scenes`: 非空数组，数组顺序就是播放顺序，不另存可冲突的 `order`。

场景字段：
- `id`: 全片唯一的稳定字符串 ID。
- `type`: 上述八种模板之一。
- `narration`: `text`、`audio_asset_id`、`audio_start_frame`。text 必须非空，音频引用必须存在。
- `duration_frames`: 正整数。
- `elements`: 数组，每项`id`、`content`、`cue`；可选`role:"topic"`仅标题/卡片且每场景最多1个，不能带代码/变量/输出/状态/事件结构。它声明中性主题而非待揭示答案，语义需人审；普通元素不猜主题。元素ID唯一，布局由模板决定，无自由坐标。教学图文仅title_reveal/card_sequence/flow_diagram/comparison_panel允许可选icon白名单、step(1–9)、highlight(content Unicode码点区间)、source_label(≤12可见码点且原口播字面包含)、panel_style:"conclusion"。结论不能与topic组合，保持原cue；来源只是稿中所述来源，不等于独立检索核实。
- `chart`: 仅data_chart必填，kind=bar|line|proportion|matrix、title(≤24码点)、unit(≤8)、source_note(≤32)、confirmed:true、data[{element_id,label(≤8),values:number[]}]，matrix另需columns(1–6唯一标签)。1–6行按elements同序完整一一引用，单系列每行1值，line至少2点；matrix值数等于列数。值为有限非bool数字0–10亿，proportion总量须正数。拒绝未知/不可见/空白字段、负值、多系列、缺失与重复引用，数据未经确认不画图。原值不拆数字或静默取整，百分比明确两位四舍五入，轴刻度可格式化为4有效位，过宽值报布局错误。冻结完整数据尺度；bar/line按原cue入场，line不平滑或补点，matrix逐行显示原值与固定色阶，proportion整体在所有绑定cue入场完成后显示，不能提前给出全局百分比。
- `edges`: 仅 flow_diagram 必填，其余模板禁止。每条包含 `from`、`to`，引用同场景元素；首版仅支持无环流程，不支持自环、重复边及环。
- `animations`: 数组，每项 `target`、`effect=fade_slide`、`start_frame`、`duration_frames`。首版每元素一个入场动画，无出场、强调或重叠动画。
- `captions`: 数组，每项 `text`、`start_frame`、`end_frame`。
- `code`: 仅 code_walkthrough 必填，含 language（python/javascript/typescript）和 source；仅按纯文本显示，不执行。最多16行、每行48显示单位（ASCII=1、其余=2），禁止制表符与不可见控制字符，旧代码正文32px。可选array_name（1–8可见码点）启用视觉C同屏布局、代码30px，不填保持旧布局；原快照/课程不自动升级。
- 代码步骤含code_lines（1-based）、variables（最多3个name/value教学快照）、output（最多44码点）。旧步骤标题≤32码点。新同屏布局每步必含array_items（最多6个{id,key,value}，ID唯一、key从0连续、value≤8码点）、pointers（最多2个{name,item_id}，name≤6且唯一、仅引用当前项）、loop（null或{current,total}，整数1≤current≤total≤100万）、input（≤44码点）；变量名≤6/值≤8、标题≤20码点。空数组/无指针/无循环分别用[]/[]/null，指针清除不隐式清变量。数字/短列表不拆位、完整中文换行，不能截断或编造结果。新布局数值26–36px，索引/变量名等辅助标记20–24px；配合字幕保留可读性。cue与动画严格递增，随机seek直接选择整步当前快照，不泄露后续结果；所有值未经过代码执行或自动事实核实。四字段不得混入旧布局/其他模板，只有CodeState模式合法。

模板限制：title_reveal 恰好一个元素、标题最多 30 字符；card_sequence 与 flow_diagram 为 1–6 元素，每个标签最多 40 字符。固定网格、安全边距 80 px，字幕占底部 180 px。画面文字至少 32 px；字幕至少 40 px。无法排入指定区域时返回布局错误，不继续缩小字号。

`cue={text_start,text_end}` 使用 Python 字符串/Unicode 码点计数的半开区间，指向当前场景 narration.text。重复关键词通过区间而不是字符串搜索定位。前端必须按码点转换索引，不能直接使用 UTF-16 下标。必须满足 0 <= text_start < text_end <= 文稿码点长度；至少包含一个非空白字符。

data_chart不由模型生成或重生成；raw响应/恢复/候选创建/提交重生成/晚到首次分镜发布均阻止chart或替换既有chart，手工已确认字段由草稿/配音/timing保留。

AI 中间输出只包含场景类型、口播、元素和 cue，以及流程边或受限的教学代码/状态；不允许生成资产地址、最终时长、字幕帧号或动画帧号。最终 DSL 由程序结合配音和对齐结果组装。无音频的草稿不是可渲染 DSL。

结构验证之后执行语义验证：唯一 ID、资源存在、边和动画目标存在、cue 合法、事件区间、模板限制、媒体时长一致性。跨引用不能只依赖 JSON Schema。

## 4. 音频、字幕与动画时间规则

先保存最终场景文本，再调用 TTS。服务适配器返回音频文件与时长；若能返回可核对到原文的短语时间戳则直接使用，否则交给独立对齐适配器。首轮技术验证须选定一个实际中文 TTS/对齐组合，禁止把模拟数据当真实对齐验收通过。

对齐内部格式：`text_start`、`text_end`、`start_ms`、`end_ms`，使用相同码点区间。区间按文本与时间递增，无时间倒退、无原文篡改；除空白与标点外的原文字符必须有覆盖。毫秒范围在真实音频内。

- 首尾留白各 6 帧，audio_start_frame=6。
- duration_frames = 6 + ceil(duration_ms * 30 / 1000) + 6。
- 字幕开始使用 floor(start_ms * 30 / 1000) + 6，中间条结束使用 ceil(end_ms * 30 / 1000) + 6；每场景最后一句保留到音频边界duration_frames−6，防止供应商词结束时间过早造成声音仍读而字幕消失。区间半开，至少1帧，相邻区间边界裁剪到不重叠；此保留策略不改变词时间戳或保证词级声学精度。
- 普通元素cue取与其文本区间相交的第一个对齐段，其开始帧为动画开始帧；明确role=topic的主题预告使用start_frame=6/duration_frames=1，0.233秒完整可见，是预告而非宣称该标题此时已被念出。cue原文校验、其他结果/步骤/字幕不变。无标记旧数据不提前，短语精度仍需实测。
- 入场动画默认 12 帧；如果尾部可用帧不足则缩短，最少 1 帧；没有可用帧则验证失败。
- 字幕按完整对齐片段拆分；每条最多 2 行、每行 22 码点。必要时对片段细分并分配时间，此分配不得冒充词级真实时间戳。
- 场景直接首尾相接，无跨场景转场。全片字幕添加前置场景帧数后再生成 SRT。

对齐失败时任务停在 alignment 阶段，保留已生成音频，允许重试。禁止默默退回按字数估时并标记成功。人工修改字幕仅更新显示文字和合法帧区间，不更改口播或自动声称语音同步通过。

所有动画是当前帧的纯函数；禁止真实定时器和未固定随机数。资源、字体与依赖版本固定，目标是确定的画面和时序，不要求 MP4 文件逐字节相同。

## 5. 任务交接、状态与错误

Celery 管理工作流任务，Node renderer 不直接消费 Celery Redis 消息。Celery 在渲染阶段通过内部 HTTP 提交 renderer，随后轮询其状态。

内部接口：
- `POST /internal/renders`: job_id、不可变 project_version_id、snapshot_checksum、render_profile。
- `GET /internal/renders/{job_id}`: 状态、进度、产物或结构化错误。
- `POST /internal/renders/{job_id}/cancel`: 停止渲染子进程。

renderer 获取并验证快照后启动受限子进程。提交接口快速返回，不等待视频结束。同一 job_id 与请求哈希重复提交返回原任务；同一 ID 不同内容返回 409。状态持久化在 PostgreSQL，不能只放在 Node 内存。

任务状态：queued → running → succeeded / failed / cancelled。`stage` 独立表示 storyboard、tts、alignment、timing、validation、render、verify，不把阶段名称混入任务生命周期。queued 可直接 cancelled；running 的取消为请求标志，进程终止或当前外部调用返回后再进入 cancelled。终态不能被迟到响应改写。

每个任务保存 project_id、scene_id（适用时）、base_revision、输入哈希、阶段、尝试次数、进度、错误、心跳、起止时间。错误格式 `code / stage / scene_id / message / retryable`，对用户信息去除密钥和内部栈。

幂等键包含任务类型、输入快照哈希、模板/主题/模型/配音配置版本、render_profile，并有数据库唯一约束。失败重试使用显式重试 API，在同一逻辑任务下创建新 attempt；成功的资产按 checksum 复用，不能把失败结果当成功缓存。

首版单个 workflow 任务和单个 render 任务并发。临时外部错误最多总计 3 次尝试，退避 2s/4s；Schema 修复最多 2 次。验证错误不做无限重试。单次供应商调用默认 120s，单次渲染 600s，全任务 900s，上限可通过受控服务配置调整。

运行任务每 10s 更新心跳；60s 无心跳标记尝试失效，允许重试。所有写入检查当前 attempt_id，失效旧进程即使继续执行也不能发布状态或产物。进程重启后清理孤儿任务和临时目录。失效重试可能再次产生供应商费用，必须记录。

## 6. 编辑、候选、快照与失效

旧新值只读明细已启用：现有ChangeSummary场景项可选values仅固定口播/代码/连线before/after文本或null，同一次比较即捕获；代码仅language/source/array_name、边仅from/to，不持有整个Project/profile或追加请求。只对共有场景确变字段，保留所有原changes与语义；缺code/空文本/[]区分，React details/pre原生转义及400px滚动。VersionHistory state/epoch/网络/Player均不改，旧手工fixture无values仍可呈现。203Node/164离线/类型/隔离Next webpack构建与真实r1/r4/dirty、受控代码口播/失败/晚响应验收通过，原服务/六表/媒体/58attempts0active不变。[验收](../output/workbench/version-field-values-qa/receipt.json)。非逐字高亮/完整差异或回滚，后端/94SQL本轮未改未重跑。

只读变化摘要已实现并在本工作台真实验证：旧版详情按钮单次GET当前项目，以锁内返回的revision/scenes/config与冻结dsl比较，不用父页面缓存或局部dirty表单。scene.id匹配主题/增删/共有相对顺序及类型、口播、代码、步骤、edges、structure/timeline/chart；对象键无序/数组有序/边按pair比较。仅显示类别、位置与捕获r号，不比较音频/字幕/animations/duration/profile，不宣称全版一致。纯前端helper/局部compareEpoch/busy/live与project/id守卫，关闭/换旧版/卸载拒晚响应，失败保留原摘要/输入；全部GET，无端点/表/Schema/依赖/任务/媒体改动，DraftScene仅补已有chart类型。真实r1/r4、dirty与受控错误/竞态验证，199Node/164离线/类型/隔离Next webpackbuild通过；94SQL为先前后端回归，本轮未改未重跑。原数据/媒体/服务/58attempts0active不变，[验收](../output/workbench/version-change-summary-qa/receipt.json)。

场景持有 revision、generated_revision、user_revision；任何接受后的内容变更增加 revision。用户编辑增加 user_revision，接受 AI 候选增加 generated_revision。草稿可变，但导出必须使用不可变 project_version。

AI 重生成产出独立候选：candidate_id、scene_id、base_revision、候选内容、来源 job_id。不会直接改场景。接受候选必须提交 expected_revision；与当前场景或候选 base_revision 不符则 409，保留候选供查看，不自动覆盖。

所有编辑提交 expected_revision；排序使用项目级 expected_revision，场景变化与排序也增加项目 revision。创建快照在一致性事务内完成。快照包含最终 DSL、稳定资产 ID/key/checksum、主题和模板版本、字体 hash、配音配置、渲染配置；不包含密钥和短期签名 URL。

未完成配音、对齐或布局验证的项目不能导出。渲染只读快照，继续编辑不会改变既有导出。预览/配音/AI 任务同样绑定 base_revision，完成时检查版本；旧结果保留为任务产物但不自动附着到新场景。

| 修改内容 | 必须失效的派生产物 |
|---|---|
| 口播文本或 voice 配置 | 当前场景音频、对齐、字幕、时长、动画、预览 |
| 元素cue或主题role | 当前场景动画、布局验证、预览；保留音频进入needs_timing，用本地重算 |
| 元素标签、边或模板类型 | 当前场景布局验证、预览；结构改变时重新验证/生成动画，不重配音 |
| 字幕文字/帧区间 | 字幕验证、预览；不重配音 |
| 场景排序、增删 | 全片时长、全片字幕偏移、项目预览；有效场景音频保留 |

视觉A升级后新增项目主题编辑接口，携带项目expected_revision并增加project revision；不改scene revision/state、原稿、音轨/词缓存或计费。纯图文展示元数据且content/cue不变时保留现有ready与时间轴。旧版本和导出不失效、不变更。删除资产必须检查所有快照引用；首版不提供硬删除资产 API。

## 7. 数据与业务 API 补充

沿用原表，增加 scene_candidates；scenes 增加 generated_revision、user_revision、派生状态；projects 增加 revision；jobs 增加阶段、输入哈希、base_revision、attempt_id、心跳和取消标志。单用户表中无需先建立租户体系。

明确以下接口约束：
- `POST /api/projects`: mode 固定 script，保存 source_text；创建草稿不直接生成视频。
- `POST /api/projects/{id}/generate`: 工作流生成候选分镜/场景；首次生成且项目 revision 未变时可附着初稿；已有编辑必须走候选接受机制。
- `PATCH /api/scenes/{id}/chart`: `{expected_revision,chart,elements,confirmed:true}`原子保存用户确认图表，不允许原稿/资产字段。转换/绑定/内容变化有音频则needs_timing；同类型同elements的数值/图种修改复用ready时序，无任务或计费。数字/行列人工确认不等于事实核实，旧快照不改。
- `PATCH /api/projects/{id}/theme`: `{expected_revision,theme}`，原子更新允许的主题ID；不触发分镜/配音/时间轴任务，旧快照不改。
- `PATCH /api/scenes/{id}`: 携带 expected_revision 和 changes，白名单elements/code/captions/narration_text，以及仅flow_diagram的edges。edges最多15条、现有节点引用、允许空数组；自连/重复/环/未知节点/额外字段拒绝并原子回滚。元素ID/cue/order/topic role仍不可修改；其他结构修改走候选。只改边通过校验保留ready/原音频/节点时间轴，原needs_voice/needs_timing不提升；同次改口播仍按原规则失效。前端仅连线实际变化时携带edges，旧编辑请求不变。代码439项回归通过；用户单次授权后仅重载API，独立副本实际保存重开、成环422回滚/输入保留、并发409保护及三条SVG连线预览已验收，功能已启用。未重启web/队列/DB，原六表所有旧行/旧快照/源音频不改，无新收费或render任务；具体证据output/workbench/flow-edge-activation/receipt.json，不冒称新MP4或实听验收。
- `POST /api/projects/{id}/scenes/reorder`: 完整且不重复的现有 scene_ids 与 expected_revision。
- `POST /api/scenes/{id}/regenerate`: expected_revision，返回 job_id，冻结为任务base_revision并生成候选。
- `GET /api/scenes/{id}/candidates`: 查看候选。
- `POST /api/scenes/{id}/candidates/{candidate_id}/accept`: expected_revision；只替换目标场景。
- `POST /api/scenes/{id}/voice`: expected_revision，返回job_id；明确收费配音，不用于本地重算。
- `POST /api/scenes/{id}/timing`: expected_revision，ready/needs_timing本地重算，返回job_id；冻结音频/词缓存与场景修订号，缺失/校验失败明确错误，无下载或付费兜底。
- `POST /api/scenes/{id}/preview`: expected_revision，仅ready/已有配音，返回job_id；scene-preview:1冻结单场景/所需音频到job-owned快照，复用render队列，其他未就绪场景不阻塞；不创建普通project_versions。成功scene_id/scene_revision/snapshot_checksum，无假version_id；scope=scene的jobs/renders查询与原files下载。未保存/非ready禁用按钮，现有Player保留，不自动配音。
- `GET /api/projects/{id}/versions?before_revision=<正整数>`：只读摘要，固定最多50条、revision降序、取51判下一页，cursor≤2147483647；`items[{id,project_id,revision,theme,scene_count}]/next_before_revision`。project隔离、不存在404、无版本空列表，主题从冻结DSL读取/缺失默认tech_explainer；不返回DSL/profile，不猜创建日期、不触碰资产/任务/数据库Schema。UI复用GET `/api/versions/{version_id}`只读展示旧稿/代码/场景JSON，不显示profile或替换当前输入/Player，卸载/请求epoch与项目一致性检查防串数据。445项代码回归后，用户明确允许一次启动/重载：3000空闲重验后本工作台loopback启动、已归属API重载，新GET200。独立副本真实旧稿/dirty/刷新通过，浏览器受控50+2/错误/空列表/关闭详情和切项目晚响应通过（非52个线上版本）；六表/原件/对象/任务计数不变。详见output/workbench/version-history-activation/receipt.json；不含回滚/旧视频预览，创建时间仍未知。
- `POST /api/projects/{id}/versions`: expected_revision；未 ready 返回 409。
- `POST /api/projects/{id}/render`: 明确 project_version_id，不接受可变草稿。
- `GET /api/jobs/{id}`、`POST /api/jobs/{id}/cancel`、`POST /api/jobs/{id}/retry`。
- `GET /api/renders/{id}`: id为现有render job_id，公开状态与downloads；成功时固定MP4/SRT URL和已发布SHA256，其余downloads为空；预览render附scope=scene/preview_scene_id。只读不触发恢复/渲染/文件或存储IO；实际下载仍由files校验，元数据不是当前文件存在证明。非render/未知404，坏发布元数据422。

异步接口返回 202 和 job_id；首版轮询，不做 SSE。400 表示非法请求、404 表示不存在、409 表示版本/状态冲突、422 表示协议或语义验证失败。响应中的 validation_errors 包含 JSON path、code、message。

## 8. 实施阶段

不承诺固定周数，每阶段以可验证产物结束。

1. 协议与渲染：可执行 Schema、Python/TS 验证、3 个模板、固定字体、手写完整 DSL 与实际音频 → 1080P MP4/SRT；先做本地 CLI 验证。
2. 语音与分镜：选定并实测一个 TTS/对齐组合，文案 → 分镜 → 真实音频/时间戳 → 最终 DSL；接口有测试替身，正式验收不能使用替身。
3. 持久化与任务：FastAPI、PostgreSQL、Celery、内部renderer与版本/幂等已实现；私有RustFS/S3兼容适配支持音频/MP4/SRT不可变内容key、校验恢复与发布前上传，已完成本地真实服务联调。经确认用仍维护的Apache-2.0 RustFS1.0.1固定摘要镜像替代归档的旧MinIO社区服务，保留MINIO_*客户端配置兼容，不切换收费AIStor。独立compose.storage.yaml只发布回环19000，关闭控制台并用named volume持久化。
4. 编辑器：已接Next.js三栏项目工作台、Remotion Player、口播/代码与步骤JSON编辑、排序、候选接受、配音重算、持久任务轮询与导出下载；暂无自由拖拽或代码IDE。未保存内容不被轮询覆盖，409保留输入；本地真实API浏览器验证已完成；真实PostgreSQL/Redis/Celery双队列与API已完成Python/RAG教学渲染、快照隔离、去重、排队取消和下载验证；另已提供local-timing:1独立本地重算并浏览器验证needs_timing→ready，无音频更换、原件修改或供应商请求。112离线/76临时PostgreSQL/141Node/typecheck/web build通过。两个实际付费案例（Python/RAG）的分镜→配音→API编辑保存重开→版本导出常驻队列闭环已验证，每例5场景；Python复用修复配音协议前已付费生成的分镜，未重复模型计费。仍未完成20组或同步听检验收。
5. 可靠性验收：中断恢复、安全边界、限额、日志清理、20 个固定样例回归，原计划之后扩展模板与主题；现经用户明确优先视觉升级，A→B→C分批实施与验收，20组真实收费回归暂缓，门槛不变。

技术验证先不启用完整 Docker 服务栈；上线完整 MVP 时再提供 Compose 与操作说明。供应商、预算、字体授权在第 2 阶段开始前明确；无凭据时只能完成测试替身验证，真实链路标记阻塞。

## 9. 验收与测试

固定 20 个中文输入，涵盖普通技术稿、长标签、重复关键词、中英文混排、数字、标点、emoji、不同长度；固定供应商配置并记录运行环境。已维护 examples/acceptance/cases.json（8组编程、12组AI）及逐例人工核查点，npm run check:teaching 检查已有交付物的原稿、模板/语言、资产、视频及SRT，不生成内容或自动执行代码。结构通过不等于教学/来源/同步验收；当前既有Python/RAG结构回归通过2组，且已另跑通这两个案例的真实付费生成/配音/API编辑导出；其余18组尚无交付物，20组整体未通过，两个案例不替代全面验收。至少 18 个在允许的重试上限内完成真实 MP4/SRT 导出，每个任务端到端不超过 900s。非法/超限输入另作拒绝测试，不计入这 20 个合法样例。

输出：ffprobe 验证 1920×1080、30FPS、H.264 视频与 AAC 音频，全片时长与 DSL 总帧数偏差最多 1 帧；SRT 区间递增且不越界。人工听检无明显丢字或截断。

对每个样例预先标注至少 3 个语音/视觉事件；至少 95% 的所测动画起点相对于实听标注点偏差 <= 0.5s。另测字幕对齐，不以动画指标替代字幕正确性。对齐失败样例记录阶段，不按字数估时冒充通过。

检查每个场景开始、每次入场中点、最后一帧的截图；同时做文本测量和边界检查。预览与导出对相同帧做对照。不得出现文字裁切、可读文字相互遮挡、字幕安全区占用。首版以确定性布局检测 + 人工截图审核为准，不宣传自动视觉 QA 能保证内容正确。

教学验收补充：代码行高亮、循环重复行、变量与输出必须对应讲解；RAG 不得将无依据分支画成回答后必经步骤。已维护 Python 示例的代码、六步变量状态和输出 5 的自检；该测试不代表任意用户/AI 代码均被执行或验证。

必须有自动化测试覆盖：
- DSL 合法样例与错误资源/目标/边/帧区间/未知字段/超限输入。
- Unicode cue、重复词、零时长、半帧舍入、字幕边界及总片时长。
- 修改口播后的失效传播、修改标签不重配音、场景重排后的 SRT 偏移。
- 接受过期候选返回 409；运行中编辑不被旧结果覆盖。
- 同幂等键重复提交、同 job_id 不同输入、失败重试与旧 attempt 写入拒绝。
- 渲染时继续编辑不改变快照；被快照引用的资产不能删除。
- Worker 重启、TTS 超时、缺失音频、磁盘不足的错误阶段与可恢复状态。
- 非法 Host/Origin、路径穿越、外部资源 URL 拒绝。

## 10. 未决事项与风险

- 已实测 DeepSeek + TTS 2.0（seed-tts-2.0 / zh_female_vv_uranus_bigtts）完整短文案链路：改用 WebSocket V3 enable_subtitle / TTSSubtitle 后取得原稿字级时间戳；输出 5 场景、747 帧、约 24.917s 的 1080P/30FPS H.264/AAC 视频及短句 SRT。不需要本地模型或额外 ASR。此前 HTTP 返回空词表的阻塞已解除；仍未完成 20 组验收、人工听检、0.5 秒同步指标或完整预算测量。
- Remotion 商业许可及字体许可需按实际使用场景核对；未核对不声称可商用。
- 当前目录不是 Git 仓库；未经单独授权不创建提交，不推送任何远程仓库。
- 已完成两个教学样例的真实队列渲染验证（Python512帧/17.067s，RAG879帧/29.312s），输出H.264/AAC/1080P/30FPS及快照字幕通过程序核验；尚未进行硬件吞吐基准或中文对齐精度验收，不能以片长当渲染耗时，也不能以这些样例代替20组课程验收。
