# 对标意图识别参考片的视觉能力任务规划

> **For agentic workers:** 用 @superpowers:executing-plans 按任务顺序执行，先红后绿并在里程碑停下来检查实际画面。仅在用户明确授权后委派。最新交付：T2–T6组件/版式、T7实际有声对照、T8真实模型三图形样本/v5上线、T9编辑/续登、T10受控有声测试课冻结/渲染/下载已验证。真实供应商分片响应修复解析后原样重放，不是人工填图；模型仅选图/原稿素材/可选状态更新，由程序生成引用及安全动作。472项Node、类型检查、419项离线Python（170环境跳过）、70项原生与追加8项/实际下载1项通过（重叠不相加）。人工主观/逐词听检、本人更长原课及全部旧冻结逐帧兼容未做，不能把这些勾成完成。见 `output/workbench/reference-grade-visuals/compact/receipt.json`。不因已有相似motif而勾选完成。

**Goal:** 先用自有/授权讲稿与音轨交付30–45秒的分层漏斗、对话状态、工具调用链样片，证明图形能解释内容且随讲解变化；再接入AI、编辑和正式渲染，达到参考片的表达丰富度而非只模仿配色。

**Architecture:** 保留现有Remotion/React、9类教学场景、JSON协议和任务系统。完善已有motif为语义图形，增加最少的受控讲解动作，布局由程序计算；AI选择图形与动作，不生成可执行代码或任意坐标。旧场景没有新增字段时沿用原行为，正式/草稿预览共享图形逻辑。

**Tech Stack:** 已安装React、Remotion、SVG、TypeScript、JSON Schema/AJV、Python/FastAPI和现有PostgreSQL。无新增框架、服务、队列、数据库或部署项目。

---

## 一、参考与基线

参考源为用户提供的本地视频（不复制进仓库）：
`/Users/lizexi/Downloads/手把手带你解Agen意图识别怎么实现！ #agent #大模型 #aiagent #agent开发 #智能体 7684979739756365989.mp4`

ffprobe：213.483991秒，1920×1080，30fps。仅做了关键帧分析，尚未完整听检或逐帧确认所有运动技法。

- 2–6秒：问题便签→模型示意→工程判断，同画面累积信息。
- 8–14秒：技术方案依次出现→难点→结论，不能一次摆满。
- 60–66秒：分层漏斗＋方向标注＋大多数/少量说明。
- 174–180秒：工具调用链→结论→防线图形。
- 抽帧证据：`output/workbench/reference-intent/contact.jpg`、`output/workbench/reference-intent/motion-contact.jpg`。

当前不是从零开始：
- `packages/video-components/src/motifs.tsx` 已有 funnel/dialogue_split/means_row/schematic 的布局和静态装饰；MotifDecor接收frame但未使用。
- `packages/video-components/src/GraphicContent.tsx` 已有图标/重点/步骤/结论；`packages/video-components/src/visual-styles.json` 已有paper_slide。
- `packages/video-components/src/motion.ts` 目前以入场为主；`packages/video-components/src/SceneGraphics.tsx` 仍主要把内容放进矩形容器。
- `services/workflow/providers.py` 已有教学动作选模板及motif提示。不能把再次添加同样提示词当本轮完成。
- 静音草稿已交付，使用 `apps/web/lib/editor.ts` 的内存投影；临时时序不是正式对齐，不回写媒体/字幕/分镜。

## 二、文件责任与边界

