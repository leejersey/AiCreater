# 交付记录

本文档记录各功能的交付详情、验证报告和历史尝试，从原始 README 中迁移。

## 2026-10-21 V6真实三段课端到端验收通过（主观画质/逐词听检待确认）

用户续批完成剩余事项后，本轮最多2次真实模型请求，实际原响应选择漏斗、对话/状态、处理链并通过显式角色/统一ID验证；保留原输出不手改决策。脚本最初过严比较段落分隔符，改为仅允许段首尾空白差异复用已有真实音频，本地重放0额外收费。新增回归修正分隔符造成演示引入段空行溢出，仅trim显示不改正文/cue。

500项Node、435项全Python（临时原生PG无跳过）、类型检查/私有Next生产构建通过；修正两处旧API费用测试仍按1次估价的过期断言，不降低V6最多2次估价。真实三段源→原配音缓存对齐→严格校验/正式共享渲染，1361帧45.37秒1080P；原生临时PG冻结DSL/机制快照→实际生产CLI出MP4/SRT→作业发布校验→HTTP200/SHA一致、发布前409、冻结版本不变（另1项CLI下载烟测）。完整解码与原片PCM相同、实际审看三段CLI关键帧、回退和3旧金样像素相同。原服务健康200/匿名401，本轮未重启或改原用户数据/任务。模型实际2请求3092输入/264输出token，0新增TTS，不自动重试；最终账单金额未对账。

交付 `output/workbench/v6-final-acceptance/frozen-cli.mp4`/`frozen-cli.srt`，证据 `receipt.json`。仅此短验收课通过，不等于所有文稿/长课正确；主观参考片质量由用户确认，人工逐词听检及全历史画面穷尽未完成。未把本地缓存对齐或音频SHA相同冒称人工听检。

## 2026-10-21 V6单摘录编号与显式角色修复上线（零新增付费）

新对话协议使用context/message/initial_state/state_after，非零均为原稿摘录ID，去掉update的1–3槽位歧义；0表示不存在的前文/结果。可选context_messages贯通schema/types/双语言校验/编辑/草稿/存取/渲染；按显式角色标前文/当前，结果来源不再作输入或连接端点，缺当前消息/重复角色/未知引用拒绝。新生成/候选、去重、估价/用量和worker子进程同步v6，v1–v5旧任务/快照原语义保留，不迁移失败任务或自动重试。

5新增Python先红后绿、3新增Node；138临时原生PG相关无跳过、499Node及类型检查通过。受控两阶段返回真实编译/原配音缓存对齐/严格校验/正式渲染454帧15.13秒，完整解码与PCM一致，实际查看134/255帧；不是本轮真实模型验收。原环境空闲/身份核对/私有备份后同参温替换workflow、正常重载API/web，并温替换render避免旧schema缓存；Beat不变，无新增消费者角色，9表全值与326文件不变，健康200/匿名401。0新模型/TTS/任务提交，未改用户课程。全Python/生产构建/逐词听检/真实v6准确率未验，收费复验另批；旧失败任务直接重试仍保留旧协议。见 `output/workbench/role-director/receipt.json`。

## 2026-10-21 真实模型编排抽测：未通过，按两次授权停止

用户明确授权最多2次模型请求、不重配音/不改原课。使用现有79个Unicode码点的取消订单验收段，真实DeepSeek两阶段均HTTP200：选中dialogue，但详细计划返回state=1/a=2/b=5/c=3/update=5；update要求0–3槽位序号，模型填了摘录ID5，`/p1/update enum`在严格校验处拒绝。人工核对也发现说明句被选为消息，不能仅把5改2就称质量通过。

已保留不含请求头/密钥的原始工具输出和按响应重建的用量（1849输入/109输出token；失败时高层回调未聚合reported，不能据此记作免费）。2次上限已用尽，0额外付费重试/TTS/原课写入/服务重启/非法稿发布，未手改输出冒称真实成功，未进入成片阶段。接下来应消除摘录ID与槽位编号混用并明确角色，而非继续只调提示词；新付费试跑需重新授权。见 `output/workbench/director-choreography/live/receipt.json`。

## 2026-10-21 AI编排首批：源角色与相关消息连接

在已有两阶段严格源摘录协议内强化initial state/输入消息/字面更新结果角色，增加state/update字段描述与通用示例；不增加wire字段/服务/模型调用次数。选择dialogue声明非update片段是相关材料，编译器生成消息→状态连接，cue使用两个端点较晚原稿；结果不作为输入连接，没有实际消息的纯update拒绝，不根据请求推断结果。旧稿/冻结不重算，渲染器不变。

4项新用例先红后绿；44相关离线、33临时原生PG/导演/冻结、496Node及类型检查通过（重叠不求和）。受控工具输出→真实两阶段处理/编译→既有真实配音word cache对齐→严格项目校验→正式机制渲染，无编译后手改；15.13秒新旧MP4完整解码、PCM一致，回退同帧相同，审看消息汇入/状态更新关键帧。该片明确标“非真实模型”，不能替代真实选型质量。未改用户课程/重启服务/产生模型或TTS费用；全Python/生产构建、真实模型准确率、逐词听检仍待。见 `output/workbench/director-choreography/receipt.json`。

## 2026-10-21 机制演示接入共享渲染与工作台

追加独立mechanism风格，复用原“课程设置→视觉风格”保存/草稿/冻结接口，无新服务或DSL。稳定风格ID派生presentation运行时标记，不依赖label且不污染冻结tokens；旧四风格和无新分组场景仍走原路径。共享SceneGraphics按已有process/dialogue/funnel启用三类过程演示，Video统一静音/有声/正式导出，加入动态正文/原稿间隙的字体容量检查、新模式安静页头字幕/上方草稿水印；既有默认风格保持。

先红后绿，496项Node、类型检查、8项原生PG样式快照/版本测试通过。真实隔离Next/API/PG浏览器保存200→刷新→实际播放到首层并暂停→三路由演示通过，场景/音轨不改、旧快照不变、0任务/页面错误；正常清理测试页/唯一Cookie/服务/DB。实际标准KnowledgeVideo导出三段45.37秒MP4，完整解码/PCM与原真实配音片相同，3旧金样逐像素相同，回退同帧一致；草稿重选Composition元数据后确认无音频模式标注可见（原测试复用正式metadata导致参数未生效，不作为通过证据）。原服务只读健康/匿名401及路由编译通过，无重启/课程写入/收费/新依赖。仍是人工编排素材，未做AI提升、逐词听检、全历史或全课质量/生产构建；见 `output/workbench/mechanism-style/receipt.json`。

## 2026-10-21 视觉优先第三批：为什么进入下一层

新增独立FunnelDemonstration纯帧原型，复用已有层/侧注/cue/动作；仅从顺序匹配字幕和层间原文显示已到时间的衔接文字，区分当前/下一层。连接与移动标记共用折线几何，只展示原connect，不编流量/比例/成本数据。保留未来文字门禁及原稿末尾声明；支持2/3层和3侧注，新增失败用例修正第三侧注重叠。调整文字列宽避免顶部短语不必要断行。

6项专项、492项全Node和类型检查通过。原版/新版15.5秒（465帧）1080P30fps实际渲染，完整解码与PCM音频SHA一致、回退再跳430帧PNG相同；实际中文字体检查及154/290/430帧/最终对照图审看。私有人工编排仅高亮/图标/连接时长，原音轨/原文/字幕/cue不变，未改生产默认或原课程，无服务重启/模型/TTS/依赖/设施新增。三类原型已齐，下一步可选生产入口/冻结兼容与AI编排；视觉确认/逐词听检/全课仍待，不将专项测试当视觉达标。见 `output/workbench/funnel-demonstration/receipt.json`。

## 2026-10-21 视觉优先第二批：上下文如何改变判断

新增独立DialogueDemonstration纯帧原型：前文/当前片段汇入关联判断，保留更新前后；显式update来源是状态素材而非新增用户消息，连接/移动标记只从原动作生成。剩余原稿边界按字幕和原文位置顺序揭示，防重复短语提前显示；多次update按frame排序，不受数组位置影响。私有编排纠正原示例角色、加入原有connect/update，不修改口播/cue/音轨/字幕、不冒充AI输出提升。

8项新增先红后绿、486项全Node及类型检查通过；15.13秒/454帧1080P30fps新旧实际导出，完整解码及解码音频SHA相同，回退重跳420帧PNG相同；中文字体Canvas检查容量并实看34/154/420帧。无模型/TTS调用、原课程/生产默认/后台服务变更、设施或依赖增加。待用户视觉确认、漏斗/生产编辑与冻结接入、AI编排；未做人工逐词听检/完整课程，不以测试数宣称对标达标。见 `output/workbench/dialogue-demonstration/receipt.json`。

## 2026-10-21 视觉优先第一批：同稿音轨过程演示对照

按用户批准的优先级，先用真实“取消订单”段落做画面演变，再补最小组件行为；未先改AI协议或堆模板。新增独立ProcessDemonstration纯帧状态/文本矩形：原稿引入、当前阶段大字/图形、高亮、显式连线移动标记、原稿边界逐步出现及总览回收。只用现有process/动作、字体、GraphicIcon/MarkedText；在私有Composition中人工补已有icon/highlight/连接展示时长，不改变讲稿/cue/音轨，不冒充AI输出提升。v1运动轨迹偏离连线，v2统一直线/分支几何并测试，不增加业务执行或伪造参数。

新增用例先红后绿，6专项、478全Node及类型检查通过。原版/新版1920x1080/30fps/442帧（14.73秒）实际导出，完整解码、解码音频SHA相同，410帧回退复跳PNG逐字节一致；实际中文字体Canvas检查容量并审看开头/推进/总览关键帧。未改生产默认入口/旧课程、未重启服务、0模型/TTS/新设施/依赖。等待用户看片确认方向后，才扩展另外两种教学过程、生产接入和AI编排；未做全课/人工逐词听检，不把测试通过当视觉达标。见 `output/workbench/process-demonstration/receipt.json`。

## 2026-10-21 分镜重复失败：选型与摘录约束分阶段一致

截图对应最新attempt48897fc3，p1/p3/p6仍报anyOf。未留原始供应商响应，不能声称恢复了这些段的具体错误值；但确定复现旧扁平schema的设计漏洞：跨图形合并ID枚举会允许一个长摘录作为漏斗层级，发送端合法、本地按12字限额拒绝，且必选b在发送端允许0。

