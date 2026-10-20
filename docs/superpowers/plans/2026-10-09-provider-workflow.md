# 第二阶段：DeepSeek + 火山配音 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 顺序实施；不授权代理，不创建 Git 提交。

**Goal:** 原稿 → DeepSeek 分镜 → 火山真实音频与时间戳 → 最终 DSL → 复用第一阶段导出。

**Architecture:** Python 工作流符合既定后端路线，用已安装 httpx 调用供应商，python-dotenv 加载本地配置；使用原 JSON Schema 验证最终产物。只做本地 CLI，不提前增加 FastAPI、数据库和队列。新增生成文件放在 public/generated/<随机运行 ID>/，导出读取不可变音频，不覆盖示例。

**Tech Stack:** Python 3.10、httpx、python-dotenv、jsonschema、FFmpeg；复用既有 Node/Remotion 导出。

## 协议决策

- DeepSeek HTTPS `/chat/completions`，JSON 模式；模型名从环境配置，默认当前文档建议的 deepseek-flash。
- 分镜含 scene id、模板类型、原文口播、元素/cue/流程边；不允许 LLM 输出音频路径或帧事件。拼接口播必须等于输入原文（仅忽略全文两端空白）。
- 1.0 保留火山 HTTPS `/api/v3/tts/unidirectional` / enable_timestamp；2.0 改接 WebSocket V3 `/api/v3/tts/bidirection` / enable_subtitle，详见原生字幕接入计划。按真实 HTTP 联调结果，code=0 为数据，code=20000000 为成功结束；必须收到结束标记，否则 incomplete_stream。其他状态拒绝，不借用 WebSocket 状态码。
- 支持新控制台 API Key 或旧控制台 App ID/Access Key，两者不能混用。resource_id 与 speaker 必须明确配置，不猜用户已授权的音色。
- 时间戳依次映射到原稿 Unicode 码点；仅允许忽略空白与标点，不静默接受读音替换、漏词、非单调时间或缺少时间戳。
- 时间与字幕遵循开发契约。字幕仅按供应商对齐段组合；超过 22 字符换行，超过两行分块并说明细分段时间是插值而非词级真实标注。
- 已使用本地凭据验证 DeepSeek + TTS 2.0 原生字幕的完整短文案链路；仍未验收 0.5 秒同步指标。

## 文件与执行步骤

1. `services/tests/test_generation.py`：先写缺配置、DeepSeek JSON/原稿保持、火山请求/响应、时间戳/Unicode/舍入/非法区间测试；运行 unittest 观察失败。
2. `services/workflow/providers.py`：配置校验和两个 HTTP 适配器；超时 120s；拒绝重定向，错误只记录阶段/状态码，不记录响应原文或密钥。
3. `services/workflow/storyboard.py`：从最终 Schema 派生中间协议，做口播原文和视觉约束检查。
4. `services/tts/timing.py`：严格时间戳映射、字幕/入场和最终帧数；最终再用现有双语言 DSL 规则核验。
5. `services/workflow/generate.py`：加载 .env，文案读入、逐场景生成、FFmpeg 转 WAV/ffprobe/checksum、最终 DSL 原子写入；失败保留生成音频用于排错，不返回假成功。
6. `.env.example`、`requirements.txt`、`README.md`：供应商配置与 CLI 示例，忽略所有真实 .env 变体。
7. 运行 Python 测试、既有 51 项 TS 测试、类型检查和缺凭据失败自检；用本地模拟 HTTP 验证协议，不能将测试替身记为真实供应商成功。

## 实施结果与核验

- [x] 中间协议从最终 Schema 派生；共享 Python 视觉语义校验，保持既有 TS/Python 一致性。
- [x] DeepSeek JSON、火山 HTTP/鉴权适配、Unicode 时间映射与字幕/入场规划。
- [x] 本地 CLI、FFmpeg 实际转码/ffprobe/checksum、原子且不覆盖发布；对齐失败保留音频。
- [x] `.env.example`、安装依赖声明、生成示例文案、运行说明与忽略规则。
- [x] 30 项 Python 测试和既有 51 项 TS 测试通过，tsc 通过，示例最终 DSL 校验通过；缺凭据 CLI 返回 config/missing_setting，不调用供应商、不生成 DSL。
- [x] 本地 API Key 鉴权、seed-tts-2.0 / zh_female_vv_uranus_bigtts 短句合成和真实 HTTP 结束标记验证；output/tts2-smoke-20261009-180337.mp3 可由 FFmpeg 解码（24kHz 单声道，约 2.66s）。
- [x] HTTP 空词表阻塞已解除：WebSocket V3 TTSSubtitle 返回原稿字级时间戳，不需额外 ASR 或本地模型。
- [x] DeepSeek 实际调用及 5 场景全片时间基联调，真实配音 → MP4/SRT 成功（747 帧、约 24.917s）；按原始字级时间合并可读短句字幕，复用音频重新导出，无重复配音费用。
- [ ] 真实中文人工听检、20 组完整样例与 0.5 秒指标。

自动测试音频来自本地正弦信号，HTTP 与时间戳为测试替身，不记录为实际供应商成功。另有真实 TTS 2.0 短句联调：音频成功，enable_timestamp=true 时 sentence.words 仍为空；该结果不代表所有 TTS 2.0 音色都无时间戳。900s 仅检查工作流检查点，进程级硬中止和自动重试/恢复留给第三阶段 Worker；流式响应持续有进度时也检查时间预算。当前无 Git 仓库、无独立代理审查、无提交或推送。

## 官方文档与未决问题

- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode/
- https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http?lang=zh
- https://docs.volcengine.com/docs/DoubaoVoice/WebSocketBidirectionalStreaming-V3?lang=zh

搜索索引给出 HTTP 请求/时间戳字段；直接抓取官方文档在本机 TUN fake-IP 下被抓取工具拦截，未更改安全策略。TTS 2.0 的真实 HTTP code=0 数据与 code=20000000 结束标记已确认；当前音色的 HTTP 返回空词表，但 WebSocket V3 原生字幕已验证会话级秒值、完整原文覆盖和全片时间基；人工同步精度仍待验收。协议不符时显式失败，不容错猜测未知格式；若实际时间戳是句内相对时间，需依据真实响应/官方定义更新适配器后再验收。