| 范围 | 现有文件/拟新增文件 | 责任 |
|---|---|---|
| 图形与动作 | `packages/video-components/src/motifs.tsx`、`packages/video-components/src/motion.ts`、`packages/video-components/src/SceneGraphics.tsx`、`packages/video-components/src/GraphicContent.tsx` | 复用现有图形；漏斗、对话、调用链复杂后各拆独立文件，不先造通用引擎 |
| 组件文件（按需创建） | `packages/video-components/src/FunnelDiagram.tsx`、`packages/video-components/src/DialogueDiagram.tsx`、`packages/video-components/src/ToolCallDiagram.tsx` | 各管一种语义图形与帧状态，不包含网络/任务逻辑 |
| 协议与校验 | `packages/video-schema/schema.json`、`packages/video-schema/src/types.ts`、`packages/video-schema/validate.py`及现有TS语义校验入口 | 可选受控动作字段，引用/顺序/原稿锚点/负载限制；types由脚本生成 |
| 正式时间轴 | `services/tts/timing.py`、`services/workflow/local_timing.py` | 原稿码点cue→真实音频帧；保留缓存、失败处理和现有音频 |
| 草稿投影 | `apps/web/lib/editor.ts` | 同一动作的临时帧，仅内存，不假造正式音频/字幕 |
| 生成 | `services/workflow/providers.py`、`services/workflow/storyboard.py` | 能力白名单与受约束JSON；不凭主题强塞图形 |
| 编辑 | `apps/web/app/SceneEditor.tsx`、`apps/web/app/Workbench.tsx` | 图形选择、内容关系与动作锚点编辑，复用草稿/revision/续登保护 |
| 保存/冻结/执行 | `services/projects/store.py`、`services/projects/jobs.py`、`services/workflow/worker.py`、`apps/renderer/src/render.ts` | 不丢新字段，冻结可复现，过期/陌生协议拒绝执行 |
| 样片与证据 | 拟新增 `examples/lessons/intent-visual-benchmark.txt`、`packages/video-components/tests/intent-visual-fixture.ts`；结果放 `output/workbench/reference-grade-visuals/` | 自有/授权原稿与可复现夹具，证据/本地素材不冒充产品设施 |

## 三、任务顺序

### T1｜锁定三段内容与对标验收（P0）

交付：同稿同音轨的新旧画面对照清单，三段各10–15秒，实际长度服从内容，不强行拉长或截断。

- [x] 新写独立的漏斗、对话状态、工具调用三段测试文稿，逐段明确“观众应理解的关系”；不搬参考片素材，不改用户课程。见 `examples/lessons/intent-visual-benchmark.txt`。
- [x] 用现有Remotion渲染器保留同稿/1080P/浅色配色的9张关键帧和37.2秒静音基线。时间是每段12秒加首尾安全帧的合成临时时序，不是已完成配音对齐。
- [x] 制作建立背景、关系展开、结论共9张静态设计稿，以及左现有/右设计的对照。设计稿系统字体与正式Noto不同，不能用它证明正式渲染无溢出；稿件显著标注非实装。
- [ ] 确认有权限的同一音轨、字幕与音量，完成正式有声对照。当前无新配音/真实模型请求，不冒充同步验收。
- [x] 用户确认三段设计方向后进入T2组件开发；正式有声样片仍须T7验收，不把静态批准等同样片通过。

验收：三段不靠标题也可区分图形类别；每个视觉对象有讲稿依据。若没有可复用配音，先静音验证，但不能宣称通过正式同步验收。

### T2｜最小动作协议及双时间轴（P0，T3–T5共用）

交付：保留原有入场，新增连线、强调、状态更新三类必要动作，不一次设计完整动画语言。可选字段名/具体负载在实现前用三个夹具验证后定稿。

- [x] 先红后绿覆盖未知目标、非法cue、乱序、过载、引用/源文限制及旧场景兼容；状态更新只读≤16码点原文，不执行代码。
- [x] 增加可选 `visual_actions`（最多12个connect/highlight/update），同步生成类型与TS/Python语义校验；无任意CSS/SVG路径/脚本/URL。T8前在线模型Schema不公开动作字段。
- [x] 动作绑定Unicode码点，接通字词时间映射器和只读草稿投影；导入/复制/候选/冻结保留动作和motif，候选重算移除旧帧。通过13项临时PG/时间轴专项；真实课程配音同步尚未验收。
- [x] 动作由frame纯计算，无定时器/随机状态；实际渲染倒回重播同帧PNG哈希相同，3张历史基线PNG像素不变。

