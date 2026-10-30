# Scene Agent 循环：Provider 适配层与工具接口设计

状态：M1（Provider 适配层）已实现，见 `packages/scene-agent/src/provider/`；M2 起未实现。不调用付费模型。

## 1. 目标与非目标

**目标**：分镜稿 + skill（方法论 / 主题 / 组件库）→ Agent 在工程目录中多轮迭代写场景 → Remotion 渲染 MP4。

- 模型越强，画面越好：平台托住下限，不压上限。
- 不绑定模型：换模型只改配置，不改循环与工具。
- 校验以“反馈”为主，只有少数客观硬约束做“关卡”。
- 质量用固定评测集打分，而不是凭单次样例判断。

**非目标（本阶段）**：

- 不改默认工作台、不动已验收的 RAG 课程数据。
- 不新建作业表；先做 CLI，跑通评测后再接入后端（见 §9）。
- 不追求通用 coding agent，只服务“单章场景”这一件事。

## 2. 总体结构

```
packages/scene-agent/            # 新包，TS 实现（工具都在 Node 侧，避免 Python↔tsx 子进程拼接）
  src/provider/                  # §3 适配层
    types.ts                     # 统一消息 / 工具 / 能力类型
    openai-compatible.ts         # DeepSeek / Qwen / Kimi / GLM / OpenAI 等
    anthropic.ts                 # Claude
    registry.ts                  # 读取 models.json，按名字实例化
  src/tools/                     # §4 工具，每个工具一个文件
  src/loop.ts                    # §5 循环控制
  src/workspace.ts               # 章节工作目录的创建与路径围栏
  src/gates.ts                   # §6 最终关卡
  src/eval/                      # §8 评测
  models.json                    # 模型能力与预算配置
skills/teaching-video/           # skill 内容（方法论、主题、组件说明），纯文档 + 组件
scripts/scene-agent.ts           # CLI 入口：npm run scene-agent -- run <chapter-brief> --model=<name>
```

一次运行 = 一个章节 = 一个独立工作目录：

```
output/scene-agent/<run-id>/
  brief.json          # 只读：口播、事实、实测 cue（帧级时间）、尺寸、时长
  skill/              # 只读：skill 文档与主题快照
  scene/Scene.tsx     # Agent 唯一可写的主文件
  scene/*.tsx|*.ts    # Agent 可新增的同目录辅助文件
  stills/             # render_stills 产物
  transcript.jsonl    # 每轮请求/响应/工具结果的完整记录（脱敏）
  result.json         # 终态：passed | stopped(reason) | failed(reason)、轮数、usage
```

## 3. Provider 适配层

### 3.1 统一类型

```ts
type Role = 'system' | 'user' | 'assistant' | 'tool';

type ContentPart =
  | {type: 'text'; text: string}
  | {type: 'image'; mediaType: 'image/png' | 'image/jpeg'; data: string}; // base64，仅 vision 模型

type ToolCall = {id: string; name: string; arguments: unknown};   // 已解析的 JSON 对象
type Message =
  | {role: 'system' | 'user'; content: ContentPart[]}
  | {role: 'assistant'; content: ContentPart[]; toolCalls: ToolCall[]; providerState?: unknown}
  | {role: 'tool'; toolCallId: string; content: ContentPart[]; isError?: boolean};

type ToolSpec = {name: string; description: string; inputSchema: JSONSchema};

type TurnRequest = {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  maxOutputTokens: number;
  signal: AbortSignal;
};

type TurnResult = {
  message: Extract<Message, {role: 'assistant'}>;
  stop: 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal' | 'other';
  usage: {inputTokens: number; outputTokens: number; cachedInputTokens?: number};
  raw: unknown;   // 原始响应，只写入 transcript，不进入下一轮上下文
};

interface Provider {
  readonly name: string;
  readonly capabilities: Capabilities;
  turn(request: TurnRequest): Promise<TurnResult>;
}

type Capabilities = {
  vision: boolean;              // 决定是否开放 view_frames
  parallelToolCalls: boolean;
  contextTokens: number;
  maxOutputTokens: number;
  promptCache: boolean;
};
```

**要点**

- 代码只通过工具参数交付（`write_file` / `edit_file`），**禁止把源码塞进正文 JSON**。这一条直接消除历史上的 `invalid_json`、DSML 尾巴、中文弯引号分隔符等失败。
- `providerState` 用来原样回传各家要求保留的字段（例如推理内容、签名块）。具体字段以各家文档为准，由对应适配器负责，循环不感知。
- `raw` 只落盘，不回灌上下文。

### 3.2 适配器

| 适配器 | 覆盖 | 说明 |
| --- | --- | --- |
| `openai-compatible` | DeepSeek、Qwen、Kimi、GLM、OpenAI 等 | `tools` + `tool_calls` 协议；`baseUrl`、`model`、额外参数从配置读取 |
| `anthropic` | Claude 系列 | `tool_use` / `tool_result` 内容块；支持 prompt cache |