删除该跨类型枚举合并。v5第一请求只选每段layout，校验完整合法后，第二请求直接复用每段所选图形的同一份本地schema：相同ID枚举、必填/可选零和固定layout；第二次输出不能改变图形。standard在第二请求直接转旧专用生成器，无第三请求、不重试坏响应；用量合计和估价两次上界保持，估价覆盖较大详情/专用请求。不降低引用/时序/重复ID/原稿边界校验，不生成缺失内容。旧编译器读零槽位兼容保留。

先红后绿：425项离线Python OK（170环境跳过）、13项临时原生PG/导演/旧v4与新v5发布回归通过；实际1410字7段原稿经两阶段Mock适配和编译，完整原文/原失败记录不变，0供应商请求。新任务子进程从磁盘加载修复，无须重启全部服务；现有API估价父进程缓存仍是原两请求估算，下次正常重载再更新说明。未真实收费重试，不能宣称该稿已生成成功。回执 `output/workbench/director-constraint-fix/receipt.json`。

## 2026-10-20 分镜失败：严格字段协议兼容修正

用户截图对应v5任务8677f612，7段1410字符，原诊断只有两条根anyOf，原始供应商响应未留存，不能声称已恢复具体错误字段。供应商请求改固定扁平整数槽位（不带anyOf），编译器保留原分型、长度、ID、分组与原稿约束；仅规范化已知非活动整数0和省略的可选0，不丢弃非零意图、不猜必填字段/内容。未知键/非零跨类型字段/bool/string/缺必填/非法引用仍拒绝；动态pN和已知字段安全保留在诊断路径，不回显未知键。

2项先红后绿，421项离线Python OK（170环境跳过）、10项临时原生PG回归通过；以该实际7段原稿和Mock规划走适配器/编译校验，全原文保持，原失败记录精确不变，0供应商调用、0重提。下一任务子进程自动加载新协议；未重启2个现有Worker，父进程诊断/旧较大Schema估价缓存待下次正常重载。不能据离线测试宣称真实重试已成功；用户可从生成入口确认费用后重新提交，不自动计费。记录 `output/workbench/director-schema-fix/receipt.json`。

## 2026-10-20 实际有声交付与导演v5启用

原v4真实实验未达预期，保留全部记录；新增v5固定原稿段落/摘录枚举选择，模型不再编分片/ID/帧，程序构造语义图形及有序动作。严格函数规划仅返回数据、不执行工具；供应商实际把规划拆成两份，解析器改为有界合并不重复段落后整体校验，错函数/重复分片拒绝。采用同一实际响应离线重放验证修复，未手工改选择，未为重放再收费。真实选择漏斗、对话状态、四阶段处理链，复用完全相同的供应商语音和词时间戳，正式45.4秒1080P/30fps有声视频、SRT和关键帧已交付。实际冻结→render发布媒体/字幕验证→隔离API视频/SRT下载200/SHA一致通过，发布前409，冻结不变；未向用户原课派发渲染任务。原稿重复短语改用摘录精确码点而非首次find，重复原文/状态更新先红后绿。

保留代码/概念/对比等旧能力：选择standard最多另请求一次既有生成器；估价含tools/schema及两次上界，成功用量合计发布，部分失败保留未知。v1–v4任务冻结协议保留，v5去重区分；472项Node、类型检查、419项离线PythonOK（170环境跳过），70项原生及追加8项/1项下载通过，均重叠不相加。原API/web与唯一worker角色受控更新，原beat恢复、9表/326文件不变，无强杀/新设施。总5次真实模型实验、3段成功配音操作；原live网络hook未覆盖内置TTS，不能把其speech=0当免费/准确请求数，实际以usage三对事件为证。一个样本不证明通用选图准确率；人工听检、本人长课、全旧冻结像素兼容未验。记录 `output/workbench/reference-grade-visuals/compact/receipt.json`。

## 2026-10-20 在线导演v4：生成、候选、估价与用量接通

新生成/候选任务使用teaching-outline:4/scene-candidate:4，经原worker显式启用semantic_graphics；候选用原draft清理帧而保留图形。旧v1–v3任务冻结协议不变，新去重不复用旧输入，不自动重试或重做旧课。估价按实际导演Schema/教学风格与原图形计输入，支持v4费率冻结并修正生成/候选估价hash缺教学风格导致复用判断不一致。无新框架/服务/依赖。

新增先红后绿测试：67项专项、27项临时原生PG通过（重叠不求和），含Mock实际适配器→worker→原生发布三图形及估价复用、旧协议参数/去重。修正原cancel测试在请求取消后漏完成当前attempt便当终态的夹具过程，验证cancel_requested→ack cancelled再提交，不改取消业务逻辑。472项Node全通过、类型通过，离线Python412项OK/169环境跳过。正常重载原API/web，温和停止原worker角色再用原argv替换，node ping通过，保持1 worker/2原beat、无额外角色，原9表逐行/326文件不变。无真实模型/TTS/原课写入；未重做前端生产构建或全原生发现。代码可在线使用，但T7有声/人工、T8真实模型选图质量、T10本人整课/生产下载/全旧冻结兼容尚未通过。回执 `output/workbench/reference-grade-visuals/online/receipt.json`。

## 2026-10-20 图形续登验收与原环境启用

纠正任务脚本将过期会话误当导航登录的问题：应用实际是原位登录弹窗，保留编辑组件。真实隔离Next/API/PG到期会话经focus检查→原位重登录→空白cue仍保留/保存仍阻止→修正可保存，方向不变、0页面错误/自动任务。与修改/草稿恢复/保存→原生缓存对齐claim/publish→ready播放→冻结同次通过，自有环境/页/Cookie清理，无业务代码补丁或收费。

原启动器在终端进程组、Python基解释器路径与旧预检假设不同，按确切argv/同基解释器/cwd/UID/监听及父进程确认，仅向controller PID正常SIGINT。核对0活动任务、私有PG备份/9表/媒体哈希，短暂暂停原1 worker/2 beat与已验证子进程，重载既有API/web后恢复相同PID；9表逐行与326媒体/私有配置完全不变，健康200、匿名401，无新消费者/强杀/原课程或会话写入。原图形编辑/保存已可用；在线AI导演未切换，T7真实有声/人工、T8真实模型及在线接入、T10本人整课/下载/全旧版本兼容仍待完成。继承前轮472Node/类型/私有构建结果，本轮无业务代码变化未重跑全套。见 `output/workbench/reference-grade-visuals/completion/receipt.json`。

## 2026-10-20 图形任务收尾：回归绿与冻结整课合成导出

修正ConfirmContext调用type→variant、课程数量可选值处理、完整Project夹具，按实际讲稿UI语义验证共享按钮函数，不删测试；quote测试改JSONDecoder取Schema首对象并断言重生成后缀。先定位重现后修复密集图形流程的文字预检溢出：仅在纵向容量不足时复用两行卡片和边缘/行间连线，保留普通流程坐标；新增路由测试并更新该刻意改变的密集布局断言。旧密集图形冻结画面可能改变，未宣称所有历史像素兼容。

472项Node全通过、类型检查通过、私有副本生产构建通过（未写运行中的.next）；离线Python409项OK/168环境跳过，59项临时原生PG/本地对齐/导演回归通过（均有重叠，不相加）。同一隔离浏览器实际编辑/草稿恢复/保存后，以原生claim/publish本地缓存重算到ready，音轨SHA不变；播放器实际播放/暂停，冻结3段并经正式renderer输出37.2秒1080P/30fps整课MP4，完整解码通过。只有合成音频/ASR测试数据，非真实模型/有声课程验收。会话过期后的图形草稿恢复三次遭工具中断/quarantined，已检查只读状态并清理自有临时环境，不声称通过。原环境/消费者/课程未动，无收费/新设施；真实模型、原环境启用、有声/人工审看、本人整课/生产下载/旧版本兼容仍待完成。最新回执 `output/workbench/reference-grade-visuals/final/receipt.json`。

## 2026-10-20 参考级图形T9：图形编辑、草稿与保留配音保存

新增GraphicsFields与小型graphics草稿适配，接入既有SceneEditor：漏斗层/侧注/方向/指向、对话消息/状态、处理阶段/参数、连线/强调/内容更新与原稿锚点。切换先确认，非法原输入和旧格式本地草稿保留；修正选择框精确可访问名。原PATCH新增可选白名单graphics完整替换，no-op不升版本，非法引用/cue与revision冲突整笔拒绝；已有配音的纯图形变更保留音轨、待本地对齐，旧动作帧清除，不自动派发任务或收费。

先红后绿，11项编辑/预览Node专项与59项原生PG/本地缓存对齐/导演测试通过（有重叠不求和）。真实隔离Next/API/PG浏览器通过登录→修改→无效cue阻止→刷新恢复→保存200→刷新保留→取消切换；0页面错误，数据库确认配音未变/needs_timing，0任务，自有服务/DB/页/Cookie清理。全Node471项469通过/2既有失败，类型检查仍7既有错误，不宣称全量绿。原环境预检发现消费者样式进程，未强停/重载，未改原课程或收费。待正式重算后同浏览器播放器联验、图形续登、原环境启用，以及T7有声/T8真实模型/T10整课；未做生产构建/全Python。记录 `output/workbench/reference-grade-visuals/t9/receipt.json`。

## 2026-10-19 参考级图形T8离线批次：导演协议与受控存取

在现有request/适配器/恢复函数增加显式选择的semantic_graphics（默认False），独立导演wire Schema支持漏斗/对话/处理链和受控动作，不新增服务或Agent框架。元素与动作都引用唯一原文，Unicode码点由程序计算；拒绝模型时间戳、陌生工具动作、伪造文字/来源、异常关系；修正有侧注漏斗在恢复时被旧元素总数规则误降格的问题。动作cue错误只输出有界结构路径/固定原因，不泄漏quote。原Worker/API/估价不切换，未调用在线模型或承诺生成质量。

新增9项测试，先红后绿；MockTransport验证三类生成/重生成，56项专项、20项临时原生PG用例通过（重叠不相加），包括quote恢复→对齐→保存/复制/候选/冻结。另以T6三段原稿构造受控输出，Python恢复及TS最终DSL/布局框检查通过，不冒充浏览器字体/真实选型。全Node469项467通过/2个既有失败，类型检查7处既有错误，原quote测试JSON尾部解析错误在HEAD复现；未宣称全量绿。未生产构建/原API重载/原课或媒体写入/消费者/收费，也无新的浏览器或有声验收。T7人工/有声门禁、T8真实模型与选择UI、T9–T10仍待完成。记录 `output/workbench/reference-grade-visuals/t8/receipt.json`。

