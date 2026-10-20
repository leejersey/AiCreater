# 完整Python/RAG课程真实验收：执行记录

目标：仅两份已复核完整文稿，真实分镜→人工复核→配音→冻结/导出→人工教学与时长验收。内容决定时长，通常2–3分钟、最长5分钟；不扩到20例，失败停止、不自动付费重试。用户在明确告知收费后回复继续，授权本轮两例。

## 当前：RAG用户验收接受；Python字幕校正版待播放

RAG修复版已获用户“没问题，继续下一项”，该问题关闭；未将用户反馈转换成0.5秒人工测量值。Python已免费复用音轨导出末字幕校正版，见末尾当前记录与待继续清单。

## 首次尝试状态（历史）：阻塞，不能算验收通过

- python-loop.txt 796、rag.txt 816 Unicode码点；原2个文稿测试通过。
- 首次仅提交Python生成任务。project_id=2e3151eb-4b4e-47d5-8a03-d480b1d45fe9，generate_job_id=0cf4c65b-1688-4164-b87e-6a4cad59e4a2。实际failed、attempts=1，error.code=validation、stage=storyboard；没有发布分镜。
- 原receipt在output/full-lessons-20261010-221550/receipt.json。没有生成RAG任务，没有TTS、render或自动重试；不声称供应商实际费用已核对，仅有一个收费生成attempt。
- 原始模型响应与细分校验原因未保留，当前证据不足以确定实际是字符保持、schema、cue还是其他限制。不能靠猜测修改文稿/放宽校验或执行模型代码。

## 无新增收费的诊断修复

确认可复现的是诊断丢失：worker.child把所有storyboard ProviderError归一化成validation，parent再存通用信息。修复仅为固定允许列表中的storyboard_*子码，并沿用公开error对象和server-owned消息。未知代码/错误阶段仍通用处理；绝不存供应商message、响应正文、key、header或动态路径。

所有storyboard_*失败仍不可直接付费retry，旧失败记录不伪造子码。未改变模型、提示、输入文本、Schema、worker超时、模板版本或业务验证，因而不声称已修复实际模型输出。后续显式再试仍可能失败/再次计费，须重新授权；同project/revision提交generate会幂等返回旧失败，不是新调用。

先红：6个child子码断言及job允许列表断言失败；最小修改services/projects/jobs.py ERRORS/_error与services/workflow/worker.py ProviderError分支。3个离线诊断用例通过，包含未知/错误stage脱敏及不可重试。新增真实子进程→job持久化用例验证子码保留、原始message丢弃、retry拒绝。

新鲜回归：discover140项、64个数据库跳过，76个离线通过；临时PostgreSQL64/64通过；py_compile通过。未重复跑未改动的Node/Next构建，前次140 Node/生产构建不冒充本轮新验证。

检查自有PID与所有项目无queued/running任务后升级API、workflow/render solo单槽workers及beat；/health ready，无新提交任务、不删卷、不改旧档案。output/workbench/services-before-storyboard-diagnostics.json及services.json留进程记录。

## 第二次显式Python尝试及离线参数修正

用户在再次告知收费后回复继续，仅提交Python一次新尝试；新项目避免同revision幂等复用失败。project_id=45b104a6-4fed-4692-a51b-b620d4327342，generate_job_id=146e4d31-c1a2-47fe-906b-f30cab8f0850；failed、attempts=1，storyboard_incomplete_response。receipt=output/full-python-attempt2-20261010-223547/receipt.json。未调用RAG、TTS、导出或自动重试。

这次证据明确是choices[0].finish_reason不为stop，发生在JSON/教学校验之前。但具体finish_reason仍未保留，不能据此断言是length，更不能把首次失败也追溯成相同原因。

核对官方资料：Chat Completions/Thinking Mode文档（https://api-docs.deepseek.com/api/create-chat-completion/ 与 https://api-docs.deepseek.com/guides/thinking_mode）。直接抓取受本机fake-IP保护阻挡，使用官方域名搜索结果确认当前Flash默认thinking，支持thinking={type:disabled}，length可能是token或上下文上限。搜索证据不是本次响应证据，两者分开。

最小离线修正：仅已知deepseek-flash/deepseek-v4-flash显式禁用thinking，保持原8192-token/1MiB/超时和完整校验，不提高费用预算，不给旧/自定义模型添加新参数。length细分为storyboard_output_limit，content_filter为storyboard_response_filtered，其他/未知/缺失值仍incomplete_response，均不直接retry、不保存原消息/正文/usage或动态数据。不改模型、文稿、提示及教学协议。减少thinking可能影响分镜质量，必须实际人工复核，不能由单测声称原故障已解决。

新服务测试先红（请求thinking缺失及finish错误码不匹配），修正后6个请求/child诊断用例通过；新鲜discover143=79离线通过+64数据库跳过，临时PostgreSQL64/64通过，py_compile通过。未重复跑无改动的Node/Next。检查无活动任务与自有PID后升级，health ready；services-before-storyboard-finish.json记录旧进程，services.json更新storyboard_finish_codes。本次修正未提交第三次收费任务。

## 第三次显式Python尝试：完整响应，但原稿保持失败

