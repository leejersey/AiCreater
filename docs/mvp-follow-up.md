# MVP后续核对（2026-10-12）

## 当前主线：口播/代码/连线旧新值已完成

用户明确实现已确认设计。只改version-changes helper与VersionChanges presenter及对应测试：同次比较为共有变更场景捕获可选values文本/null，代码固定投影/边from-to，不额外fetch、不读dirty、不改既有state/epoch/后端/Schema/依赖。折叠旧/新r号、空文本与未设置/[]区分、React转义、原pre滚动；不逐字diff/执行/回滚。

本轮203Node+164离线Python（258total/94DBskip）、typecheck和隔离Next webpack源码生产build通过，原.next BUILD_ID/服务不动，不夸大为默认Turbopackbuild或新94SQL。真实RAG副本旧r1两边/当前r4三边、dirty不纳入且保留；口播/代码、缺code/空edges/800行JSON、失败保留/关闭晚响应使用明确受控响应，不写live版本。80行代码JSON只有5物理行高度211px，原滚动测试误假设，观察后只扩测试数据为800行，400pxclient/1267pxscroll证实约束，产品未改来迁就测试。

116捕获请求GET，native fetch恢复、精确确认丢弃自有临时文本，留真实结果页/截图已查看；finish keep=true/forcedCleanup=false。CLI --instance误参在提交前拒绝、无动作，后用原选定实例和相同任务请求继续。原API/web/消费者组、六表/媒体/配置/容器/73对象、58attempts0active未变，无新版本/任务/收费。[证据](../output/workbench/version-field-values-qa/receipt.json)/[实图](../output/workbench/version-field-values-qa/preview.png)。只有自审，无代理/初始Git提交；听检/nums/20费用组/异地备份继续暂缓。

## 上一项历史记录：旧版与已保存稿只读变化摘要已实现并验证

用户确认设计并要求实现。旧版详情按钮每次GET服务器锁内已保存稿，不读取父缓存或dirty内容；按scene.id比较主题、增删/共有相对顺序与教学字段，不比较音轨/字幕/动画/时长/profile，不把摘要无变化说成全版一致。前端纯函数、独立epoch/live/busy及project/id检查，不改page/Player/后端/Schema/依赖，不回滚/新端点/媒体访问或收费。

本轮199Node、164离线Python（258total/94DBskip）、typecheck及私有源码副本Next webpack生产构建通过；构建不拷.env/音频，原.next BUILD_ID未变，默认Turbopack生产build本轮未重复跑。94SQL为上轮后端回归，本轮后端未改未重跑。真实RAG副本r1两边/r4三边仅报第3章连线，临时dirty口播不计入且输入保留；受控失败保留结果、关闭/切冻结版/切项目晚888响应拒绝、busy保护通过，受控r2仅传输mock无live版本。捕获183请求皆GET，native fetch恢复，确认丢弃自有临时内容并留真实输出页，截图已查看。BLOCKING_DIALOG为授权确认，finish首次误加CLI不支持参数无副作用，正确finish keep=true/forcedCleanup=false。

首尾原API/web/消费者进程、六表/配置/媒体/容器/73对象均未变，58attempts/0active，无新版本/任务/收费。守卫首错是JSON把PID映射键变字符串，非进程变化；规范化整数键后严格同成员/lstart/CWD检查通过。[证据](../output/workbench/version-change-summary-qa/receipt.json)/[实图](../output/workbench/version-change-summary-qa/preview.png)。只自审，无代理或初始Git提交；人工实听/nums/20组费用/异地备份继续暂缓。

## 上一项历史记录：只读版本历史已启用，真实未保存输入保护通过

用户确认设计后明确实现。新增有界GET项目版本摘要，每页50/cursor，冻结theme/scene_count来自旧DSL，日期未记录；现有GET版本详情不变。独立折叠组件只读旧口播/代码/场景JSON、不展示profile、不修改父编辑/dirty/Player；请求epoch/卸载及project/id检查，分页去重、错误保留已载列表，不高频轮询。无迁移/表/Schema/依赖/媒体/任务/收费调用。