新增模型优先只加配置；只有协议差异才加适配器。

### 3.3 模型配置 `models.json`

```json
{
  "deepseek-flash": {
    "adapter": "openai-compatible",
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-v4-flash",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "capabilities": {"vision": false, "parallelToolCalls": true, "contextTokens": 128000, "maxOutputTokens": 8192, "promptCache": true},
    "budget": {"maxTurns": 15, "maxOutputTokensTotal": 120000}
  },
  "claude-sonnet": {
    "adapter": "anthropic",
    "model": "claude-sonnet-5-5",
    "apiKeyEnv": "ANTHROPIC_API_KEY",
    "capabilities": {"vision": true, "parallelToolCalls": true, "contextTokens": 200000, "maxOutputTokens": 16000, "promptCache": true},
    "budget": {"maxTurns": 15, "maxOutputTokensTotal": 200000}
  }
}
```

能力数值为占位，接入前按各家当前文档核对。

### 3.4 错误语义

| 情况 | 处理 |
| --- | --- |
| 工具参数不是合法 JSON / 不符合 schema | **不终止**；以 `isError` 工具结果把错误原文还给模型，计 1 轮 |
| 调用不存在的工具 | 同上 |
| `max_tokens` 截断 | 计 1 轮，提示“改用 edit_file 分段修改”；连续 2 次则停止 |
| HTTP 429 / 5xx / 超时 | 传输层最多重试 2 次（指数退避），不计轮；仍失败则 `stopped: provider_unavailable` |
| 401 / 403 / 余额不足 | 立即 `stopped: provider_auth`，不重试 |
| `refusal` | `stopped: refusal` |

所有花费都记入 usage，评测统计以实际 usage 为准。

## 4. 工具接口

工具结果统一为**简短文本**（必要时附图片）。模型看到的是结论和定位，不是原始大 JSON。每个结果上限约 4k 字符，超出部分截断并提示用哪个工具查看细节。

### 4.1 文件

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| `list_files` | `{dir?}` | 列出工作目录内文件（只读区 + `scene/`） |
| `read_file` | `{path, offset?, limit?}` | 带行号读取；可读 `brief.json`、`skill/**`、`scene/**` |
| `write_file` | `{path, content}` | 仅 `scene/**`；单文件上限约 60KB |
| `edit_file` | `{path, old, new, replaceAll?}` | 精确替换；`old` 不唯一或未找到时返回错误和附近行 |

路径一律经 `workspace.ts` 解析并围栏在工作目录内，拒绝 `..`、绝对路径和符号链接。

### 4.2 知识

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| `read_skill` | `{topic}` | 按主题返回 skill 文档片段（原则、反模式、组件 API、主题 token），避免一次把全部文档塞进系统提示 |
| `get_timing` | `{}` | 返回 cue 列表：`id、文本、startFrame、endFrame`，以及总帧数 / fps |

### 4.3 检查（反馈型）

| 工具 | 复用 | 返回内容示例 |
| --- | --- | --- |
| `typecheck` | `files.ts#typecheckSource` | `scene/Scene.tsx:42:7 TS2322 ...`，最多 20 条 |
| `render_stills` | `scripts/render-custom-scene.ts` 的 still 路径，改为函数调用 | 渲染指定帧或默认关键帧（每个 cue 起止 + 中点）；返回“已渲染 N 帧”和失败帧的报错栈 |
| `audit_scene` | `geometry-audit`、`label-layout`、`source-motion-review`、`teaching-scene-audit` | 按严重度排序的文字发现，每条含“对象 id、帧号、问题、量化数值、建议修正”，例如：`[high] caption-answer 与 card-2 在帧 312 重叠 38px；建议 y 640→742` |
| `view_frames` | 读取 `stills/` | **仅 vision 模型开放**；返回最多 6 张缩小后的帧图 |

`audit_scene` 只报告、不阻断。它是本设计中质量提升的主要来源，也是给纯文本模型的“眼睛”。

### 4.4 结束

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| `finish` | `{summary, selfReview: {item, pass, evidence}[]}` | 触发 §6 最终关卡；通过则 `passed`，否则把未通过项作为工具错误返回并继续循环 |

`selfReview` 的条目来自 skill 的完工自检清单，强制模型逐项回答，但**不作为关卡**（关卡只看客观检查）。

### 4.5 不提供的能力

不提供任意 shell、网络访问、读取工作目录外文件、安装依赖。渲染在受限子进程中执行（沿用 `scrubRenderEnvironment` 的环境清理）；后续接入后端时再放进现有隔离容器，只保留一层隔离。

## 5. 循环控制

```
system = 角色 + skill 核心原则摘要 + 工具使用约定
user   = brief 摘要 + 本章分镜 + “先读 get_timing 与相关 skill，再动手”

loop:
  result = provider.turn(...)
  执行全部 toolCalls（只读工具可并行，写入/渲染串行）
  记录 transcript
  if finish 通过            → passed
  if 轮数 ≥ maxTurns         → stopped: budget_turns
  if 输出 token ≥ 总预算     → stopped: budget_tokens
  if 连续 3 轮 audit 高严重度发现数未减少且文件无变化 → stopped: stalled
  if stop == end_turn 且未调用 finish → 追加一条提醒；连续 2 次则 stopped: no_finish
```