用户m03009在明确第三次收费提示后回复继续，仅提交一次Python任务。project_id=1a8dc70e-838d-45a2-ac49-a71c15268a64，generate_job_id=bbc727d5-7cc0-46c8-8c59-2ce5baf9442a；failed、attempts=1、storyboard_source_mismatch。记录output/full-python-attempt3-20261010-230714/receipt.json。参数thinking=disabled/max_tokens=8192；没有发布分镜、没有RAG/TTS/render和自动重试。

代码路径说明本次finish_reason已为stop且JSON已解析，然后口播串接与796码点原稿不相等。不能断言是哪处空白、标点或内容变动，也不能声称模型语义已正确。旧两次的具体原因仍不补造。

进一步重复收费或放宽原稿校验不可取。建议下阶段调整供应商内部协议：程序持有原文片段，模型仅引用连续片段ID并产生图解数据，程序恢复narration.text，全部片段必须原序覆盖一次；不修改原稿或既有DSL/HTTP。可选轻量方案仅在去空白后完全相同时恢复空白，但无法消除模型删改/重复文稿的根因。待设计批准后先离线测试，暂不收费。

只读预检：Python原稿8个非空行、最长125码点；RAG9个、最长96。真实短课与字词同步验收仍阻塞，旧视频不冒充交付。

## 原文归属协议已离线修复（m03023批准）

供应商新增内部source_parts/source_part_ids协议：程序按中文句末/换行无损拆分、最多200片段，模型可合并连续片段为≤20场景；全部ID必须原序覆盖一次，恢复narration.text后执行原Schema/cue/代码/图解校验。不模糊匹配或放宽原稿。重生成单场景用一个原文片段、原ID限制不变。旧完全保持原稿的canonical响应兼容，已有HTTP/DB/语音草稿/模板不变；仅request用户消息格式改变。详细代码与9个新测试见docs/superpowers/plans/2026-10-10-source-owned-storyboards.md。

新鲜88离线+64临时PostgreSQL通过，compile通过；闲置自有服务安全升级。此轮没有新的收费分镜/配音任务，没有发布任何完整新课程。不冒充第三次失败已被真实模型验证修复，后续仍需明确授权一次收费尝试。

## 第四次Python：真实分镜成功并完成文本复核

用户m03085明确允许一次收费验证。project_id=f657d3a0-82b1-47a4-a497-905445063665，generate_job_id=c2b2d9f7-e98c-4082-8dba-26537f52d024，succeeded、attempts=1、11场景；原稿796码点含末尾换行完全保持，证明本次真实供应商已贯通source-parts恢复路径。receipt和原始draft位于output/full-python-attempt4-20261010-232159/。

人工复核发现cue虽合法但存在动作/总结提前，并校准全部步骤到精确原文锚点；概览四行代码高亮修为2–5。生成代码只用AST与可信固定示例比较，未执行；两次取值/累加n/total、打印5、单独错误版本3与空列表边界已审阅。普通PATCH正确拒绝只读cue，未改数据；随后用既有人工候选(source_job_id=None)与revision保护接受，场景r2、项目r13，原稿和保存重读一致，所有needs_voice。

详细review.md、review-before.json、review-progress.json与reviewed-python-draft.json均在该目录；没有更改生产代码，没有自动新增收费调用。没有配音、RAG或导出，仍不能算完整课程验收通过。下一步11场景真实配音将计费，须再次明确允许，失败停、无自动付费重试。

## 11段配音与本地导出完成（m03133明确授权）

依次提交11个voice，均succeeded、attempts=1；失败即停策略未触发，无自动重试/新增分镜/RAG。实际4783帧/30=159.433秒，MP4封装159.445秒（2分39秒）。原稿SHA不变，全部ready，Schema及动画/字幕边界通过。voiced-python-project.json/voiced-python-dsl.json和voice-receipt.json位于output/full-python-attempt4-20261010-232159/。

项目r24冻结version e17f77dc-7397-4279-9648-b59b1218253f；本地渲染job ded41656-8a5f-4aec-939d-de4835f63cd5一次queued→running→succeeded。RustFS及HTTP下载SHA对比通过，python-full.mp4/srt保留，ffprobe确认1080P30 H264/AAC。55.5s、98s、124s代表帧人工检查取值状态/打印5/正确错误分列与字幕安全区。详细delivery.md与render-receipt.json保留。

仅这条完整编程课跑通真实分镜→人工候选复核→11段TTS2→冻结→成片下载，不称全量产品/教学质量验收。未完整听检变量发音或量化≤0.5s字词同步，未跑RAG/20例。已有生产代码未改，本轮不重跑未改动的回归或网页构建。下一步用户播放审阅；RAG需另行明确授权收费。

## RAG首次收费分镜尝试：结构校验失败（2026-10-12）

用户m03175在明确仅1次收费分镜、不配音、失败停的提示后回复继续。project_id=cc4a2225-8009-442b-a2d2-4979083734f8，generate_job_id=6222096e-22f9-4efc-8b40-9cb36950b1c1；failed、attempts=1，storyboard_schema_error，stage=storyboard、retryable=false。816码点原稿SHA256=25d40d340d4364e1dd356b6f3351ff0d9e3f88c1ee4eb5258e0f7079da6da3f2。记录output/full-rag-attempt1-20261012-153909/receipt.json。