主要测试：拟新增 `packages/video-schema/tests/visual-actions.test.ts`、`packages/video-components/tests/visual-actions.test.ts`；扩展 `services/tests/test_local_timing.py`、`apps/web/tests/draft-preview.test.ts`。

### T3｜分层漏斗与关系强调（P0）

交付：真正的分层结构，而非三个宽度不同的文本框。

- [x] 几何/2层3层/40码点中文与emoji/动作/四种冻结箭头风格测试先红后绿；正式字体预检复用实际漏斗标签框，40字压力图通过。常驻“层级示意 · 不表示数量比例”。
- [x] 复用funnel motif绘制连续梯形/层线/标签，按原稿逐层强调、连接。只升级带新动作的2–3层场景；旧场景保留原渲染。
- [x] T6补齐funnel层/侧注绑定（最多3层/3侧注），能力/成本方向、指向层的引线、结论按各自原稿揭示；示例箭头向下与逐层处理方向一致，不把层级当统计比例。
- [x] 支持2/3层；短标签在图内，长标签自动外置并用引线关联，不侵入字幕安全区。独立侧注使用funnel.notes，不与旧外置层标签混淆。

验收：能看懂层级和处理关系，存在图形内部变化，不靠轮流淡入矩形冒充漏斗。

### T4｜对话与状态更新（P0）

交付：消息区＋状态区联动，可解释一句话在不同上下文下的差别。

- [x] 先红后绿覆盖消息/更新不得提前、缺失/陌生/重复引用、原文绑定、长中文/emoji、跳帧与3消息气泡尾部间距；实际正式字体压力图通过。
- [x] 复用dialogue_split，新增可选dialogue绑定消息IDs和状态ID；气泡逐条出现，状态按受控动作更新并保留划除的旧值。TS/Python、只读预览、时间对齐、复制/候选/冻结保持绑定。
- [x] 所有内容为讲稿原文片段，状态最多16码点；画面标注“讲稿示意，不代表真实推理结果”，不调用真实业务。

验收：观众能辨认“新消息、相关上下文、更新后的状态”，而非只看见两列便签。

### T5｜工具调用链与结构化参数（P0）

交付：意图理解→结构化工具调用→系统执行的过程图，明确模型与程序的边界。

- [x] 节点/连接引用、2–4阶段/0–2详情上限、按口播揭示、显式失败分支、陌生动作拒绝通过；失败分支有实际PNG，不伪造执行结果。
- [x] 复用flow关系、GraphicIcon与受控强调动作，新增可选process绑定阶段和详情IDs；阶段≤24码点、详情≤40码点，全部为原稿摘录。正式字体预检使用与绘图相同的文本框。
- [x] 参数/代码经React文本转义，脚本文本回归通过；模型线上Schema尚不开放新组件，原稿无返回/失败时不补造，不执行真实工具。

验收：能看懂“结构化调用不是直接执行”，也能用于非Agent的处理流水线，不能把领域术语写死在组件里。

### T6｜组合版式与批注（P0）

交付：三种已有内容可复用的组合版式，而非再新增一批整页scene type。

- [x] 完成“主图＋侧注”“过程＋下方参数”“对话＋状态”。新增可选funnel显式绑定，TS/Python校验、生成类型、对齐、预览、候选/复制/冻结保持字段，线上模型Schema仍不开放；无新scene type或布局平台。
- [x] 复用MarkedText、highlight/source_label/panel_style，三图形共享重点/原稿标签/结论样式；标签必须出自自身cue，结论不得提前。复用T4旧状态划除，不冒称新增自由手绘误区编辑器。
- [x] 实际正式字体渲染3条40码点中文/emoji侧注，32px正文三行保留；拒绝过长、引用异常与编造内容，字体预检复用真实框；标题/正文/侧注/字幕分区，三张历史金样及回退同帧像素不变。

