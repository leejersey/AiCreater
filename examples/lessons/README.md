# 非编程教学示例

围绕“蒸发与水循环”的三段可编辑教学示例，不需要 PostgreSQL、Redis、Celery、对象存储或工作台。

| 文件 | 用途 |
|---|---|
| `general.txt` | 可直接阅读或粘贴到新课程的原始讲稿 |
| `general.json` | 可编辑分镜：概念解释 → 过程说明 → 对比分析，保留原文触发范围 |
| `../general-demo.json` | 本机语音生成的完整视频 DSL（先执行下面的生成命令） |

## 本地预览与导出（macOS）

```bash
# 使用系统 say 与已安装的 ffmpeg，不调用模型或收费配音服务
npm run demo:create -- --general

# 浏览器预览；Studio 中选 KnowledgeVideo
node --require ./scripts/loopback.cjs node_modules/@remotion/cli/remotion-cli.js studio apps/renderer/src/index.tsx --public-dir=apps/renderer/public --props=examples/general-demo-props.json --no-open

# 同一配音、同一配色，对照两种视觉风格
npm run render -- examples/general-demo.json output/general-whiteboard.mp4 --visual-style=whiteboard
npm run render -- examples/general-demo.json output/general-minimal.mp4 --visual-style=minimal
```

已实际生成两版 1920×1080、30FPS、约25.3秒的有声 MP4 和 SRT，输出位于 `output/general-whiteboard.mp4`、`output/general-minimal.mp4`。

修改时先改 `general.txt` 及 `general.json` 的口播/要点，再校对 `cue.text_start/text_end`（0起 Unicode 码点、左闭右开）。概念正文必须来自对应原文范围，恰好一个定义，至多一个总结；流程使用显式无环连线；对比元素按“左、右、左、右”排列。此生成器用每个句子作为独立语音片段，因此示例的触发范围应完整、连续地覆盖各句。修改后重新生成，不直接覆盖已有课程或历史版本。

这是教学表达示例，不是模型自动选模板的验收，也不是供应商配音或人工同步听检。语音是系统音色，时序来自分段合成；没有调用强制对齐服务。仅作基础知识演示，正式课程仍需人工事实审校与听检。