仅一次生成调用，未发布分镜、没有TTS/render或自动重试。现有公开错误只保留安全类别，没有具体字段/原始响应，不能据此断言是哪类图、步骤或其他字段违规；不能声称已定位/修复实际根因。本轮未改生产代码，不重跑无改动的构建或回归，也未核对供应商实际账单。

## 安全Schema字段诊断已离线实现（2026-10-12）

本轮批准仅修复诊断链路，不新增收费。`error.schema_errors`最多3条，只含由已签入Schema白名单约束的path和固定rule；不采用jsonschema.message/instance/schema内容，未知字段名截断，附带原始消息丢弃。ProviderError→child→Jobs.fail→job/attempt→HTTP贯通，父进程再次过滤；其他错误与重试规则不变。校验错误即使没有可公开详情仍失败，不能因脱敏放行。无迁移、依赖、模型/提示/文稿/Schema改动。

新鲜94项离线和66项临时PostgreSQL集成通过，覆盖额外/缺失/类型/枚举字段、安全数量上限、异常元数据、子进程持久化和HTTP脱敏；禁用元数据传递时回归断言如预期失败。测试未使用用户数据库或供应商凭据，无新增分镜/TTS/render。随后确认持久工作台无活动任务，暂停beat并优雅重启API/workflow worker，再恢复beat；API ready、网页HTTP 200、workflow/render ping通过，任务尝试数仍为24，无新增执行。未重跑未修改的网页构建。

此改动只让未来失败可安全定位，不能恢复上一次RAG响应或认定根因已修复。再次收费尝试仍需单独授权，失败停。实施记录见`docs/superpowers/plans/2026-10-12-safe-schema-diagnostics.md`。

## RAG第二次单次收费分镜：图解cue校验失败（2026-10-12）

用户在“仅一次RAG分镜、收费、不配音、不自动重试”的确认后授权。project_id=6df99963-800d-4af0-b08c-670af7d36e8d，generate_job_id=76fa2f48-ce73-4966-89ed-5a3d424f067e；failed、attempts=1，storyboard_invalid_cue、stage=storyboard、retryable=false。仍为原816码点文稿，SHA256=25d40d340d4364e1dd356b6f3351ff0d9e3f88c1ee4eb5258e0f7079da6da3f2。记录output/full-rag-attempt2-20261012-164253/receipt.json。

按当前校验顺序，本次已通过Draft字段结构和口播原文保持检查，随后失败于图解cue对应的口播区间校验；不等于第一次Schema错误已修复，也不等于有效分镜/课程已生成。固定业务错误没有附带具体场景/偏移诊断，原始响应仍不保存，不能猜测哪个cue或怎样越界。HTTP回读确认0个已发布场景、项目原稿哈希不变。仅1个generate任务；总job_attempts从24到25，无TTS/render/retry。本轮未修改生产代码，未重跑无改动的回归或网页构建；供应商实际账单未核对。

## 第二次失败后的离线cue排查（无新增收费）

9组本地断言探针通过，44项source-owned/generation/diagnostics回归通过。覆盖空区间、反向、越过场景末尾、仅换行、合法末端开区间、Unicode码点/误用UTF-16、全稿偏移/场景局部偏移、816码点RAG原稿29片段的无损恢复。确认cue采用场景局部Unicode码点[start,end)；上述反例均由现有严格校验拒绝，合法输入通过且原始wire数据不被修改。探针记录output/full-rag-attempt2-20261012-164253/offline-cue-probe.json。

已证实诊断链路缺口：packages/video-schema/validate.py生成/scenes/{i}/elements/{j}/cue；services/workflow/storyboard.py将其置于ProviderError安全消息内，但child只转出固定业务code，Jobs结果丢失路径。Schema诊断仍按其设计工作，不覆盖此类业务校验。上次实际响应未保存，探针不是其重现，不能把空白/UTF-16/全局偏移任一假设当成实际根因。首次探针自身断言误省ProviderError stage/code前缀，纠正后重新全部通过，未改产品代码。

候选最小设计待用户批准：为invalid_cue附加公开场景/元素路径和固定原因（空或反向、超出场景、仅空白），端到端白名单过滤，无原文/标签/模型ID/原始响应和数值偏移；保持严格拒绝、Schema与重试规则。另可设计原文锚点引用协议由程序计算cue，范围较大且不能声称已证实必要；不采用静默clamp或继续收费试错。本轮未改生产代码或服务，无新增付费调用。

## 安全cue诊断修复（离线验证完成）

用户批准最小修改后，补充`error.cue_error={path,reason}`，仅适用于storyboard_invalid_cue。沿用既有首次违规位置，原因固定为empty_or_reversed、out_of_bounds、blank_interval；公开路径严格限定/scenes/0..19/elements/0..5/cue。ProviderError和父进程Jobs分别过滤，多余raw/source/text_start/text_end字段丢弃，格式错误诊断不公开，原本业务失败仍保留。没有改提示、文稿、DSL、Python/TypeScript共享校验、取消/attempt所有权或重试规则；没有clamp。

