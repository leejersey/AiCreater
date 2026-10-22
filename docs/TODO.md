# 后续待办（当前单用户本地MVP）

已交付的A/B/C视觉、完整Python C版及RAG课程不再重复生成。此表集中跟踪未完成项；文档检查完成不等于整个平台验收通过。

## 当前开发：教学图片编排（用户批准方向与开发）

- [x] 图片资产底座与离线对象入场：私有PNG/JPEG、独立元素绑定、字幕避让、校验/版本冻结及账号隔离，见[实施计划](superpowers/plans/2026-10-21-teaching-images.md)。不是背景贴图，也不是已接通生图。
- [x] AI图片规划阶段：新 :8/:9 分镜在一次请求中给出用图/不用图理由、0–2个对象需求、元素和原文锚点；计划独立存档并在工作台只读显示，内容变化需复核。531项Node、460项临时PostgreSQL全后端及类型检查通过；未调用真实模型/生图，未重启服务或写入原课程。
- [ ] 代码与图片组合模板、已绑定图片的配音/重生成保护与复核完整闭环。
- [x] 个人中心 GPT Image 2 配置入口：每账号自定义公网HTTPS Base URL、密钥加密存储与替换/删除、旧Key不随新地址转移；不调用供应商。启用需维护窗口配置 `ACCOUNT_CREDENTIALS_KEY` 并重启API，真实私有配置/服务本轮未改。
- [ ] GPT Image 2独立任务、明确费用确认、候选接受/放弃/换图及超时不重复收费。
- [ ] 浏览器全流程、独立授权的真实生图小样及教学有效性验收。

## 当前优先：从摆模板到教学过程演示（用户2026-10-21批准）

- [x] 三项聚焦优化首段：可选`mechanism_focus`“机制演示·聚焦”，仅处理链启用去重/稳定案例标记/节奏与结论静止，其他图形保持。先5项红测后通过，505全Node/类型、8原生冻结用例；真实隔离浏览器保存200/刷新/同对象移动/其余图形路由通过，0页错误/任务。14.73秒同稿音轨A/B完整解码/PCM一致、寻帧/3旧金样及上一mechanism帧像素相同；原环境chunk已含代码，无重启/收费/原课写入。见[新版](../output/workbench/process-focus/v2/after.mp4)/[对照](../output/workbench/process-focus/v2/comparison.jpg)/[回执](../output/workbench/process-focus/receipt.json)。当前仅优化同一处理段，不宣称漏斗/对话重做或自动抽取关键词。

- [x] 第一批：固定“取消订单”14.73秒同稿同音轨，新增纯帧过程演示；建立案例→显式连线移动→重点推进→边界揭示→回收总览。原版/新版实际渲染、音频解码SHA一致、中文容量检查、关键帧审看/回退逐帧相同；478项Node及类型检查通过，无模型/配音费用，无原课程/生产入口变更。见[样片](../output/workbench/process-demonstration/v2/after.mp4)/[前后对照](../output/workbench/process-demonstration/v2/comparison.jpg)/[记录](../output/workbench/process-demonstration/receipt.json)。
- [x] 用户“继续实现”后完成第二批对话/状态：前文与当前片段显式关联，保留状态前后，更新素材不冒充用户消息；原稿安全边界按字幕分块，修正重复短语/乱序更新。15.13秒同音轨新版/原版真实导出、解码音频相同、回退与中文容量通过；486项Node及类型检查通过。见[样片](../output/workbench/dialogue-demonstration/v2/after.mp4)/[前后对照](../output/workbench/dialogue-demonstration/v2/comparison.jpg)/[记录](../output/workbench/dialogue-demonstration/receipt.json)。独立原型、人工编排，0付费/原课程变更，不是生产默认或AI能力提升。
- [x] 第三批漏斗过程：层间原文/字幕给出衔接条件，层级推进/显式连接示意移动，按原稿最后强调非真实流量比例；支持2/3层和3侧注，无重叠。15.5秒真实同音轨新旧导出、PCM一致、回退和中文容量检查通过；492项Node及类型检查通过。见[样片](../output/workbench/funnel-demonstration/v2/after.mp4)/[对照](../output/workbench/funnel-demonstration/v2/comparison.jpg)/[记录](../output/workbench/funnel-demonstration/receipt.json)。未改生产默认/课程、未调用模型/TTS。
- [x] 三类演示接通共享Video/工作台可选“机制演示”：保存风格不改分镜/配音，静音草稿和冻结导出使用同路径，其他模板正常回退、旧风格不切换。496项Node/类型检查和8项原生PG风格冻结用例通过；真实隔离浏览器登录→设置保存200→刷新保留→播放推进/暂停→三场景实路由通过，0页面错误/任务；45.37秒正式MP4完整解码、配音PCM与原片一致、3旧金样像素相同。见[记录](../output/workbench/mechanism-style/receipt.json)。原服务只读健康/编译检查通过，无重启/课程写入/收费。
- [x] AI编排首批（受控输出）：明确state初始上下文/update结果（非用户发言），声明相关消息→状态关系，编译生成晚端点cue连线；update来源不再作输入，纯update无消息拒绝。4新增用例先红后绿，44项离线/33项原生（重叠不求和）、496项Node/类型通过；受控两阶段输出无手工补丁，复用真实配音缓存完成严格校验/正式渲染/PCM对比。见[验证片](../output/workbench/director-choreography/render/after.mp4)/[记录](../output/workbench/director-choreography/receipt.json)。0模型/TTS调用。
- [x] V6离线根因修复并部署：对话`context/message/initial_state/state_after`统一原稿ID，新增可选`context_messages`贯通验证/表单/草稿/渲染/存取，前文不再按序号猜，结果不作输入。新任务/估价/用量/v6去重/worker同步，旧v1–v5保留。138项原生PG相关（无跳过）、499项Node/类型检查通过；受控输出15.13秒实际渲染/完整解码/音轨相同，非真实模型成功。空闲核对/私有备份后正常重载原API/web及同参温替换两个既有worker，Beat不动、9表/326文件不变、0付费/任务；见[记录](../output/workbench/role-director/receipt.json)。
- [x] V6真实模型三段验收课：在新增2次授权内实际生成漏斗/对话状态/处理链，统一摘录ID/角色通过；保留原响应无手改，复用原真实音轨/词级缓存。45.37秒1080P成片完整解码、与原PCM一致、三段关键帧审看、回退及3既有金样像素相同；真实临时PG冻结→生产CLI→校验发布→MP4/SRT HTTP200/SHA一致。500Node/435全原生Python（0跳过）/类型/私有生产构建及1项实际CLI下载烟测通过；0新TTS/原课写入/重启。见[视频](../output/workbench/v6-final-acceptance/frozen-cli.mp4)/[字幕](../output/workbench/v6-final-acceptance/frozen-cli.srt)/[记录](../output/workbench/v6-final-acceptance/receipt.json)。
- [ ] 用户最终视觉质量确认、逐词听检及全部历史冻结画面穷尽：之前用户授权后2次真实请求均HTTP200，但第二次`/p1/update enum`拒绝（模型把摘录ID5填进0–3槽位编号），且说明句被当作消息；未通过，未静默修正、发布或继续付费。1849输入/109输出token，0配音/原课写入；见[实测记录](../output/workbench/director-choreography/live/receipt.json)。双编号/显式角色已在v6修复，本轮已新增授权完成一门短验收课的真实复验；不能把离线通过称为真实质量通过。新增机制风格仍只使用已有分组/动作，不会凭空把普通卡片变成新结构，不再先堆组件或独立样片。早期样片是人工编排，本轮新增真实模型成片，但不证明所有文稿自动达到参考片标准；不继续用组件数量替代质量。

## 历史批次：对标参考视频的语义图形（用户“继续完成”）