## 2026-10-19 参考级图形T6：组合版式、原稿批注与静音对照

补齐漏斗主图＋独立侧注/方向、对话＋状态、过程＋参数三组合。新增可选funnel层/侧注绑定与TS/Python容量/原稿/引用校验，复制/候选/冻结、真实时间映射、只读预览保留；在线模型Schema尚不开放。抽取复用MarkedText供三图形显示重点、原稿标签、结论；侧注和结论按自身cue揭示，不假造来源/数量比例，不执行工具。旧场景无新字段时保留原表现。

先红后绿验证27项Node专项与11项临时原生PG/时间轴用例（含三绑定存取子例），实际37.2秒1080P/30fps静音片、9帧、结论边界和3×40码点中文/emoji侧注压力图；倒回同帧与3历史PNG一致。另输出同稿/字幕/时序旧卡片兼容路径的左右对照，6元素漏斗回到通用卡片，不冒充原始历史导出。两视频完整解码通过，不当作有声/人耳同步验收。全Node469项467通过/2既有失败；类型检查仍7既有错误，未全量绿。本轮无原课程/媒体写入、原API重载、消费者、收费、新设施或全Python/生产构建。T7待用户样片确认与有声对照，T8–T10未完成。证据 `output/workbench/reference-grade-visuals/t6/receipt.json`，按原门禁不抢跑AI接入。

## 2026-10-19 参考级图形T4/T5：对话状态与工具处理链

复用dialogue_split/flow_diagram与T2受控动作，新增可选dialogue/process显式绑定。消息逐条出现、旧状态划除/新状态揭示，处理阶段/下方原文片段与失败分支展示；源文锚点、容量、关系、未知字段在TS/Python双侧校验。正文仅原稿摘录，参数不执行，不冒充实际模型推理或业务结果；新字段尚不开放给在线生成模型。时间对齐、去时序、只读预览、复制/候选/冻结均保留字段；未接编辑UI，不改旧文档和旧场景绘图。

23项Node专项与10项临时原生PG回归通过（数据库清理，原库未接触）。实际Remotion 1080P/30fps/37.2秒三图形静音合片，9关键帧、更新边界、显式失败分支、长中文/emoji、倒回同帧与3历史金样像素相同。压力图发现三消息气泡间距不足后先补失败测试，再修12px间距/尾部。全Node465项463通过/2个既有失败，类型检查仍7处既有错误，不声称全套通过；未重跑全Python/生产构建，无原API加载、收费、真实工具或原课写入。T6独立侧注/方向/批注、T7正式有声M1及T8–T10继续待办。证据 `output/workbench/reference-grade-visuals/t4-t5/receipt.json`；计划 `docs/superpowers/plans/2026-10-19-reference-grade-visuals.md`。

## 2026-10-19 AI导演第一批：无配音也能预览画面

新增纯前端待配音/待对齐章临时时序投影，复用Video/Player、现有模板与视觉风格，按Unicode cue顺序入场，支持临时步骤定位。播放器内水印及外部提示明确非真实配音；不读旧音轨、不造文件/音频资产、不保存临时时序或字幕、不派任务，正式就绪预览/冻结/导出护栏不变。草稿模式关闭Player默认5个静音音频占位，正常预览维持原默认。未保存修改仍不进入预览。

新增7项回归，431 Node/类型检查/隔离Next生产构建通过；独立真实Next/API/原生PG概念课播放末卡opacity0→1、0media/浏览器写请求/任务，项目数据不变，代表图已查看。原工作台chunk已热加载功能、API健康，未重启服务或写原课。临时资源正常清理，无收费/新设施；Python未改未重跑。第二批AI选景解释/局部重生成和第三批确认后配音→对齐→渲染仍待开发，不冒称本次全闭环完成。见 `docs/superpowers/plans/2026-10-19-ai-director-preview.md` / `output/workbench/ai-director-preview/receipt.json`。

## 2026-10-19 调整：密码最低6字符

按用户反馈，将注册、新密码、本机重置统一由12放宽到6字符，最大128、非空/非法字符检查、scrypt哈希、会话撤销与限次保持。前端注册/确认/改密和后端PasswordChange/共享校验、CLI提示及文档同步。新增纯边界/哈希/API模型与原生注册→6位改密→退出登录→本机重置回归，先红后绿；10项账户测试在临时原生PG执行通过，类型检查通过。受控重载原启动器后OpenAPI最低6，原六表、已有密码hash、312文件不变；原页面浏览器实测5字符不通过、6字符可用，无提交/改Cookie。未重跑全套Node/Python或生产构建；无收费/消费者/新设施。记录 `output/workbench/password-six/receipt.json`。

## 2026-10-19 修复：未登录首页不跳转

原环境复现：`/api/auth/me`404而课程列表200，首页旧兼容分支直接展示匿名编辑器。移除Home/AccountSession的legacy回退，缺账号接口明确报错；新增根入口回归先红后绿。私有pg_dump备份后，验证当前监督器身份与0活动任务/消费者，正常重载原API及耦合网页，账号默认启用，未登录me/projects均401。原六表已有值及312个媒体/配置文件不变，25门旧课保留且未绑定，不自动归首个注册者。

原环境Turbopack出现连续重新编译及根页/登录页刷新；移出实时日志未消除。保持同源码/API/端口对照已有webpack后稳定，`npm run web`仅增加`--webpack`，无新依赖或设施。原3000实际浏览器验证未登录首页/课程页跳转、登录表单hydration完成可用、404故障注入只报错不开放编辑器、撤销注入后恢复；0 API写入/Cookie改动，验收页正常关闭/finish。420Node和类型检查通过，本次不冒称重跑348Python/生产构建。未启动消费者或收费；旧课程明确认领及双账号完整UI仍待办。证据 `output/workbench/login-redirect-fix/receipt.json`，替代上一条的“原API待切换/404兼容”状态。

## 2026-10-19 后续：账号与课程整体流程首轮实现

按用户确认的“账号→我的课程→免费新建→独立编辑→预览/导出”方案实现。复用PostgreSQL/FastAPI/Next及既有编辑/渲染能力，无新增依赖或永久服务。真实用户名/密码、摘要会话、退出/改密、限次/跨站校验；后台在操作前核对课程及关联场景/候选/任务/版本/媒体归属。旧课程仅可由本机命令显式认领，不能自动送给首位注册者。

新增登录/注册/账号/课程列表/新建/独立编辑页面，课程状态/更新时间、免费创建与费用确认分离。用户草稿隔离，原位续登保留输入且不重发写请求，离开/退出确认未保存内容；账号读取临时失败不卸载已有编辑器，真实切号清空内存。注册表单等待hydration后才启用，避免SSR原生提交丢输入。高级执行器状态默认折叠；未配音章只显示内容草稿，不假称视频预览。原根入口仅账号接口404时保持兼容，401/网络错误不降级绕过认证。

新增4 Node和8 Python账户/权限用例。最终全套419 Node＋348 Python（临时原生PostgreSQL，无跳过）通过，共767项；类型检查及私有副本Next生产构建通过。真实隔离浏览器已验证根入口、注册、新建、手工概念编辑/刷新恢复、过期续登不重发、保存、改密，零jobs/attempts/供应商调用，无API响应mock。最终测试页/Cookie/临时数据库与服务正常清理；原3000另经只读浏览器确认旧工作台仍可用，零原API写入。早期双账号长UI链退出时被工具取消，按协议只读恢复并清理，未重发；完整退出/双账号/前进后退UI仍待补验，不用后端隔离测试冒充。

**原8000尚未加载账号接口、未认领旧课**；切换须先确认账号归属与备份。保持本机试用边界，不增加公网部署、邮件/短信、团队/额度/计费设施，不执行此前待预算的真实课程试跑。详情 `docs/superpowers/plans/2026-10-19-account-course-flow.md`，证据 `output/workbench/account-course-flow/receipt.json`。

## 2026-10-19 后续：手工概念场景已在原工作台启用

用户“继续开发”后，先现场核对任务0、无消费者及服务身份，再正常停止旧启动器并沿用相同命令加载原API/耦合网页，无新增设施或业务代码。原8000概念接口已加载，实际3000→8000浏览器验证概念创建、草稿刷新恢复、角色校验/保存后重载、旧卡片创建和重排通过；不是把请求转至隔离API的模拟激活。缺定义422、过期revision409、陌生Origin403和额外字段422均不改变验收项目。

仅写本轮manifest所属测试项目和两场景，测试页关闭后精确清理，原六表全部行及312个配置/媒体文件hash不变，58attempts/0active，供应商调用0；未启动消费者或容器。保留Tabbit注入`data-tabbit-tray-*`导致的既有开发态hydration提示实证，不掩盖其他SSR错误。本次未重跑755项全套测试，也未执行收费模型/配音、完整效率或20组正式验收。证据 `output/workbench/concept-activation/receipt.json`。

## 2026-10-19 功能优先：手工概念场景与非编程示例

不新增基础设施。按批准清单先实际验收九类场景三种风格（75帧＋66个边界），未发现需重写共享组件的问题。concept真实模型/供应商配音停在预算门槛；33项离线专项不能代替真实课程。

新增手工概念场景、概念角色编辑，复用原文cue/草稿恢复/revision和新增卡片协议，不自动配音。独立数据库/API与浏览器已验证创建、刷新恢复、角色保存、旧卡片创建及已有重排；原8000尚无新增接口，本轮未重启原服务，不能称原工作台完整启用。

批量本地对齐复用既有代码，在独立原生PostgreSQL/真实HTTP/实际子进程上三章通过，缺缓存时整批拒绝、音轨/冻结版本保留；原队列/消费者未动。新增可编辑蒸发/水循环/对比示例和生成器 `--general`，macOS say本机语音，两版25.3秒1080P MP4/SRT，供应商调用0。重排已有功能仅验收、不重复实现。

415 Node、198离线Python及142原生数据库用例通过，TypeScript与独立Next生产构建通过；合计755项去重测试。真实模型/供应商配音、制作效率及20组正式验收仍待预算，人工同步/nums继续暂缓。详见[本轮记录](superpowers/plans/2026-10-19-function-first.md)及 `output/workbench/function-first-qa/receipt.json`。