新增用例先观察到缺失诊断导致两项断言失败；实现后新鲜97项离线、68项临时PostgreSQL/API/任务集成通过，包含三种原因、恶意元数据/边界索引、child、job_attempts与HTTP，现有Schema诊断和发布/取消竞态回归通过。无新依赖、迁移、收费调用或用户项目改动。后续按用户“继续”完成激活：先确认无活动任务、核对进程身份与目录，再优雅重启API/workflow并恢复beat。API ready、网页HTTP 200、workflow/render ping通过，任务尝试数25不变，无新增执行；记录output/workbench/cue-diagnostics-activation.json。网页未改，未重跑构建。实施记录docs/superpowers/plans/2026-10-12-safe-cue-diagnostics.md。

这只增加未来失败的安全定位，不能恢复上次模型响应或认定真实RAG问题已修复。下一次收费必须另行明确授权，失败仍停。

## RAG第三次单次收费分镜：安全定位已实际验证

用户仅授权一次分镜、不配音、不导出、不自动重试。本轮诊断12项离线回归通过后只提交一个generate任务。project_id=de511f6f-61af-4566-afa2-c016dca0c197；generate_job_id=40c7d25d-40ad-4aa3-89ca-9f05265dd62b；记录output/full-rag-attempt3-20261012-170420/receipt.json。结果failed、attempts=1、storyboard_invalid_cue、stage=storyboard、retryable=false；cue_error={path:/scenes/2/elements/2/cue,reason:out_of_bounds}，对应第3场景第3元素。安全诊断真实贯穿worker→持久化→HTTP；不代表有效分镜生成已通过。

HTTP和只读SQL复核：0个发布场景，仍为原816码点文稿，SHA256=25d40d340d4364e1dd356b6f3351ff0d9e3f88c1ee4eb5258e0f7079da6da3f2；本项目仅1个generate，总job_attempts从25到26，无TTS/render/retry。操作脚本首次读取误用id，而API返回job_id；停止提交后只读查询同一项目的唯一任务，找回ID继续查询，没有再提交或重试。此问题属于操作回执，不是产品生成错误。供应商账单未核对。

现已知首个违规cue超过本场景口播末尾；数值偏移与原始响应未保存，不能判断是全稿坐标、计数或其他模型行为。已停止收费尝试，本轮未改生产代码/Schema/文稿。下一步应离线设计cue定位修复（例如引用原文锚点由程序计算区间），不能静默clamp或继续重试碰运气；新协议需另行设计确认与回归验证。

## 原文短语定位cue已实现（离线，新协议）

用户批准后实施新provider-only cue={quote}。只在原样恢复的当前场景文本中唯一精确匹配，Python计算码点区间；不存在/仅空白/重复含重叠全部拒绝，不能规范化、跨场景搜索、猜首个匹配或clamp。新适配器严格要求引用协议，不接受数字响应回退；旧canonical草稿与旧v1冻结任务仍用原规则。新任务版本teaching-outline:2、scene-candidate:2及generation去重隔离，旧失败不会伪装成新版本结果，也未自动重试它们。公开DSL/校验/快照/TTS均不变。

引用失败延续storyboard_invalid_cue，只附白名单位置与quote_blank/quote_not_found/quote_ambiguous，不公开引用值、原稿或偏移。新增7项测试先全部因功能缺失失败，实现及兼容覆盖后新鲜106离线、70临时PostgreSQL/API/任务集成通过。首次集成新增用例遗漏额外项目的排队任务清理，导致后续9项失败；根因定位后修正该测试项目的清理归属，整套重新通过，没有放宽生产队列或校验。

无收费调用、供应商真实验证、用户数据库写入、依赖或迁移。后续按用户继续完成激活：无活动任务时核对进程身份和工作目录，优雅重启API/workflow，再恢复beat。API ready、网页HTTP 200、workflow/render ping及进程存活通过；总attempts仍为26，无新增执行。激活记录output/workbench/quoted-cue-activation.json。网页未改，未重跑构建。旧实际响应无法恢复，不把新协议的离线通过当成RAG教学内容已通过。记录docs/superpowers/specs/2026-10-12-quoted-cue-design.md、docs/superpowers/plans/2026-10-12-quoted-cue-plan.md。

## RAG第四次单次生成：新引用协议真实通过，仍待教学校对与配音

用户明确授权仅1次新协议分镜。project_id=f63fb494-f4d0-4054-b109-48c06b275689；generate_job_id=b45ce5ed-33ff-4912-a770-36052f4fdf2f；teaching-outline:2、succeeded、attempts=1、error=null。发布9场景：4flow_diagram、3card_sequence、1title_reveal、1comparison_panel；全部needs_voice。原816码点与SHA256=25d40d340d4364e1dd356b6f3351ff0d9e3f88c1ee4eb5258e0f7079da6da3f2保持，场景口播连接逐字符相同，规范草稿cue只有text_start/text_end。本项目只有1个generate，总job_attempts从26到27，无TTS/render/retry。没有操作回执重提或字段错误。