验收：三个图形有不同构图；画面有主次，移动端缩小观看仍能辨认关键关系。

### T7｜30–45秒对标样片与质量门禁（M1）

已有带侧注/重点/结论的37.2秒1080P三图形静音片、同稿/字幕/时序的新旧卡片兼容布局对照（左右缩放1920×580）、9帧接触表，见 `output/workbench/reference-grade-visuals/t6/render-reviewed/`。旧对照移除新语义绑定/动作，6元素漏斗回退通用卡片布局，并非未经修改的历史导出。两文件完整解码通过，已查看关键帧与压力图；仍不能替代用户连续观看与正式有声同步。

- [x] 交付实际45.4秒有声同稿同音轨对照：live/automatic-voiced.mp4为初版真实AI、live/hand-edited-voiced.mp4为明确标注人工编排；最新compact/verified/automatic-voiced.mp4为真实模型选择三图形、未改决策的正式成片。模型原始响应因解析器拒绝分片曾报错，修复后用同一真实响应离线重放，未额外收费或伪装新请求。
- [ ] 保存建立/展开/结论关键帧及动作边界帧；实际播放检查文字、遮挡、节奏、跳转与画面增量，不只验证HTML或JSON。
- [ ] 用户确认视觉方向后再进入AI接入；未通过先修组件/版式，不继续堆任务编排和一键按钮。

验收证据：三段可播放视频、新旧对照、关键帧、问题清单。不能将少数截图或静音片当完整配音同步验收。

### T8｜让AI选择这些能力（P1，M1通过后）

- [x] `services/tests/test_director.py`新增9项受控用例：三类图形、纯定义退回、未知/遗漏/伪造引用、Unicode/重复引用、非法时间/工具动作、源分片、错误脱敏；实际适配器MockTransport覆盖三类首次生成/单章重生成，不调用供应商。这里只验证协议承载，不冒称模型能正确选图。
- [x] 新增显式选择的导演quote协议，复用原storyboard_request/deepseek_storyboard/restore_storyboard（semantic_graphics默认False），允许funnel/dialogue/process/visual_actions；元素和动作皆用唯一原文quote，程序恢复码点并对齐，模型不能给帧数/执行工具。新图形正文/来源必须出自自身cue，坏关系拒绝、不静默降格。后续新增任务已切换v4导演协议，既有v1–v3任务冻结走旧协议；Worker/估价/用量同步，候选保留原图形，未执行真实付费模型调用。
- [x] T9的GraphicsFields显示实际配置与调整项，不伪装推理。新任务已启用v5：固定原稿段落＋局部整数枚举选择＋程序构造引用/动作/时序，严格函数规划不执行业务工具；v1–v4冻结任务仍可读。专用代码/概念/对比等选择standard时至多再调用一次既有生成器；估价含tools/schema及两次上界，用量合计后一次发布，不漏计回退。
- [x] 真实模型实测已完成1个三段样本：实际选中漏斗、对话状态、四阶段调用链，5/4/6个原稿摘录和7/4/9个动作；原始响应包含两份不重复段落规划，安全合并后整体验证，非人工改写或Mock伪造模型结果。完全复用原稿相同的真实配音/供应商词时间戳并正式渲染。先前实验未达标全部保留；本例成功不代表跨课程选景准确率已达标。

验收：不是只能手填夹具；真实模型生成能进入同一预览/渲染路径。无预算时此项真实模型验收保持待完成。

### T9｜用户可改且修改不丢（P1）

