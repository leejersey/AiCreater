# 第一阶段：DSL 与渲染闭环 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans，在当前会话逐项执行；未授权子代理。本目录无 Git，不创建 worktree 或提交。

**Goal:** 手写 DSL 经 Python/TypeScript 同协议校验，用三个 Remotion 模板生成真实中文音频的 1080P MP4 和 SRT。

**Architecture:** 根 npm 项目管理 TypeScript 构建和测试；packages/video-schema 存储唯一 Schema、生成类型及语义规则；packages/video-components 提供纯布局/运动函数和帧驱动 React 画面；apps/renderer 提供 Composition 和本地导出 CLI。Python 校验器读取同一个 Schema，做与 TS 一致的语义检查。首版测试夹具时间戳为手工示例，不冒充正式语音对齐。

**Tech Stack:** Remotion 4（统一固定版本）、React、TypeScript、Ajv、json-schema-to-typescript、Node test、Python jsonschema、FFmpeg/ffprobe、本地 Noto Sans SC 字体。

---

## 文件职责

- `package.json`、`tsconfig.json`、`.gitignore`：构建、测试、Studio 和本地导出命令。
- `packages/video-schema/schema.json`：最终 DSL 的 JSON Schema。
- `packages/video-schema/src/types.ts`：从 Schema 生成；禁止手改。
- `packages/video-schema/src/validate.ts`：TS 结构及跨引用/时长/cue/DAG/字幕验证。
- `packages/video-schema/validate.py`：相同 Schema 的 Python CLI 和语义验证。
- `packages/video-schema/tests/validate.test.ts`：合法/非法输入、双语言行为一致性。
- `packages/video-components/src/layout.ts`：固定安全区布局、文本分行。
- `packages/video-components/src/motion.ts`：纯帧驱动入场。
- `packages/video-components/src/Video.tsx`：模板、音频、字幕及顺序组合。
- `packages/video-components/tests/components.test.ts`：布局和时间函数。
- `apps/renderer/src/index.tsx`：Remotion Composition 注册。
- `apps/renderer/src/render.ts`：验证资产、调用 renderer、验证 MP4、输出 SRT；失败不发布最终文件。
- `apps/renderer/src/subtitles.ts`：帧号与全片字幕偏移转换。
- `apps/renderer/tests/render.test.ts`：资源边界和字幕转换测试。
- `scripts/generate-types.ts`：Schema 类型生成。
- `scripts/create-demo.ts`：macOS say + FFmpeg 生成示例配音与 5 个手工 DSL 场景；不提供伪对齐服务。
- `examples/demo.json`、`apps/renderer/public/demo/`：自包含示例输入和配音。
- `README.md`：运行、测试、限制、后续阶段。

## Task 1：协议与双语言校验

- [ ] 写 TS 协议测试及合法夹具，运行 `npm test`，确认因协议模块缺失失败。
- [ ] 实现严格 Schema（unknown fields 拒绝、枚举和边界）。
- [ ] 生成 TS 类型，实现跨引用、Unicode cue、流程无环、模板数量、总时长和事件检查。
- [ ] 实现 Python 校验器，直接读取同一个 Schema；通过测试逐项核对两种语言的接受/拒绝结果。
- [ ] 运行 `npm test` 和 `npm run typecheck`。

## Task 2：布局、动画与三个模板

- [ ] 先写纯布局/动画测试，确认缺失模块失败。
- [ ] 实现固定网格卡片、标题和纵向 DAG 流程图，连接线从文字区外绕行；文本按码点确定性分行。
- [ ] 实现 Scene/Sequence/Audio 和半开字幕区间；所有动画按 useCurrentFrame 计算。
- [ ] 固定 Noto Sans SC 本地字体，通过字体加载完成后再放行渲染。
- [ ] 注册 Composition，按输入总帧数计算 metadata；运行测试和类型检查。

## Task 3：资产核验、SRT 和 CLI

- [ ] 写资源路径穿越、checksum、帧号舍入和跨场景字幕偏移测试，确认缺失模块失败。
- [ ] 仅允许 public 内普通本地音频文件（含 symlink 实际路径检查），用 ffprobe 确认媒体时长和哈希。
- [ ] 实现本地 CLI：结构/语义/资产验证 → bundle → selectComposition → renderMedia → ffprobe → 原子发布 MP4/SRT。
- [ ] 渲染前后验证输出位置，禁止无意覆盖已有输入/产物；限定并发和 600s 超时，清理临时目录。
- [ ] 运行测试、类型检查和 CLI 非法输入自检。

## Task 4：真实示例与验收

- [ ] macOS 本地中文语音生成 5 场景；若不可用则要求自备音频，禁止用静音声称中文配音验收通过。
- [ ] 写 README，明确手工字幕/cue 不是自动强制对齐；真实供应商阶段尚未实现。
- [ ] 实际渲染 MP4 和 SRT，ffprobe 检查 1920×1080 / 30FPS / H.264 + AAC 及帧时长。
- [ ] 抽取三类模板关键帧截图并检查安全区、字体、字幕、连接线；保留截图作为阶段证据。
- [ ] 最后运行 `npm test`、`npm run typecheck`、`python3 packages/video-schema/validate.py examples/demo.json`；记录实际结果与未验收内容。

## 自审约束

不增加队列、数据库、Web 编辑器、供应商适配器或多租户。Python/TS 语义规则需用共同边界案例保持一致。依赖全部锁定，离线资源打包；示例音频仅证明渲染链路，不证明正式 TTS/对齐能力。阶段 2 需要明确真实供应商。完成后报告阶段产物，而不是声称完整 MVP 已开发完成。

## 执行记录（2026-10-09）

任务 1–4 已执行；上方清单保留原实施步骤，实际验证结果如下：
- `npm test`：51 项通过；包括双语言协议边界、Unicode cue、BOM 空白、整数值浮点 JSON、路径穿越、软链、哈希、时长、拒绝覆盖、布局和字幕偏移。
- `npm run typecheck` 通过；Python 校验真实示例通过；`npm audit` 报告 0 漏洞。
- 真实渲染 `output/demo.mp4` 与 `output/demo.srt`：5 场景、1261 帧、42.048 秒、1920×1080、30FPS、H.264 + AAC。
- 三类模板抽帧人工查看未发现明显文字裁切、遮挡或字幕区侵占；截图保存为 `output/scene-1.png` 至 `output/scene-5.png`。
- Studio HTTP 返回 200，并通过 lsof 实测只监听 `127.0.0.1:3107`；验证用服务已停止。
- 首次 Chromium 下载耗尽工具 240s 执行窗口；清理该运行的孤儿进程后，使用缓存浏览器重新导出成功。渲染失败不伪报成功。
- 未接真实 LLM/TTS 供应商、自动强制对齐、数据库、队列或编辑后台；未做音频人工听检、20 组 MVP 验收和 0.5 秒同步指标验收。
- 本目录没有 Git，未创建仓库、提交或推送。
