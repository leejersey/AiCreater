# TTS 2.0 原生字幕接入

用户批准：保留云端 TTS 2.0，不使用本地模型或额外 ASR；优先接 WebSocket V3 的原生字幕（2026-10-09）。

## 设计与范围

- 保持 `volcengine_speech(text, settings, client)` 返回 `(audio_bytes, words)`；TTS/ICL 2.0 使用 WebSocket，1.0 保留已有 HTTP 适配，调用者与 DSL 不变。
- 固定 `wss://openspeech.bytedance.com/api/v3/tts/bidirection`，复用鉴权字段，启用 `audio_params.enable_subtitle`；不用 SSML 或 LaTeX 模式。
- 单场景单会话：StartConnection(1) → ConnectionStarted(50) → StartSession(100) → SessionStarted(150) → TaskRequest(200) → FinishSession(102) → 音频(352)/字幕(364) → SessionFinished(152) → FinishConnection(2)。等待会话结束后才发布完整音频。
- 字幕 `words[].word/startTime/endTime` 为原稿字词和秒值，复用原有 Unicode/单调性/完整覆盖检查。不得用字数推算时间、偷偷调用 ASR 或自动切换付费模型。
- 二进制协议只实现本流程需要的 V1 帧、WithEvent、无压缩、JSON 控制和原始音频。校验长度、消息类型、会话 ID、错误事件；拒绝未知格式和过早断连。按所请求格式收集 MP3，不拼接多段 WAV 头。
- 总合成时间预算最多 120s，消息与累计音频有大小上限；日志不包含密钥或原始服务错误体。异常保持 ProviderError 分阶段格式。
- 单元测试注入模拟 WebSocket，真实联调最多使用短句和一个短分镜例子。不要把协议测试当成实际同步精度验收。

## 步骤与验收

1. 添加字节级协议/生命周期/晚到字幕/异常/超时/会话错配测试，先确认失败。
2. 新增 `services/tts/subtitle.py`，使用已安装的 websockets 16.0，并在 requirements 中声明版本；不要导入上游示例的敏感日志。
3. 在既有供应商入口按 2.0 资源切换传输，覆盖真实生成调用者的模拟流程，保留 1.0 回归测试。
4. 先用本地 Key 生成短句与包含两句的口播，保留音频/字幕并验证 FFmpeg 可解码、原文完整覆盖、时间在音频范围内。
5. 若短句通过，用现有 CLI 运行短文案 → DeepSeek → TTS 2.0 → DSL；校验双语言 Schema 后复用 Remotion 导出。
6. 更新 README/开发契约中的实际状态，执行 Python/TS 测试和类型检查。权限/字段/时间基不符时停止真实调用，报告准确阻塞；不宣称 0.5s 指标通过。

## 参考

- 官方接口文档：https://docs.volcengine.com/docs/DoubaoVoice/WebSocketBidirectionalStreaming-V3?lang=zh
- 官方协议示例压缩包（仅作只读协议参考）：https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_5ec6e28945592c909158dc1e2cf9a89c.zip
- 原生字幕为中英文；SSML/LaTeX 模式可能不输出字幕，首版不启用。

当前没有 Git 仓库，不创建提交，不引入代理。连接池复用留到 Worker 阶段；首版逐场景连接便于明确失败边界。

## 实施结果

- [x] 新增 `services/tts/subtitle.py`，复用既有供应商入口；2.0 自动切 WebSocket，1.0 保留 HTTP。字节长度/会话身份/结束状态/错误/120s 时间预算/音频和字幕数量限制均检查；不记录供应商原始错误体。
- [x] 真实短句与两句口播返回完整字级时间戳，原文覆盖通过；MP3 可由 FFmpeg 解码；两句时间戳没有重置。
- [x] 真实 DeepSeek → 5 场景 TTS 2.0 → `output/native-project.json` 成功。共 747 帧，约 24.9s；TS/Python DSL 校验通过。
- [x] 原生字级时间戳不再逐字闪字幕：按标点/长度合并可读短句，动画仍使用原始字词时间。已有配音与词表重新编排为 `output/native-project-v2.json`，不重复付费配音。
- [x] 导出 `output/native-video-v2.mp4` / `.srt`：1920×1080、30FPS、H.264/AAC、约 24.917s；FFmpeg 全片解码通过。抽查五个场景截图，未见抽查帧明显裁切或字幕安全区冲突，不代表所有帧自动 QA 通过。
- [x] `npm run test:workflow` 30 项、`npm test` 51 项与类型检查通过；独立 Schema 校验通过。覆盖晚到字幕、断连、会话不匹配、压缩/长度错误、音频/词数量限制、错误体保密和短句字幕分组。
- [ ] 20 组完整样例、人工听检及 <=0.5s 同步指标；不宣称 MVP 已全部完成。

后续阶段：SQLite 不可变修订、候选分镜确认和修改失效规则、任务/重试快照、FastAPI/Web 编辑器。真实请求可能产生费用；后续联调应复用已留存音频和词表。当前未接独立 ASR 或本地模型。