记录output/full-rag-attempt4-20261012-175407/receipt.json；规范草稿draft.json经过既有validate_storyboard再次校验，只读初审draft-review.json。初审确认答案未拆封条件与无依据分支保留，但发现第3场景index、第4场景retriever、第5场景model的cue晚于该概念初次引入；第8场景右侧说明起点11早于右标题22。需按教学意图复核，不能全局排序破坏对比固定配对；本轮未做场景修改。这些是有效草稿的教学时机观察，不把数据通过冒充人审通过。

没有配音、实际时长、渲染、截图/0.5秒同步验收或账单核对。此次只证明一次真实生成链路成功，不保证未来模型响应都成功，也无法恢复前三次响应根因。建议下一步先无收费校对，再另行确认配音范围/费用。生产代码未改，未重复跑无改动测试或网页构建。

## 免费人工cue校对完成（4场景7个cue，仍未配音）

用户继续后，未改变产品代码、Schema或编辑只读规则；使用已有Store.create_candidate(...,source_job_id=None)与HTTP候选采纳流程，未伪造模型job/attempt来源。先验证当前草稿等于已初审版本、无活动任务，备份draft-before-cue-review.json；每次按场景修订号采纳，回读全部项目再次严格validate_storyboard。4个手动候选均accepted，project revision从2到6。

第3场景index定位“放进索引”；第4场景retriever/candidates分别定位“检索模块寻找”/“候选片段”；第5场景prompt/model分别定位“放进模型的上下文”/“模型的上下文”；第8场景右标题/说明分别定位“但不保证消除所有错误”/“不保证消除所有错误”。各短语在当前场景精确且唯一，数值由程序计算；流程节点顺序及右侧标题→说明→结果检查通过，不全局排序对比元素。共7个cue改变，9场景口播、ID、标签、元素配对、edges及所有非cue字段逐项不变，全部needs_voice。

记录output/full-rag-attempt4-20261012-175407/cue-review-correction.json，最新草稿draft-corrected.json；原生成draft.json与只读初审draft-review.json不覆盖。原生成receipt.json追加校对关联。项目仍只有1个generate，总attempts仍27，无任何新任务/模型/TTS/render/retry。脚本含边界、源文哈希、非cue差异、修订号、状态与持久化回读断言；没有产品代码改动，未重跑无变化的产品测试/构建。此阶段不声称0.5秒同步、配音听检、视频或最终教学验收通过。

## RAG九场景配音完成（单独授权，无重试或导出）

用户明确授权9场景配音，逐一提交，成功后才进入下一场景。9个native-voice:1任务均succeeded、各attempts=1、attached=true，原816码点及修订后所有元素id/content/cue逐项不变。project_id=f63fb494-f4d0-4054-b109-48c06b275689，revision6→15，9场景全部ready；final_valid组合DSL通过。时间线4930帧/30fps=164.333秒（2分44.333秒），9音频纯时长160.584秒，未人为补齐时长。9个本地音频文件checksum、ffprobe非零时长/单声道及asset duration匹配核验通过，无外部读取或渲染。

第一次配音成功后操作记录脚本因误读audio_id发生KeyError；只读查看规范字段audio_asset_id、config.video_config.fps并核对状态/attempt成功后，继续余8场景，没有重新提交已成功任务。回执保留operator_check_incidents，不把操作脚本错误称作供应商失败。前置27attempts，首段成功时28，最终36；本项目仅1generate+9voice，无新生成/重试/导出任务或快照。

记录output/full-rag-voice-20261012-182524/receipt.json、project-after-voice.json、dsl-after-voice.json、audio-verification.json。没有产品代码改动/未重跑未变代码测试或构建。尚无全课听检、视频/截图/0.5秒同步验收或账单核对；ready只代表声轨/字幕/动画可渲染，不代表最终教学质量验收。下一步明确本地导出范围，不再次生成/配音。

## RAG单次本地导出完成，技术通过/开场节奏待改

用户独立授权本地导出和检查，不新增供应商调用。前置核对全9ready、revision15、原稿与配音后DSL完全相等、无活动任务/render worker存活；创建不可变快照，仅1个snapshot-render:1，succeeded、attempts1。本项目1generate+9voice+1render，总job_attempts36→37，无重新生成/配音/重试。HTTP下载MP4/SRT的SHA256等于结果checksum，项目revision及口播保持。

output/full-rag-export-20261012-183518/rag-course.mp4、rag-course.srt；receipt.json与snapshot.json保留快照/结果。视频1920×1080/30fps/4930帧/164.352秒，H.264/AAC，8,674,610字节；字幕68段、边界有序。全片ffmpeg解码无错误，音轨mean -24.8/max -9.6dBFS，-40dBFS阈值无>1.5秒静音。18抽帧（每场景早期/全部揭示）contact-sheet.png未见明显文字裁切/重叠，流程/对比代表帧可读。media-review.json区分技术与人工验收。