- [x] SceneEditor/GraphicsFields提供漏斗层/侧注/方向/引线、对话消息/状态、处理阶段/参数分组及连线/强调/更新动作与原稿锚点。复用步骤正文/来源/高亮字段，无自由画布、模型执行或关键帧编辑器。
- [x] 可选graphics本地草稿字段兼容旧稿；错误原输入保留，切换前确认（取消不丢），保存走原PATCH/revision/租户权限。服务端白名单替换，实际变化保留既有音轨并needs_timing，移除旧动作帧；空白/非整数cue、陌生引用、超界与过期版本原子拒绝。
- [x] 实际隔离工作台编辑/恢复/保存/重算后播放通过；后续按真实产品的“会话过期原地登录对话框”验收，草稿及无效原输入保留、不自动保存/计费，见completion/browser-reauth.json（早期误走整页重载的工具中断不再作结论）。原API/web及唯一worker角色已受控更新，两个原beat原身份暂停/恢复；本轮v5重载九表/326文件不变，无强杀/额外消费者。

主要测试：`apps/web/tests/cues.test.ts`、`apps/web/tests/preview.test.ts`；必要时新增 `apps/web/tests/visual-actions.test.ts`，以及临时数据库下的项目存取用例。

### T10｜正式链路、旧版本与整课验收（M2/M3）

- [x] 受控三段测试课完成真实模型选择→供应商真实语音/词时间戳→正式45.4秒渲染/完整解码→临时原生PG导入/冻结→实际render任务发布校验→HTTP视频/SRT下载200、SHA相同、发布前409、冻结快照不变。原环境v5已启用，但未对用户原课派发新任务，且该下载验收不是生产worker重新生成成片。
- [ ] 检查协议/执行器版本：若新增字段改变冻结执行契约，新增版本并明确双读/拒绝未知版本，不改变旧冻结快照。
- [ ] 本轮472项Node全通过、类型检查通过、私有副本生产构建通过；离线Python409项OK/168环境跳过，59项原生PG/本地时间轴/导演通过。修正过密图形流程的两行布局/边缘连线及预检重叠，旧普通流程不动；密集带图形旧流程的像素可能改变，尚不能承诺9模板/所有旧冻结逐帧兼容。租户/费用/revision护栏测试保留。
- [ ] 扩展到本人完整意图识别课，按内容轮换图形与版式；不硬性要求每段换模板，不强塞3分钟时长。
- [x] 最终实际有声自动片、同音轨人工对照、关键帧、供应商用量、失败实验与校验/下载/上线记录均保留于live/及compact/receipt.json。人工逐词/0.5秒听检、用户主观质量确认仍未执行，不把完整解码当听检。

M2：AI能选、用户能改、预览可播放。M3：完整课程正式导出通过，旧冻结版本仍可复现；真实模型、配音和人工审看各自有记录，不混为一个通过状态。

## 四、验证命令与操作限制

每个非平凡改动：先补最小失败用例→确认失败原因→实现→单测通过→相关回归。全套结果以执行时实际数量为准，不沿用旧的431/348等数字。

```bash
npm run schema:types        # 仅schema变更时；检查生成差异
npm test                   # 期望0失败/0意外跳过
npm run typecheck          # 期望退出0
npm run test:workflow      # 纯测试；数据库用例必须另在临时原生PG全部执行
python3 output/workbench/function-first-qa/test-postgres.py discover -s services/tests
```

生产构建复用已有私有副本验证办法，不在正在使用的原.next构建。渲染复用 `npm run render -- --help` 确认当前参数后执行，不自行猜测参数或新建渲染服务。浏览器使用独立测试项目/Cookie和临时API，验证后正常清理，不重发状态未知的写请求。

- 不新增服务、存储、队列、渲染框架、微服务或部署/监控体系。
- 不迁移/覆盖用户旧课程，不默认认领未归属课程，不自动启动消费者。
- 不运行真实工具、任意模型代码或联网素材生成；不直接复用参考片音轨/素材作发布成品。
- 原环境启用前核对差异、活动任务、备份/回滚；数据库/导出/协议变化不能只靠热更新掩盖。
- 模型/配音请求另批预算与重试边界；本轮规划不等于收费授权。
- 仓库尚无首次提交时不擅自全量git add/commit；不为任务隔离新建基础设施。无用户授权不启动子代理。