- [x] T1设计确认、T2受控动作、T3漏斗含独立侧注与能力/成本方向；后两项由T6补齐。
- [x] T4对话＋上下文状态、T5处理/工具调用链：原稿绑定、按讲解揭示、前后状态、失败分支、惰性参数；23项Node专项和10项临时原生PG回归通过，旧3张金样及倒回同帧像素不变。已导出[37.2秒三段静音片](../output/workbench/reference-grade-visuals/t4-t5/render-final/three-diagrams-silent.mp4)/[接触表](../output/workbench/reference-grade-visuals/t4-t5/render-final/three-diagrams-contact.jpg)，不是正式有声M1。见[规划](superpowers/plans/2026-10-19-reference-grade-visuals.md)/[验收](../output/workbench/reference-grade-visuals/t4-t5/receipt.json)。
- [x] T6三组合版式、原稿重点/标签/结论、独立侧注/方向：27项Node专项、11项临时原生PG/时间轴用例通过，40码点中文/emoji侧注不缩字、回退同帧及3旧金样像素相同。已导出[新版37.2秒静音片](../output/workbench/reference-grade-visuals/t6/render-reviewed/three-diagrams-annotated-silent.mp4)/[新旧同稿静音对照](../output/workbench/reference-grade-visuals/t6/render-reviewed/old-new-comparison-silent.mp4)/[关键帧](../output/workbench/reference-grade-visuals/t6/render-reviewed/contact.jpg)；见[回执](../output/workbench/reference-grade-visuals/t6/receipt.json)。
- [x] T8离线基础：可选导演quote协议与Mock适配器验证三图形/动作，唯一原文恢复→对齐→原生PG保存/复制/候选/冻结；9项新测试、56项专项和20项临时原生PG用例通过（有重叠不求和），T6真实三段原稿控制输出通过TS最终DSL/布局框检查。Worker/API默认旧协议，无在线调用/新设施；见[回执](../output/workbench/reference-grade-visuals/t8/receipt.json)。不代表模型选型正确率或T8全部完成。
- [x] T9核心图形编辑/草稿/保存：分组、侧注/方向/引线、动作/cue；切换确认、空白/非法原输入保留、revision原子护栏。真实隔离工作台登录→改图形→草稿恢复→保存200→刷新保留→取消切换通过，0页面错误；59项原生PG/缓存对齐/导演及11项编辑/预览Node专项通过（不相加算去重）；保留原音轨，0任务/收费。见[记录](../output/workbench/reference-grade-visuals/t9/receipt.json)。
- [x] 收尾回归与受控整课：修复ConfirmOptions调用、课程数量可选值、Project夹具、讲稿UI断言、quote测试Schema提取及密集图形流程排版。472项Node全通过、类型检查/私有生产构建通过；离线Python409项OK/168环境跳过、原生59项通过。同隔离浏览器编辑保存→原生本地对齐claim/publish→ready播放→冻结→37.2秒正式MP4及完整解码，配音/ASR均合成，无收费；见[记录](../output/workbench/reference-grade-visuals/final/receipt.json)。
- [x] T9图形续登及原环境启用：本轮按真实原位过期弹窗交互验收（旧脚本错误强制导航，非应用故障），真实会话到期→弹窗重登录→未保存空白cue/方向不丢，不自动保存/发任务；同次隔离链保留对齐→ready播放→冻结，临时页/DB/服务清理。核对空闲和进程身份、私有PG备份后，短暂SIGSTOP/SIGCONT原1 worker/2 beat（含已验证子进程），正常重载既有API/web；恢复相同消费者PID，9表逐行/326媒体及配置不变，匿名401、健康200，无收费。见[最新记录](../output/workbench/reference-grade-visuals/completion/receipt.json)。
- [x] T8在线代码接通：新生成/候选采用v4，经既有Worker调用导演协议，候选保留图形、旧v1–v3冻结任务照旧。估价/用量费率/教学风格及复用hash同步；Mock实际适配器→worker→原生PG发布验证三图形，67项专项、27项原生通过（重叠不相加）。472项Node/类型检查通过，离线Python412项OK/169跳过；受控重载原API/web并替换原worker角色，不增消费者，原9表/326文件不变，无收费。见[记录](../output/workbench/reference-grade-visuals/online/receipt.json)。不代表真实模型选图正确率通过。
- [x] 实际有声/真实选择收尾：用户“直接完成”后进行有界实测，保留5次模型实验和3段实际TTS，最终实际响应选择漏斗/对话/调用链；修复供应商分片规划解析后离线重放同一真实响应，未手工改决策或为重放收费。v5源摘录枚举/程序构造结构已上线，专用模板最多再调用一次且估价/用量含两次；v1–v4旧任务保留。45.4秒1080P有声片、完整解码、实际冻结/发布校验及视频/SRT HTTP下载200/SHA验证通过。472项Node/类型检查、419项离线Python（170环境跳过）、70项原生及1项实际下载通过（有重叠不相加）；原9表/326文件未变，见[记录](../output/workbench/reference-grade-visuals/compact/receipt.json)。
- [ ] 人工主观/逐词听检、用户本人更长原稿、全部历史冻结逐帧金样仍未验收。密集旧图形流程排版会变；一个真实样本不证明通用选图准确率，混合专用段落可能整课回退旧生成器；不把这些标成已完成。

## AI导演制作闭环（视觉样片优先，后续再续）

- [x] 第一批：已保存分镜的静音动画草稿与临时步骤定位，复用Video/Player，零音轨/任务/正式数据回写；就绪章及冻结导出护栏不变。独立真实Next/API/PG概念课播放中末卡opacity由0至1，无media/浏览器写请求，项目数据不变；原网页新chunk已含功能，无重启/原课写入。见[计划](superpowers/plans/2026-10-19-ai-director-preview.md)/[回执](../output/workbench/ai-director-preview/receipt.json)。
- [ ] 第二批：教学意图/模板选择的可理解方案和局部重生成，复用现有JSON协议，不做自由执行Agent。
- [ ] 第三批：确认执行范围/费用后串联配音→对齐→渲染；明确进度与失败恢复，不自动重复收费。真实模型/配音验收仍需预算。

## 账号与完整课程流程（2026-10-19，用户“推进”）

- [x] 真实用户名/密码、会话/退出/改密、跨站与限次保护；服务端课程/场景/候选/任务/版本/媒体授权，旧课程显式本机认领。后续按用户反馈将密码统一为6–128字符，前后端/重置同步并在原API生效，10项账户测试/类型检查及原页面边界验收通过，已有密码不变；见[记录](../output/workbench/password-six/receipt.json)。
- [x] 登录/注册/账号页、本人课程列表、免费新建、独立编辑页；按用户隔离草稿、原位续登不重发写请求、清空切号内存、保存状态/安全导航。
- [x] 419 Node＋348 Python全套（原生临时PostgreSQL，767项无跳过）、类型检查及私有副本Next生产构建；隔离真实浏览器注册→新建→编辑/恢复→过期续编→改密通过，零生成/配音任务，无响应mock。高级执行器状态折叠；首批账户交付时未配音仅内容草稿，后续已补充明确标注的静音临时时序预览。
- [ ] 双账号/退出/前进后退完整浏览器链：后端双账号全资源隔离通过；早期UI链在退出步骤遇工具取消，已按协议只读恢复并清理，没有重发业务写入，仍需专项补验。
- [x] 原环境账号接口启用与未登录跳转修复：备份后受控重载，移除404匿名回退；原3000首页/课程页跳转登录且表单可用，原API未登录401。webpack对照修正Turbopack反复刷新。新增回归先红后绿，420 Node/类型检查通过；原六表已有值、312文件及0活动任务保持，未启动消费者或收费。见[回执](../output/workbench/login-redirect-fix/receipt.json)。
- [ ] 旧课程明确归属：25门旧课仍未绑定，需指定账号和清单再本机认领；不自动迁移匿名草稿，新注册列表为空不代表丢失。

[方案](superpowers/specs/2026-10-19-account-course-flow-design.md)/[实施与剩余项](superpowers/plans/2026-10-19-account-course-flow.md)/[回执](../output/workbench/account-course-flow/receipt.json)。不新增依赖/服务/部署/队列；不把新增登录当公网发布许可。此前收费课程试跑及人工听检继续保留，不自动执行。

## 本轮功能优先（2026-10-19，按用户清单顺序）

- [x] 九类场景三种风格实渲染：75帧与66个数量/长文边界，无新增风格架构。
- [ ] concept真实课程闭环：33项离线专项通过；模型/供应商配音待预算，事实与同步听检未完成。
- [x] 手工概念场景开发与隔离验收：原文摘录/角色/草稿恢复/保存；旧卡片兼容。
- [x] 原API受控加载新增概念接口和角色编辑：用户“继续开发”后沿用原启动器重载API/耦合网页；实际3000→8000浏览器创建、恢复、角色保存/重载、旧卡片和重排通过。仅本轮独立验收项目写入后精确清理，原六表及312个配置/媒体文件不变，58attempts/0active，无供应商调用。证据 `output/workbench/concept-activation/receipt.json`。
- [x] 批量本地对齐独立副本实际执行：真实HTTP、原生PostgreSQL及本地子进程，三章ready，音轨和冻结版不变；非原队列/供应商缓存听检。
- [x] 重排已有入口复用并实测，不重复开发。
- [x] [非编程示例包](../examples/lessons/README.md)：可编辑讲稿/分镜、本机系统语音，两版25.3秒有声视频和SRT。
- [ ] 完整新文稿效率试跑与20组正式验收：收费部分待预算，人工同步/nums继续暂缓。

首轮代码验证：415 Node＋198离线Python＋142原生数据库用例通过（755项去重），TypeScript及临时副本Next生产构建通过；本次激活仅重跑原环境API/浏览器/完整性检查，不冒称重跑755项。[进度](superpowers/plans/2026-10-19-function-first.md)/[首轮回执](../output/workbench/function-first-qa/receipt.json)。未增加依赖/服务/存储/队列/部署，未改原课程或收费。

## 用户明确加入待办，暂不执行

- [ ] **人工0.5秒同步验收（免费）**：用户/审查者实听并填 `output/workbench/visual-C-full/sync-review/manual-events.csv`，我再按实测视觉起点−实听首音统计。38动画候选、76字幕区间均未填；缓存时间不能当人耳证据，主题预告须单列。资料：[核对说明](../output/workbench/visual-C-full/sync-review/README.md)。
- [ ] **修正Python nums发音（收费）**：先确认希望的读法、供应商控制方式与单段试听预算，获得明确授权后只试一小段；通过再决定是否替换对应场景。保留原稿/音轨/版本，禁止自动批量重配或重试。当前原发音保留。

## 此前主线记录：真实视觉风格 → 轻量验证 → 通用教学表达

- [x] **收费任务提交即时反馈**：生成分镜/重生成候选/单章配音校验归属、章节版本与操作后立即更新任务；复用parseJobs/parseSceneJob，同ID去重、坏响应保留原状态。估价确认/409/dirty与配音重复入口护栏不变，不自动补发。2项先红后绿，410Node/typecheck/私有构建＋2原生/10受控检查通过；10估价/7提交均模拟拦截，真实收费0、原数据/存储不变，自有页/副本清理。[验收](../output/workbench/paid-task-response-qa/receipt.json)。

