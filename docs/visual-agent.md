# 视觉设计与场景代码 Agent

## 与原有流程的区别

原模板路径继续保留。本路径不是把文字填进更多组件，而是：

`口播 + 实测音频时间 → visual-design.json → 专用 React/SVG → 编译检查 → 源码审批 → 关键帧 → 人工看图反馈 → 修订代码 → 再次审批与渲染`

设计产物明确记录：解释主旨、视觉隐喻、对象及其含义、空间布局、每条旁白对应的对象变化、避免事项、验收标准。代码生成读取设计及已认可的钱包代码参考；参考只提供绘图方法，不强迫所有题材画钱包。

### 当前范围

这是本地受信源码工作流，不是生产工作台集成。两个真实模型案例已保留，尚未获得用户视觉验收；不宣称稳定复现手写参考质量。没有新增整篇视频路由，也没有自动执行模型代码。配音与字幕仍由现有系统负责；本轮场景预览是静音的。

## 操作入口

以下命令在仓库根目录执行。`.env` 由 Node 显式读取，不输出密钥。所有输出使用新路径，拒绝覆盖；没有自动付费重试。

```sh
# 从现有配音清单导入实测时间；seed 只提供主题、事实和视觉目标。
npm run visual:agent -- from-audio \
  ../claude-code-blueprint/presentation/public/audio/audio-manifest.json \
  context examples/custom-scenes/context-wallet/brief.json output/my-context-input

# 第一阶段：模型只做视觉设计，不写代码。
node --env-file=.env --import tsx scripts/visual-agent.ts design \
  output/my-context-input/brief.json output/my-context-input/cues.json \
  output/my-context-design.json --confirm-cost

# 阅读设计，确认对象关系与动作符合讲解，再进入第二阶段。
node --env-file=.env --import tsx scripts/visual-agent.ts code \
  output/my-context-design.json output/my-context-candidate.json --confirm-cost

# 阅读源代码后使用命令返回的实际 SHA256 审批。
npm run custom:render -- output/my-context-candidate.json output/my-context-stills \
  --approve=SHA256 --stills-only --design=output/my-context-design.json
```

`from-audio` 接受 `{segments:[{chapter,text,start,duration,pauseAfter}]}`，秒数来自实际音频测量。它保留停顿、按绝对时间换算帧，不平均分配时长。当前粒度为片段/句段，不声称字级对齐。也可直接提供严格的 `cues.json`：每个 cue 包含 `id,text,startFrame,endFrame`；文字必须逐条拼接成完整原稿，时间不得重叠或越界。

外部 Agent 不需要依赖内置供应商：用 `prepare-design` 或 `prepare-code` 输出提示词，再用 `pack design.json Scene.tsx artifact.json` 保存代码及冻结设计。不能把“编码完成”当成视觉验收。

## 看图修正

渲染报告包含源码、设计和每张 PNG 的哈希。关键帧覆盖每条 cue 的开头、约一秒后的状态、25%/50%/75% 处、结束，以及片尾。仍须实际播放检查中间动作；抽帧不能证明每一帧都正常。

看过图片后写观察记录，例如：

```json
{
  "schemaVersion": "visual-review:1",
  "sha256": "当前产物源码哈希",
  "designSha256": "report.json 中的设计哈希",
  "verdict": "revise",
  "evidence": [{"frame": 0, "observation": "主对象不可辨识"}],
  "feedback": "让钱包从首帧清晰可见，不要只有空白卡片。"
}
```

```sh
npm run visual:agent -- review artifact.json stills/report.json observations.json review.json
npm run visual:agent -- prepare-revision design.json artifact.json review.json revision-prompt.txt
# Agent 根据反馈修改源码，pack 到新版本，再按新哈希审批、渲染和审核。
```

审核命令核对证据图片与渲染记录，不具备视觉理解能力；`verdict` 是审核者的判断，不是自动评分。旧源码、旧设计或被替换的图片不能直接用于新版本审核。PNG 哈希保证与记录一致，不是独立图片解码校验或恶意代码安全证明。

判定 `pass` 还必须具备首帧、全片25%–75%内的中段帧和最后一帧的观察。它只保证最低审核覆盖，不保证审美或教学质量。