## 五、阶段记录（以开头最新状态为准）

不先做：3D、粒子特效、自由生成React/SVG执行、海量整页模板、完整动画编辑器、一键制作平台重构。静音预览与现有纸质风格保留复用，不能重复计进度。

用户确认T1后，T2–T6现均专项及实际静音渲染通过。本轮27项Node专项、11项临时原生PG/时间轴测试通过（含三类绑定冻结/复制/候选子例）；最新全Node469项467通过/2个既有失败，类型检查仍7处既有错误，不声称全量绿。Schema生成可复现、git diff --check通过。三张旧金样及回退同帧像素相同，37.2秒新旧静音文件完整解码通过；见 `output/workbench/reference-grade-visuals/t6/receipt.json`。未重跑全Python/生产构建、未在原工作台开放新编辑能力，无原课程/媒体改写、消费者或收费。T7仍缺有声和用户样片确认；用户继续后新增T8离线协议/Mock适配器与完整存取链，56项专项及20项临时原生PG测试通过（包含重叠项，不相加计数）。未切换Worker/API在线协议，不提前开放AI或一键制作；T8真实模型/选型UI、T9核心编辑/草稿/保存与本地缓存重算现已隔离验证；原环境启用、同浏览器正式重算后播放器联验、图形续登及T10整课仍待续。最新59项原生测试、11项编辑/预览Node专项通过；全Node471项469通过/2个既有失败，类型检查仍7个既有错误，无新增；受控启用预检因消费者样式进程阻断，未强停或重载。见 `output/workbench/reference-grade-visuals/t9/receipt.json`。全Node/类型检查仍2失败/7错误，另原有quote测试的JSON尾部解析错误在HEAD复现，未掩盖；记录 `output/workbench/reference-grade-visuals/t8/receipt.json`。以上为历史批次结果；本轮最新收尾已消除2测试失败/7类型错误，472项Node、类型检查及私有副本生产构建通过，离线Python409项OK/168环境跳过、原生59项通过。修复旧quote测试Schema提取尾部解析。完成同浏览器ready播放与冻结整课合成片/完整解码；过期会话续登工具中断，未冒称通过。原环境未重载、未切换在线AI、未做有声/真实本人课和全旧版本兼容验收；不能结项。该轮记录 `output/workbench/reference-grade-visuals/final/receipt.json`。2026-10-20最新：查明旧过期脚本误用强制导航，按实际原位登录弹窗验收通过，空白cue/侧注保留、0自动任务；T9续登缺口已补。核对身份和空闲、私有PG备份后短暂停并恢复原1 worker/2 beat及其已验证子进程，正常重载API/web，9表逐行和326媒体/配置不变，原图形保存已启用。T7真实有声/人工确认、T8真实模型及在线导演协议、T10本人整课/生产下载/全旧冻结兼容仍未完成；不收费，不宣称整项结案。该轮证据 `output/workbench/reference-grade-visuals/completion/receipt.json`。随后用户继续，T8新任务v4在线代码已接通并受控启用：生成/候选、费用估价、用量冻结和hash复用一致，旧v1–v3任务不变。Mock实际适配器→worker→原生发布链三图形通过，67项专项/27项原生通过（重叠不求和），472Node/类型通过，离线Python412OK/169环境跳过。原API/web重载，原worker角色温和退出后原argv替换，保持1 worker/2 beat，无额外消费者；9表/326文件不变。未收费/未真实模型选图，T7有声人工、T8真实质量、T10本人整课和生产下载/全旧冻结兼容仍待完成。最新记录 `output/workbench/reference-grade-visuals/online/receipt.json`。