- [x] **整课导出响应保护与即时任务反馈**：复用冻结快照校验后才渲染，校验返回任务的归属/revision/整课范围后同ID更新；异常保留旧列表、不自动补发。新增2项先红后绿，408Node/typecheck/私有构建＋2原生/8受控检查通过；11次模拟POST全部拦截、真实版本/任务创建0，原列表/项目/jobs/存储不变，自有页/副本清理。[验收](../output/workbench/export-response-qa/receipt.json)。

- [x] **本地预览/单章对齐提交即时反馈**：校验项目、章节/版本和操作后应用返回任务，同ID去重、其他行保留，不依赖轮询成功；不改收费/确认/dirty护栏。4项先红后绿，406Node/typecheck/私有构建＋2原生/8受控检查通过，6次模拟POST均拦截、真实执行0；原列表/项目/jobs/存储不变，自有页面/副本清理。[验收](../output/workbench/local-task-response-qa/receipt.json)。

- [x] **显式重试即时呈现服务端状态**：复用取消入口的parseJobs/归属/任务ID验证及行替换，重试响应立即应用，不靠下轮轮询、不假报已执行。坏响应/冲突保留旧行，取消确认零提交，估价/人工核对/dirty/后端重试规则不变。先受控页面精确状态红证据再修4行；402Node/typecheck/私有构建＋2原生/6受控检查通过，7次模拟POST均本页拦截，真实重试/收费0，原列表/文档/jobs/存储相同。首次脚本用整行失败文案含历史error会误判，业务改前收窄状态span并再次真实红；保留8个已处理confirm告警。自有页面正常close/finish、副本删除。见[验收](../output/workbench/retry-response-qa/receipt.json)。

- [x] **单章配音已有任务入口保护**：复用currentVoiceJob，当前章/revision/音色已有已加载任务时禁用收费入口，显示状态并保留显式失败重试；旧版/他章/历史音色不误挡，dirty/核对护栏不变。原页面先红后绿，2原生＋6受控GET检查、既有402Node/typecheck/私有构建通过；原列表/文档/jobs/存储不变。浏览器runtime上下文曾丢失，依恢复协议检查同一已观察组后重建只读夹具，未重放业务操作；误建空白页与自有验收页正常关闭/finish。无新增依赖/API、收费或消费者，不替代后端幂等，不取消/退款。见[验收](../output/workbench/single-voice-qa/receipt.json)。

- [x] **批量配音旧勾选不复活**：复用现有batchVoiceScenes和对齐选择清理模式，核对撤销/dirty/本版任务/revision失效时清除收费选择；重新合格仍需手动勾选，其他合格章/无关轮询保留。实际受控页面先红后绿，5项交互回归＋2项原生只读检查，既有402Node/typecheck/私有构建通过。仅4行清理逻辑、effect依赖和提示，无新依赖/API/任务，原文档/jobs/存储相同；Next诊断POST与处理过的confirm告警单列，自有页/副本正常清理。未提交真实配音或收费，见[验收](../output/workbench/voice-selection-qa/receipt.json)。

- [x] **已保存稿比较异常保护**：只校验比较需要的项目归属/revision/教学字段，复用formSteps/原摘要，不误用冻结DSL要求配音/时长；坏数据保留旧比较与dirty，空稿可比较，不改稿或输出版本。新增6项，402Node/typecheck/私有构建，2原生＋4受控GET检查通过，原列表/文档/任务/版本/存储相同。仅清理自有页/构建，无收费/消费者；1次Next诊断POST拦截、已处理confirm及工具fetchError告警保留，不冒充零告警。finish起初误用了task子命令，仅读使用提示后以正确finish正常完成，无强制清理。见[验收](../output/workbench/version-compare-response-qa/receipt.json)。

- [x] **版本列表/详情异常保护**：验证归属、重复/安全ID、倒序revision与递进分页；冻结详情核对ID/revision，复用现有DSL/冻结风格校验，不以当前风格补造历史。坏响应保留原列表/详情和dirty输入，手动可恢复。新增6项，396Node/typecheck/私有构建、2原生＋7受控GET检查通过；原列表/文档/任务/版本/存储一致，无冻结/导出/收费，正常清理自有页/副本。见[验收](../output/workbench/version-response-qa/receipt.json)。

- [x] **任务坏响应不破坏工作台**：共用parseJobs守住轮询、批量对齐/配音和取消入口；验证归属/重复ID/安全路径段及渲染字段，保留合法nullable元数据。坏响应保留旧状态和输入，取消需匹配任务，不自动补发。新增6项，390Node/typecheck/私有构建、2原生＋7受控检查通过；原列表/文档/任务/存储相同，未操作真实任务或收费，自有页/副本正常清理。见[验收](../output/workbench/job-list-validation-qa/receipt.json)。

- [x] **已保存全文一键复制**：仅显式点击写剪贴板，原样保留保存稿/空格/换行，等待禁重入、空稿禁用，拒绝权限提示手动复制；旧异步结果不冒充新稿复制成功。新增2项回归，384Node、typecheck/私有构建，2原生只读＋5受控GET/剪贴板替代检查通过，原项目/任务/存储不变。未读写真实剪贴板、调用收费接口或启动消费者；自有页/副本正常清理。原生剪贴板权限仍需用户环境实测，见[验收](../output/workbench/copy-manuscript-qa/receipt.json)。

- [x] **项目列表坏数据不白屏**：首屏/手动刷新共用结构与重复ID校验，整份拒绝异常响应并保留旧列表/课程/dirty，合法空列表不误报；不改API或加依赖。新增4项回归，382Node、typecheck/私有构建、2原生＋4受控GET检查通过，原文档/任务/存储不变。测试清理时发现本机备份仍保留，仅读后显式丢弃自有影子草稿续跑，无绿后业务改动；自有页正常关闭/finish。未写原数据、启动消费者或收费，见[验收](../output/workbench/project-list-validation-qa/receipt.json)。

- [x] **保存成功直接应用返回项目**：场景/图表/主题/排序/候选接受复用applySavedProject，移除保存后强制GET，不因读失败掩盖已确认写入；保留失败输入、revision与选章/确认护栏。先受控主题红证据后改；378既有Node、typecheck及私有构建通过，2原生只读＋6受控回归，7模拟写全拦截，原列表/文档/任务/localStorage相同。页内存影子已恢复、自有页正常关闭/finish、副本删除，无原写入/消费者/收费。测试两次误用标题选择器/409原始消息，仅读状态后修测试续跑，不重发原操作；1次Next诊断POST及2已处理确认警告保留。见[验收](../output/workbench/save-response-qa/receipt.json)。

- [x] **创建成功直接呈现项目**：核实POST返回完整Project，复用页内showProject应用返回值、本地列表去重加入；移除创建后强制两次GET，读取失败不再掩盖已创建项目。初始projectsLoading禁提交防较早列表覆盖，保留dirty确认/失败输入与显式草稿/选章守卫；口播输入补稳定aria-label。先受控浏览器红证据再改，378既有Node、typecheck/私有构建通过；2原生open回归＋4受控创建/失败/取消/初始等待检查，累计5次模拟POST全拦截、真实创建0。全部localStorage用单页内存影子并恢复，真实原项目/列表/任务/存储不变。自有页正常关闭/finish、副本删除，无收费/消费者；mock脚本元数据用法、双error选择器及fieldset断言误用均修脚本并留痕，5次Next诊断POST与已处理对话框警告如实记录。见[验收](../output/workbench/create-response-qa/receipt.json)。

- [x] **重新载入保留当前章**：复用selectedSceneId，仅一行修复open始终选首章；同项目保留当前有效行，已删回首章/空稿清选择，异项目仍首章，显式草稿目标先校验不变。先原生浏览器红证据再改，378既有Node、typecheck/私有构建通过；3原生＋3受控GET回归覆盖同课重载/侧栏重开/切课/dirty取消与确认/移除及空稿，原文档/任务/localStorage不变，无写原数据/收费。自有页正常关闭/finish、副本删除；测试首次未等读取结束假绿，补响应/解锁等待后真实红→绿，2个已处理confirm警告保留。见[验收](../output/workbench/reload-selection-qa/receipt.json)。

- [x] **项目列表就地查找**：按已加载标题做大小写不敏感的字面子串匹配，支持中文/emoji、清除/无匹配提示与计数；不切课、不清dirty、不发搜索请求，刷新保留查询。只新增纯helper和现有侧栏控件，无接口/依赖/持久化。4项先红后绿回归，378Node、typecheck/私有构建通过；25个已加载项目的3原生检查＋1唯一GET夹具dirty检查通过，原文档/任务/localStorage不变。自有页正常关闭/finish、副本删除，无任务/收费；1次Next诊断POST与已处理confirm警告保留，截图带已有开发Issue徽标，不冒称控制台全净。见[验收](../output/workbench/project-search-qa/receipt.json)。

- [x] **章节标题易辨认**：共用sceneTitle从已保存主题步骤/图表标题/首步/模板取标题，侧栏与总览一致；保留类型/状态/revision，标记当前章，不生成或改写内容。4项先红后绿回归；374Node、typecheck及私有构建通过，2原项目4章无mock检查匹配API并验证定位/当前标记。原文档/任务/localStorage不变，未发任务/收费；自有页正常关闭/finish、副本删除。测试空Set泛型与page.fetch结果用法纠正仅限测试；1个Next诊断POST单列，页面错误0。见[验收](../output/workbench/chapter-label-qa/receipt.json)。

- [x] **项目读取失败可恢复**：共享request仅对无body的GET默认5秒限时，保留调用方signal，不给提交自动超时/重发；新增项目列表就地刷新，首屏失败/切课超时可重试，旧列表/课程/dirty输入保留，初始请求卸载不回写。核对全部调用方，新增4项回归；370Node、typecheck及私有构建，2原生＋3受控GET检查通过。开发Strict Effects首屏2次读取如实记录，非重试循环；原项目/任务/localStorage相同。测试先收窄空Next播报器alert选择器，再补跨程序恢复变量，只修测试、不改绿后业务源码；2次Next诊断POST和已处理confirm警告保留。自有页正常关闭/finish、副本删除，无写原数据/消费者/收费。见[验收](../output/workbench/project-load-qa/receipt.json)。