## 教学项目保存与版本保护（第三阶段首批）

已有 PostgreSQL 仓库、本地 CLI、FastAPI、Celery任务队列、配音恢复与Next.js教学编辑器；完整教学质量验收尚未完成。

在本地 `.env` 设置 `POSTGRES_PASSWORD` 和 `DATABASE_URL`（不要提交）：
`postgresql://aicreater:<URL编码后的密码>@127.0.0.1:15432/aicreater`。然后：

```bash
docker compose -f compose.postgres.yaml up -d --wait
python3 -m services.projects.manage import output/python-sum-project-v2.json --title "Python 循环教学"
python3 -m services.projects.manage get <project_id>
python3 -m services.projects.manage edit <scene_id> patch.json --revision <scene_revision>
python3 -m services.projects.manage reorder <project_id> order.json --revision <project_revision>
python3 -m services.projects.manage version <project_id> --revision <project_revision>
python3 -m services.projects.manage export <version_id> output/frozen-lesson.json
npm run render -- output/frozen-lesson.json output/frozen-lesson.mp4
```

- `import` 输出项目/场景 ID 与 revision；场景数据库 ID 不同于 DSL 场景名。
- `patch.json` 仅可包含 `elements`、`code`、`captions`、`narration_text`；elements 提供完整数组并保留 ID、顺序和 cue。代码/变量/标签修改保留音频，需重新审核技术含义。
- 修改口播删除配音附着、字幕、时长、动画，标记 needs_voice；未补齐前不能创建快照。**本轮不自动调用付费配音恢复**。
- `order.json` 为场景数据库 ID 的完整、不重复数组；过期 revision 报 conflict，事务不会覆盖并发编辑。
- 快照保存 DSL、revision、主题/模板版本、字体 hash、配音配置与渲染参数；之后编辑不改旧快照。导入及快照重验音频哈希/时长/路径，不提供资产删除入口。
- 配音配置记录当前本地配置，导入旧音频的供应商来源无法仅凭 WAV 校验。中文字体 hash 已记录；代码系统等宽字体尚未打包，不保证跨机器逐像素一致。
- 本轮只启动过临时测试 PG，未替你启动长期开发库。不要用 `docker compose down -v` 删除需保留的数据卷。

```bash
python3 services/tests/run_project_tests.py
```

PG 测试使用自有临时容器和随机回环端口，结束删除，不访问用户已有库。普通 `npm run test:workflow` 会跳过 PG 项；不能把跳过当作通过。本轮另跑过真实 PG 的并发、代码编辑、失效、快照、CLI 和资源篡改测试，不调用付费供应商。

## 本机工作台受控启停冷启动验证