**上下文管理**

- 系统提示与 skill 摘要固定在前缀，便于 prompt cache。
- 旧的 `read_file` / `audit_scene` 结果在超过 N 轮后折叠为一行摘要（“第 4 轮审计：3 high / 2 low，已过时”），只保留最近一次完整审计。**仅当 `capabilities.appendOnlyHistory=false` 时允许**；Claude 等启用 preserved thinking 的模型禁止改写历史（会使思考块失效），改为依赖 prompt cache，并把单章轮数控制在上下文预算内。
- 不在上下文中保留旧版本源码全文；需要时由模型重新 `read_file`。

## 6. 关卡与反馈的划分

只有下列**客观、与模型能力无关**的条件做关卡，在 `finish` 和最终渲染前检查：

| 关卡 | 判定 |
| --- | --- |
| 编译 | `typecheck` 0 错误 |
| 可渲染 | 所有关键帧渲染成功，无运行时异常 |
| 时长 | 合成时长 = brief 帧数；场景不依赖墙钟 / 随机数（确定性渲染） |
| 安全区 | 主体元素不越出画布；不侵入字幕区 |
| 严重遮挡 | `audit_scene` 中无 `high` 级重叠 / 越界 |
| 文件围栏 | 只引用允许的模块（React、Remotion、组件库、主题） |

其余全部是**反馈**：标签微调、运动连续性、路线一致、构图留白、审美、反 AI 味、自检清单。不要求“必须用某个组件”或“必须是某种结构”，强模型可以自由写 `.tsx`。

## 7. 评审角色（可选）

`--reviewer=<model>`：在 `finish` 通过后，用一个 vision 模型看关键帧，按 skill 的评审清单给出 `pass | revise` 和具体意见。

- `revise` 的意见作为一条 user 消息回灌主循环，最多 2 次。
- 评审不能推翻关卡，也不能单独判定成功；它只提供高层审美反馈。
- 主模型本身支持 vision 时可不开评审。

## 8. 评测集

```
eval/teaching-scenes/
  cases/<case-id>/brief.json     # 口播、事实、实测 cue、分镜
  cases/<case-id>/notes.md       # 人工评分要点（不给模型看）
  runs/<date>-<model>/<case-id>/result.json
  runs/<date>-<model>/summary.json
```

- 初始集：RAG 课程 8 章（已有实测 cue）+ 计划中的 12 个新主题。
- 自动指标：关卡通过率、轮数、token / 费用、停止原因分布、最终审计发现数。
- 人工指标：1–5 分画质评分（盲评，隐藏模型名）。
- 对比方式：同一 case、同一 skill 版本、不同模型。架构是否“随模型变强”，看强模型的人工分是否显著更高、而关卡通过率不降。

## 9. 与现有代码的关系

**直接复用**：`geometry-audit`、`label-layout`、`source-motion-review`、`teaching-scene-audit`、`design.ts#cuesFromManifest`、`files.ts#typecheckSource`、`render-custom-scene.ts` 的渲染逻辑、`workbench.ts` 的整课导出与 SRT、`services/tts` 的配音与对齐、教学组件库与主题。

**改变角色**：审计器从“一票否决”改为 `audit_scene` 反馈；最终关卡只保留 §6。

**暂不触碰**：现有 `visual_jobs`、`teaching_*` 表与工作台。CLI 评测证明可行后，再在后端加一种作业类型 `scene-agent`（复用一张统一作业表），届时再规划旧管线的冻结与退役。

## 10. 里程碑

| # | 内容 | 是否调用付费模型 |
| --- | --- | --- |
| M1 | `provider/types.ts`、两个适配器、`models.json`；用录制的假响应做单元测试（含非法参数、截断、429） | 否 |
| M2 | 文件 / 知识 / 检查工具；对已审核的 `examples/custom-scenes/reviewed-rag` 直接调用工具验证输出 | 否 |
| M3 | `loop.ts` + `gates.ts` + CLI；用脚本化的假 Provider 跑完整循环（写错 → 审计 → 修正 → finish） | 否 |
| M4 | 实验：DeepSeek Flash 跑 RAG 第 1 章，上限 15 轮 | 是，需单独确认预算 |
| M5 | 同一 case 对比一个强模型；评测集扩到 8 章 + 12 主题 | 是，需单独确认预算 |
| M6 | 接入后端作业与工作台；规划旧管线退役 | 视情况 |

## 11. 待确认

1. skill 内容的起点：从现有教学组件文档整理，还是参考 `web-video-presentation` 的 CHAPTER-CRAFT 结构重写？
2. 默认关键帧策略：每个 cue 起止 + 中点是否足够，长 cue 是否需要更密？
3. M4 的预算上限。