实跑94临时PG/API/Jobs、164离线Python（258总/94DBskip）、187Node、typecheck/build/py_compile通过。旧theme/稿件不变、52版本分页/项目隔离/六表只读/参数边界、SSR内容及转义覆盖，见[代码阶段](../output/workbench/version-history-qa/receipt.json)。该阶段405与外部rtc_demo_nodejs占用3000为当时事实；未操作外部项目、未沿用连线维护授权。

用户随后确认端口可用并明确允许本web启动、短暂API重载、未保存输入验收。重验3000无监听/原组归属/两队列idle后仅启动loopback web与重载原API；当前 [工作台](http://localhost:3000) 新GET200，容器/DB/worker未重启。独立RAG副本r4三条边与冻结r1两条边确实不同；当前口播加入临时未保存标记后查看详情与刷新仍保持。真实浏览器受控50+2/错误保留52/空列表、关闭详情后晚回不重开、A卸载后晚列表不覆盖B通过；这是传输fixture，非新增52个线上版本，SQL分页另在临时DB验证。246捕获实际API请求均GET，native fetch恢复、临时输入确认丢弃无PATCH、scratch关闭，输出页保留且已finish keep=true/forcedCleanup=false。实际PNG已查看，旧稿可读、不显示profile；Dev1Issue diff明确为html上Tabbit tray与沉浸翻译注入属性，未屏蔽警告或改扩展，不能宣称浏览器无警告。

[新激活记录](../output/workbench/version-history-activation/receipt.json)、[真实/受控浏览器区分](../output/workbench/version-history-activation/browser.json)、[预览](../output/workbench/version-history-activation/preview.png)。首尾与读接口后六表/原件/73对象/容器/配置/消费者精确不变，58attempts/0active/0新任务/收费，无新源代码变更。仅自审，无代理/初始Git提交；时间仍未记录，不支持回滚/对比/旧视频预览；听检/nums/收费20组/异地备份仍暂缓。本轮维护授权已完成，不自动沿用。

## 上一项历史记录：流程连线编辑启用并完成独立副本实际验收

用户要求暂缓异地/新增运维，转回核心功能，并确认手工连线设计/实现。现有flow节点下拉增删≤15，允许空边；仅显式边变化携带PATCH edges，未改边保持旧请求兼容。服务端复用DAG/锁/revision与事务：unknown/self/duplicate/cycle/extra field等回滚，仅改边保留ready/原音轨/节点时间轴，needs_voice/needs_timing不提升；改口播仍失效。旧候选/快照受保护，不新增模型/TTS/Schema/依赖。

代码阶段实跑91隔离PG/API/Jobs、164离线Python（255总/91DBskip）、184Node、typecheck/build/py_compile。用户随后单次新授权仅API原模式重载，web/队列/DB不重启。独立RAG副本8fe1e4f9-6a70-4894-b81a-9384b9b2fcdc第3章实际PATCH顺序200/422/200/409/200，验证新增/保存重开、空边、成环回滚/输入保留、并发冲突不覆盖、旧候选拒绝；重开显示r4/ready，静音Player三条独立SVG路径opacity1，截图已核对。新增仅1project/9scenes/1version/1candidate，所有旧六表行/配置/源音轨/词缓存/原MP4/SRT及旧快照完全不变，原容器ID/StartedAt相同，58attempts/0active，无新收费或timing/render。功能已启用，未新导出MP4或做实听/0.5秒验收；此维护授权不沿用。

[代码阶段及源代码hash](../output/workbench/flow-edge-qa/receipt.json)、[实际激活保存/预览验收](../output/workbench/flow-edge-activation/receipt.json)、[预览图](../output/workbench/flow-edge-activation/preview.png)。新浏览器task连线实际保存验收已finish确认keep=true，保留静音暂停输出页供查看，未强制收尾；只确认自有副本过期输入，未收集console计数不虚构。历史代码阶段旧tab关闭曾EVALUATION_TIMEOUT/恢复附着PAGE_ATTACHMENT_TIMEOUT codeDispatched=false，旧receipt不改写。仅自审，无代理/初始Git提交。听检/nums/20付费组仍暂缓，当前个人使用许可边界见许可说明。下述运维条目为历史记录，不是继续安排的新主线。

## 当前后续安排（用户要求两项加入TODO、继续其他工作）

人工0.5秒同步听检和Python nums发音修正已加入[集中TODO](TODO.md)，均保留未完成，不再重复要求当前选择或自动收费。下一项转到本地部署/交付：只读核验API、网页、两队列、RustFS及五个回环端口，陌生Host/Origin403、配置0600；attempts58且活动任务0，无新增任务或服务重启。`output/workbench/deployment-review/readiness.json`留证。

已整理[运行手册](local-operations.md)及[许可初筛](dependency-license-review.md)。新发现需注意：实际Redis7.4.8为RSALv2/SSPLv1，不能标BSD或套用redis-py MIT；Remotion4.0.534也不是MIT，主体与使用情境许可仍待确认；当前FFmpeg GPLv3+、字体OFL1.1。未采购/升级/迁移。辅助检查先误猜worker hostname前缀，现场pong确认workbench-workflow/render后修正；临时文件需要repo sys.path也已纠正，非业务故障，不改服务或任务。

只读核查阶段未重跑未变产品测试/构建。用户继续后已完成本机空闲隔离备份恢复：6表/73私有对象/2865文件与加密配置恢复相等，API项目/版本/音频/MP4/SRT及缺MP4缓存回填通过，保留仓库外362090292bytes备份及独立0600密钥。原服务未停、原业务数据/资产不变、attempt58和活动0，无付费任务；2临时容器/网络/恢复目录已清理。[恢复记录](../output/workbench/recovery-drill/latest.json)。

演练脚本遇到的Docker internal不发布HostPort、无后缀beat活跃日志、ObjectStore constructor与TestClient非回环403已根因确认；改独立no-masquerade bridge、仅排除日志、按现有构造契约/显式回环测试，不改产品或安全限制。S3用户metadata/内容类型也保留。未提供通用自动恢复或源码变更，首尾hash/恢复等价的空闲检查不是生产停写/airgap/异地灾备。后续已按用户确认固定当前PG16.13/Redis7.4.8 RepoDigest（Compose及两套隔离测试），不升级/重启原服务。134离线+87真实临时PG测试通过，临时IPv6API8000的真实PG/Redis/Celery/RustFS队列350帧渲染通过，取消0attempt、冻结、去重、私有下载和缓存回填通过；原容器ID/StartedAt/6表/原件/配置不变，attempt58/0active，独立测试资源清理。`output/workbench/image-pin-qa/receipt.json`留证。下一优先许可主体确认，人工同步和nums仍在TODO；商用/公网/开机自启尚未验收。以下为各历史阶段记录，旧attempt数字不代表当前状态。

## 已完成：受控手动启停

用户确认设计后实现`services/workbench.py`与标准库回归测试、npm入口。macOS `status|run`，本人私有dotenv/本机只读PG与依赖前置；lsof/ps核验cwd/真实API argv或Next title、回环、启动身份与健康；只启动缺失API/开发网页，同项目现有服务不接管。无worker/beat/Docker入口；忙/DB失败拒绝停止，idle仅owned Popen group TERM、不KILL。补红绿回归修复父退出但group仍活误报成功、正常延迟退出误判崩溃、argv子串冒认、TERM权限失败退出控制器的边界。

真实隔离HTTP双角色start/CTRL+C、owned父子group回收、本机status与现有服务复用验证；原容器ID/StartedAt、6表/原件/配置未变、attempt58/活动0，无新收费/任务。该早期阶段未做原服务冷启；下述批准窗口现已完成实际API/dev及生产网页冷起。整机/容器冷启、原子停写、系统自启/配额/GC、Windows仍未验收，全部边界见[运行手册](local-operations.md#受控前台启动器macos)。证据`output/workbench/controlled-startup-qa/receipt.json`。只自审，不擅造新Git首次提交。

## 已完成：只读20GiB磁盘预警

按用户确认的书面设计，仅`services/workbench.py`成功status输出新增`disk`与约8行stdlib查询，低于20GiB标low，等于/更高ok，OSError不可用/None且不记录异常。不改code/services/tasks、基础错误/成功退出码、run或任务/启停行为；无新依赖/参数/API。新增5tests先RED（缺helper/字段4fail，其中status两个子例），后30focusedGREEN及251discover中164PASS/87DBskip，py_compile通过。

真实npm status快照55887339520可用bytes约52.05GiB/ok；原containerID/StartedAt/6表/配置/原媒体hash不变，58attempts/0active，无队列/配音/模型/渲染或服务重启。证据`output/workbench/disk-warning-qa/{receipt.json,status.json,readings.json}`。只自审，无Git首次提交/委派；未重跑未变数据库全套或前端构建。只是ROOT文件系统手动快照，不代替Docker VM额度、监控/容量预留/配额/GC；其他应用可改变可用空间，原基础失败仍不保证独立disk输出。

## 已完成：真实应用服务冷启动维护窗口

用户明确允许临时停止并恢复API/网页。一次性/private/tmp/real-cold-start.py（compile与assert闸门，纯分类自检）现场核验原API21059及npm67402/next组，PG0active/58attempts、2consumersactive/reserved/scheduled空；仅已确认两组TERM，不用旧PID文件/pkill/KILL，不动基础容器/队列。真正前台workbench冷起API/dev网页并核对归属、原项目/冻结版/音频/MP4/SRT hash与Host/Origin403；Ctrl+C退出0、两端口实际释放。再恢复相同API命令并实测预编译npm web:start、7个静态script均HTTP200，BUILD_IDhash未改；只停本次prod组后恢复原npm web dev模式（17script）。

原containerID/StartedAt/6表hash/配置/原媒体/73对象inventory相同，58attempts/0active、无新任务/模型/配音/render；现APIgroup87504/webgroup87568 ready（历史快照，操作仍要现场核验）。workflow/render/beat3原进程cwd与启动时间早于窗口，未重启。首个只读队列PID检查误把包含Celery字串的诊断shell当consumer而assert失败；根因已观测并用shlex argv module前缀+反例自检排除，非服务故障/重启，产品代码不改。证据[冷启验收](../output/workbench/cold-start-qa/receipt.json)及同目录before.json/queue-processes.json；日志0600输出目录0700。不作首次Git提交或委派，仅自审。

当前恢复同原模式，允许继续使用工作台。此轮HTTP/static/download不是独立浏览器所有交互验收；不涉及整机/容器重启、原子全系统停写或异地恢复。外部消费者一直在，用户暂停提交不等于写锁；API冷启会做既有DDL/桶检查，不说成只读。无业务代码/依赖变更，不重复全套单测/构建或旧计数；后续窗口/冷启其他组件仍需明确授权。

## 已完成：冷启后只读浏览器回归

用户m06877继续：Tabbit新task/临时页（未接管原C验收tab）对实际重启后的开发网页读取项目列表、Python C11章/第4章代码/数组快照表单、RAG9章/第3章步骤表单和高级JSON、重新载入；静音Player0:00→0:01/2:39后暂停。实际工作台链接经浏览器fetch/CORS取MP4首1024bytes206与完整字幕200，匹配原文件sha；不是完整MP4或原生download事件验收。预置API mutation route guard未触发，pageErrors/HTTP400+均0。原table/containerID/StartAt/配置/媒体首尾hash不变、58attempts/0active/零新增收费，无业务代码/依赖变更，不重复旧测试数字。

2次React hydration提示实际diff为html的data-tabbit-tray-loaded/mounted，HTTP原SSR无这两字段，归因浏览器tray注入且未业务屏蔽。3次诊断程序断言因猜测标签而失败：项目列表实际叫项目、代码实际为代码 · python、流程无连线专用label，均重新观察并用实际步骤/高级JSON核验；不是业务修复或隐藏错误。截图实际打开查看并复制/hash核验；自身临时页关闭、finish确认forcedCleanup=false，原用户tab未动。[记录](../output/workbench/post-cold-browser-qa/receipt.json)及[截图](../output/workbench/post-cold-browser-qa/workbench.png)。只自审，无提交/委派。

本次不覆盖保存、生成/配音、取消/重试等有副作用路径，不替代人工实听/0.5秒/nums发音或无扩展生产浏览器全功能回归；这些保留TODO/现有隔离测试，不扩大为全系统验收。

## 已确认交付

- RAG：output/full-rag-subtitle-tail-fixed-20261012-202251/rag-course.mp4，用户确认字幕修复没问题。
- Python：output/full-python-opening-only-20261012-205231/python-full.mp4，用户确认开场可以；其他部分先前反馈没问题。nums发音明确暂缓，不能声称已解决。
- 首尾字幕保留策略有共享实现和红绿回归；107离线Python、70临时PostgreSQL、140Node测试通过。此次核对未改代码，不重复跑这些测试。
- 原版/校正版、配音和审查记录保留。没有新增模型、配音或导出任务；最近总attempts41为先前导出记录，不是本轮重新查询的状态。

## 已完成：无需重新配音的时间轴重算

POST /api/scenes/{id}/timing使用expected_revision，为ready/needs_timing冻结原稿、教学场景、音频身份及词缓存SHA256。local-timing:1走既有workflow任务，重算动画/字幕后按revision/profile/attempt fence附着ready。缺缓存、文件越界/超限/篡改或文本不符明确失败，不隐式调用配音；缓存错误不可重试。旧任务协议及voice收费分支保留。

前端独立“重算时间轴（不重新配音）”和“配音（收费）”，保留未保存/教学核对保护，timing重试不再提示收费。当前仅本地已保存音频与*-words.json可用，词侧车不在对象存储里；缺失时无下载/ASR/配音兜底。

红绿回归后112离线Python+76临时PostgreSQL/API/jobs、141Node、typecheck/web build通过。旧WAV毫秒round与ffprobe ceil允许最多1ms差异并保留原asset duration，词校验不放宽。空闲时API/workflow/beat优雅重启加载v5约束和新协议，web dev刷新。浏览器在独立测试副本手动候选变cue后从needs_timing→ready，一次timing任务succeeded/attached；9音频checksum、其他8场景及已验收原项目/冻结快照不变，总attempts41→42，无模型/配音/渲染调用。记录output/workbench/local-timing-qa/receipt.json、workbench.png，原件未改。

仅自审（未授权独立委派，无Git元数据不可提交）。浏览器首等待器标签不正确导致测试程序超时，但实际job成功，随后只读核对，未重复提交；不把脚本错误称为业务失败。

## 已完成：视觉A（三主题与教学图文）

在保留tech_explainer兼容主题之外新增深色科技tech_multicolor、浅色教学light_teaching、彩色信息图color_infographic。七种模板共享配色令牌；title/card/flow/comparison支持有限SVG图标、步骤编号、content码点高亮、稿中来源标签、结论面板。共享Schema/生成types/Python/TS语义检查、分镜提示/恢复、候选与timing、项目theme原子API、Player/render、编辑入口一并完成。结论不提前，原topic机制不扩大，来源并不代表真实检索核实。

126离线Python+83临时PostgreSQL/API/jobs、163Node、typecheck/web build通过，含未知theme/不支持模板、危险/空白元数据、Unicode越界与来源字面验证、冻结旧版本与audio/revision保护、装饰布局和文本/语义色4.5:1基面对比度、旧兼容颜色/布局回归。空闲API/workflow/render/beat激活，新web启动。

实际浏览器在独立QA副本e93a0b91-e3b3-49bd-90cc-37bf2d5ef27b选择三主题、点击三次单场景预览。每次18.07秒/542帧，MP4/SRT校验和及scene/revision/冻结theme核对，三个解码音轨逐字节相同，与原WAV按既有6帧/200ms音频起点对齐相关性0.9999587（AAC有损，非原文件hash相等）。原9音频/DSL/MP4/SRT与旧冻结版本hash未变，仅新增3个render、attempts45→48，没有generate/voice/timing收费调用。纯展示元数据复用原animations/captions，场景保持ready。output/workbench/visual-A-qa/receipt.json、render-verification.json与三主题截图/视频/字幕留证；主页面现选中彩色信息图副本。

验证辅助脚本最初误猜src/单数animation/subtitle/PATCH返回scene及version.checksum，查询真实契约后只读恢复既有副本；没有重复编辑/任务或把校验脚本错误当业务失败。音频零起点相关性低是忽略既有6帧偏移，不是改声；按契约对齐后通过。截图审查未替代所有长文/模板组合实测；本轮只自审，无Git/独立委派。用户尚待验收A，B数据图示与C代码演示仍待后续设计实施，20组收费验收继续暂缓。

## 已完成：视觉B（用户确认四类数据图）

新增data_chart原生SVG bar/line/proportion/matrix，显式录入并核对数字、单位、来源、行列与cue后原子保存，严格完整有序绑定。1–6单系列行/最多6×6矩阵、label8/title24/source32码点、有限非bool非负≤10亿；不支持负值/多系列/文件导入。raw模型回复、恢复、候选、场景重生成、晚到首次生成发布均不允许chart或替换用户确认数据；用户图表在内部草稿/配音/本地timing合法保留。独立JSON编辑器与未保存保护、API、共享Schema/TS类型/双语校验、Player和冻结render全部接通，无SQL/新依赖。

129离线Python+86临时PostgreSQL/API/jobs+172Node、typecheck/web build通过。修复并回归了确认非bool、加载图表保留确认、starter虚构element.type违反Schema、BigInt literal与ES2017target冲突（保留target改构造器）、大数字被换行拆位、零柱伪造2px高度；数值单行/零柱严格0高度，矩阵列宽/比例单位按真实文本测量，不悄悄取整；文字标签可安全换行居中。

API/workflow/render/beat空闲48attempts激活，真实浏览器独立副本0305d432-60cc-4a92-8044-cc66340a990c，场景093908ac-2245-42f9-857a-600ebeedd957：配置bar→needs_timing，1次本地timing成功/attached，再四种图各一次preview。后发现数字拆位风险，以红绿修复+额外深色5×6/8字标签/10亿数值preview检查，合计48→54=1timing+5render，没有generate/voice计费，render均attempt1。四基础18.07秒/542帧，源数据与各冻结版本一致、视频/字幕SHA验证、五片解码音轨相同，与原WAV按6帧起点相关性0.9999587；原9音频、词缓存、DSL/MP4/SRT及旧项目version哈希不变。证据output/workbench/visual-B-qa/{fixture.json,render-verification.json,submitted.json,receipt.json}及视频/关键帧。

辅助脚本最初错误假定原场景4元素，断言在任何修改前失败；查实际5元素并按原cue排序，不造第6元素/新配音。另一次测试标签12码点被严格拒绝且保留输入、无revision/job变化，改成符合上限8码点，不放宽Schema。错误独立SDK模块/旧task失效均发生于动作前，读安装CLI指南并重建自有浏览器task后完成，不重复提交已完成任务。

比例在最后cue完成前保持空图卡，不提前显示总量/全局百分比；这是一项明确首版视觉限制，不宣称所有时段无空白。图表均清晰标记合成测试数据，复用RAG原音轨而非数字原稿；只验图形/触发/复用，数字口播语义与0.5秒量化同步仍未验收。最大6×6/所有主题组合与完整图表课程未全量实测。用户待验收B；当时C待实现，现见下节，20组收费/nums仍暂停；仅自审，无独立委派或Git提交。

## 已完成：视觉C（代码与状态同屏）

可选code.array_name启用code_walkthrough富布局，旧无字段布局保留。每步array_items/pointers/loop/input显式完整快照；6项连续索引/唯一ID、2个当前项指针、3变量、受限循环轮次，纯文本不执行。共享Schema/生成types/Python/TS、引用恢复/候选/配音/timing、原revision编辑/Player/冻结render全部接通，无新API/SQL/依赖。编辑器启用仅空快照、停用清除需确认、无效JSON保留并阻止保存；后台仍裁决Unicode/未知字段/引用/资产/冲突。初步另提helper后遵循最小改动复用apps/web/lib/editor.ts，没有新增lib/code-state.ts。

131离线Python（discover218中87DB跳过且下项另跑）、87真实独立临时PostgreSQL/API/jobs、181Node/typecheck/web生产构建通过。自有API/workflow/render/beat确认空闲后同配置激活，57attempts/ready与网页HTTP200。浏览器真实保存四字段并保留音频与只读ID/cue，非法输入保存禁用；六项/两个同格指针/16×48代码/最大变量值/44字输入输出做边界检查，修复ASCII拆位与卡片边距后DOM测量包含。原JSON控制字段严格拒绝，不缩小上限掩盖失败。

QA副本e44e4fa1-0032-4aa2-b3c1-9739848cef64保留原11场景原稿与资产、七代码场景补纯元数据。三主题仅选第一轮取值场景c2edcd4d-54a3-4e94-8db2-ac105caac6b2本地预览；每段350帧/11.669秒、1920×1080/30fps、attempt1，54→57仅3render。三片decoded PCM同SHA，按原6帧起点与WAV相关性0.9999608；原项目/视频/SRT/音频/词缓存与旧version SHA完全保留，临时边界代码/值已恢复后才渲染。证据output/workbench/visual-C-qa/{fixture.json,receipt.json,render-verification.json,submitted.json}及视频/关键帧。零模型/配音/重试，旧音频读音不改；新六步枚举例稿只离线核验，未偷偷配音。

辅助脚本起初猜错theme名dark_technology，主题API422拒绝而场景边界已保存，随后按真实tech_multicolor验证并显式恢复，没有重复任务；Tabbit闲置task释放导致一次动作前about:blank超时，重新声明已有C验收tab，无重复编辑/收费。渲染三主题第一轮取值范围实际检查，不代表全片每步/所有极限组合或新的0.5秒声学验收。仅自审，无Git/委派；C实现完成，待用户播放反馈，nums/20付费回归仍暂停。

## 已完成：C完整Python副本导出（后续继续）

复用原11章和全部现有配音，只导出C QA revision17彩色主题新正常version b12d6800-4a04-4956-a91c-704fcf9aa82b；job918fdf41-a334-47dd-8a52-c3e7687ba97f attempt1 succeeded。57→58仅1本地render，无模型/配音/timing/重试，未新增产品代码/依赖。11章/7富代码章，4783帧、159.445秒、1920×1080/30fps。输出output/workbench/visual-C-full/python-full-C.{mp4,srt}；verification.json与chapters.json记录SHA/冻结及章节/状态证据。

字幕与原全课逐字节相同，整轨解码PCM也逐字节相同、相关性1.0；原项目/音频/缓存/文件/旧version以及QA当前项目未改，版本表正常新增1。章节联系表及第2/5/6/7/8章高分辨率关键帧自审，两个循环指针0→1、total0→2→5、最后stdout5且n仍3与手动快照一致；第5章首cue前仍等待，未借未来结果填补空白。并非独立人耳/全部逐帧/新的0.5秒声学验收。nums读音/20收费回归继续暂停，全片只有彩色主题实际导出。完成待用户播放反馈。

## 已整理：C人工同步核对资料（未完成声学验收）

用户继续后，仅只读既有完整C课和11份词缓存，输出 `output/workbench/visual-C-full/sync-review/{README.md,manual-events.csv,audit.json}`。逐项列出38个动画候选、76个字幕区间（114行），全局秒包含每章既有6帧音频起点，cue原文及字幕全文覆盖通过严格align_words核对；原视频/音频/SRT/DSL/词缓存SHA不变，无模型、配音、timing或render任务/数据库修改。

缓存参考差最大0.295秒，唯一超一帧的是原开场title1（0.200秒显示，缓存首音0.495秒），保留既有开场且标记需人工判定，不自动排除。这是缓存差，不是实听误差，不能宣称0.5秒通过。114项实听/实见时间、审查者仍全部空白，acoustic_verdict=pending；README给出标注规则及38个附近播放链接，字幕单独标注，最后一条既有尾部延长策略不更改。11章不计成11个固定验收案例，也不凑20组。

辅助脚本最初误把“每例至少3事件”写成“每章至少3”，第5章1步/第7章2步导致在输出或任何修改前断言停止。对照合同纠正统计范围，保留真实步骤数量，不造cue/配音；重跑资料生成和只读哈希检查通过。未新增生产代码/依赖或冒充人工听检，nums/20收费验收仍暂停。

## 其他未通过项

1. 固定20组真实验收仍未完成：已交付两个主题不等于18/20通过。2026-10-13免费重新执行check:teaching，既有固定短案例结构2/20通过，18例缺交付物，正式验收pending；报告output/acceptance-audit-20261013-110805/report.json。发现6例仍期待旧模板名bullet_cards，运行Schema只支持card_sequence，因此当前标准即使全部生成也最多14例匹配，达不到18/20；load_cases白名单也保留该旧名。随后按用户继续完成修复：6个type统一card_sequence，检查器直接使用运行Schema枚举，加入合法/旧名拒绝/清单一致回归。只改6个type，20原稿/ID/review/coverage逐项不变。123离线测试通过，81数据库测试本轮跳过；未改DB/前端/服务或重跑无变构建。output/acceptance-template-fix-20261013-111629/report.json与receipt.json留证，仍2/20结构通过、18例缺失、formal pending，18/20门槛不变，无模型/配音/渲染或新收费。固定短案例与已接受长课不是同一份原稿，不能混算。
2. 人工0.5秒量化指标尚无完整标注，用户接受不等同统计测量；自动ASR/元数据一致性不是声学真值。
3. nums发音修正延期；未来若重做须明确读法、时间戳兼容和单次收费试听授权。
4. 已实现明确role=topic的提前预告：仅标题/卡片、最多1个，普通结果不提前，旧无标记不变。115离线/77临时DB/155Node/typecheck/build和实际副本timing+render通过，attempts42→44，无配音/模型；output/workbench/topic-opening-qa/留证。未承诺所有模板/无标记输出不空白，主题不泄露答案仍需人审。
5. 已补GET /api/renders/{job_id}只读状态/下载信息，原files安全下载仍保留。120离线+77临时DB/API回归和API-only激活后真实查询通过，jobs/attempts44不变；output/workbench/render-info-qa/留证。单场景preview现已补齐：ready场景冻结到job-owned scene-preview:1，复用render队列/下载，无新增普通版本/表/队列；其他场景needs_voice不阻塞。120离线/81临时DB/156Node/typecheck/build及浏览器一次18.752秒预览通过，attempts44→45仅render，原件/音频/版本不变，output/workbench/scene-preview-qa/留证。未代替无需渲染的Player，不产生模型/配音调用。
6. 供应商账单/预算及Remotion商用许可未核对；仍仅单用户回环部署，无公网鉴权，不可直接公网发布。

已按用户批准范围完成本地时间轴重算，未扩自由拖拽/发音词典或付费验收集。已按合同补齐render查询与单场景preview接口；后续需确认20组规模/预算，不能自行批量收费。