- [x] **已保存全文只读查看**：复用API现有source_text，不改后端；明确有分镜时为当前口播合文、不是最初提交稿存档。保留完整文本/换行/Unicode并安全转义，空数据不拼造，键盘可聚焦选中文本；不新增编辑/复制接口或自动任务，dirty输入不混入。新增3项回归，366Node、typecheck、私有构建及2原生＋2受控GET检查通过；原文档/任务/localStorage相同，自有草稿精确移除。仅确认丢弃自有测试输入的可恢复警告保留；自有页正常关闭/finish、副本删除，无消费者/供应商调用。见[验收](../output/workbench/saved-manuscript-qa/receipt.json)。

- [x] **版本历史读取不再卡死**：复用已有signal支持，列表/详情/已保存稿比较限时5秒，超时解锁并提示手动重试，保留已有结果/未保存输入，不自动重发或取消任务。先受控复现6.5秒仍禁用，再新增1项回归；363Node、typecheck、私有构建及2原生＋3受控GET检查通过。原项目/任务/版本/localStorage不变，无消费者/收费；测试曾误用任务名称，仅新建空白页，读态确认后正常清理两份自有任务，不改业务代码掩盖。1个Next诊断POST与已处理confirm警告单列。见[验收](../output/workbench/version-timeout-qa/receipt.json)。

- [x] **刷新后章节选择修复**：已选章节被后台已保存稿移除时选首个现存章节，重排保留有效选择；空稿清空，dirty时不换稿/切章。复用同一选择规则用于保存刷新与轮询，不改接口/依赖。先受控复现空编辑器，再新增4项回归；362Node、typecheck、私有构建及2原生＋4受控页面检查通过。原项目/任务/localStorage不变，自有页和副本正常清理，无消费者/收费。见[验收](../output/workbench/scene-selection-qa/receipt.json)。

- [x] **整课原文摘录/概念角色核对（UI本机已验）**：复用cuePreview/conceptLabels，总览逐步显示已保存口播摘录、Unicode码点范围及概念只读角色；坏范围/未知角色提示，不猜测/改稿/自动确认，保留dirty/busy护栏。仅改现有CourseOverview，新增4项回归；358Node、typecheck及私有构建通过，2原生检查覆盖10步摘录，另3受控GET检查概念/未保存输入/坏数据。初次浏览器断言因跨realm原型失败，只修测试为结构比较；原项目/任务/localStorage不变，1个Next诊断POST和已处理confirm警告单列。自有页正常关闭/finish，副本删除，无消费者/收费调用；**未据此勾销concept实际课程/音视频专项验收**。见[验收](../output/workbench/course-review-qa/receipt.json)。

- [x] **任务轮询串行/中止/恢复（本机已验）**：受控浏览器先复现setInterval并发峰值2且旧响应覆盖新状态，改为每轮完成后2秒再查、单轮5秒期限；旧查询在切课/忙碌/卸载时Abort，沿用原GET与dirty护栏。通用request仅追加可选signal，旧调用/409/JSON行为不变。超时显示状态可能过期；另复现恢复后警告不消失，改独立pollError，恢复不清其他操作错误。新增4测试，全量354Node、typecheck及私有构建通过；2原生＋6受控GET检查，修复同脚本峰值1，覆盖超时恢复、辅助项目GET中止、dirty保留、操作错误独立及离页不再轮询。完整离页未观察到requestfailed事件，未冒称该事件通过；输入复原仍dirty为既有护栏，改夹具显式确认重载，未改业务。原数据/任务/localStorage相同，4次Next诊断POST单列，页错误0；自有页正常关闭/finish，1个已处理confirm警告保留，副本清理，无后端变更/消费者/供应商调用。查询中止不等于取消任务/停止计费。见[验收](../output/workbench/task-poll-qa/receipt.json)。

- [x] **完成任务的发布结果提示（本机已验）**：复用API已有result.attached，分镜/配音/对齐明确发布时已应用或未应用，不把历史成功当成当前稿；候选提示到对应章节查看是否接受，缺失/坏元数据不推断。只改现有任务卡片和纯helper，不改后台/依赖或自动补发。新增4项回归，350Node、typecheck和私有构建通过；2原生只读检查覆盖15历史任务/12提示，另4受控GET检查验证未应用/候选/缺字段及筛选护栏。原项目/任务/localStorage不变，1个Next诊断POST被拦截、页面错误0；自有页正常关闭/finish、副本清理，无业务写入/消费者/供应商调用。见[验收](../output/workbench/task-result-qa/receipt.json)。

- [x] **任务列表筛选（本机已验）**：全部/进行中/失败，保留取消等待及不可重试失败；只筛当前已加载列表，明确计数边界。不清dirty输入，轮询保留选择，同课重载保留、切课重置；不改原任务按钮/后端/依赖。新增4项回归，346Node、typecheck及私有构建通过；4原生只读＋6受控GET检查，原项目/任务/localStorage相同，唯一自有测试草稿已精确删除。原生发现控件名称含选项文字，已补固定aria-label并重跑；1次Next诊断POST被拦截，页面错误0，受控放弃输入确认的finish警告如实保留。自有页正常关闭/finish与构建副本清理，无业务写入、消费者或供应商调用。见[验收](../output/workbench/task-filter-qa/receipt.json)。

- [x] **取消请求≠任务已停止（本机已验）**：复用API已有cancel_requested，运行中取消显示等待执行器确认并禁重复点击；采用取消响应立即更新行，排队终止/执行器终态才显示停止，失败不假成功也不自动补发。提示已发出的供应商调用可能仍计费，不改后端取消/确认/重试机制。新增4项回归，全量342Node、typecheck与私有构建通过；2原生只读＋6受控检查，3次模拟取消POST均拦截、真实取消0。原项目/任务/localStorage不变；1个Next诊断POST被拦截并单列，页面错误0。自有页正常关闭/finish且构建副本已删除，无消费者或供应商调用。见[验收](../output/workbench/task-cancel-qa/receipt.json)。

- [x] **任务→章节定位（本机已验）**：候选/配音/对齐/单章预览可定位当前关联章并滚动至编辑区，复用暂停和章首定位；已删除/跨项目/整课任务无入口，dirty/busy禁用。不自动重试、恢复历史稿或覆盖音轨；任务种类中文显示。新增4项回归，全量338Node、typecheck及私有构建通过；2原课程5项无mock只读＋7项受控GET检查分列，原项目/任务与localStorage前后相同。仅删唯一自有临时草稿，自有页正常关闭/finish、构建副本删除；无新接口/依赖、原数据写入、消费者或供应商调用。见[验收](../output/workbench/task-navigation-qa/receipt.json)。

- [x] **候选列表刷新/错误重试（本机已验）**：现有候选面板支持加载/空/错误状态，失败或5秒超时隐藏旧列表、释放就地重试；元数据/归属/重复ID异常关闭接受，切章取消旧请求、晚响应不串，重新载入同章也重读。保留原接受确认与服务端校验，刷新不清dirty输入或生成任务。新增4项回归，全量334Node、typecheck与私有构建通过；9原生＋9受控GET检查分列，2原项目/3候选列表前后相同。受控输入仅使用唯一虚构章节，本次草稿已精确删除；自有页面/构建副本正常清理。保留1次被拦截的Next本地堆栈诊断POST和已处理的放弃测试输入确认，不冒称零诊断；业务写入/收费/消费者均0，无新接口或依赖。见[验收](../output/workbench/candidate-list-qa/receipt.json)。

- [x] **候选稿可读比较（本机已验）**：复用版本历史教学字段比较，接受前查看变化类别、口播/代码/连线旧新值和步骤/触发范围概览，保留完整JSON。已接受/过期/跨章/dirty/busy/坏数据禁用，不改后端接受或计费协议；读取失败不再静默。新增6项回归，330Node、typecheck及私有构建通过；2原项目/3历史候选11项无mock检查，另4项受控GET展示/取消检查明确分列，原项目与候选前后相同。未实际接受原候选、写原数据/派任务/收费或启动消费者，无新增依赖/接口/设计流程；仅清理自有页面和构建副本。见[验收](../output/workbench/candidate-review-qa/receipt.json)。

- [x] **已保存步骤定位（本机已验）**：复用Player，在现有教学内容面板定位步骤动画触发帧并暂停；整课加章偏移、单章用局部帧，不重复加音频padding。dirty/busy/待配音或对齐/无效时序禁用，不修改cue/音轨/动画或登记任务。6项先红后绿新增测试，324Node、typecheck和私有构建通过；两门原课12项无mock只读检查覆盖精确帧、播放中暂停、重复点击、轮询不打断、整课/单章切换与pending清旧音轨，原课程文档前后相同。未改原数据/新增依赖或接口、未启动消费者/收费；仅清理自有页面与构建副本。见[验收](../output/workbench/step-preview-qa/receipt.json)。

- [x] **章节网页预览/定位补齐（本机已验）**：未完成整课可预览当前已就绪章，未就绪章不播放旧音轨；整课就绪仍连续预览，定位章首暂停且同章可重定位。只改现有Player/helper，不加接口或派任务，导出/dirty护栏不放宽。6项先红后绿回归，318Node、typecheck与私有构建通过；两门原课程10项无mock只读检查覆盖精确帧定位、轮询不打断、缓存音频播放、待配音清旧播放器与导出禁用。原生测试捕获row UUID与DSL scene.id混淆，已修复并让测试夹具区分两者。未改原数据/启动消费者或收费；自有页面/构建副本清理，见[验收](../output/workbench/chapter-preview-qa/receipt.json)。