### 钱包质量基准第二版

本地修订现直接采用已认可 `CustomWallet` 的横向前袋、侧搭扣与前后遮挡结构，保留原773帧的配音时间，重新映射装入、受阻、筛选与稳定收尾。没有新增模型调用；这是参考引导的本地重绘，不是自动生成成功的新证据。

实际渲染19张关键帧并检查开场、拥挤、扫描和片尾。片尾PNG与已认可参考的片尾逐字节一致；本地基准审核通过，用户验收待确认。首轮模型响应及第一版截图仍保留。设计文档也同步修正，未改写口播和实测cue。

这些经验已写回两阶段提示词：首帧要有可识别物体；明确背板→纸片→前景→搭扣的遮挡顺序；不虚构容量刻度；输出区不得遮挡移出物；先表现原因再表现结果。不宣称仅凭提示词更新就能让下一题自动达标，下一步仍须真实换题验证。

### 换题验证第二轮

用户另行授权2次请求：Agent循环的视觉设计生成成功；代码响应JSON不完整（`Unterminated string`），没有形成可执行产物，也未自动重试。本轮验证**未通过**，未覆盖之前可播放的GeneratedLoop案例。

失败暴露了旧适配器的记录缺口：它在解析前未保存原始文本和`finish_reason`，所以本次无法确证是否由8192输出预算导致。失败说明保存在 `output/visual-agent/loop-quality-v2-candidate.json.failure.json`，不要把它当作生成场景。