发现开场title_reveal的首图形start_frame334/30=11.133秒，此前主体空白仅字幕；这是教学节奏观察，未自动调cue或新增卡片。抽帧不代表全片视觉或0.5秒声画听检通过。没有真实人耳全课听检、账单核对或最终教学验收；无生产代码变化/未重跑未变代码测试/构建。下一步可设计最小开场时机修正并复用现有音频后本地重导出，不再次调用LLM/TTS。

## 开场校正版完成（独立副本，音频/字幕与原版相同）

用户批准“现有标题提前到第一句字幕，复用配音，通过现有导入生成校正版并保留原版”。只改第一元素cue为原文首句字幕的唯一精确区间、首动画start_frame从334到15（0.5秒）；删除这两个差异后DSL与原版完全相等，严格final_valid通过。原项目f63fb494-f4d0-4054-b109-48c06b275689 revision15始终不变；校正版0a4dc12e-1c35-41ea-a8fd-61b3bb40ca8c revision1/9ready，版本a41ba3b2-49ce-46ab-837f-58425a5b68ec，render ce88dc56-03d8-4baf-867d-887200a706ff一次succeeded。仅导入ready DSL，不新增重算入口、不绕过候选采纳的needs_timing规则。

output/full-rag-opening-corrected-20261012-185336/rag-course.mp4及rag-course.srt；receipt.json与media-verification.json。4930帧/1080p/30fps/164.352秒、全片解码/checksum通过；SRT字节完全相等，AAC流及解码PCM的SHA256与原版均相同。opening-before-after.png的1秒/5秒/11.933秒实际画面确认早期标题存在、原版保留，无明显裁切/重叠。总attempts37→38，校正版仅1个render，无生成/配音/重试。原稿哈希和全部其他字段不变。

未改产品代码/依赖/Schema或重跑未变代码测试/构建；含assert的操作脚本核对前置状态、唯一匹配、最小差异、验证、资产保留、快照及下载。人工完整听检/0.5秒语义同步与账单核对仍未完成；此轮只处理已批准的开场问题，不把音频相同冒充听检通过。实施记录docs/superpowers/plans/2026-10-12-rag-opening-correction.md。

## 校正版30动作的免费只读核验与人工清单

基于apps/renderer/public中的既有九份*-words.json，align_words严格覆盖原稿及单调时序，time_scene重算9个duration、30animation和68caption均与校正版完全一致，所有9音频缓存checksum匹配；每个cue都在供应商token开头，没有中间token的字符时间估计。相对供应商词起点的帧量化误差最大0.031667秒。这是供应商元数据自洽检查，不是独立声学测量。

从成片抽取60个精确帧（每个动作前3帧/后13帧），排除字幕/页眉的图形区域30窗口均有>0.2平均像素差；6对代表图像人工抽检符合预期揭示，无明显裁切/错序。区域变化不证明具体target被识别或人耳同步，不能当作完整听检/0.5秒语义同步验收。首轮FFmpeg-vsync参数在当前新版已移除，命令失败；定位后改用-fps_mode passthrough重跑成功，未写入成片或项目。

同校正版目录timing-audit.json、action-window-contact-sheet.png和human-review-checklist.md（列30个动作时刻/原文、所有复选框未勾选）。回读原revision15/校正版revision1/全部ready，视频SHA256与attempts38不变；无任何新job/供应商调用/产品代码/依赖或构建。下一步由实际播放审阅者确认读音、自然表达、镜头/字幕和0.5秒语义同步；没有工具证据就不勾选人工项。

## 独立离线中文ASR完成（识别差异，不自动修稿）

检查发现已有faster_whisper和完整缓存Systran/faster-whisper-medium snapshot08e178d48790749d25932bbc082711ddcfdfbc4f，直接本地目录CPU/int8/4线程，HF_HUB_OFFLINE=1，未下载/调用云API。未提供原稿initial_prompt，condition_on_previous_text=False；全164秒片得到24段787原始字符，约102.639秒。independent-transcript.json保留未改原始输出。

首个直接比较因识别途中切换繁体产生大量字形差异；没有将其判为语音错误。当前未装opencc/pypinyin，复用macOS Foundation Traditional-Simplified（Swift），以“檢索與規則”→“检索与规则”assert核验，仅作用于比较副本。再忽略标点/空白/大小写与单个数字表记，原/识别都721字符，SequenceMatcher序列相似度0.9764216366158114；13组replace、0个insert/delete分组。差异包括检/简、甲/假、乙/已/椅、示例/势力、已/以、向/项、收/说、检索/减速、依据/一句、再按/在案、夹/加。相似度不是ASR准确率，更不是没有漏读或音质通过的证明。

用对齐后的独立ASR词时间估计核对30个动作，未发现绝对差值>0.5秒，最大0.5秒（开场主题标题不是字面概念跟读）；这仍不是独立声学/人耳真值，不能据此自动改时序。independent-asr-review.json与asr-listening-checklist.md的人工项均未勾选。优先52.5–57.5秒（收到/检索），listen-52_5-57_5.wav是5秒成片PCM摘录，ffprobe时长assert通过，不重新生成声音。

回执记录local_asr_inferences1/cloud_asr_calls0/model_downloads0，视频SHA256与attempts38不变，无新job/项目改动。没有新增依赖、产品代码/构建或供应商费用；不能将ASR疑似差异归咎配音，必须实际听后再决定是否修正/另行授权。