- [x] **真实视觉风格首批纵切**：独立于theme的本地StyleTokens预设与visualStyle选项，当时4类共用图文场景消费形状/填充/边框/间距/箭头/入场，专用模板当时拒绝非legacy（现已补齐，见下）；旧调用默认legacy。268Node、typecheck和同色同分镜3版实际CLI导出通过，263帧、解码音频与SRT相同；已查看早期/完成帧，原示例/音频哈希不变、无原DB/队列/服务操作或模型/配音调用。见[设计](superpowers/specs/2026-10-16-visual-style-tokens-design.md)/[验收](../output/workbench/visual-style-tokens-qa/receipt.json)。这是首批能力，不是全模板覆盖，也未接工作台风格冻结。
- [x] **轻量视觉验证入口**：复用现有CLI完成本地实际对照，不经API/数据库/队列/对象存储/编辑器；README默认先走该路径，[说明](getting-started.md#轻量本地视觉验证与独立风格)。没有另建执行器、停原服务或拆迁设施；基础服务仍运行，未做停服试验，安装依赖也未裁剪。它解决验证入口负担，不冒称基础设施整体已精简。
- [x] **通用concept代码与隔离验收**：独立concept＋只读concept_role，恰好一个定义、可选特征/例证/总结，正文绑定cue摘录、严格原稿与入场顺序；定义主卡/支持层级复用3种本地风格，不是卡片改名。Schema/双端校验/原稿恢复/分镜/表单/Store护栏/本地对齐全部接通；新任务v3隔离v1/v2，参考估价/费率同步兼容。276Node＋197离线Python＋135真实隔离PG，共608项去重测试，typecheck和独立构建通过；历史/物理/生物3×3版静音导出及4张代表帧检查通过，同稿音轨/SRT相同。仅静音人工时间视觉夹具，不冒充真实模型/配音、事实审校或听检；无原API/DB/队列/消费者/供应商操作。自有构建副本、PG和渲染临时目录正常清理。见[设计](superpowers/specs/2026-10-16-concept-teaching-design.md)/[验收](../output/workbench/concept-qa/receipt.json)。
- [ ] **concept原环境受控加载/验收**：先核对原进程归属/活动任务/队列并备份，再另行明确正常重载与只读验收范围；无新增DDL，不自动启动消费者或处理历史队列。真实生成、事实/角色审核及声学听检未完成，收费仍须预算，不能将新文件交给旧代码。
- [x] **四类专用模板真实风格代码与本地验收**：普通代码＋视觉C、三种状态、时间线与四种数据图表均消费白板/极简，现支持全部9类；保留状态快照/数据坐标/时序，时间条不平移、图表不插值。302Node、typecheck及私有webpack构建通过；50份修改前legacy SSR哈希、10张关键帧逐像素相同。同色九类/15场景3版各1080帧，音轨/SRT相同；30完成态＋10局部帧已生成，代表帧检查发现并修复完成态clip裁掉当前外框，重新红/绿测试并全量导出。仅静音/人工时间夹具，不是教学事实/配音/听检；Python/PG未改动且未重跑，无原服务/DB/队列/供应商操作，自有构建/渲染资源已清理。见[设计](superpowers/specs/2026-10-16-dedicated-visual-styles-design.md)/[验收](../output/workbench/dedicated-styles-qa/receipt.json)。
- [x] **工作台风格选择与独立冻结代码/隔离验收**：按用户要求直接完善，无新增设计流程。项目风格设置、Player、草稿/409/404保留、旧API保护、冻结版本/预览任务完整token快照、worker→CLI文件传递与历史v1/legacy全部接通；不改音轨/场景revision、配音profile或DSL。312Node＋198离线Python＋141真实隔离PG减1重跑重复，共650项去重通过，typecheck/私有构建和14项受控页面检查通过。真实隔离PG先冻结白板再改项目极简，真实worker/CLI三版各1261帧、解码音轨/SRT相同，旧版本不被当前选择替代。实际修复导出阻塞误把风格元数据送入DSL校验，以及404数字cause分支；该代码验收未操作原服务/DB/队列或收费，自有资源已清理。[代码验收](../output/workbench/style-selection-qa/receipt.json)/[使用](getting-started.md#工作台风格选择与冻结本机已启用)。
- [x] **原工作台风格受控启用**：实际核对空闲/进程归属/备份和schema，所需字段已存在，无新增迁移；只正常SIGINT旧控制器并加载API/web，不强杀或重启基础容器。16项原生API与8项无mock页面检查通过，临时副本3次成功风格保存、1次完整快照冻结，实际Player更新/播放、重开及旧版本独立均验证。自有副本2章/1版本与页面正常清理；原六表逐行相同，238媒体/73对象、配置、容器身份及队列0/0/5不变，0活动任务/消费者/供应商调用。又重跑312Node与typecheck通过，21源码hash与650项历史隔离验收一致。保留Tabbit注入属性的完整hydration诊断，不改应用屏蔽。见[原生验收](../output/workbench/style-selection-activation/receipt.json)。人工听检/nums与20组收费仍未做，不以风格启用为由启动消费者。


- [x] **整课批量本地对齐设计**：[书面设计](superpowers/specs/2026-10-16-batch-timing-design.md)已批准实现。仅选择已保存/核对的待对齐章，后端原子登记，不做前端逐章循环；设计阶段仅文档，实施结果见下。
- [x] **整课批量本地对齐代码与隔离验收**：复用单章冻结payload/缓存与发布护栏，项目锁内双revision/归属/状态/全组缓存校验后同事务登记；缺缓存或中途插入失败不留新任务，单/批/并发同hash复用，匹配失败不自动重试。独立选择、确认取消零提交、一次POST，409/404/422/网络失败保留且无逐章兜底；核对/revision变化不恢复旧选择。258Node＋190离线Python＋132真实隔离PG，共580项去重通过；132离线跳过项逐ID补齐，typecheck、私有webpack构建与10项受控页面检查通过，自有页/预览/副本及PG资源正常清理。本次主会话自审、无HEAD未提交；无原API重载、原DB/队列写入、消费者或供应商调用。晚会话guard仅自审，未强制绕过busy诱发切课；提交原子不保证执行全成全败，缓存预检不保证语义匹配。见[验收](../output/workbench/batch-timing-qa/receipt.json)/[界面](../output/workbench/batch-timing-qa/preview.png)。
- [x] **批量本地对齐本机接口加载**：随风格功能正常重载原API/web，公开schema/路由及健康已只读核对，无新增迁移、任务或消费者，见[加载记录](../output/workbench/style-selection-activation/receipt.json)。
- [ ] **批量本地对齐原生执行验收**：登记/执行会留下可执行jobs，不当成只读；须明确临时副本、执行与清理范围，不启动原消费者或动历史celery5条。现有隔离验收不替代原生任务执行、人工听检和最后的20组收费验收。
- [x] **批量本地对齐实现与隔离验收（重复待办已合并）**：见上方580项交付与[记录](../output/workbench/batch-timing-qa/receipt.json)，不重复开发；原API现已加载，但原生任务提交/执行仍未验收，不代表已处理原队列或完成收费验收。

- [x] **步骤触发位置手工编辑设计**：用户已批准[书面设计](superpowers/specs/2026-10-16-manual-cues-design.md)并要求实现。采用Unicode码点起止范围＋原文预览；已有步骤ID/顺序/角色不变，不做波形/拖拽、自动派任务或收费试跑。
- [x] **步骤触发位置手工编辑代码与隔离验收**：复用现有PATCH/锁/revision；仅改cue保音频/字幕/时长、失效旧动画并待对齐，旧任务不附着，需显式缓存重算。坏范围与代码快照一起备份，刷新/409不丢，跨revision仅复制/丢弃；图表保留独立人工确认。255Node＋190离线Python＋126真实隔离PG/API/Jobs，共571项去重测试、typecheck、独立Next webpack构建和10项受控页面检查通过；126离线跳过项逐ID在隔离PG覆盖。测试页/私有预览与构建副本已正常清理，代码隔离阶段无原课程/媒体/数据库写入、原服务重载、消费者或供应商调用；后续原生启用见下一项。此处页面使用明确API替身，不冒称原环境保存；见[验收](../output/workbench/manual-cues-qa/receipt.json)/[界面](../output/workbench/manual-cues-qa/preview.png)。多标签草稿非原子锁，未做人工0.5秒实听。
- [x] **手工触发范围原环境受控启用**：0活动任务/消费者、归属与私有六表备份核对后，正常重载自有API/web监督器，无新增迁移。19原生API＋6无mock页面检查通过，3次成功范围保存仅属明确临时副本；非法范围/身份/角色/顺序/字幕组合、409/403、Unicode、待配音不升ready、旧版不变及待对齐禁止冻结均验证。副本1项目/3章按UUID、完整数据与revision事务清理，自有页正常关闭/finish。原25项目/149场景/18候选/21版本/58任务/58attempts六表逐行精确不变；238媒体/73对象、配置/容器及队列workflow0/render0/celery5相同，9源码哈希对应571项已验交付，本次未重跑全套。Tabbit注入属性hydration告警如实记录，未屏蔽；未启动消费者、对齐/渲染任务或供应商调用，人工听检/20组收费验收仍最后、另行明确预算。见[原生验收](../output/workbench/manual-cues-activation/receipt.json)/[实际界面](../output/workbench/manual-cues-activation/preview.png)。

- [x] **每次尝试用量记录（代码与隔离验收完成）**：可空`job_attempts.usage`，历史NULL不补账；领取冻结价格，记录合法模型token/配音提交字符，失败/超时/取消也尝试留档，重试独立且不覆盖reported。只读项目API/UI分列已知参考额与待核实，全未知不显示0元；手动刷新、404/坏数据/超时隐藏旧金额，切课中止旧请求，不派任务或自动对账。244Node、190离线Python、121隔离PG/API/Jobs共555项、typecheck、独立Next webpack构建与10项受控浏览器检查通过。代码验收阶段未新增依赖或调用供应商、连接/迁移原DB、重启常驻服务或启动消费者；自有预览/页面/副本已清理。见[设计](superpowers/specs/2026-10-15-usage-records-design.md)/[验收](../output/workbench/usage-records-qa/receipt.json)。金额不是账单/总支出/硬预算；账号折扣、机器成本、真实计费尚未验证。
- [x] **用量记录原环境受控启用**：空闲/零消费者及自有进程身份复核、私有六表备份后，迁移可空usage列并正常重载自有API/配套页面；29项原生GET检查、7项无mock页面检查通过。原25项目/149场景/18候选/21版本/58任务/58尝试精确不变（旧attempt仅新增usage:null，原始行JSON哈希因此变化）；238媒体/73对象、私有配置、容器身份不变，队列长度workflow0/render0/celery5。13份实现源码与555项验收版本一致，本阶段未重跑全套。未补账、建任务/副本、调用供应商或启动消费者；自有浏览器页关闭、finish确认，用户页/草稿不动。见[原生验收](../output/workbench/usage-records-activation/receipt.json)。参考额非账单/硬预算，真实计费、听检、20组收费验收仍最后、另行确认预算。

- [x] **新增／复制／删除场景（代码与原环境启用均完成）**：按用户授权只做最小场景管理。新增手工卡片追加末尾、初始待配音；复制紧随原章，唯一ID/r1、保持原状态与音频引用，不复制复核或历史任务；删除须明确确认，至少留一章，活动场景任务阻止删除。归档保留候选/任务外键、旧版本和媒体；全部旧场景入口及重试拒绝已归档章节，删除/重试统一项目→任务锁，并发回归通过。结构变更双revision/归属/20章/4000码点校验；表单409及轮询保留输入，dirty保护、自动选中新章、删除取消不发请求。213Node、164离线Python、108隔离PG/API/Jobs、typecheck与独立Next webpack生产构建通过；3302真实浏览器使用明确受控fetch验证新增409后保存、复制、取消/确认删除，不冒称原数据验收。见[设计](superpowers/specs/2026-10-15-scene-management.md)/[验收](../output/workbench/scene-management-qa/receipt.json)/[预览](../output/workbench/scene-management-qa/preview.png)。临时服务/目录/页面/容器已清理，无供应商调用、消费者、原课程/媒体写入；不做拆分合并/撤销/清理。
- [x] **场景管理原环境启用及实际保存验收**：用户继续授权后，实际检查发现原15432数据库已恢复，无需擅启容器；0活动任务/0消费者，旧队列workflow0/render0/celery5保留。先保存0700/0600迁移前PG备份及逐行hash，再核对启动器/进程身份，正常TERM重启同一受控API/web启动器，API初始化迁移可空`scenes.deleted_at`。在独立项目“场景管理实际保存验收副本（不改原课程）”`313a1ad9-f719-4a1c-9256-2527bd803d3e`真实浏览器保存：复制code章保留音轨/代码/步骤；追加待配音卡片；取消删除零提交，确认删除后重开仍移除。删除前冻结的三章版本保留归档章且GET前后一致，过期新增409/归档编辑与预览404。真实API/PG而非fetch替身；一次exact-label自动化选择器误匹配经只读核对后继续，输入未丢且未重放写入。原24项目/145场景/18候选/20版本/58任务/58attempt逐行不变，仅验收项目增加4场景行（3活动1归档）及1快照；238媒体、73对象、配置、容器/卷、队列一致。最终API/web ready，0活动任务，磁盘正常；未起消费者、未收费，验收页面已关闭。见[启用验收](../output/workbench/scene-management-activation/receipt.json)/[实际界面](../output/workbench/scene-management-activation/preview.png)。
- [x] **未保存草稿恢复（代码与原页面只读加载验证完成）**：当前浏览器localStorage按课程/项目/章节隔离，覆盖课程标题文稿、口播/代码/步骤/连线/数组快照原始输入、图表JSON与新增卡片。顶部本机列表可定位非首章或复制已移除章文本；只显式恢复到表单，恢复后仍未保存/未复核，版本变化仅复制/丢弃；成功保存才清对应备份，409/取消不清，非法JSON与存储失败均保留输入并提醒，不偷偷腾空间。226Node、typecheck、独立Next webpack构建与13项受控浏览器检查通过；修复新建项目双重放弃确认，跨表单备份保留。常驻3000原页面已自动加载新UI，原生两次GET、无mock/输入改动；未重启服务、改原课、迁移或收费。见[验收](../output/workbench/local-draft-qa/receipt.json)/[预览](../output/workbench/local-draft-qa/preview.png)/[使用说明](getting-started.md#本机未保存草稿恢复)。临时3303/构建副本/测试存储/自有页面已清理。仅同浏览器同origin、不加密；多标签页比较仅尽力保护，非原子并发锁，不做云同步、历史草稿或自动合并。
- [x] **执行器响应提示（已在原工作台启用）**：新增只读GET `/api/consumers`，独立Celery控制客户端只读active_queues元数据，不导入queue/worker、不派业务任务；只回workflow/render检测到/未检测到/未知、响应数和时间，不泄露worker名、broker或异常。连接/读取/响应1s等待、禁连接重试；前端首次+手动刷新，5s取消、不轮询，刷新不留旧正向状态，404/坏响应/失败显示未知，不改排队/提交规则。230Node、171离线Python、108隔离PG/API/Jobs、typecheck/独立Next webpack构建通过；空临时Redis最终真实检测1.142s未响应、停服0.001s未知，控制客户端不替换current Celery app，队列全0且未起消费者；受控3304真实浏览器10项检查、0页面错误，不冒称原数据验收。代码验收时旧API仍404，后续已受控加载并在原页面原生验收；未改原课/消费旧队列/收费。临时服务、Redis、目录、自有备份/页面已清理，见[验收](../output/workbench/consumer-readiness-qa/receipt.json)/[预览](../output/workbench/consumer-readiness-qa/preview.png)。未响应不等于离线，响应不保证beat、供应商或执行成功。
- [x] **原API受控加载新检测路由**：确认0活动任务/0消费者及当前端口、启动时刻、cwd、命令、控制器归属；API/web同属监督器，按正常SIGINT重载同一监督器，未单杀子进程绕过监督。原生GET200/no-store、实测1.011s两队列未检测到响应；原3000页面无mock、手动刷新时间变化、0错误、仅GET、0输入改动；恶意Host/Origin均403。前后六表所有行哈希、238媒体、73对象、私有配置、三个容器身份/启动时刻/挂载及队列workflow=0/render=0/celery=5完全一致；API/web ready、任务0、无强杀/容器重启/收费。自有验收页已关闭并结束，见[原环境验收](../output/workbench/consumer-readiness-activation/receipt.json)/[预览](../output/workbench/consumer-readiness-activation/preview.png)。
- [x] **项目级音色设置（代码及原环境验收完成）**：公开音色ID输入，不改全局.env；nullable projects.voice、历史NULL继承默认，免费PATCH校验项目revision/ID/初始分镜任务，显式固定资源与音色，仅项目升版，场景/旧音轨/版本/任务不变。新voice/timing及新版本/预览用有效profile，旧冻结任务保留，错音色发布attached=false；默认批量兼容原策略，固定音色按profile复用且与估价共查，不自动重试。任务列表补齐50条外当前匹配任务，voice_current=false标旧音色、不给它阻挡新选择或误重试。复用音色项目草稿、取消/忙碌/409/离开与旧API缺字段保护，不虚构音色目录/语速/克隆/付费试听。240Node、182离线Python、116隔离PG/API/Jobs共538项、typecheck/独立Next webpack构建通过；3316受控浏览器14项，1次假课程免费保存/1次只读估价/收费确认取消，0任务提交/页面错误，代码阶段原API/数据库/队列未访问或改动，后续原环境启用见下一项。旧媒体/版本/隔离性、旧结果不附加而新音色可发布、冻结对齐/预览、新旧去重和50条外任务均有真实隔离DB测试；临时页/草稿/服务/构建副本已独立清理。见[设计](superpowers/specs/2026-10-15-project-voice-design.md)/[验收](../output/workbench/project-voice-qa/receipt.json)。供应商音色权限与听感未验，无收费。
- [x] **原环境受控迁移/加载项目音色**：原环境0任务/消费者，复核监听及控制器PID/启动时刻/cwd/命令/UID/父进程/进程组后正常重载自有API/web，仅加可空无默认projects.voice列。原生9项API检查（免费保存、同值幂等、409、三项422、403、当前音色只读估价、隔离/无新任务版本）和原3000无mock浏览器6项（取消不PATCH、1次真实免费保存、隔离、切课/刷新持久化、草稿清理）通过；两个自有验收副本/11复制章已按UUID/标题/revision/音色/场景清单和无任务版本候选条件事务清理。25原项目仅新增voice:null，其余字段哈希及原音色值不变，另外五表（149章/18候选/21版本/58任务/58attempts）、238媒体/73对象、配置/容器及队列0/0/5未变；10文件代码哈希与已验交付一致，最终API/web ready、0任务/消费者。验收页独立关闭并finish，无强清理/收费/试听/beat。见[原环境验收](../output/workbench/project-voice-activation/receipt.json)。供应商音色权限与听感未验证；20组真实收费验收仍最后，预算另行确认。
- [x] **提交前费用预估（代码及原环境验收完成）**：分镜/候选/单章与批量配音/收费显式重试在原确认框展示CNY参考价、数量、快照日与官方URL。只读repeatable-read接口校验项目/章节revision，复用真实任务哈希与批量特有同版复用规则；重试按冻结输入单独估新调用，不因已有音轨误报重配免费。共用供应商完整prompt/schema/max_tokens8192与旧协议；token为经验区间，seed-tts-2.0按3元/万Unicode码点参考、含空格标点，未扣套餐/免费量。价格基于2026-10-15官方域名检索摘要，直读受fake-IP SSRF保护阻断未绕过；未知型号/协议/过期30天/损坏数据均未知非0。5s取消、旧API404/失败/坏响应降级未知仍须明确收费确认，409不确认、切页晚响应不提交；取消零派发，不改原计费/重试规则。236Node、179离线Python、110隔离PG/API/Jobs、typecheck和独立Next webpack构建通过；3305受控浏览器11项检查、10次只读估价、9次确认全取消、0业务写入/页面错误。新增隔离测试排队任务污染经根因定位改为每job addCleanup取消，完整110重跑通过，未改生产领取规则。代码阶段仅原API GET openapi，未重载原服务；随后原环境受控加载及无mock验收已完成，见下一项。临时服务/构建/自有页面清理，0供应商调用。见[设计](superpowers/specs/2026-10-15-cost-estimates-design.md)/[验收](../output/workbench/cost-estimates-qa/receipt.json)。估价非账单/硬上限，不做账本或预算拦截。
- [x] **原API受控加载估价路由**：0活动任务/0消费者及回环监听、启动时刻/cwd/命令/UID/进程组/父控制器身份复核后，正常SIGINT重载同属监督器的自有API/web，无强杀/容器重启。原生11项接口检查通过（Python/RAG配音和候选、真实待配音批量、空项目生成、冻结重试7份200/no-store估价，409/422/422/403四项拒绝）；原3000浏览器无mock，3份真实估价/确认均取消，0业务写入尝试/页面错误，未改输入、核对复选框或localStorage。六表全行哈希（25项目/149章/18候选/21版本/58任务/58attempts）、238媒体、73对象、配置/容器身份及队列计数workflow=0/render=0/celery=5前后相同；代码6文件哈希与已验交付一致，最终API/web ready、0任务/消费者。验收页已独立关闭/finish，无收费/beat。见[原环境验收](../output/workbench/cost-estimates-activation/receipt.json)。20组真实验收仍最后安排。

- [x] **整课配音与导出检查（代码完成，原环境功能已验证）**：用户已批准执行。整课总览保留逐章/逐版本人工确认，选择已确认的待配音章节后一次付费确认；项目级批量接口事务校验归属/双revision/状态，已有本版任务（含失败/取消、配置变化）复用，不自动重试，ready/待对齐不批量重配。当前场景任务补齐最近50条之外的历史；显示完成/失败数量与原因。导出前复用DSL校验，未保存/无分镜/待配音/待对齐/缺音频引用/字段布局错误可定位章节，实际媒体仍由冻结接口校验。208Node、164离线Python、99隔离PG/API/Jobs、typecheck及独立Next webpack生产构建通过；真实浏览器在临时3301生产页使用明确受控fetch，验证取消零提交、dirty轮询保留、409选择保留、批量仅两章、失败不重试、版本确认失效与定位。一次测试选择器误匹配Next announcer已记录并修正，不冒称生产链路。见[验收记录](../output/workbench/course-workflow-qa/receipt.json)/[预览](../output/workbench/course-workflow-qa/preview.png)。代码阶段原PG/Redis停止造成数据库不可用，未恢复原容器/API/web/worker或改原课程/收费；测试容器、临时网页/服务/构建目录已清理。原环境后续激活见下项，不改写此处历史测试边界。
- [x] **原环境激活与无收费安全验收（已启用）**：用户明确执行后，原PG/Redis/RustFS已自行运行，确认0活动任务/0消费者，旧celery队列5条保持不动。仅用原受控启动器启动loopback API/web，无worker/beat/容器变更。实际Python11章、RAG9章及预览副本10就绪+第2章待配音总览/任务数、导出阻塞定位、dirty轮询保留与取消临时输入均通过，native fetch无替换，未勾选人工核对或调用付费按钮。新批量路由空body422、Host/Origin403；六表全行hash/238媒体/73对象/配置/容器身份及58jobs/58attempts精确不变。浏览器输出页保留、任务正常finish；完整网络resource未在finish前导出，仅保留先前inline概要，不冒称完整trace。验收期间另项目`rtc-aigc-demo/web`曾新起`*:3000`，全局status正确拒绝`non_loopback_listener`；未擅停外部进程、改端口或绕过检查。**最终复核时该外部监听已自行消失**，仅原自有`127.0.0.1:3000/8000`，重新校验启动时刻/cwd/command一致，status确认API/web ready、0活动任务、磁盘正常；最终六表/媒体/配置/队列快照仍与启动前完全相同，见`final-status.json`/`listeners-final.json`/`final.json`。原浏览器开发hydration与favicon404如实记录，未扩展修复范围。[本次激活证据](../output/workbench/course-workflow-activation/receipt.json)/[实图](../output/workbench/course-workflow-activation/preview.png)。配音/渲染消费者仍未启用，不会处理新提交或历史任务。
- [ ] **新文稿完整制作效率试跑（先完善其他功能，预算待确认）**：按用户最新安排先补产品功能，20组真实验收放在最后；不因“继续”自动收费试跑。未来获批预算及停止条件后记录人工耗时、修改次数、供应商费用；不顺带重启已暂缓的同步实听或nums修正。

- [x] **流程图手工连线编辑代码（当前主线）**：用户已确认设计/实现，现有节点from/to下拉增删≤15，空数组可存，复用PATCH/DAG/revision；不增节点CRUD或拖拽。仅改边保留ready/原音频/时间轴，原待配音/待对齐不提升；改口播仍失效。164离线Python、91隔离DB/API/Jobs、184Node、typecheck/build通过，见[代码验收](../output/workbench/flow-edge-qa/receipt.json)。未改边仍用旧请求，避免不必要字段；下项已获单次激活授权并完成，仅独立副本数据变化，无原件/收费改动。
- [x] **连线功能激活与独立副本实际保存验收**：用户明确继续单次API重载，仅旧自有API进程组TERM并按原模式启动；web/队列/DB不重启。独立副本8fe1e4f9-6a70-4894-b81a-9384b9b2fcdc第3章实际新增/保存重开、空边、成环422回滚/输入保留、并发409不覆盖未保存输入、旧候选base冲突保护、三条可见SVG路径预览通过。新增仅1project/9scenes/1version/1candidate，所有旧六表行/源音轨/词缓存/旧视频字幕/原容器配置不变，58attempts/0active，无新generate/voice/timing/render。见[激活验收及预览图](../output/workbench/flow-edge-activation/receipt.json)。浏览器输出页保留且静音暂停，实听及新MP4不在此验收范围；维护授权不沿用到下一次。版本历史浏览已进入下项设计。
- [x] **冻结版本历史只读浏览（已启用）**：用户明确“实现”，[设计](superpowers/specs/2026-12-17-version-history-design.md)/[计划](superpowers/plans/2026-12-17-version-history.md)已按TDD完成。项目隔离的50条摘要/cursor，旧主题与原稿来自冻结DSL，时间“未记录”；只读详情查看口播/代码/完整场景JSON，React转义且不展示profile，组件不触碰父project/dirty/Player。94隔离DB/API/Jobs、164离线Python、187Node、typecheck/build通过，无表/Schema/依赖/媒体/provider改动，无常驻写入/收费/新任务；[代码及运行边界](../output/workbench/version-history-qa/receipt.json)。此链接保留为代码阶段历史证据；真实异步/未保存输入验收见下项新记录，不把SSR当浏览器。
- [x] **历史浏览激活与真实未保存输入验收**：用户确认端口空闲并明确允许本项目启动及一次API重载。再次核对空闲3000、原API/消费者idle；仅启动loopback本web、TERM已归属API后按原命令启动，不处理外部项目或worker/DB。`http://localhost:3000`已可用、新GET200。独立副本真实r4三条边与冻结r1两条边显示不同；未保存输入在详情/刷新保留。浏览器受控50+2分页/错误保留52/空列表、关闭详情晚响应及切项目晚列表保护通过；真实临时SQL分页已于代码阶段通过，不新增52个线上版本。246次所捕获实际API请求均GET，native fetch与临时输入恢复，scratch关闭、输出页保留；六表/原件/73对象/容器/消费者精确未变，58attempts/0active无新任务/收费。见[新激活记录](../output/workbench/version-history-activation/receipt.json)/[预览](../output/workbench/version-history-activation/preview.png)。当前浏览器Next hydration diff为Tabbit tray/沉浸翻译注入html属性，已如实记录、未屏蔽或改扩展；不保证无扩展浏览器全覆盖。
- [x] **旧版与当前已保存稿变化摘要（当前项完成并可用）**：用户确认“实现”，复用GET项目的锁内已保存稿、冻结DSL及scene.id比较主题/增删/共有相对顺序/类型、口播、代码、步骤、连线、结构、时间线与图表。前端纯函数/独立epoch及项目隔离，全部GET，不读取dirty内容；对象键顺序忽略、数组保留、边pair顺序忽略，不误报配音/字幕/时轴或“全版本一致”。199Node、164离线Python、typecheck、隔离源码Next webpack生产构建通过（原.next/服务未重启）；后端/94SQL本轮未改未重跑。真实副本r1两边→r4三边只报第3章连线、dirty保留；受控错误/关闭/切旧版/切项目晚响应保护通过。原六表/媒体/容器/73对象/进程及58attempts/0active未变，无新任务、版本或收费。[验收](../output/workbench/version-change-summary-qa/receipt.json)/[预览](../output/workbench/version-change-summary-qa/preview.png)。无回滚、逐字diff或旧视频预览；其他暂缓不变。
- [x] **口播/代码/连线字段旧新值（当前项完成并可用）**：用户确认实现，沿用摘要折叠文本与同次比较快照，仅共有场景三字段变化时捕获字符串/null；代码白名单language/source/array_name、连线from/to，空文本/未设置/[]明确，React转义，旧fixture兼容，输入后续变化不影响已产值。203Node/164离线Python、typecheck/隔离源码Next webpackbuild通过，原.next与进程不动，94SQL后端未改未重跑。真实RAG副本r1两边→r4三边/dirty保留；代码口播空值/恶意文本/长JSON、失败保留与关闭晚响应是明确受控传输，无live版本创建；116捕获皆GET，native fetch恢复、自有临时口播已确认丢弃。六表/媒体/配置/容器/73对象/进程及58attempts0active未变，无费用/重启。无逐字diff/回滚/旧媒体。[验收](../output/workbench/version-field-values-qa/receipt.json)/[实图](../output/workbench/version-field-values-qa/preview.png)。
- 新增运维/备份工作先暂停，已交付服务不撤销；人工同步/nums及20组收费验收仍保持原暂缓状态。

## 已推进的部署与交付项（非当前主线）

- [x] 只读检查本机API/网页/两队列/RustFS健康、五个监听端口回环、Host/Origin拒绝、配置0600；任务尝试仍58且活动任务0。证据 `output/workbench/deployment-review/readiness.json`。
- [x] 整理[本地启动/停机/交付手册](local-operations.md)；明确恢复服务可能执行已排队的收费任务，不盲目重启，不删除卷，不沿用旧PID。
- [x] 完成[已安装版本许可初筛](dependency-license-review.md)，不是商用合规批准：Remotion4.0.534自定义许可，实际Redis7.4.8为RSALv2/SSPLv1，当前FFmpeg为GPLv3+，Noto为OFL1.1。
- [x] **本机空闲隔离备份/恢复演练**：真实PG dump/新库恢复6表、73个S3对象（bytes与用户metadata）、2865文件（源码/锁文件/固定字体/媒体/words/输出），私有配置加密与解密验证；API项目/版本/音频/MP4/SRT及缺MP4缓存从新S3回填通过。备份362090292bytes在仓库外0700目录，密钥单独0600保存；无供应商环境或消费者、attempt仍58，原数据不变，2临时容器/网络/恢复目录已清理。[验收记录](../output/workbench/recovery-drill/latest.json)。未停原服务，仅首尾hash和恢复结果相同，不冒称生产停写一致性。
- [ ] **生产停写一致性**：需另行确认全写入者范围/停写窗口与恢复授权；本机空闲演练不代替原子一致备份。暂不因核心功能开发而停机。
- [ ] **跨设备/异地备份（用户明确暂缓）**：用户要求先不做，继续核心功能；不再主动安排传输或反复要求选存储目标。未来重新授权后确认目标盘/异地存储、预算/数据权限、保留周期和独立密钥，并做异地恢复。当前备份同机同盘、无自动调度，不能计作异地灾备完成。
- [x] **当前镜像固定（不升级）**：Compose与两套隔离测试统一PG16.13/Redis7.4.8 RepoDigest，RustFS原digest不变。134离线+87真实临时PG测试通过，IPv6隔离API/PG/Redis/Celery/RustFS350帧渲染实测通过，冻结/去重/取消0attempt/私有下载/缺缓存回填通过。原容器ID/StartedAt、6表、配置与原媒体不变，attempt58/0active；未重启或拉新版本。记录 `output/workbench/image-pin-qa/receipt.json`。固定不等于自动升级，今后变更要重新隔离验收。
- [x] **当前个人使用范围与许可初筛**：用户明确个人使用。再次完整读取Remotion/Player4.0.534本机LICENSE，individual符合Free License，无需为当前用途购买Company License。Redis7.4.8沿RSALv2内部使用路径保留，不提供第三方Redis服务；官网全文抓取受安全检查限制，以官方搜索说明交叉核对，不冒充全面法律批准。未购买/迁移/升级。详见[个人范围与证据](dependency-license-review.md#已确认当前个人使用范围)。
- [ ] **用途改变后的许可复核（条件项）**：若改公司/多人/对外收费软件服务或打包分发，重新核对Remotion/Redis/GPL/OFL及供应商音色、对应源码/NOTICE义务。个人资格不免模型/配音费；固定digest不等于商业批准，不擅换Valkey。
- [x] **资源只读盘点**：主机约52.6GiB可用，应用媒体/交付/依赖/备份及3个已归属卷已测。36音频与54发布缓存hash匹配，S3全部73key被已知DB记录引用；旧示例6缺词侧车（完整Python/RAG侧车都在），不补配音。118未直接匹配文件不等于垃圾，Docker可回收统计为全主机共享，不准自动删。原状态/attempt58不变、0新任务。详见[资源报告](resource-audit.md)。
- [x] **受控手动启停实施**：`npm run workbench:status` / `npm run workbench`，前台仅缺失API/web、同项目健康服务复用不接管；无worker/beat入口，仍人工确认。Ctrl+C/TERM忙或DB失败阻塞，idle只本次Popen group TERM，子group未退出不报成功，不强制KILL/删卷。隔离真实HTTP双角色/父子进程回收与本机只读复用通过；原服务/6表/原件不变、attempt58/0active。详见[手册](local-operations.md#受控前台启动器macos)与`output/workbench/controlled-startup-qa/receipt.json`。
- [x] **真实API/网页冷启动验收**：用户批准维护窗口后，核验原组身份/空闲并TERM；实际启动器owned冷起API/开发页、Ctrl+C exit0两端口释放通过，另实测预编译生产web:start（7script）、项目/冻结版及音频/MP4/SRT哈希、Host/Origin403。现已恢复原dev网页模式和同API命令。原容器/6表/配置/原媒体/73对象inventory不变，58attempts/0active，workflow/render/beat3原进程启动早于窗口，未重启/付费。详见[冷启验收](../output/workbench/cold-start-qa/receipt.json)。
- [x] **冷启后真实浏览器只读回归**：Tabbit新临时页验证项目加载、Python C11章/第4章代码快照控件、静音Player时间推进并暂停、RAG9章/第3章步骤表单及高级JSON、重新载入。浏览器CORS取实际下载链接MP4首1024bytes（206/hash）及完整SRT（200/hash）；无写请求/pageerror/HTTP失败。2次hydration提示的diff是Tabbit tray注入html属性，原SSR无该属性，未加屏蔽。原服务/6表/配置/原媒体不变，58attempts/0active/0新收费；仅自身临时页关闭，原tab不动。详见[浏览器记录](../output/workbench/post-cold-browser-qa/receipt.json)。不替代保存/收费/取消全流程或实听，浏览器未传完整MP4。
- [ ] **整机/基础容器冷启动与原子生产停写**：本轮仅应用服务冷启，未重启PG/Redis/RustFS/主机，也未设置原子全系统写入锁；需新的窗口及恢复/收费队列授权。不用HTTP/static验收替代独立浏览器全功能或整机故障恢复。
- [x] **只读磁盘预警**：按[批准设计](superpowers/specs/2026-10-14-disk-warning-design.md)在workbench:status新增ROOT文件系统可用bytes/20GiB与ok/low/unavailable；低于仅提示，读失败不泄露异常，不改变既有返回码/字段或run，不阻断任务/启停/删除，不监控/预留容量。新增5例与原25例通过，164离线PASS/87数据库SKIP；真实只读status实测55887339520bytes（约52.05GiB）ok，原服务/6表/配置/原件与58attempts/0active不变，无新任务。详见[验收](../output/workbench/disk-warning-qa/receipt.json)。Docker VM额度仍未独立验证。
- [ ] **资源管理实施**：配额/最小余量策略、目录/版本/诊断保留期限与删除权限仍需确认。只读预警不代替配额；暂不加自动重试/清理器，避免误执行收费任务或删除引用资产。

## 仍暂缓，不能计为完成

- [ ] **最后阶段：20组固定真实教学验收**：用户明确先完善其他功能，最后再跑20组。既有2/20结构交付，18组缺失；正式执行范围、复用与重跑策略须届时确认，新模型/配音调用须先有总预算/停止条件。不用11个章节或本地demo凑20例。
- [ ] 供应商账单核对；自然表达、技术事实及完整听检。
- [ ] 公网/多用户/外部S3 IAM/HA/Windows支持：超出当前本地交付边界，不开放端口替代鉴权。

本机恢复演练、镜像固定、资源盘点、受控启动器、磁盘预警及真实API/开发与生产网页冷启、重启后浏览器只读回归已完成并恢复原模式；当前个人用途与许可适用初筛已明确；未来商用软件/分发须重核，异地备份需目标与权限，整机/容器冷启、原子停写与清理/配额策略需额外窗口/范围授权。人工同步、nums修正继续留在本表；跨设备备份明确暂缓，当前开发主线回到文稿→分镜→编辑→配音→导出核心功能，不再以新增运维盘点替代产品开发。