已修复后续行为：设计阶段保留8192上限，代码阶段采用16384上限；付费响应在JSON解析前保存为`.provider-response.json`，失败写`.failure.json`，明确区分`length`终止与无效JSON，不对半截代码执行或自动重试。较高上限只影响未来明确授权的调用，本次没有追加费用。`length`意味着输出可能被截断，依据[DeepSeek接口文档](https://api-docs.deepseek.com/api/create-chat-completion/)。

### 单次代码重跑结果

用户随后明确授权仅重跑1次代码生成。复用已保存设计，生成正常结束（`finishReason=stop`），源码通过检查；未进行额外调用，也未手工修补这份代码。`GeneratedLoopV2` 展示该原始模型结果：`http://localhost:3100/GeneratedLoopV2`。旧循环样例仍在原位置。

实际渲染50张关键帧。首帧机制完整可见，但视觉审核为`revise`：需求/结果说明压在环线和工具节点上；任务位置对已计算的路径点再次插值，造成路径偏离。浏览器对SVG中心线采样测量，第578帧偏离环线约31.5px，第1154帧偏离回流管线约94.4px。已保存绑定源码、设计、截图哈希的审核和修订提示，未执行修订。

这说明传输与编译链路可以完成，但仍不能宣称自由代码生成已稳定达到参考视觉质量。全量589项测试通过、专项类型检查通过；单元测试不替代视觉验收。整篇生产接入仍未开始。

## 本地几何修订与自动检查

修订版：`http://localhost:3100/ReviewedLoop`。原始模型版 `GeneratedLoopV2` 保持不变。

本地修订取消了对路径坐标的二次插值，任务直接使用圆弧/二次曲线的坐标；出口与回流终点连续相接，并穿过可见门。节点间距、左右标签区、工具下方标签和标题行距均已调整。本轮没有付费模型调用，不把本地修订冒充自动生成能力验证。

渲染器现在在字体加载完成后、对应帧状态稳定时，运行宿主拥有的几何检查，并把每帧结果绑定到产物报告：

- 可见SVG文字的包围盒碰撞及字幕安全区越界。
- 文字与声明节点轮廓、路线中心线的碰撞。
- 移动锚点与声明路线的距离，容差2px。
- 采集失败、超限和丢失帧检查记录会显式报告，不能安静地判为通过。

源码标记：路线用唯一`id`和`data-route="true"`；跟随路线的组用`data-follow-path="route-id"`，组本地原点是锚点；节点轮廓用`data-obstacle="true"`，容器用`data-object`区分。对应规范已加入设计/代码提示词。同一个对象容器内的文字允许有意嵌入节点，仍需人工检查是否合适。

只有单一直接SVG根节点可视作完整的SVG覆盖。纯HTML、多个SVG或HTML包装/混排仍可渲染，但报告为`partial`，不声称已自动检查全部内容。无几何报告、缺少逐帧记录、存在问题时，审核命令拒绝`pass`；`partial`需明确使用`--allow-partial-geometry`并完成人工审核，不能绕过已经发现的问题。

真实浏览器对照中，给原始SVG补加测试专用标记（未修改原模型源码或图形）后，检查器复现约31.49px/94.42px的偏移及文字碰撞；修订版50张关键帧均无几何问题，其中32次声明的路径跟随检查通过。结果在`output/visual-agent/geometry-browser-comparison.json`和`reviewed-loop-final/report.json`。

限制：这是有限采样和保守包围盒检查，不是审美评分或逐像素证明。路线检查忽略描边宽度、裁剪和遮罩，不覆盖未声明的移动对象，也没有逐帧检查整片。整篇生产接入与新模型生成质量验收仍未完成。

自动检查失败时，可直接生成包含问题对象、帧号和具体原因的代码修订提示：

```sh
npm run visual:agent -- prepare-geometry-revision design.json artifact.json render/report.json revision-prompt.txt
```

此步骤校验源码和设计绑定，合并重复问题，不调用模型、不修改源代码，也不产生视觉通过结论。后续修订仍须明确授权模型调用，并重新编译、渲染和审核。已使用本地失败报告验证此链路，原模型样本保持不变。

## 本次真实实验

- 总计授权并使用 4 次模型请求：两个知识点各一次设计、一次代码，无重试。
- 钱包：模型代码第一次因变量重名编译失败，原结果保留；本地修复后抽帧发现回收托盘遮挡纸片，进行了明确记录的本地修订。
- 循环：模型代码编译通过；抽帧发现终端越过底部、结果徽章未沿实际回流线运动，本地修订了几何与路径。
- `GeneratedContext` / `GeneratedLoop` 展示的是“模型生成 + 本地审查修订”，不是模型一次生成结果。`CustomWallet` 仍是原来的手写质量参考，`TemplateWallet` 是原模板对照。
- 原始响应、失败记录、修订产物、截图在忽略提交的 `output/visual-agent/`；可复用的修订源代码及设计在 `examples/custom-scenes/generated-context/` 和 `generated-loop/`。

```sh
npm run custom:studio
```

预览：`http://localhost:3100/GeneratedContext` 和 `http://localhost:3100/GeneratedLoop`。两者使用不同实测时长，不是原 18 秒等分示例。

## 两章有声拼接预览

用户已确认 ReviewedLoop 的视觉。下一步仅接本地两章联调：`agent-loop` + `context`，共3082帧（约102.73秒）。循环章保留源哈希 `fb685d9d23f3e55226ab9176f14eac256a76f79d2d9023bf0522d7ccc6e2687e`；钱包候选仍标记 `pending`，不把 CustomWallet 的认可自动转给其他源码。

```sh
npm run custom:assemble -- prepare examples/custom-scenes/two-chapter-input.json output/visual-agent/two-chapter-assembly
npm run custom:assemble -- verify output/visual-agent/two-chapter-assembly
npm run custom:assemble -- preview output/visual-agent/two-chapter-assembly --port=3101
npm run custom:assemble -- render output/visual-agent/two-chapter-assembly output/visual-agent/two-chapter-render
```

示例输入引用本机此前保存的实验产物及相邻 blueprint 项目的音频，不是无外部文件的开箱示例。其他项目需提供自己的产物、冻结设计、明确源码审批哈希及实测音频清单。`review`字段可选，缺失时保留视觉待审核状态；它不能替代源码执行审批。所有输出目录须为新目录。

`prepare`不调用模型：校验原稿、设计、源码审批和实测时间，检查音频流/时长后复制音频、源码与冻结数据。预览和渲染均先校验，再建立独立快照，再校验；原输入热改不会直接进入已运行的预览。固定宿主代码仍是仓库内受信任代码，本工具不是沙箱。

所有字幕与场景共用实测句段帧。字幕不按字数估计逐字时间，不改速；每句完整显示，展示层只归一化原换行并换行排版，最多两行（每行48个Unicode码点），过长明确拒绝。SRT保留原句段文本与时间。每章尾停顿保留，跳过的章节不会在合并后留下多余空档。

渲染产物为`video.mp4`、`video.srt`、`timeline.json`、抽帧PNG和绑定输入哈希的`report.json`。成片检查音视频流、1920×1080尺寸和实测总时长；失败保留`failure.json`，不写成功报告。可加`--stills-only`只做抽帧，不导出视频。整体视觉和拼接听感仍须人工验收，不因单章通过就自动认定整片通过。

本次证据：26张抽帧；实测成片102.741秒（时间轴102.733秒）；11条句段SRT与冻结时间轴一致。浏览器播放跨过第2309帧进入钱包章，字幕和音频源切换，无页面错误。四处原配音/导出音频的8kHz PCM交叉相关检查，最佳偏差分别0、0、0.375、0毫秒，相关系数均大于0.995；这仅是抽样信号校验，不代表逐帧或人工听感验收。628项测试通过，专项类型检查通过。本轮无付费请求，尚未接生产队列。

用户随后确认“没问题 继续”，两章合成版验收记录独立保存于`two-chapter-render/user-acceptance.json`，不回写已冻结产物。其余六章的视觉目标见`examples/custom-scenes/remaining-chapters.json`；已派生22条实测句段、六份brief与设计提示至`output/visual-agent/full-course-inputs/`。完整现有配音约391.248秒，不应伪称五分钟成片；逐章换算30fps并保留章尾停顿后，计划总帧数11743（391.433秒），差异是章节帧量化的显式停顿填充，不改动语速。

### 六章有界生成测试

用户单独授权最多12次请求、不重试，现已全部使用：6次设计、6次代码。12份原始 provider response 均保留，finishReason 均为 stop，但这不等于12次产物验收通过。设计原始通过4/6；代码还出现额外字段、隐式 any 和语法错误。预算台账见`output/visual-agent/full-course-inputs/paid-run-ledger.json`，余额为0。

原始渲染还发现路线与移动物不一致、停靠区和文字相撞、动画超出句段、权限闸门未实际完成通行等问题。独立的`local-visual/`保留修订副本，未覆盖原始输出。这一轮属于“模型生成 + 本地编码代理视觉修订”，不能宣称 agent 已稳定自主达到样片质量。

观察到的问题已写回设计/代码提示约束：共同路线端点、有效停靠包围盒、查询变化先于结果变化、对象身份连续、子阶段在句段内完成、拒绝先于执行、显式类型和精确产物字段。回归测试验证规则和契约存在；本轮没有新增模型请求验证这些新提示的实际增益。

整片仅使用通过源码/设计哈希绑定审核的场景，复用33段原有音频，不新增TTS费用。几何检查是采样SVG的保守检测，不替代审美验收，也不是执行不可信代码的安全沙箱。生产DSL、任务队列与正式生成路径未接入这一实验性自由场景流程。

已冻结八章工程：`output/visual-agent/full-course-assembly/`，输入索引为`examples/custom-scenes/full-course-input.json`。以下操作只读冻结工程，不调用模型：

```sh
npm run custom:assemble -- verify output/visual-agent/full-course-assembly
npm run custom:assemble -- preview output/visual-agent/full-course-assembly --port=3101
npm run custom:assemble -- render output/visual-agent/full-course-assembly output/visual-agent/full-course-render-new
```

导出目录必须不存在，不能覆盖历史产物。冻结工程与实测音频都在本地，可迁移到自己的 worker；运行生成源码前仍需建立真正的进程/容器隔离与资源限制。当前只有显式源码审批、静态约束和有界渲染，不是安全沙箱。

本轮最终交付在`output/visual-agent/full-course-render-v2/`：`video.mp4`、`video.srt`、81张检查帧、`report.json`、`timeline.json`与`audio-check.json`。成片为1920x1080、30fps、11743帧，实测391.445秒，包含AAC中文音轨和33条句段字幕。逐章首尾16处PCM对齐抽检全部通过，最大偏移0.375ms；这不替代人工听感和内容验收。字幕显示修复了孤立标点及CJK行高问题，不改配音时间。旧的`full-course-render/`是已中断的排版问题诊断产物，不可作为交付视频。

### 代码输出协议

模型参考现使用 `readReviewedCodingReference` 的精简构造约束，不再拼接完整 Wallet/RAG 源码；设计阶段也读取同一份约束。原示例仍保存在仓库，用于哈希核对与本地审查，不执行、不作为大段模型参考。`repaired-rag-clearance/coding-reference.json` 绑定用户认可的视觉方向源码 SHA；加载器限制字段与大小，并要求 accepted/automaticGenerationVerified 保持 false。视觉方向认可不等于自动复现或几何通过。代码修订仍会携带待修订的目标源码，这不是整段参考样例回填。

代码新生成与修订统一使用 Responses JSON Schema（`scene_artifact_v1`），覆盖独立 `custom:scene generate`、`visual:agent code` 和工作台生成/修订。输出必须包含且仅包含 `schemaVersion`、冻结的 `brief`、非空 `rationale` 与 `source`；后两者分别限制 4000 与 64000 字符。Schema 不替代源码 AST、类型、布局、运动及人工视觉检查。

原始响应先保留再校验；协议尾巴、截断、拒绝、工具调用或字段不匹配都停止，不裁剪、不自动重试、不降级回 JSON mode。历史产物与审批哈希不变；新源码仍须另行审阅并批准具体哈希才能执行。此协议已离线验证，尚未据此证明真实模型能够稳定复现视觉基准。

### 上线边界

禁止把此工具直接暴露为多用户代码执行接口。上线需要隔离 worker、禁外网、资源硬限制和产物版本审批，再连接课程、队列、音轨、字幕。现有 AST 检查仅为护栏。渲染请串行运行；本轮一次并发本地渲染遇到 localhost 服务无响应，失败目录被保留，串行重渲染成功。
# Deterministic motion foundation (offline, not production mode)

`packages/custom-scenes/src/motion-plan.ts` parses immutable `motion-plan:1`
tracks, evaluates seek-safe smoothstep keyframes and emits world-space SVG
transform/opacity values. Repeated equal keys encode a pause; static parent tracks
keep child offsets rigid. Translation, uniform scale and opacity are supported;
dynamic parenting and collision resolution are not yet implemented.

`npm run visual:motion-check -- artifact.json question-roll doc-fragment`
checks the actual marked SVG groups through the TypeScript AST, without importing
or executing the generated module. Each group must bind directly to
`motion["object-id"].transform` and `.opacity`; duplicate identities, attribute
spreads, alternate coordinate expressions and transformed ancestors fail.
This deliberately checks a new binding contract, not compatibility with old
sources. It does not prove the provenance of the `motion` variable and is not
yet a production gate. Host-owned assembly is required before that claim.

Plan validation and binding validation do not imply visual acceptance. Existing
source-hash approval, geometry reporting and human review remain unchanged.
See `docs/superpowers/plans/2026-10-25-deterministic-motion.md` for remaining work.

## Host-owned assembly (offline CLI)

Run `npm run visual:assemble-motion -- examples/custom-scenes/motion-host/assembly.json output/visual-agent/new-host-candidate.json`.
The command makes no model or TTS calls and does not execute the resulting scene.
All output paths must be absent. It writes the existing scene artifact/check files
plus `.assembly-input.json` and `.assembly-provenance.json`.

Input `motion-assembly:1` contains the immutable `brief`, a `motion-plan:1` and
paint-ordered `layers`. Every motion track must have exactly one layer with the
same ID. `artwork` is data, not TSX: `g`, `path`, `rect`, `circle`, `ellipse`,
`line`, `polyline`, `polygon` and `text` with allowlisted numeric attributes.
Fills/strokes use theme tokens or `none`. Groups can contain children; text uses
a literal `text` field. No transforms, style/class overrides, object identity
attributes, opacity attributes, media, URLs or executable expressions are accepted
from artwork. Paint-specific opacity is allowed within a bounded range.

The host extracts the evaluator AST from checked-in `motion-plan.ts`, emits the
runtime and validated data into standalone source, creates the sole root SVG and
all outer object groups, then applies binding/source/type checks. Its source hash
therefore binds the exact runtime, plan, illustration and brief. The input hash
is provenance only. Existing render-time source-hash approval is still required.

The checked-in fixture is a rigid-transfer engineering example, not a recreation
of the RAG scene and not a visually approved video. This new input protocol is
not yet wired to the paid generation/repair prompts or workbench actions. Static
parenting, limited shape attributes and no clips/masks/rotation are deliberate
initial limits. Bounds, path syntax/renderability, semantic duplicates and visual
quality still require subsequent geometric and visual review. This is not a
security sandbox or an automatic visual pass.

## Timed handoff in motion-plan:2

Version 2 adds per-track `attachments` with `startFrame`, `endFrame`, `parentId`
and an `offset` pose (`x`, `y`, `scale`, `opacity`). Windows are half-open:
`startFrame <= frame < endFrame`. Outside a window, a track's keys are world
poses; inside it, the complete pose is derived from the parent and offset.
Static `parentId` cannot coexist with timed attachments on the same track.

The parser rejects overlapping windows, missing/cyclic dependencies, and unequal
free/attached world poses at each attach/release frame. A final window may end
at `durationInFrames`, with no off-screen release check. The dependency graph
is conservatively acyclic over all windows, not only simultaneous ones. Version
1 does not accept these new fields. Neither version guarantees reasonable speed,
valid artwork bounds or collision-free motion without scene-specific checks.

`examples/custom-scenes/motion-rag/fixture.ts` builds a manually authored RAG
mechanism from the exact frozen design hash. It uses one context fragment,
held-grip keyframes, a timed rigid attachment to the question, the lower clearance
route and a continuous hand return. Its opening replaces the older extra 14px arc
with a straight interpolation, and station artwork is manually reconstructed.
It is not a model output or an approved visual reproduction. Tests execute only
trusted data/evaluator modules, not the assembled Scene.

The workbench paid generation protocol is still unchanged. Before enabling this
mode there, the remaining work includes route/obstacle metadata, cue-linked plan
review and screenshot/continuous-motion acceptance of the new assembly. A new
runtime changes newly assembled source hashes; previous frozen artifacts remain
unchanged and their approvals do not authorize a new artifact.

## Host-owned audit annotations in motion-assembly:2

Version 2 requires an `audit` object. `routes` entries contain `id`, `layerId`,
`nodePath` (artwork array index followed by child indices) and `followers` with
`objectId`, `startFrame`, `endFrame`. `obstacles` contain `layerId`/`nodePath`.
Version 1 continues rejecting audit data. Metadata does not go into artwork
attributes; the host places it on the exact referenced node and emits phase-bound
`data-follow-path` on the actual moving group.

Routes must reference visible stroke geometry in a static layer; overlapping
follow windows, missing nodes, duplicate annotations and unknown IDs fail before
assembly. No invisible proxy elements are generated. This validates reference
integrity, not completeness of obstacle coverage or semantic correctness of a
route. Existing geometry measurement and warning rules are unchanged.

The repaired RAG fixture in `examples/custom-scenes/motion-rag-clearance` preserves
the original 938-frame plan and all handoff poses. It removes the suspension line,
moves the tray label outside the payload sweep, and rebuilds the tray/generator
as notched silhouettes with clearance tested against actual painted dimensions.
Visible routes now use the payload's real top-left origin, not the previous
centerline or an audit-only offset. Old frozen inputs/source/reports remain intact.

New obstacle coverage can reveal conservative container/occlusion warnings not
seen in an unannotated source. They must be retained and reviewed, not silently
waived. Source/type/pose tests do not prove the repaired artwork passes visual
review; a new exact source hash still requires approval before screenshots.

## 工作台字幕显示修复

工作台保留原始实测字幕用于设计绑定与复核，播放器和 SRT 通过同一
`workbenchDisplayCaptions` 生成显示条目。仅在无时间间隙、前条未结束完整句子、
尾条至多两个中文/标点字符且持续不超过15帧时合并，并保留两条时间区间的并集。
不跨停顿、不合并英文尾词、不改有显式换行的条目、不超过96字符安全上限。
合并会让极短尾字随前条一起显示，不是逐字对齐；原始字幕时间戳和音频不变。
两行显式字幕中若一行只有标点，则重新排版；正常显式换行仍保留。
SRT 与烧录字幕采用相同分组和换行，不再原样导出孤立句号行。

## Node 工作台数据式模式

`scripts/visual-workbench.ts generate` 的输入现在可显式携带
`"generation_mode":"host-motion"`。省略时仍走原有 `source` 路径。
设计请求不变，第二次请求使用 `motion_assembly_v2` Schema，返回
`motion-assembly:2` 数据，不接受模型 TSX。宿主校验数据、设计对象身份、
运动连续性和审计引用后装配代码，再走现有静态护栏与类型检查。

输入仍为 `{brief,cues}`，可加上述模式字段；设计修订也支持该字段。
修复命令只接受 `{previous_directory,feedback}`，从父稿继承模式，不能偷偷
切换回 TSX。一次生成最多两次请求、一次修复最多一次，不自动重试或回退。

新稿另存 `generation-mode.json`，数据式稿件保存 `frozen-assembly.json`；
`result.json` 绑定 `generation_mode`、`assembly_sha256`、源码与设计哈希。
修订读取时复核数据哈希，遗失模式记录但残留装配数据时拒绝兼容降级。
预览仍须明确批准完整源码哈希，原始几何门槛和人工验收不变。

Python API、队列输入和网页已接入该可选模式。网页“生成方式”默认仍为
“源码生成（兼容）”，可显式选择“宿主运动（实验）”，并单独确认最多两次模型请求。
模式写入任务快照，设计修订与数据修复自动继承父稿模式，不接受修复时覆盖。
历史无模式字段的任务按source兼容读取，不迁移记录。
发布结果与后续预览核对模式和装配哈希；网页审核区展示装配数据哈希。
本地模拟及数据库回归不证明供应商支持递归Schema，也不证明模型自动画质达标。
没有自动渲染、付费探针或新预算授权。

# 离线源码响应诊断

```sh
npm run visual:agent -- inspect-source-response design.json provider-response.json new-proposal.json
```

仅诊断完整stop响应中“完整JSON对象 + 已观察的三段DSML结束标记”，允许分隔的ASCII JSON空白及CRLF，不修复其他JSON错误或未知尾巴。输入只接受普通文件，有界读取最多256KiB；原始正文最多128KiB。继续验证原artifact Schema、设计brief绑定、设计布局、源码护栏和类型。绝不导入或执行Scene、不调用模型、不改写失败原文、不覆盖输出。

输出是独立source-recovery-proposal:1，绑定原文件、解析后的响应记录、正文、设计及源码/brief哈希。固定review-required、accepted=false、originalResponseAccepted=false、execution=not_run、modelRequests=0。technical=passed只表示静态护栏/类型通过；动作审阅和视觉验收仍未完成。该提案不能作为artifact直接渲染，也没有自动接入生产成功或工作台采纳路径。

完整Agent工作与实测结果见 [统一任务清单](superpowers/plans/2026-10-26-agent-completion.md) 及 [定制视觉工作台说明](visual-workbench.md)：
- **已可用路径（`generation_mode:"source"`）**：已完成协议污染/代码块只读恢复（Task 1）、工作台审阅与标签避让建议（Task 2）、静态动作与遮挡反馈闭环（Task 3）、单章真实端到端验收（Task 4：《RAG的工作流程》`5ee01c70...`）、跨题材零人工改码自动生成质量初步验证（Task 5：《上下文预算》`6d5767e9...`）以及两章已验收自主生成场景的统一整课 MP4/SRT 导出与失败恢复验证（Task 6：`d05f31a6-7e94-4c3a-8b13-8e4c6d2f3a04`）。
- **实验路径与未验收边界**：数据式模式（`host-motion`、`host-intent`、`host-components`）与离线迁移（`prepare-transfer`、`preview-transfer`）保持为可选实验/诊断路径；工作台项目 `7735849c` 除第 3 章外的其余 7 章仍为 `needs_voice` 未配音状态；历史人工/代理修补样片（`reviewed-loop`、`GeneratedContext`、`full-course-assembly`）与模型零改码自主生成结果严格区分。