## 用户确认重点5秒片段读音正常

用户对提供的52.5–57.5秒片段明确回复读音正常，因此仅勾选“收/说”和“检索/减速”这2项，记录independent-asr-review.json、receipt.json和asr-listening-checklist.md；不用重配音或改稿。剩余11处识别差异、完整自然表达听检及人工0.5秒同步仍未确认，不能从5秒确认推断整课通过。本轮只记录反馈，无媒体/项目/代码改动或供应商调用。

## 用户整体正面反馈与末句字幕修复

用户反馈整体没问题，但“不应因此获得调用工具或绕过授权的能力。”在声音继续时消失。实片143.5秒确实没有字幕；字幕end142.633秒后1.4秒平均音量−22.1dB、峰−11.2dB。缓存供应商最后词结束15.445秒，音频17.280秒。渲染无字幕fade代码，仅严格遵守end_frame；此前检查仅核对动作起点/元数据一致，未覆盖字幕结束风险。独立ASR也提示持续到143秒之后，但不是声学真值。

用户批准修复：time_scene最后caption.end_frame取scene.duration_frames−6，保留所有中间字幕、词时间戳、起点/元素/配音和场景长度。回归test_last_caption_persists_when_provider_word_ends_early先失败[(6,21),(24,36)]≠[(6,21),(24,97)]，最小共享修复1赋值+原因注释。107离线测试、70临时PostgreSQL测试、140Node测试通过，无新依赖/Schema/渲染器变更，不使用用户数据库跑集成测试。

ready DSL导入副本，仅9个末字幕end_frame改变，逐项恢复后与校正版相等，开场仍0.5秒、原稿/配音不变。一次render succeeded，总attempts38→39，无generate/voice/retry；原校正版project revision1未动。最新output/full-rag-subtitle-tail-fixed-20261012-202251/rag-course.mp4、rag-course.srt、receipt.json、media-verification.json。4930帧/30fps/1080p/164.352秒、全片解码/checksum通过，AAC流与PCM hash与旧版相同，68字幕文本完全相同；本句end144.467秒，143.5/144.4秒实际帧均可见。用户整体正面反馈是修复前带此问题的条件反馈，不把新版本自动标成完整人审通过。待复核2:20–2:25即可优先关闭本问题；仍不保证词级供应商时间戳精度。

## RAG用户验收接受后，转到Python末字幕覆盖检查

用户明确回复RAG修复版没问题并继续下一项，receipt.json/media-verification.json记录问题关闭与交付接受，未伪造量化同步测量。只读既有Python成片发现11末字幕均早于音频边界，较长第7/8/11间隙0.967/1.067/0.7秒仍有音频信号（平均−31.1/−25.9/−29.7dB；峰−14.4/−12.6/−14.9dB），不能把非静音直接称为声学文字判定。subtitle-tail-audit.json记录检查；初次读取旧文档错误别名dsl.json失败，核对实际voiced-python-dsl.json后只读继续，没有任何收费或重提。

沿用已批准末句保留规则，ready DSL导入副本，只改变11个终端end_frame；恢复这些字段后与原DSL完全相等，final_valid通过。原project f657d3a0-82b1-47a4-a497-905445063665 revision24及媒体未改，原796码点/代码/变量/高亮/配音/动作不变。一次本地render succeeded、attempts39→40，无generate/voice/retry。output/full-python-subtitle-tail-fixed-20261012-203403/python-full.mp4、python-full.srt、receipt.json、media-verification.json。4783帧/1080p/30fps/159.445秒完整解码/checksum通过，AAC流与PCM hash与原版一致、字幕文字相同；实际帧92.6/109.6/158.8秒均可见末句。无新产品代码/依赖/构建；先前107离线+70数据库+140Node覆盖的同一规则本轮未重复重跑。

## Python开场图形修正，nums读音按用户要求延期

用户反馈开场只有语音/字幕，nums读音错误，其他没问题；只读复现标题start278帧=9.267秒，实际1秒空白。当前TTS直接传原文，没有指定nums读法。查询官方文档显示发音词典/SSML有候选能力，但正文fetch因DNS映射到198.18.1.7被SSRF防护拒绝，没有绕过；能力与原文字时间戳兼容仍需确认，未调用供应商。用户明确先不改读音，因此不改接口/词典、原文或音频，也不收费试音。

只修当前开场，title_reveal只能1元素，复用既有card_sequence3卡。原主题动画6帧/1帧，0.233秒完整可见（不是字面第一帧；现有最早6帧规则不放宽），早于首字幕0.467秒。2 + 3与= 5的cue由精确唯一“二和三”/“五”及缓存原词时戳计算，分别0.833/3秒；2+3==5 assert，不执行模型代码或提前输出循环状态。其余10场景、源文/字幕/时長/音轨不变，恢复首场景后DSL完全相同，final_valid/导入回读/冻结快照通过。