需已有基础服务与本人0600配置；不启动Docker/worker/beat，不接管已运行服务。任务忙/DB不可达则拒绝自动停机，只回收本次子进程组且不强制KILL。现有二者都正常时直接报告复用并退出。生产网页仍用原`web:start`手动管理；工具不自动构建或切换模式。[边界与操作](local-operations.md#受控前台启动器macos)。成功`status`的`disk`含ROOT文件系统可用bytes和20GiB阈值，低于阈值为`low`，读取失败为`unavailable`；只提示、不改变退出码/启停/任务。手动快照不保证渲染容量，Docker VM额度另算。

已在用户批准窗口完成真实API/开发网页冷起与Ctrl+C回收，并实测预编译生产`web:start`；现已恢复原开发网页模式，数据不变、无新任务。[冷启动记录](../output/workbench/cold-start-qa/receipt.json)。不等同整机/容器重启或原子全系统停写。

## 当前本机的持久工作台操作记录

已启动并导入两个复核案例：访问 **http://127.0.0.1:3000**，在项目列表选择Python或RAG。两例已重新冻结导出，持久任务中可下载MP4/字幕；口播、代码和步骤可在右栏编辑。本次只复用已有配音并渲染，不产生新的模型/配音请求。

本机服务使用compose project `aicreater-workbench`：PostgreSQL15432、Redis16379、RustFS19000、API8000及Next.js3000均回环绑定。私有随机凭据保存在已忽略的`.env.local-services`（0600），原`.env`未改；不要删除该配置或将它发到聊天/提交版本库。项目、对象和队列用named volume持久化，应用进程暂未做系统开机自启。

进程/项目/导出ID见`output/workbench/services.json`，日志在同目录。若应用退出，先`set -a; source .env.local-services; set +a`，再按上文启动API、workflow/render worker、beat与web；**先检查端口/进程，不要重复启动**。数据库服务可用`docker compose --project-name aicreater-workbench --env-file .env.local-services -f compose.postgres.yaml -f compose.storage.yaml up -d --wait`恢复。停止数据库时用同样compose参数执行`down`，不要添加`-v`；应用进程另行检查停止。

后续点击生成/配音仍会调用原`.env`配置的收费服务；本机服务运行本身不自动发起它们。浏览器已验证两个项目、ready场景、编辑表单、预览控件和RAG正确任务的字幕下载；这不替代同步听检。

## 本地 HTTP API 与编辑器验证

已用独立临时PostgreSQL+真实API+生产页面验证Python教学播放、步骤编辑并重开、非法JSON、轮询保留草稿、409冲突及新建AI文稿，截图 `output/editor-preview.png`。没有触发真实付费任务；真实Redis/Celery双队列的教学渲染与下载现已实测，两个案例的付费文稿→分镜→配音→编辑→导出闭环现已验证；20组课程及同步质量仍待验收，RustFS真实对象存储与恢复已验证。

## 私有 RustFS / S3 兼容存储联调

执行 `pip install -r requirements.txt`，在本地 `.env` 配置 `.env.example` 中的 `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`（保留配置名以兼容S3客户端，不部署旧MinIO服务）。设置唯一access key和强随机secret（可在本地执行 `openssl rand -hex 32`，不要发送到聊天），使用 `MINIO_ENDPOINT=http://127.0.0.1:19000` 后启动：

```bash
docker compose -f compose.storage.yaml up -d
# 查看回环健康端点，不输出凭据：
curl --fail http://127.0.0.1:19000/health
```

然后重启API与Celery消费者，使它们读取本地S3配置。镜像固定RustFS1.0.1及sha256摘要，Apache-2.0，非root、仅发布回环19000，控制台关闭，named volume持久化。ENDPOINT留空保持原本地模式；配置后存储失败会阻止成功发布，不静默降级。HTTP只允许回环/minio，远程需HTTPS。桶默认私有且不得存在bucket policy；外部S3的IAM、ACL和账户级public-access-block需另行检查，尚未验收。

音频和MP4/SRT按sha256+扩展名存为不可变对象。上传先封存/校验；本地缓存缺失时限额下载、核对sha256后原子恢复，已有损坏缓存拒绝而不覆盖。浏览器继续使用项目资产/任务下载API，不获取存储密钥或对象URL；Node/供应商子进程不接收MINIO/RUSTFS存储环境变量。已引用音频在导入、冻结版本及渲染验证时上传，旧导出不会自动批量迁移。未引用对象暂不GC，需预留存储空间。

已按确认从归档的旧MinIO社区服务改用RustFS；官方仓库未归档，1.0.1镜像已实拉取，客户端仍用未归档的minio-py S3 SDK。真实RustFS+PostgreSQL+Redis+API+Celery双队列已验证Python/RAG教学导出，匿名对象GET返回403，删除音频及导出缓存后按sha256恢复。另验证了compose容器删除重建后named volume仍保留对象、6MiB multipart上传和恢复。没有付费调用或商业AIStor许可依赖；仍不代表集群HA、外部S3/IAM或生产容量验收。

可在空闲8000上复跑隔离验收；脚本创建自有RustFS/数据库/Redis，复制样例音频到自有缓存、删除缓存验证恢复，不改用户原音频，结束清理自有容器/进程。输出目录必须是新的：

```bash
npm run test:queue -- --rustfs --project output/python-sum-project-v2.json --output output/rustfs-python-check-new
npm run test:queue -- --rustfs --project output/rag-project-v2.json --output output/rustfs-rag-check-new
```

已验证产物 `output/queue-rustfs-python/teaching.mp4`（512帧/17.067s）、`output/queue-rustfs-rag/teaching.mp4`（879帧/29.312s），同目录有SRT/报告。`--minio --minio-image`仅保留为已有受信私有镜像的兼容入口，不作为默认部署。

## 真实队列教学渲染回归（不调用付费服务）

```bash
# 需要Docker、已安装依赖/FFmpeg，以及已有最终DSL和对应本地音频。
# 8000必须空闲；脚本不停止已有用户服务。输出目录必须是新的。
npm run test:queue -- --project output/python-sum-project-v2.json --output output/queue-check-python-new
npm run test:queue -- --project output/rag-project-v2.json --output output/queue-check-rag-new
```

脚本使用自有随机临时PostgreSQL/Redis，启动真实API、Celery workflow/render消费者及beat；通过HTTP导入教学样例、冻结版本、提交渲染，观察queued→running→succeeded、检查下载校验和及1080P/H.264/AAC/帧数/时长。渲染期间修改场景并断言冻结DSL/导出不变；验证重复提交去重，以及排队生成任务取消后attempt仍为0。禁用供应商凭据、不执行付费任务，结束清理自有进程/容器/中间产物，不读取用户数据库。

实测产物：`output/queue-smoke-python-v2/teaching.mp4`（512帧、17.067s）和 `output/queue-smoke-rag-v2/teaching.mp4`（879帧、29.312s）；同目录有SRT和`report.json`。这只证明真实教学渲染队列，不代表付费生成/配音全链路或教学内容正确性已验收。

## 教学对比面板（第二阶段首个组件）

```bash
npm run demo:create -- --comparison
npm run render -- examples/comparison-demo.json output/comparison-panel/video.mp4
```

样例是手写教学数据+macOS本地say音频（短语级时间，不是云端字词对齐），421帧/14.033s，仅演示组件，不是完整长课或真实模型验收。macOS之外请提供自有合法音频。开始/入场/完成截图在同目录，全文草稿为examples/lessons/comparison.json。

交付对比面板时，本机工作台曾更新至模板版本teaching:2，导入“对比面板 · 本地合成示例”，实际HTTP编辑保存重开、保持音频、冻结快照、真实队列导出及下载SHA验证通过；刷新http://127.0.0.1:3000可查看。本轮未调用收费模型/配音。新类型要求同版本validator/renderer；旧四类项目仍合法，旧导出不删除。模板版本保护下，旧teaching:1快照不能直接由新runtime重渲染，请从项目冻结新版本再导出，不能改旧快照的版本标记。状态图及执行时间线现已实现，配音前确认与基础表单也已实现。

## 数据结构状态图（第二阶段第二个组件）

```bash
npm run demo:create -- --state
npm run render -- examples/state-demo.json output/state-demo.mp4
```

手写原稿在`examples/lessons/state.json`，本地say样例为903帧/30.1秒、1080P30 MP4+SRT；仅证明组件，不是完整长课、真实模型或云端字词对齐验收。实际字体校验发现栈顶与当前标签需要267.7px，已校准320px标签区并保留字宽防溢出检查。数组/对象/栈及六项长中文压力图在`output/state-demo-qa/`。

持久工作台已导入“状态图 · 数组对象栈 · 本地合成示例”，实际HTTP编辑/保存/重开保持音频、冻结新快照、真实双队列/RustFS导出及MP4/SRT下载SHA通过；交付`output/state-demo-qa/workbench.mp4`与同名SRT。浏览器播放/暂停和空数组可视状态已检查，`workbench-preview.png`保留；Tabbit注入html属性产生开发模式hydration警告，未用suppressHydrationWarning隐藏。状态图交付时模板版本为teaching:3（现为teaching:4），旧项目与旧下载保留；旧快照重渲染需重新冻结，不得修改原profile。

本机macOS常驻Celery的prefork子进程在初始化中崩溃，已将默认单槽worker池改为solo，并补红绿测试；任务仍在现有受限子进程内执行，两条队列和配音/渲染超时边界不变。所有自有进程在检查PID和活动任务后升级；未删除用户卷、旧导出或已有任务。

本轮108/108 Node测试、TypeScript检查、70个离线Python测试与62个真实PostgreSQL测试通过（unittest discover总132，跳过的62随后以临时数据库单独运行）。不增加依赖、收费请求、嵌套结构、树或新表单；Next生产构建本轮未重跑，使用既有开发工作台实测。当时下一步为执行时间线，现已实现。

## 执行时间线（第二阶段第三个组件）

```bash
npm run demo:create -- --timeline
npm run render -- examples/timeline-demo.json output/my-timeline.mp4
```

手写串行/异步假设原稿在`examples/lessons/timeline.json`，本地say样例636帧、约21.2秒、1080P30 MP4/SRT。已导入工作台“执行时间线 · 串行与异步 · 本地合成示例”，HTTP编辑保存重开保持音频/字幕/轴数据，冻结新版本、双队列/RustFS导出与MP4/SRT下载SHA通过。**推荐交付为`output/timeline-demo-qa/workbench-v3.mp4`及同名SRT**；浏览器播放/暂停、5个刻度与代表帧已检查，截图在同目录。

关键帧发现零刻度与说明文字重叠，已增加红绿回归并将刻度移至270px。重复冻结相同revision/profile会复用已有版本与导出；早期workbench-v2因此仍是旧布局，保留诊断、不推荐播放。最终接收一项明确示意标签修改后冻结新的版本与任务，实际queued→running→succeeded一次完成，未修改原快照或删除旧文件。

本机自有API/worker/beat已在检查PID和活动任务后升级至teaching:4；旧项目和下载保留，旧模板快照重渲染需重新冻结。133个Node测试、类型检查、73个离线Python测试与63个真实PostgreSQL测试通过（discover总136，跳过的63单独运行）。本轮零收费调用、未执行模型代码，也未跑Next生产构建；音频为本地短语级时序，不能视为原生字词同步或完整2–3分钟课程验收。当时下一步为配音前分镜确认及步骤/变量表单，现已实现。

## 配音前分镜确认与基础表单（第三阶段）

工作台增加已保存分镜总览、当前场景revision复核及中文时长显示。确认只保存在浏览器会话，绑定场景ID/revision；编辑即撤销，重载或切换项目清空，不写数据库，也不限制直接API/CLI。工作台单场景配音/对应voice重试须先复核且无未保存修改，原计费弹窗仍保留，不自动调用服务。

ready时使用实际帧数/30；未配音部分按非空白Unicode码点200–300/分钟粗估并计入已知场景留白，混合状态相加。仅提示可能超5分钟，不截断；英文/代码可能偏差大，时间线示意毫秒不算视频时长，最终仍由实际配音与300秒限制裁决。

步骤表单支持说明文字；代码场景另有高亮行复选、变量增删（最多3个）及输出。高级JSON与表单同一数据源，修改保留cue/ID及状态图items、高亮、时间线event等原字段。无效JSON/字段类型会阻止切入表单及保存，保留输入；后端schema、失效/expected_revision仍为最终裁决。

本轮140个Node测试、类型检查、Next生产构建、73个离线Python和63个真实PostgreSQL测试通过。浏览器实测复核启用/编辑撤销/重载撤销、无效JSON保留、变量三项上限、说明/变量/输出保存重开及高亮选择；全部未点击收费操作。编辑示例已恢复，音频与字幕继续ready。截图`output/forms-qa/form-preview.png`。

验收发现旧Python示例遗留场景重排把print放在第二次循环之前；已恢复scene1→scene2→scene3→scene4→scene5并冻结新版本导出，旧文件未改。正确顺序短样例为`output/forms-qa/python-correct-order.mp4`及同名SRT，实际双队列/RustFS下载SHA通过，记录在`output/forms-qa/receipt.json`。这仍是短样例，不是完整2–3分钟课程；先前历史导出不会被自动替换。

不新增依赖、API/数据库/模板变更、服务端持久审核、专用状态/时间线表单或付费请求。技术事实仍需人审；下一步为完整Python/AI课程真实生成与人工验收，收费安排须另行确认。

## 视觉B：用户确认的数据图

129离线Python、86临时PG/API/jobs、172Node、typecheck/production build通过。浏览器独立已配音副本确认四种图并进行1次免费timing、4次preview；自审发现大数换行后红绿修复，另1次深色5×6长标签/10亿边界preview。48→54attempts仅1timing+5render；所有MP4/SRT SHA、冻结数据、原9音频/词缓存/原交付物/旧version核对，五片解码音频一致，和原WAV按6帧对齐相关性0.9999587，未调用模型/配音。证据`output/workbench/visual-B-qa/`。

**该预览使用明确标记的合成数据与原RAG音轨，只验组件/时间触发/音轨复用，不冒称数字口播对应或真实实验验收。** 完整图表课程、全部主题/6×6最大行数实测仍待后续；当时C未实现，现见下节。20组收费验收与nums修正继续暂停。

## 视觉C：代码与教学状态同屏

131离线Python、87独立临时PG/API/jobs、181Node、typecheck及web生产构建通过。真实浏览器检查编辑/保存、非法输入保护、16行48单位/6项/2指针/长文本边界；发现ASCII被拆位、数组索引和输出靠近边框后红绿校准，最终DOM证明三卡内容包含在边界内。独立11场景Python副本只补七个代码布局，不改原口播/音频/词缓存/动画/字幕，三主题各一次本地preview，均350帧/11.669秒/1080P30且attempt1。54→57仅3render，MP4/SRT SHA和冻结字段检查、三段解码音轨一致、原WAV按6帧起点相关性0.9999608；原项目/已交付视频/音频/缓存/旧快照哈希不变。证据`output/workbench/visual-C-qa/receipt.json`、`render-verification.json`、三主题MP4/SRT和关键帧。

仅教学快照，不是沙箱或事实自动核验。示例用已存在Python音轨，未新增模型/配音/重试；nums读音、20组收费回归及全片人耳0.5秒同步仍暂停/未验收。仅自审，无独立委派/Git提交。三主题样例实际验第一轮取值场景，不冒充全片每状态/每组合重渲染。完整课程模式可在工作台QA副本预览；原课程不会自动升级。

后续用户继续后，已冻结副本revision17并完成一次**完整C彩色课**：`output/workbench/visual-C-full/python-full-C.mp4`（11章/7代码章、4783帧/159.445秒、1920×1080/30fps）及同名SRT。57→58只增1本地render/attempt1，不增模型/配音/timing/重试；新version是正常整课版本，QA当前项目也未改。视频下载SHA核对，字幕和原全课逐字节相同、整轨解码PCM也逐字节相同，原项目/已交付文件/缓存/旧version哈希不变。`chapters.json`列章节/状态时间点；关键帧自审确认两轮指针0→1、total0→2→5、末章stdout5且n仍3，未执行代码。全课仅彩色主题，其他主题仍短片验证；首cue前等待面板保留，不用后续状态填充。未新增人耳/逐帧/0.5秒验收，待用户播放反馈。证据`output/workbench/visual-C-full/verification.json`。

## 安全结构诊断（离线验证完成）

经确认，`storyboard_schema_error`现可附带最多3条`error.schema_errors`，每条仅含公开Schema字段路径与规则类型，如`{"path":"/scenes/0/type","rule":"enum"}`。校验→ProviderError→子进程→任务/attempt持久化→HTTP结果贯通；未知属性名截断，附带message/原始值丢弃，父进程再次过滤。不能取得安全诊断时保留通用失败，不让无效分镜通过。

94项离线Python与66项临时PostgreSQL/API/任务集成测试通过，包含缺字段、类型/枚举/额外字段、秘密字段过滤、子进程与HTTP持久化边界。无新依赖、数据库迁移、文稿/Schema放宽或付费请求；仍不可直接付费retry。历史RAG错误无法补回，不代表实际模型问题已修复。现有API/workflow worker已在任务空闲时重启加载新代码，beat已恢复；API健康、网页HTTP 200及workflow/render worker ping通过，任务尝试数仍为24，无新增执行。未改网页，未重跑网页构建。见`docs/superpowers/plans/2026-10-12-safe-schema-diagnostics.md`。

## 安全cue诊断（离线验证完成）

`storyboard_invalid_cue`现在可附带`error.cue_error`，仅含场景/元素路径和固定原因。例如`{"path":"/scenes/0/elements/0/cue","reason":"out_of_bounds"}`。原因限定为空/反向区间、越过场景末尾、仅空白；ProviderError、子进程、任务/attempt持久化及HTTP结果贯通，父进程重新白名单过滤，不保存原文、标签、模型ID或数值偏移。既有严格校验与不自动重试规则不变。

新鲜97项离线测试及68项临时PostgreSQL/API/任务集成测试通过；无新增收费调用、依赖或数据库迁移。现有API/workflow worker已在任务空闲时重启加载cue诊断，beat已恢复；API ready、网页HTTP 200、workflow/render ping通过，任务尝试数保持25，无新增执行。激活记录`output/workbench/cue-diagnostics-activation.json`。未改网页或重跑网页构建。只修复未来失败的安全定位，上次实际cue错误无法恢复，不能宣称RAG生成已修复。见`docs/superpowers/plans/2026-10-12-safe-cue-diagnostics.md`。

## 原文短语定位cue（新协议，离线验证完成）

新分镜请求只接受`cue:{"quote":"原文短语"}`，在原样恢复的当前场景口播中精确且唯一匹配，再由程序计算Unicode码点`[text_start,text_end)`。短语不存在、重复（含重叠匹配）或仅空白均拒绝；不归一化、不猜首个重复、不clamp，也不接受新响应回退到数字偏移。原稿、最终DSL、配音和既有快照不变。

新任务版本为`teaching-outline:2`/`scene-candidate:2`，去重区分版本，旧v1冻结任务继续使用旧适配器，旧有效草稿仍严格兼容。引用失败仅公开固定原因`quote_blank`/`quote_not_found`/`quote_ambiguous`和场景元素路径，不保存引用内容或数值偏移。

新鲜106项离线、70项临时PostgreSQL/API/任务集成通过；覆盖中文/emoji/CRLF/组合字符、场景局部性、重复/重叠、单场景重生成、输入不变、旧版本及去重。首次集成跑失败源于新增测试的排队任务未纳入清理，已修正测试清理范围并全量重跑通过，未改队列逻辑。无新增收费调用、依赖、迁移或用户数据库写入；现有API/workflow已在空闲时重启加载新协议，beat恢复；API ready、网页HTTP 200和workflow/render ping通过，总attempts仍为26，无新增执行。激活记录`output/workbench/quoted-cue-activation.json`。未改网页或重跑构建。模型仍可能给出不存在/重复的引用；随后已单次验证RAG分镜成功（见下），但完整课程与教学声画验收仍未完成。设计与实施记录`docs/superpowers/specs/2026-10-12-quoted-cue-design.md`、`docs/superpowers/plans/2026-10-12-quoted-cue-plan.md`。

## 早期真实配音教学样例与原生字幕链路

本机早期已生成两个真实配音教学样例：
- `output/python-sum-teaching-v4.mp4` / `.srt`：约 17.067 秒，代码 32px，六步循环行高亮和变量变化。
- `output/rag-teaching-v2.mp4` / `.srt`：约 29.312 秒，问题到答案的图解与检索失败分支。
- `output/teaching-qa/`：关键步骤帧，抽查未见明显裁切；不代表所有帧或教学正确性自动验收通过。

第二阶段实测 DeepSeek + TTS 2.0（seed-tts-2.0 / zh_female_vv_uranus_bigtts）原生字幕的完整短文案链路：
- 示例 `output/native-video-v2.mp4` / `.srt` 为 5 场景、747 帧、约 24.917s、1080P/30FPS、H.264/AAC；字幕按短句组合，抽查了五个场景截图。此样例不等于完整 MVP 验收。

## 两个真实付费教学案例（已跑通）

本轮按用户确认只验证Python循环累加与RAG，不批量调用20组。真实DeepSeek分镜、原生TTS2配音、PostgreSQL/Redis/Celery双队列、RustFS、HTTP编辑保存重开及快照导出通过。每例5个场景，10个配音任务及两个导出任务均一次执行成功；编辑标签不重新配音，演示编辑后恢复原标签再导出。

首次闭环产物目录 `output/paid-teaching-pair-20261010-145916/`（原始结果保留，推荐播放下方复核版）：
- `python-sum/video.mp4`：622帧、20.736秒，代码高亮、变量及输出5；同目录SRT、最终DSL、版本/任务报告和code-preview.png。
- `rag/video.mp4`：959帧、31.979秒，检索/提示构建/回答来源与无依据处理；同目录SRT、最终DSL、版本/任务报告和flow-preview.png。

联调发现配音worker给草稿误加schema_version，导致真实草稿校验失败且尚未调用TTS；修复共享入口并增加真实校验回归。Python复用首次已付费生成的分镜，没有重复调用模型；RAG本轮完整生成后直接配音导出。未自动重试失败付费任务；实际费用以供应商账单为准。执行用自有临时容器并已清理，交付物和真实音频保留。本次编辑通过真实API验证，不额外声称新一轮浏览器全流程或0.5秒同步听检通过；代表帧已检查，全面教学验收仍待人工审核。

## 两例教学画面复核（不再计费）

提取原视频72张关键帧，检查10个场景概览及修复后的重点帧。发现模型把“取出数字”和“累加”放进同一cue，Python累加高亮比对应讲解提前26帧（约0.87s）；复用原生字词时间修正scene3/4，累加改为第73/74帧，取值改为47/48帧。RAG回答标签补回“未拆封”条件，并缩短文字避免单字换行。

推荐播放：
- `output/teaching-reviewed-20261010/python-sum/video.mp4`
- `output/teaching-reviewed-20261010/rag-readable/video.mp4`

同目录有最终DSL、SRT、review.json和修后截图；原视频及全部审核关键帧保留在原目录visual-audit/。重新导出通过协议/资产/1080P/帧数/音频检查，配音、口播和字幕未改且没有付费调用。修正是对这两份交付物的人审调整，**不是自动生成器已消除所有语义错误**；原生时间一致性不等于0.5秒实际听检通过。详见 `docs/teaching-visual-review.md`。

## 完整课程首次尝试（历史：Python待听检，RAG结构校验阻塞）

两份文稿已离线复核并获准本轮收费尝试；首次Python分镜任务failed（attempts=1、storyboard/validation），没有发布分镜，随即停止，未调用RAG/TTS/导出，也未自动重试。receipt为`output/full-lessons-20261010-221550/receipt.json`。原响应/子码未留存，不能断言具体模型失败原因。

已补固定允许列表`storyboard_*`错误分类，未知值仍通用，原始正文/消息/认证信息不落库；这些校验失败保持不可直接付费重试。76个离线Python+64个临时PostgreSQL测试通过，闲置自有服务已安全升级，未新增供应商调用。随后获准再试Python一次，仍failed，已明确storyboard_incomplete_response（模型未正常结束，尚不知道具体finish_reason），立即停止，未调用RAG/TTS。第二receipt为`output/full-python-attempt2-20261010-223547/receipt.json`。

已离线为已知Flash模型显式关闭默认thinking，保持8192-token预算；length/内容过滤分别固定脱敏分类，未知值不泄漏也不直接重试。79个离线Python+64个临时PostgreSQL新鲜回归通过，自有服务已升级，未提交第三次收费任务。该调整未经真实输出验证，不能声称原故障已解决；完整2–3分钟教学课仍未验收，通过前需人工检查教学事实。之后再获准Python一次，模型已完整结束但失败于`storyboard_source_mismatch`：生成口播未严格保持原稿。记录`output/full-python-attempt3-20261010-230714/receipt.json`；立即停止，无配音/RAG/导出。下一步建议先改供应商内部协议，让程序持有原文、模型仅引用原文片段并生成图解，不通过反复付费或放宽校验解决。原文归属协议已批准并离线完成：程序无损生成source_parts，模型只引用source_part_ids，引用必须完整原序覆盖，再由程序恢复口播并沿用严格校验；旧完全保持原稿的响应仍兼容，现有项目/API/数据库/模板不变。88个离线Python+64个临时PostgreSQL回归通过，服务已安全升级；本轮未发起收费分镜/配音，未重跑未修改的网页构建。新协议尚未验证真实供应商成功，完整课程仍未验收；再次收费尝试仍须显式允许。详见`docs/superpowers/plans/2026-10-10-source-owned-storyboards.md`。详见`docs/superpowers/plans/2026-10-10-full-course-acceptance.md`。

随后获准一次真实Python生成，source-parts协议成功：11场景、原稿796码点含末尾换行完整保持。已人工核对正确代码AST/变量状态/打印5、单独错误版本3/空列表边界，校准动作cue及四行概览高亮；经人工候选与revision保护保存重读，项目r13、全部待配音。记录和复核在`output/full-python-attempt4-20261010-232159/`，项目“完整课 · Python循环累加 · 原文片段协议尝试4”可在工作台查看。未执行模型代码，也未调用TTS/RAG或导出；真实音频同步与完整课程验收仍待完成，下一步配音需要授权计费。

用户明确允许11段后，逐段真实配音全部成功、各attempts=1；已本地导出**2分39秒、1080P30 H264/AAC**完整Python课程：`output/full-python-attempt4-20261010-232159/python-full.mp4`及同名SRT。Schema/动画字幕边界、冻结版本、队列/RustFS与HTTP下载SHA通过，人工检查取值/打印/正误对比代表帧。详情同目录`delivery.md`；未新增分镜/RAG，不执行模型代码，无自动重试。原稿完整保留；发音及逐词同步仍待完整听检，RAG完整课尚未跑，不能认定全量教学质量验收完成。

2026-10-12获准仅1次RAG收费分镜生成，任务失败于`storyboard_schema_error`、attempts=1，不发布分镜；已停止，未调用配音/导出或自动重试。记录`output/full-rag-attempt1-20261012-153909/receipt.json`。具体失败字段及原始响应未保留，不能猜测根因或宣称已修复；下一步先离线排查结构约束，任何新增收费尝试仍需明确授权。

随后明确授权第二次仅1次RAG分镜，任务failed、attempts=1、`storyboard_invalid_cue`：图解cue未对应有效口播区间。按校验顺序，本次已通过字段结构与原稿保持检查，但具体场景/偏移未保存，不能据此宣称前次错误已修复。HTTP确认无分镜发布，816码点原稿不变；总attempts由24到25，无配音/导出/自动重试。记录`output/full-rag-attempt2-20261012-164253/receipt.json`。已停止付费尝试；下一步先离线排查cue与业务错误安全定位，不靠继续收费试错。

随后明确授权第三次仅1次RAG分镜，仍failed、attempts=1，但本次安全诊断已实际贯通：`storyboard_invalid_cue`、`cue_error.path=/scenes/2/elements/2/cue`、`reason=out_of_bounds`（第3场景第3元素的cue超过场景口播末尾）。没有发布场景，816码点原稿哈希不变，总attempts由25到26；没有配音/导出/重试。记录`output/full-rag-attempt3-20261012-170420/receipt.json`。操作回执起初误用API的id而不是job_id，随后仅查询原有任务找回ID，没有重提。实际越界偏移不保存，不能据此推断全稿偏移或Unicode计数等原因；下一步先离线设计定位修复，不继续收费试错。

## Python 完整课程：末句字幕校正版（后续开场另行修正）

RAG修复版用户回复“没问题，继续下一项”，已记录该问题关闭与交付接受（不冒充量化人工同步测量）。下一项检查既有Python课程，发现第7/8/11场景末字幕后0.7–1.067秒仍有音频信号（非独立语音判定），沿用批准规则导入副本，11场景仅末字幕end_frame改到音频边界；原796码点、代码/变量/高亮/配音/动作不变，旧project revision24和成片保留。

最新版`output/full-python-subtitle-tail-fixed-20261012-203403/python-full.mp4`、`python-full.srt`，约2分39秒；receipt.json/media-verification.json记录一次render succeeded，attempts39→40，0模型/配音/重试。4783帧/1080p/30fps/159.445秒完整解码/checksum通过，AAC流与PCM hash与旧版相同，字幕文字不变；92.6/109.6/158.8秒实际帧末字幕均存在。只复用现有已测试策略，无新产品代码/依赖/构建；待用户播放确认n/total读音、取值/累加/输出的教学顺序与整体声画，不自动标为听检通过。

## Python 完整课程：开场图形修正版（读音按用户要求暂不修改）

用户确认其他部分没问题，但开场约9.27秒才出现标题，且报告nums读音不正确；随后明确先不改读音。本轮只改当前课程开场，复用已有card_sequence三张卡：原主题、2 + 3、= 5。遵守动画最早6帧规则，标题0.233秒完整可见，早于首字幕0.467秒；算式0.833秒出现，结果3秒随原稿“五”出现，未提前显示结果。原稿、11音轨/字幕/时长及其他10场景不变，原项目/成片保留。

最新版`output/full-python-opening-only-20261012-205231/python-full.mp4`，配套`python-full.srt`、receipt.json、media-verification.json、dsl-opening-fixed.json。一次本地render，attempts40→41；4783帧/159.445秒完整解码/checksum通过，AAC+PCM与旧版相同，SRT逐字节相同。实际0.5/2.6/3.6秒抽检有主题、算式、按序结果，无明显裁切/重叠。

无模型/配音/重试/依赖或产品代码改变，操作脚本含源数据/资产/唯一cue/最小场景差异/最终验证/回读/音轨一致断言，未重复跑未变产品代码测试/构建。用户已确认修正开场；nums读音已明确延期未解决，未来发音控制需另行设计和收费授权。此为当前课程修订，未新增全局自动开场策略。

## RAG 新引用协议：单次真实分镜成功（随后已配音）

明确授权仅一次生成后，新任务`teaching-outline:2`一次succeeded，发布9个场景（4个流程图、3个卡片序列、1个标题、1个对比面板）。原816码点文稿与SHA256不变；全部needs_voice，存储cue已还原为规范数字区间，不残留quote/source_part_ids。总attempts从26到27，本项目仅1个generate，无配音/导出/重试。

记录`output/full-rag-attempt4-20261012-175407/receipt.json`，规范草稿`draft.json`，只读初审`draft-review.json`；工作台项目ID`f63fb494-f4d0-4054-b109-48c06b275689`。结构通过不等于教学验收：第3/4/5场景有节点cue晚于初次概念引入，第8场景右侧说明cue早于标题，后续已免费人工校对4场景7个cue，走现有候选修订/采纳而非绕过只读保护。原口播、标签、ID、布局配对及其他字段不变，项目修订号2→6，全部仍needs_voice，总attempts仍27。原始草稿/初审保留；最新`draft-corrected.json`、校对回执`cue-review-correction.json`。这些修正只验证文本定位与顺序，不等于真实声画验收。示例答案的“未拆封”条件与无依据分支保持。没有测配音时长、渲染或声画同步，实际账单未核对；后续已按独立授权完成9场景配音，见上；不继续生成试错。

## RAG 完整课程配音：9场景成功（随后已本地导出）

用户明确授权最多9个场景逐一配音，全部9个native-voice:1任务succeeded、各attempts=1、attached=true。项目修订号6→15、全部ready；原816码点与校对后的元素/标签/cue保持。时间线4930帧/30fps=164.333秒（约2分44秒），9段纯音频合计160.584秒，差额为既有镜头余量，不人为填满时长。9个本地WAV checksum及ffprobe时长/声道核验通过。本项目1generate+9voice，总attempts27→36，无重试、重新生成或导出。

记录`output/full-rag-voice-20261012-182524/receipt.json`，规范DSL`dsl-after-voice.json`、`project-after-voice.json`、`audio-verification.json`。第1配音任务本身成功，记录脚本曾误读audio_id（规范字段audio_asset_id），只读定位后继续剩余8个，未重复付费配音；错误已保留为operator_check_incidents。

未改产品代码/未重跑未变代码测试或网页构建；未创建导出快照或render任务，未听检/截图/0.5秒同步验收，实际账单未核对。后续已本地导出（见上），人工声画检查和开场节奏验收仍待完成，不把ready状态当作最终课程验收。

## RAG 本地 MP4/SRT 已导出（原版曾发现开场节奏问题）

独立授权本地导出后，冻结revision15快照并仅提交1个snapshot-render:1任务，一次succeeded；总attempts36→37，本项目1generate+9voice+1render，无重新分镜/配音/重试。下载MP4/SRT的SHA256与发布结果一致，原稿与项目revision不变。

视频`output/full-rag-export-20261012-183518/rag-course.mp4`（1920×1080，30fps，4930帧，164.352秒，H.264/AAC，8,674,610字节），字幕`rag-course.srt`（68段）。全片解码通过、字幕时序有序；音轨mean -24.8dBFS/max -9.6dBFS，无超过1.5秒的-40dBFS静音。18张抽帧接触表`contact-sheet.png`未见明显裁切或重叠，但开场首图形11.133秒才出现，前段只有字幕，需复核教学节奏。`media-review.json`、`receipt.json`记录技术/抽样检查，不冒充人工全片听检或0.5秒同步验收。

未改生产代码或重跑未变代码测试/网页构建；无供应商新增调用，实际配音/模型账单仍未核对。下一步可复用现有配音免费调整开场再本地导出，或先人工播放审阅，未自动修改开场。

## RAG 开场校正版已导出（原版保留，无新增模型/配音）

按批准方案，导入独立校正版项目`0a4dc12e-1c35-41ea-a8fd-61b3bb40ca8c`，只改首元素cue与该标题动画start_frame：334→15（11.133→0.5秒，与首句字幕同帧）。原项目revision15及原MP4保留，其余DSL字段/九段音频资产不变；严格final_valid和回读断言通过，不绕过编辑只读/needs_timing保护。

一次本地render成功，总attempts37→38。成片`output/full-rag-opening-corrected-20261012-185336/rag-course.mp4`，字幕`rag-course.srt`；4930帧/1080p/30fps/164.352秒，全片解码与下载checksum通过。字幕逐字节相同，AAC音频流和解码PCM的SHA256均与原版一致。`opening-before-after.png`抽检1秒/5秒/11.933秒：校正版开场已有标题，无新增明显裁切/重叠；`receipt.json`、`media-verification.json`保存证据。

没有新模型、配音、重试、依赖或产品代码改变；未重跑未变代码测试/构建。仅修正已确认开场问题，不宣称完成全片人耳听检或人工0.5秒语义同步验收，既有供应商账单仍未核对。实施记录`docs/superpowers/plans/2026-10-12-rag-opening-correction.md`。

## RAG 逐场景自动时序/动作窗口检查完成（人工听检仍待确认）

校正版9段配音缓存checksum/原稿对齐通过，30动作、68字幕与原供应商词时间戳重新计算完全一致；相对词时间戳的帧量化偏差最大0.031667秒，未发现cue从供应商词中间开始。实际MP4共60个动作前/后帧，30个窗口均检测到图形区域变化（排除字幕/页眉）；6对代表帧人工图像抽检未见明显错序/裁切。此检测不识别具体目标或实际读音，不能据此宣称人工0.5秒语义同步通过。

同输出目录`timing-audit.json`、`action-window-contact-sheet.png`与`human-review-checklist.md`；30动作时间/原文已列出，所有人工复选框保持未勾选。核对原项目revision15、校正版revision1、视频SHA256、总attempts38均不变，无模型/配音/渲染或项目改动。FFmpeg新版移除-vsync导致首次抽帧命令失败，改为-fps_mode passthrough后完成，未改成片。下一步需要实际播放的人审：读音、表达、镜头衔接及0.5秒同步，不再重复自动检查冒充验收。

## RAG 独立离线转写检查完成（13处识别差异待听检）

使用已缓存Whisper medium，CPU/int8离线推理1次（约103秒），无原稿提示、模型下载或云API。原始24段转写`independent-transcript.json`保留，仅比较时用系统Foundation简繁转换、空白/标点/大小写及单个数字等价处理，未改原稿或配音。比较后13组替换差异（含甲/假、乙/已/椅等可能同音），未见整段插入/删除分组；这是ASR差异，不是已证实错读，序列相似度97.64%不是准确率。

30动作与独立ASR估计词起点对照未发现>0.5秒差值（最大0.5秒，开场是主题标题例外），但Whisper时间戳不是声学真值，仍不能勾选人工验收。`independent-asr-review.json`、`asr-listening-checklist.md`列出时刻；优先听`listen-52_5-57_5.wav`，确认“收到问题后，检索模块…”是否清楚（识别为“说到/减速”）。5秒片段来自成片解码PCM，不重新配音。

成片SHA256与总attempts38保持，无项目/渲染/供应商改动。真实读音、自然表达和人工同步仍需要实际播放审阅，不依据ASR结果自动改稿或重配音。

## RAG 末句字幕消失已修复（用户已确认）

用户整体反馈正常但末句字幕在声音结束前消失。复现：142.633秒字幕退场，143.5秒实际画面无字幕而音频仍非静音；供应商最后词时间戳早于17.280秒音频长度。共享`services/tts/timing.py`现在让每场景最后一句保留到音频边界`duration_frames−6`，不修改词时间戳、开场/动作/音频/文字。新回归先失败36≠97，再修复；107离线、70临时PostgreSQL、140Node测试通过。

最新成片`output/full-rag-subtitle-tail-fixed-20261012-202251/rag-course.mp4`、`rag-course.srt`。独立校正版项目`c21daa9f-925f-4e50-863c-f37ce21e870c`，旧项目/成片保留。9场景仅末字幕end_frame改变；报告句终点142.633→144.467秒。143.5/144.4秒实际帧均可见该句；4930帧/164.352秒完整解码、下载checksum通过，AAC流与解码PCM与旧版相同，字幕文字未改。一次本地render，attempts38→39，无模型/配音/重试。

receipt.json和media-verification.json保存证据；实施`docs/superpowers/plans/2026-10-12-caption-tail-fix.md`。无需重复收费配音。用户“整体没问题”记录为修复前带此例外的正面反馈；用户随后回复“没问题，继续下一项”，已记录交付接受及问题关闭，不将该反馈冒充量化人工同步测量。词级时间戳的声学精度不由本次句尾显示策略保证。

## 只读导出结果查询

`GET /api/renders/{render_job_id}`复用现有导出任务，返回公开状态与`downloads`。成功时提供固定MP4/SRT地址及已发布SHA256；其他状态downloads为空，非render/未知ID404，发布校验值不完整422。查询只读Jobs.get，不恢复/提交/重试任务，不读文件或调用存储；下载仍由原files接口实际校验，元数据不保证文件此刻在磁盘。

新接口5项红绿测试、120离线Python+77临时PostgreSQL/API/jobs通过。空闲时仅API重启，已有成功导出真实查询返回2下载项，jobs/attempts均44→44，无模型/配音/渲染任务。`output/workbench/render-info-qa/{receipt.json,info.json}`留证。未改前端/worker/schema/数据库，未重复跑未变Node/build，无新依赖；只自审，无Git元数据。

## 已配音单场景预览

`POST /api/scenes/{id}/preview`携带expected_revision，仅ready场景。冻结选中场景、原音频及当前profile到job.input的scene-preview:1，复用render队列/幂等/取消/attempt fence；不写普通project_versions或改项目。成功结果包含scene_id/scene_revision/snapshot_checksum和下载checksum，不返回假version_id。jobs/renders查询标记scope=scene，files仍走安全校验；未知渲染协议拒绝。

网页“预览本场景（本地渲染）”仅已保存ready启用，保留既有Player。其他场景未配音不阻塞，任务列表区分预览与整课，本地render重试不提示模型/配音收费。120离线Python/81临时PostgreSQL/156Node/typecheck/web build通过。浏览器独立副本（其他场景needs_voice）一次成功，18.752秒/562帧/1080p/30fps/8字幕；checksum/全片解码/冻结checksum/原音频/原项目不变、无普通版本记录核对通过，attempts44→45仅render。证据与样片`output/workbench/scene-preview-qa/{preview.mp4,preview.srt,receipt.json,workbench.png}`。

没有新表/SQL/队列/依赖/模型或配音调用，API/render/beat已空闲刷新；无Git元数据/独立委派审查。初次新增API测试遗漏取消干扰共享队列、版本计数未限定项目，修正测试后重跑81通过，未放松生产队列；抽帧-ss .5改0.5无重提。浏览器Tabbit注入html属性产生开发态hydration警告，已定位，不用suppressHydrationWarning隐藏。needs_voice/needs_timing/资产不可用明确拒绝；视频编号1/1仅代表预览范围，渲染仍占用本地资源。

## 明确主题的自动开场预告

Element可选`role:"topic"`，仅title_reveal/card_sequence、每场景最多1个，不能携带代码/变量/输出/状态/事件结构；Python/TS校验一致。共享time_scene只让该主题从frame6/duration1出现（0.233秒完整可见），普通计算结果/流程仍按原cue，原文/词时间戳/配音/字幕不改。模型提示明确主题不应是待揭示答案，网页标记只读，角色变更须候选确认并免费重算，不能借保存绕过。

115离线Python、77临时PostgreSQL、155Node、typecheck/web build通过，API/workflow/render/beat已空闲重启同版Schema。独立验证副本把晚cue标题从278帧重算到6帧，其他动画25/90帧未变；实际0.5秒有主题、2.6秒无结果、3.6秒有=5。一次timing+一次本地render，attempts42→44，无模型/配音；AAC/PCM/SRT与原版一致，原项目revision1及冻结版本未改。证据与成片`output/workbench/topic-opening-qa/{receipt.json,preview.mp4,preview.srt}`。

无标记旧数据不擅自提前，不能保证任何模板/模型输出都不空白；主题自然语言是否泄露答案仍需人审。没有新模板/依赖或修改验收原件，nums读音继续暂缓，未委派独立审查/无Git元数据。

## 本地时间轴重算（不重新配音）

`POST /api/scenes/{id}/timing`，`expected_revision`，支持ready/needs_timing，冻结音频asset与词侧车SHA256。复用align_words/time_scene、既有持久任务与发布保护；缓存缺失、篡改、越界或原文不匹配明确失败，绝不转收费配音。子进程不带模型/语音密钥或HTTP客户端，发布不下载/上传音频，修改原稿后的needs_voice仍需明确授权配音。重复任务幂等，过期结果不附着，取消/旧attempt不发布。

网页独立“配音（收费）”和“重算时间轴（不重新配音）”，后者会替换动画/字幕时间，不改变声音，仍需保存并核对当前场景。112离线Python、76临时PostgreSQL、141Node、typecheck和web build通过。API/workflow已空闲重启，浏览器一次真实点击在独立副本needs_timing→ready，9音频checksum和其他场景不变；原验收项目/冻结版本保留，attempts41→42仅新增本地timing，无模型/配音/渲染调用。记录`output/workbench/local-timing-qa/receipt.json`和`workbench.png`。

限制：只有本机已有原WAV/词侧车可重算，导入外部音频或丢失侧车会失败，不造词时间戳；局部手动动画/字幕时间会被重新计算覆盖。nums读音/全局开场策略/20组验收未扩，独立审查未委派，当前目录无Git元数据。

## 完整教学短课（第一阶段）

以讲清楚为准，通常2–3分钟，真实配音装配后最长300秒；不靠慢放、扩写短稿或重复卡片凑时长。共享分镜提示已去掉固定5场景倾向，改为按教学动作/认知段落拆分（最多20）；强调取值和累加分别定位cue，以及AI回答保留依据中的适用条件。原文保持、短稿、单场景重生成和现有协议均兼容。

两份可校对的完整口播：
- `examples/lessons/full/python-loop.txt`：Python循环、逐轮状态、错误初始化和空列表。
- `examples/lessons/full/rag.txt`：问题/文档/索引/检索/上下文/答案条件/无依据与安全边界。

将txt全文贴入工作台文稿输入即可走现有流程。核查表在 `examples/lessons/full/README.md`；这只是文稿和生成规则，不是已生成的2–3分钟视频，字数不能证明时长。未新增付费调用，模型指令仍需真实生成后人工复核。对比面板及数组/对象/栈状态图已实现，执行时间线也已实现，分镜确认和基础表单也已实现；完整长课真实生成与人工教学验收仍待完成。

## 20组编程/AI教学验收

固定输入与人工检查要点在 `examples/acceptance/cases.json`：8组Python/JavaScript/TypeScript教学、12组AI教学，覆盖循环重复行、分支、函数、变量输出、RAG无依据分支、Agent授权、Token/emoji、中英数字标点及不同长度。

固定20组清单的6处旧bullet_cards已统一为实际card_sequence，检查器模板名直接取Schema，18/20标准不变。123离线Python回归通过；重新检查既有交付物仍2/20通过、18组缺失，正式pending，不新增收费或伪计成功。报告`output/acceptance-template-fix-20261013-111629/report.json`。

每组已生成的交付物按 `<results>/<case-id>/project.json、video.mp4、video.srt` 放置；project.json是最终DSL（可从不可变版本的dsl字段保存），不是draft或API整个版本响应。音频仍须可在renderer/public校验，缺失缓存应先通过资产API恢复。

```bash
npm run check:teaching -- --results output/teaching-results --report output/teaching-check-new.json
```

该命令**不生成视频、不调用供应商、不执行代码**。复用生产校验器检查原稿不变、教学模板/编程语言、资产、1080P/30FPS视频帧数时长和快照SRT；缺失/非法交付物计为失败，报告不能覆盖旧文件。20组中至少18组结构通过才退出0，但报告formal_acceptance始终pending：真实供应商来源、端到端900s、截图/事实核查及0.5s同步听检仍需单独验收，不能靠自报耗时或此报告证明。

已用既有RustFS真实Python/RAG交付物复跑：2组结构通过、18组缺失，整体未通过；报告 `output/teaching-acceptance-check-20261010-143740/report.json`。这不是20组视频验收完成，后续真实批量生成需另行确认费用预算。

## 后续与边界

最新两份课程画面交付已获用户确认，Python nums读音按要求暂缓；20组及量化同步、账单/许可仍未完成。已补只用保存音频/词时戳的独立重算入口，避免改cue后恢复对齐再次配音收费；缺缓存不会自动转收费。详细缺口与待确认范围：[docs/mvp-follow-up.md](mvp-follow-up.md)。

第二阶段已实测 DeepSeek + TTS 2.0（seed-tts-2.0 / zh_female_vv_uranus_bigtts）原生字幕的完整短文案链路。示例 `output/native-video-v2.mp4` / `.srt` 为 5 场景、747 帧、约 24.917s、1080P/30FPS、H.264/AAC；字幕按短句组合，抽查了五个场景截图。此样例不等于完整 MVP 验收。第三阶段已接 PostgreSQL 项目仓库、版本冲突、口播失效和不可变快照；已接 FastAPI 与显式候选接受；已有Celery/Redis调度、首次教学分镜及场景候选生成；已接单场景配音恢复和不可变版本渲染/下载；已接Next.js本地教学编辑器；私有RustFS/S3兼容存储及本地真实恢复联调已完成；完整课程验收仍待完成。

当前有 PostgreSQL 仓库、本地 CLI、HTTP 编辑/重生成任务接口与 Celery/Redis 调度，以及Next.js本地教学编辑器；已验证一个真实自动分镜样例、两个维护的教学样例及短句，未进行 20 组完整 MVP 验收、人工语音听检或 0.5 秒同步精度验收。字体来自 `@fontsource/noto-sans-sc`，许可随依赖保留；Remotion 和系统语音的商业使用条件需按实际用途另外核对。

---

[返回 README](../README.md)
