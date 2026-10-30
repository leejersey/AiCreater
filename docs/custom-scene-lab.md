# 定制场景实验入口

后续新增的两阶段 Agent 工作流见 [视觉设计与场景代码 Agent](./visual-agent.md)，包括真实模型案例、实测旁白时间、设计版本绑定及截图审核。

## 本次解决什么

原流程让模型选择有限的场景类型并填字段。本实验新增一条独立路径：模型或外部 coding agent 可以编写特定知识点的 React/SVG 画面，继续用 Remotion 做帧驱动渲染。不改变生产 DSL，不修改既有课程，不替换 TTS，不接入账号或后台任务。

第一组例子为同稿、同主题、同 18 秒节拍的 `TemplateWallet` 和 `CustomWallet`。前者调用真实 `SceneGraphics` 卡片组件，不是故意制作的差示例；后者通过信息纸片进入钱包、容量受阻、无关片段移出来解释上下文预算。两版都是静音视觉实验，没有调用配音服务。视觉优劣仍由实际对照决定，不因“定制”自动判优。

## 看对照

```sh
npm ci
npm run custom:studio
```

访问 `http://localhost:3100`，分别选择 `TemplateWallet` 和 `CustomWallet`。独立 Studio 只加载仓库内已审核的示例源文件，**不接受任意生成 artifact**。生产 Studio 仍使用原 `npm run studio`。

## 接到自己的 Agent：不需要付费接口

```sh
# 1. 准备不可改的口播、事实、时长，以及可自由设计的视觉目标
npm run custom:scene -- prepare \
  examples/custom-scenes/context-wallet/brief.json output/custom-scenes/prompt.txt

# 2. 让你的 coding agent 阅读 prompt，写出独立 Scene.tsx
# 这里只用仓库里的已审核例子验证同一条路径
npm run custom:scene -- pack \
  examples/custom-scenes/context-wallet/brief.json \
  examples/custom-scenes/context-wallet/WalletScene.tsx output/custom-scenes/wallet.json

# 3. 静态规则和 TypeScript 编译检查，返回审批 SHA-256
npm run custom:scene -- check output/custom-scenes/wallet.json

# 4. 阅读 artifact 中的源码和 brief 后，传入上一步的实际 hash
npm run custom:render -- output/custom-scenes/wallet.json \
  output/custom-scenes/wallet-render --approve=<SHA256>
```

渲染器生成静音 `video.mp4`、5 个关键帧 PNG、冻结的 `artifact.json` 和 `report.json`。`--stills-only` 只产出抽帧，适合先审构图。输出目录必须全新，拒绝覆盖；源代码或 brief 改变后，旧 hash 失效。

源组件契约是 `export default function Scene(props)`：

```ts
type Props = {
  frame: number; fps: number; width: number; height: number;
  theme: {
    background: string; foreground: string; muted: string;
    accent: string; secondary: string;
  };
};
```

只允许导入 React / Remotion，使用 `frame`、`interpolate`、`spring` 等计算画面。素材限自包含 HTML/SVG；不支持外部图片、网络、计时器、事件处理或自控音频。主系统未来仍负责统一旁白、字幕和场景时长。

## 可选：调用项目已有模型供应商

```sh
export DEEPSEEK_API_KEY=...
export DEEPSEEK_MODEL=deepseek-flash
npm run custom:scene -- generate brief.json output/custom-scenes/candidate.json --confirm-cost
```

只有显式传 `--confirm-cost` 才会请求付费接口；使用固定 DeepSeek HTTPS 地址，120 秒请求超时。工具不会自动读取其他工作目录的密钥。生成前检查输出碰撞，最终写入也拒绝覆盖。

结构有效但类型不通过的候选仍保存为指定 JSON，并写 `.check.json`，命令返回失败；可以修改源码后重新 pack 到新版本。不通过编译的候选不能渲染。格式不合法或不满足静态规则的模型响应会失败，不会成为可执行产物。本次未调用真实付费 API，仅使用模拟响应测试协议。

## 看图后修改

技术报告的 `technical=passed` 只表示编译和渲染通过；`visual=pending` 不代表好看。查看开场、中间、末态，检查：

- 画面是否真的演示机制，而非把口播重新排成几张卡片？
- 事实、数字、示例标签是否准确？
- 是否有文字碰撞、裁切、先出现结论或误导关系？
- 同稿对照是否更容易理解？允许得出“不如模板”的结论。

把观察保存为反馈文本，然后生成下一轮提示词：

```sh
npm run custom:scene -- revise artifact.json feedback.txt output/custom-scenes/revision.txt
```

让外部 agent 按反馈修改 TSX，再 pack → check → 新 hash 审批 → 抽帧。默认不自动重试付费请求，也不把技术检查冒充视觉模型评分。

## 安全边界与下一阶段

这是**本地受信源码工具，不是恶意代码沙箱**。导入限制、静态检查、临时工作目录和 hash 确认都是操作护栏，不能证明任意 JS 安全。不要将陌生来源代码自动审批、不要在生产 API/工作台主进程中执行，不要暴露为多用户代码执行服务。独立示例 Studio 也不是审批或沙箱入口。

上线前需要独立容器/虚机 worker、禁外网、资源/进程硬限制、固定依赖、权限隔离和审核产物版本绑定；之后才把 `scene artifact` 引用接入课程版本、预览及 Celery 任务。还应接入已有音轨和真实字级时间锚点，替换示例中等分的三阶段节拍。

当前取消信号接入截图和视频；打包、浏览器启动在返回后才检查取消，不是进程级硬超时。不要把本地三分钟计时器当作生产资源限制。

## 验证

本地新增场景检查：`npm run custom:typecheck`；测试：激活仓库 `.venv` 后运行 `npm test`。本次 564 个 Node 测试通过；Python 482 个测试完成，其中 184 个数据库测试跳过。完整 `npm run typecheck` 仍有原有 `beat-focus.test.ts:11` 的 `audio_start_frame: 0` 与 DSL 固定值 `6` 冲突；本次未修改该测试。

本次没有增加新依赖，也没有升级原有依赖。安装时审计报告原项目 Next.js 16.4.0 有 critical 告警；本实验未启动 Next.js 工作台，不代表该风险已修复。请独立安排依赖修补。