一次render succeeded，attempts40→41，旧project revision1及媒体保留。最新output/full-python-opening-only-20261012-205231/python-full.mp4、python-full.srt、receipt.json、media-verification.json。4783帧/1080p/30fps/159.445秒完整解码与checksum通过；AAC/PCM/SRT与原版相同。0.5/2.6/3.6秒实片分别有主题、算式、结果，2.6秒没有结果，无明显裁切/重叠。无新模型/配音/重试/依赖/产品代码/构建或无变代码测试；实施docs/superpowers/plans/2026-10-12-python-opening-only.md。这是当前课程修订，不声称新增全局自动开场策略；用户开场确认待完成，nums读音明确延期。

## 明确主题自动预告完成（不提前计算结果）

按用户确认设计，Element可选role=topic，仅title_reveal/card_sequence/每场景最多1个；结构不带代码/变量/输出/状态或事件。双校验一致，主题是否中性不泄露答案仍由人审；不从位置/模板名猜普通元素是主题。time_scene只改明确主题的start6/duration1，普通cue/字幕/配音保持。readonly角色变更只能经候选确认，变更角色同cue也needs_timing，免费重算后ready。模型提示/精确quote恢复/前端只读说明/类型接通，无新模板/依赖。

红绿后115离线Python/77临时PostgreSQL/155Node/typecheck/web build通过；无Git或委派，只自审。初次DB测试fixture错误调用Store._draft_scene，改为既有Jobs静态helper后通过，未改域规则。零活动时API/workflow/render/beat优雅重启，同版Schema，启动attempts42不变。

独立副本ebb3c883-e6fb-4550-9803-d5d775ca175e先冻结未标记晚标题278帧，然后只加topic候选，needs_timing→一次timing succeeded/ready，标题6帧、其他动画25/90不变。一次本地render，attempts42→44；无模型/配音，原Python54d3c504-d5ce-4bfe-b845-88ad383d08d6 revision1及冻结旧版不变。output/workbench/topic-opening-qa/preview.mp4、preview.srt、receipt.json，4783帧/159.445秒完整解码/checksum、AAC/PCM/SRT与原版一致。实际0.5/2.6/3.6秒有主题→算式无结果→结果，无明显裁切/重叠。操作脚本把cache_snapshot字符串当dict（副作用前失败）、job_id误读id（任务已成功）均只读恢复，无重提，回执保留。

无标记/其他模板不能保证不空白，不补分类器或自行重配音。nums读音仍延期，20组批量真实/量化声学同步/预算许可未扩。

## 已配音单场景预览接口与按钮完成

用户确认后红绿实现POST scene/preview，only ready+expected_revision；冻结选中场景和原音频到job-owned scene-preview:1，复用render，不创建普通版本。普通snapshot-render:1不变；未知协议拒绝。公开scope=scene与scene ID，发布scene_revision/checksum，不返回假version_id；下载仍hash与范围校验。按钮未保存/非ready禁用，普通Player保留，local render重试不提示配音计费。

120离线Python/81临时DB/156Node/typecheck/build通过；初次API新增测试未取消queued render污染后续claim和全表versions计数误判，限定项目/cleanup后重新81通过，不修改生产公平队列。闲时验证身份/CWD/active0/attempts44，API/render/beat重启。首次脚本错认模块名，核对queue:app后执行，之前未停服务。

独立副本c279fd40-f1a9-4df7-af36-f443d89f6166场景2改为needs_voice，不改原件；浏览器该场景按钮禁用、ready场景按钮启用，一次点击job1bd289bd-ad91-42c8-be18-20d045a02da4 succeeded/attempt1。预览562帧/18.752秒/1080p/30fps/8字幕，下载hash/全解码/frozen snapshot checksum/原WAV/源项目与副本不变、无普通版本核验通过。actual0.5秒有主题、不裁切重叠；output/workbench/scene-preview-qa/preview.mp4、preview.srt、receipt.json与workbench.png。总attempts44→45只新增render，无模型/配音/重试。

当前FFmpeg要求0.5而非.5，抽帧修正只读复查无重提；Tabbit注入html data属性引起dev hydration警告已定位，不用suppress隐藏。无独立委派/无Git。仍不保证未配音可预览或所有输出人工声学通过，nums/20组/账单/许可未扩。

## 待继续

1. 用户已回复“可以，继续”确认Python修正开场；其他部分已有正面反馈，nums读音继续暂缓，不自动重配音。receipt.json/media-verification.json记录视觉接受，不伪造量化同步测量。其他部分已有用户正面反馈，不反复扩自动审查。
2. RAG本轮交付已接受，原版/校正版及诊断保留；不重复收费。未来新供应商调用仍需单独授权，旧失败具体机制无法补回。
3. 按用户批准已完成独立本地时间轴重算：local-timing:1/POST timing/独立免费按钮，112离线+76临时DB+141Node/typecheck/build通过，空闲重启后独立副本浏览器一次needs_timing→ready。9音频及原验收项目/冻结版本不变，attempts41→42仅timing；无新模型/配音/渲染。证据output/workbench/local-timing-qa/receipt.json，docs/mvp-follow-up.md更新。缺词缓存明确失败，不转收费；后续20组规模/预算与原接口补齐仍待确认，不自行批量收费。用户反馈不等同量化0.5秒同步测量或所有未来输出质量保证。
