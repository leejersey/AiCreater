<p align="center">
  <strong>AI CREATER</strong>
</p>

<p align="center">
  从文稿到成片的 AI 教学视频生成平台
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-22+-339933?logo=node.js&logoColor=white" alt="Node 22+"/>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python 3.11+"/>
  <img src="https://img.shields.io/badge/Next.js-16-000?logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Remotion-4.0-6C47FF?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=&logoColor=white" alt="Remotion"/>
  <img src="https://img.shields.io/badge/License-Private-red" alt="License"/>
</p>

---

## 📖 项目简介

AI Creater 是一个面向**中文知识教学**的 AI 视频生成系统。输入教学文稿或主题，系统拆分章节、配音并按真实音频对齐字幕，再由 Scene Agent 逐章生成画面并出片，最终输出 **1080P / 30FPS 的 MP4 视频与 SRT 字幕文件**。

```
文稿 → 整理口播章节 → 火山 TTS 配音 + 实测对齐 → Scene Agent 逐章生成画面并出片 → 人工确认 → 整课 MP4 + SRT
```

**Scene Agent**：像 Codex 一样，给 Agent 一份分镜稿（口播 + 实测时间轴）和一套 skill，它在工作目录里自己写场景代码、渲染、看审计报告、修改，直到通过客观检查，再用现有配音和字幕出片。换模型只改配置；设计目标是模型越强、画面越好（尚未用更强模型对照验证）。RAG 课程 8 章已全部由 DeepSeek（开启思考）独立完成。

> 每次更新的内容与时间见 [CHANGELOG.md](CHANGELOG.md)。

> 早期的模板流程（DeepSeek 自动分镜 → 9 种模板画面）和定制视觉流程已于 2026-11-02 删除，代码见 git 历史。这些流程留下的任务记录、候选与版本表已在 2026-11-03 的数据库迁移中删除。

---

## ✨ 核心特性

### 🧭 选题台（`/studio`）
- **今日选题**：手填领域关键词（存服务端），点「刷新今日选题」采集公开热榜并按前 3 个关键词检索（Tavily），由 `daily-topics` skill（改编自 yanhua1010 trend-radar，MIT）生成 5–8 张原创选题卡：核心判断、受众、平台、时效窗口、开场、痛点、差异化角度、证据（样本编号与来源链接）、仍缺的证据、风险，以及热度 / 匹配 / 可视化 / 时效四项评分与理由。可收藏、按日期回看；手动刷新每天最多 10 次，可开启每天 7 点后自动生成一次（计费，失败最多每小时重试一次）。
- **用这个选题做视频**：带着标题、补充想法和证据（作为爆款参考）进入新建页，后续的文稿、建课和内容审核都能溯源到这些样本。
- **拆解库（爆款视频解析）**：上传对标视频（mp4 / mov / webm，10 分钟、200MB 以内）、贴链接（B站 / YouTube 公开字幕、文章正文）或粘贴文案。上传的视频在本机用 whisper.cpp 转写口播（简体、带时间），抽关键帧（前 3 秒每秒一张，再取变化最大的镜头）交给看图模型描述画面，再由 `video-breakdown` skill（改编自花叔 huashu-douyin-script，MIT）出拆解卡：前 3 秒文案 / 视觉钩子与强度、带时间的分镜段落、节奏、画面手法、转化、合规、可复制与不可复制要素。勾选 1–5 张提炼「爆款公式」（可修改，确认后「带到文案」）。原视频保留 7 天，转写、关键帧和拆解卡长期保留。原「热点与爆款参考」（检索热点、今日热榜、文字拆解、三平台方案）也移到这里。
- **从选题到可溯源的文稿**：选题卡的证据、拆解出的爆款公式随「带到文案」进入新建页；大纲按公式的步骤与时长排章节，Markdown 分镜文稿只能用证据包（与课程证据包同编号 E1、E2…）里的事实，用到事实的段落在画面素材末尾写「依据：[E1][E3]」，口播里不出现编号（出现会被要求重写），给 Agent 的分镜稿会去掉这些编号。内容审核优先按段落标注的证据溯源，引用不存在的编号会提醒。
- 「审核」标签可单独审一份文稿。

### 📝 新建视频与爆款文稿工作流
- **热点与爆款参考（弹窗）**：
  - **多平台热点检索**：在 `.env` 配置 `TAVILY_API_KEY` 后，可按关键词与时间范围（24h / 7天 / 30天）定向检索全网热点、公众号、小红书、抖音、X / Twitter、B站、YouTube、知乎与科技媒体；可选配置 `TIKHUB_API_KEY` 获取抖音 / 小红书实时互动数据。
  - **今日热榜聚合**：一键拉取 B站热门、Hacker News、GitHub 近期高星项目与当日热点资讯，可直接设为选题或加入参考。
  - **链接与文案导入**：粘贴公众号 / 博客 / B站（自动拉互动与分P）/ YouTube（自动拉公开字幕口播）/ 抖音 / 小红书链接一键提取，或直接粘贴爆款口播文案。
  - **爆款拆解与三平台方案**：将选中的 1–5 条素材拆解为「真实事实弹药 + 高点击钩子 + 观众痛点 + 叙事骨架」（支持 4 种爆款节奏偏向），可一键生成**抖音 60 秒 / 小红书 2.5 分钟 / B站 5 分钟**三平台适配选题，拆解结果自动注入构思、大纲与文稿生成。
- **长文 / 笔记一键转视频脚本（弹窗）**：支持粘贴 20–25000 字长文、贴文章链接提取正文或导入本地 `.md / .txt` 文件，按目标时长（1 / 3 / 5 / 8 分钟）忠于原文事实提炼干货、重构前 3 秒钩子并产出带视觉弹药的分镜文稿。
- **博主口吻 / 人设档案（弹窗）**：内置 3 套预设并支持自定义称呼、语气、口头禅、禁用词、结尾引导语与历史样稿（按账号存于本机），全链路保持统一频道口吻。
- **从选题发散 & 卡片内大纲**：输入选题与补充想法，AI 给出 4 个结构各不相同的切入方向（可换一批、合并两个或自定方向）；选定后在卡片内编辑大纲（标题、要点、画面构想、预计秒数，支持追问调整与退回上一版）。「更多设置」（受众、时长、主题、格式、要点）以弹窗承载，顶栏支持「专注构思 / 双栏 / 专注文稿」视图切换。
- **分镜卡片编辑与文稿抛光**：
  - 支持 **分镜卡片视图 / Markdown 源码** 一键切换，卡片按段显示预计秒数与超长预警，每段支持 **「AI 改这段」** 局部重写（压缩时长 / 加生活例子 / 补强画面素材 / 自定义意见），均带 Toast 一键撤销。
  - 提供 **「开场钩子 3 选 1」**（反常识 / 痛点 / 悬念，一键替换第 1 段口播）与 **「一键去 AI 味」**（口语化短句润色）。
  - **配音前文稿体检 & AI 毒舌审稿**：零成本实时检测 AI 套话、单段超 110 秒、空画面素材与超长句；AI 审稿输出四维评分与 3–5 条可执行建议，每条建议支持 **「一键采纳自动改写」**。
  - **多平台发布套件**：一键生成 5 个高点击标题、封面主副大字、平台简介、话题标签与置顶引导评论（新建页与工作台均可一键复制）。
- **内容审核（事实溯源）**：口播里的数字、百分比、年份、「研究显示」一类说法和具名论文 / 机构，逐条对照证据包（注入的爆款参考里的事实及来源）：有来源 ✅、二手来源 ⚠️（来源本身只是转述、没给出处）、找不到来源 ❌；另查广告法绝对化用语、医疗 / 投资 / 保证类敏感说法、AI 套话和时长。新建页可随时免费预审；带证据包创建的课程在工作台顶栏显示审核状态，**有阻断项时不能配音、整课自动生成或 Agent 生成**，可修改口播或逐条「我已核实」并写明依据；改了口播需重新审核。可选让 AI 判断规则对不上的转述（计费）。
- **整理口播章节 & 编辑章节（免费）**：进入工作台后按口播拆分章节（最多 20 章），工作台内支持修改口播、从光标处拆分（带前后段预计秒数实时预览）、与下一章合并、删除章节（10 秒内可撤销）。

Markdown 使用固定格式：每段 `## [s1] 标题`（ID 唯一），依次包含 `### 口播`、`### 画面素材`、`### 画面意图`。口播只写纯文本；`### 画面素材` 作为给动画师的视觉弹药（数据卡片、对比项、流程节点、代码围栏等），仅纯过渡段填“无”。最多 20 段、Markdown 共 24000 字符、口播共 4000 Unicode 码点。只有口播参与配音和字幕；与章节口播完全一致的段落，其标题、画面素材和画面意图会写进该章给 Agent 的分镜稿。

### 🎙️ 配音与对齐
- **火山 TTS 2.0**：原生字级时间戳，自动字幕对齐，短句组合可读字幕
- **实测对齐（免费）**：按已有音频重算每句的时间轴，Scene Agent 按这些时间点安排画面变化
- **项目独立音色**：每门课程可设置独立音色 ID，不影响其他项目

### 🤖 Scene Agent：分镜稿 + skill → 视频

```
口播 + 实测 cue ─▶ Agent 循环（写 Scene.tsx → 自动类型检查 / 渲染 / 审计 → 修改 → finish）─▶ 客观关卡 ─▶ 配音 + 字幕出片
```

- **原生工具调用**：代码只通过 `write_file` / `edit_file` 交付，不把源码塞进 JSON；参数错误、截断都回给模型自行修正。
- **每次修改自动检查**：类型检查、关键帧渲染、几何审计（文字重叠、越出字幕安全区）、卡片互相遮挡、像素级空白帧检测，结果带文字内容与坐标交还模型。
- **画面跟随配音**：画面按 `timing.cues`（第几句）安排动画而不是写死帧号；收尾时还要在另一套时间轴（每句 ±30%）上重新通过检查。这样的画面在重新配音、换音色、重算时间轴后不用重新生成，系统自动按新配音免费重渲染，确认保留。
- **客观关卡**：编译、可渲染、无 high 级问题（含空白帧）；模型自评只作记录。达标后未收尾时，框架回退到最后一个达标版本并标记为 `harness`。
- **skill**（`packages/scene-agent/skill/`）：`scene-contract` 场景约定、`motion` 动效设计、`kit` 组件库用法、`craft` 工艺规则、`patterns` 按内容类型（问题、机制、对比、列举、总结）的画面套路、`examples` 从通过的画面提炼的示例、`visual-review` 看图模型的自查清单；只用分镜稿中的事实。
- **画面组件库**（`packages/scene-kit/kit.tsx`）：画面可 `import … from './kit'` 的预制部件（方框、自绘箭头、文档、叉/勾、增长柱、计数、聚光、镜头推进与时间工具），带几何审查标记与主题色。部件只接收 0–1 的进度，时间仍由画面按 `timing.cues` 决定。每次运行把组件库冻结到工作区 `scene/kit.tsx`，通过的版本连同副本一起发布（`kit.txt`），导出、换主题、重新配音后的重渲染都用这份。
- **模型适配层**：OpenAI 兼容（DeepSeek / Qwen / Kimi / GLM / GPT）与 Claude 官方 SDK，`packages/scene-agent/models.json` 切换。默认 `deepseek-flash-thinking`（思考 effort low）。
- **实测**：RAG 课程 8/8 章通过、由模型自行收尾。2026-11-09 加入 motion / examples / kit 后复测：仍 8/8，画面在 8 章中 5 章更好、其余持平（用满字幕以上的画面、逐句出现与变暗、把问题画成过程）；写初稿前的 skill 改为一次读完后，轮数最多的 4 章由 52 轮降到 18 轮（每章 4–5 轮），输入 token 降 62%，画面不变差。逐次记录见 [`packages/scene-agent/eval/runs.md`](packages/scene-agent/eval/runs.md)。

### 🖥️ 工作台（`/courses/:id`）

每章顶部只有一个「下一步」按钮（配音 → 对齐 → 生成视频 → 确认 → 下一章 / 导出），其余操作在「更多操作」里。整课可以用「整课自动生成（付费）」一次确认、自动推进；生成好的章节用「连续审片」逐个确认（支持 `Space` 播放/暂停、`←/→` 进退 2 秒、`N` 暂停提意见、`Enter` 确认、`J/K` 切换、`Esc` 关闭）。每章的步骤：

1. **配音与对齐**：添加配音（付费，先显示参考价），再「实测对齐」得到每句的真实时间轴。
2. **生成视频**：点 **「Agent 生成视频（付费）」**，一次确认最多 25 轮模型调用；通过后直接生成本章 MP4 / SRT，未通过则停止并显示实际用掉的轮数，不自动重试。运行中页面显示实时进度（如「第 3 轮 · 检查发现 2 个需修正的问题」「画面已完成，正在渲染视频」）。看完视频后直接点击确认（Toast 提示）。

- **整课进度与紧凑分栏布局**：顶部玻璃拟态进度栏集中展示确认进度条与主操作，批量生成收纳在「批量操作」浮层；左侧章节栏独立滚动且双向同步 URL `?scene=` 参数，展示各章状态色点与预计/实测秒数。
- **紧凑播放器与影院放大**：视频区采用「左紧凑播放器 + 右关键帧速览（开头/中段/结尾）」分栏布局，一屏尽览操作与状态；支持点击 **「放大观看」** 进入影院弹窗同步进度播放，关键帧均支持灯箱放大查看细节。
- **按意见修改（付费）**：对已通过检查的版本写下修改意见（如「第 2 段的流程图太小」），Agent 从这个版本的代码出发只改你指出的地方，仍需通过全部检查并由你确认；原版本保留，最多 25 轮。
- **批量生成**：「批量 Agent 生成 N 章（付费）」把已配音、尚无确认版本且不在运行中的章节一次排队，只确认一次（弹窗写明合计轮数上限）；每章结果仍需逐章观看确认。
- **整课导出与发布套件**：全部章节都有已确认的 Agent 视频后即可一键本机导出 MP4 + SRT；顶栏随时可打开 **「发布套件」** 弹窗一键生成并复制各平台标题、封面大字、简介、标签与置顶评论。
- **课程设置（弹窗）**：主题（蓝图、黑板、终端、纸刊、暖色发布会、瑞士蓝 + 自定义强调色）与项目独立音色统一在弹窗中配置；换主题免费，已确认章节无需重新生成。
- **重新配音**：已确认的章节可换音色或重新配音；跟随配音的画面（按第几句安排动画）保持确认，执行器按新配音免费重渲染，页面显示进度。
- **按时间点提意见**：视频暂停时点「在当前画面提意见」，自动填入该时刻口播并滚动聚焦到意见输入框，Agent 据此定位。
- **生成过程看画面**：Agent 运行时显示最新一轮渲染的关键帧（支持点击放大）。
- **费用**：确认弹窗与页头显示配音费用（按火山价格换算成元）和已用 token；DeepSeek 价格在 `.env` 配置 `DEEPSEEK_PRICE_*` 后才换算成元，不编造价格。
- **失败可操作 & 全局 Toast**：失败原因附带对应操作（检查模型配置、重新提交、刷新）；保存、确认、删除等操作配全局轻量 Toast 与撤销能力。
- **删除可撤销**：删除章节后 10 秒内可撤销。
- **自动刷新**：课程有变化时通过服务端事件流（SSE）刷新，低频轮询兜底。
- **课程列表**：支持整卡点击进入、骨架屏加载，卡片显示最近一个视频的关键帧（没有时用主题色卡）。
- **本机草稿恢复**：新建视频与项目音色的表单自动暂存，发现草稿时以可读摘要 Banner 提示恢复。

### 🔒 账号与权限
- 注册 / 登录 / 退出 / 修改密码
- 课程按用户隔离，草稿按用户隔离
- 会话过期后原位续登，不丢失编辑内容
- **模型配置**：个人中心可保存自己的 OpenAI 兼容模型（Base URL、API Key、模型 ID，按账号加密保存，需在 `.env` 配置 `ACCOUNT_CREDENTIALS_KEY`），讲稿生成和 Agent 生成画面都会使用，费用由你的服务商收取；未配置时使用服务端 DeepSeek。每次调用前检查地址解析到公网（Fake-IP 代理需设 `LLM_FAKE_IP_CIDR`）；Agent 任务按提交时的模型执行，之后改配置会让排队中的任务停止

---

## 🚀 快速开始

### 前置依赖

- **Node.js 22+** 与 **npm**
- **ffmpeg / ffprobe**（配音转码与视频渲染需要）
- **Python 3.11+**（后端服务需要）

```bash
npm ci
```

---

### 路径 A：教学工作台（完整网页流程）

需要一个 PostgreSQL（`docker compose -f compose.postgres.yaml up -d`，开机或 Docker 重启后自动恢复）、一个火山 TOS 私有桶，以及两个配置文件（字段见 `.env.example`；程序自己读取，不需要 `source`）：

- `.env.local-services`：`DATABASE_URL`
- `.env`：DeepSeek / 火山 TTS 密钥，以及 TOS 的 `TOS_REGION`、`TOS_BUCKET`、`TOS_ACCESS_KEY`、`TOS_SECRET_KEY`（桶须私有、不加桶策略；AK/SK 建议用只授权该桶的 IAM 子用户）；可选配置 `TAVILY_API_KEY`（启用多平台热点检索与网页提取）与 `TIKHUB_API_KEY`（启用抖音 / 小红书实时互动数据）

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # 首次安装
npm run workbench          # 启动 API + 网页 + 任务执行器；Ctrl+C 一起停止
npm run workbench:status   # 只查看状态
```

拆解库转写口播需要 whisper.cpp（`brew install whisper-cpp`）和中文模型：`mkdir -p ~/.cache/aicreater/whisper && curl -L -o ~/.cache/aicreater/whisper/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`（约 466MB，也可用 `WHISPER_MODEL` 指定路径）。

本机 8000 端口被其他服务占用时，用 `AICREATER_API_PORT=8010 npm run workbench` 换端口启动（网页代理会跟着改）。

浏览器访问 **http://127.0.0.1:3000** → 注册 / 登录 → 我的视频 → 新建视频。

- **任务执行器**（`python -m services.runner`）每 2 秒向 PostgreSQL 领一个排队任务：workflow 队列跑配音、对齐和 Agent，render 队列跑整课导出和主题重渲染，每条队列同时只跑一个。它只会执行你在网页上确认过的任务，本身不产生费用。
- **启动时如果已有排队中的任务**（比如上次关机前提交的），`npm run workbench` 不会自动启动执行器，先在网页上看一下这些任务，再手动运行 `.venv/bin/python -m services.runner`。
- **Ctrl+C**：有任务正在执行时，API 和网页暂不停止；执行器会做完当前任务再退出，连按两次则中止当前任务（标为失败，不自动重试）。
- **改过 Python 后端代码**：Ctrl+C 后重新运行 `npm run workbench`。执行器也必须重启，否则仍按旧代码领任务。

---

### 路径 B：Scene Agent 命令行（单章评测）

```bash
# 预演：只打印模型与预算，不调用模型
npm run scene-agent -- run packages/scene-agent/eval/cases/rag-ch4/brief.json \
  --cues=packages/scene-agent/eval/cases/rag-ch4/cues.json

# 真正运行：必须显式加 --confirm-paid（DeepSeek 计费；默认最多 25 轮）
npm run scene-agent -- run <brief.json> --cues=<cues.json> --confirm-paid [--model=deepseek-flash] [--max-turns=15]
```

加 `--theme=<id>` 让关键帧按某个主题渲染（默认 blueprint）。用已确认的源码预览各主题效果（本机渲染、不调用模型）：`npx tsx scripts/theme-preview.ts <导出任务输入.json> <输出目录> --themes=paper-press,chalk-garden`。

每次运行写入 `output/scene-agent/<id>-<model>-<时间>/`：`scene/Scene.tsx`、`stills/`、`checkpoints/`（达标版本）、`transcript.jsonl`（每轮请求与工具结果）、`result.json`。命令行只产出画面和关键帧；带配音的视频在工作台生成。密钥读取项目 `.env` 中的 `DEEPSEEK_API_KEY`（Claude 用 `ANTHROPIC_API_KEY`）。

工作台的「Agent 生成视频」由执行器的 workflow 队列执行，单个任务通常几分钟，租约上限 30 分钟；整课导出和主题重渲染走 render 队列。

---

### 运行测试

```bash
npm test                 # 网页与各 package 的 TypeScript 测试
npm run typecheck
npm run test:workflow    # Python 后端测试（未设置 TEST_DATABASE_URL 时，依赖数据库的用例会跳过）
.venv/bin/python services/tests/run_project_tests.py services.tests.test_api …   # 在一次性 Docker PostgreSQL 中跑指定模块（结束后连同数据卷删除）
```

数据库用例的夹具用 ffmpeg 现场生成短音频与字级时间，不依赖本机文件。

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│ 浏览器（Next.js）                                                 │
│  /courses 我的视频 → /courses/new 新建 → /courses/:id 工作台        │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP
┌───────────────────────────────▼──────────────────────────────────┐
│ Python API（FastAPI）                                             │
│  账号 · 项目 · 文稿生成 · 配音 / 对齐 · 费用参考 ·                  │
│  视觉任务（agent / export / restyle）· 事件流 · 文件下载           │
└──────┬───────────────────┬───────────────────────┬───────────────┘
       │                   │                       │
  PostgreSQL                                    火山 TOS
  项目 · 章节 ·                               音频 · 视频 · 导出
  jobs（统一租约）
       │ 任务执行器 services.runner：每条队列一个进程，空闲时每 2 秒领任务
       │      ┌──────────────────────────┐
       │      ▼                          ▼
  ┌────┴──────────────────────┐ ┌──────────────────────────────┐
  │ workflow 队列               │ │ render 队列                   │
  │ · 火山 TTS 配音 + 实测对齐   │ │ · 整课导出 · 主题重渲染         │
  │ · Scene Agent（每章一个任务）│ │                              │
  └────┬──────────────────────┘ └──────────────┬───────────────┘
       │ tsx scripts/scene-agent-job.ts          │ scene-agent-course-job.ts
       ▼                                         ▼
  ┌───────────────────────────────────────────┐  │
  │ Scene Agent 循环（packages/scene-agent）    │  │
  │  模型适配层 ──▶ DeepSeek / Claude …         │  │
  │  工具：读写 Scene.tsx · skill · 时间轴 ·     │  │
  │        类型检查 · 关键帧渲染 · 审计 · finish │  │
  │  关卡：约定 · 编译 · 渲染 · 无 high 问题     │  │
  └───────────────────┬───────────────────────┘  │
                      ▼                          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Remotion 渲染（本机）：Agent 场景 + 配音 + 字幕                   │
  │  → output/visual-workbench/<任务>/ 1080P / 30FPS MP4 + SRT     │
  │  → 发布后上传火山 TOS（按内容哈希寻址）                          │
  └──────────────────────────────────────────────────────────────┘
```

配音、对齐、Agent 与导出任务都在同一张 `jobs` 表里，由 `services/projects/leases.py` 统一领取与续租：租约时限按类型设定（配音与对齐 15 分钟，Agent 与导出 30 分钟，超时由执行器回收），运行中靠心跳续租，每条队列（workflow / render）同时只运行一个任务；取消运行中的 Agent 任务时，执行器在下一次心跳停止。付费任务（配音、Agent）只在用户确认后入队；Agent 未通过检查时停止并保留运行记录，不自动重试。

媒体以火山 TOS 私有桶为主副本，经 S3 兼容端点访问，不开放公共链接，下载都经过 API 校验哈希。配音音频、Agent 视频（源码、MP4、字幕、审查帧）与整课导出都存入 TOS；本机目录只是渲染缓存，缺失时下载或导出会自动从 TOS 取回。Agent 视频上传失败时任务仍会发布、付费结果不丢，页面提示「尚未备份到 TOS」，执行器每 10 分钟自动补传；也可手动运行 `python -m services.projects.sync_storage`（可重复执行）。

---

## 📂 目录结构

```
apps/
  web/                     Next.js 工作台（前端）
  renderer/public/         本机媒体缓存：配音音频（generated/），火山 TOS 为主副本

output/visual-workbench/   本机渲染缓存：每个 Agent / 导出任务一个目录，发布的文件同时存入 TOS

packages/
  scene-agent/             Scene Agent：模型适配层、工具、循环与关卡、skill、评测用例、渲染
  custom-scenes/           场景源码约定、cue 解析、类型检查、几何审计、字幕与整课渲染宿主
  scene-themes/            课程主题：主题 JSON、可读性校验（对比度、字体已打包）、注册表
  scene-kit/               画面组件库 kit.tsx：画面可 import './kit' 的预制部件，按 Agent 版本冻结
  content-skills/          内容 skill：选题、文案与审核的方法（SKILL.md），可替换、可升级、可改编开源 skill；来源与许可证见 NOTICE.md

services/
  api/                     FastAPI 后端（账号、项目、配音、视觉任务路由）
  accounts/                用户注册、认证与会话管理
  projects/                项目、配音/对齐任务、统一任务表与租约（leases.py）、费用参考、TOS 存储（storage.py）与补传命令（sync_storage.py）
  visual/                  Agent、整课导出与主题重渲染任务、章节编辑，及它们的执行逻辑
  workflow/                文稿生成/润色/钩子/审稿/长文转脚本/发布套件、热点研究（Tavily）、热榜与视频提取、社交数据适配、配音与本地对齐
  runner.py                任务执行器：按队列向 PostgreSQL 领任务并执行
  config.py                读取 .env 与 .env.local-services
  tts/                     火山 TTS 2.0 配音与字级时间戳
  chapters.py              章节数据结构：口播、配音音频、时长与实测字幕的校验和计时
  workbench.py             `npm run workbench` 的 API + 网页启动器

scripts/                   Scene Agent 命令行与任务入口（Agent、整课渲染）、主题预览、配音音频校验、本机回环
docs/                      Scene Agent 设计、本地运维、依赖许可，及仍在使用的功能的设计记录
```

---

## 📚 文档索引

| 文档 | 说明 |
|:---|:---|
| [Scene Agent 设计](docs/superpowers/plans/2026-10-30-scene-agent-loop-design.md) | 适配层、工具接口、关卡与反馈划分、里程碑 |
| [更新日志](CHANGELOG.md) | 每次更新的时间与内容 |
| [Scene Agent 运行记录](packages/scene-agent/eval/runs.md) | 每次真实模型运行的结果、用量与问题 |
| [本地运维](docs/local-operations.md) | 工作台启停、任务执行器、火山 TOS 配置 |
| [依赖许可](docs/dependency-license-review.md) | 第三方依赖许可审查 |
| [设计记录](docs/superpowers/) | 账号、配音、对齐、存储、费用参考等功能的实现计划与设计 |

---

## 🛠️ 技术栈

| 层级 | 技术选型 |
|:---|:---|
| **前端框架** | Next.js 16 · React 19 · TypeScript |
| **视频引擎** | Remotion 4.0 · FFmpeg |
| **后端服务** | Python · FastAPI · 任务执行器（PostgreSQL 租约） |
| **AI 模型** | DeepSeek API（文稿、Scene Agent）；Scene Agent 可切换 Claude 等 |
| **语音合成** | 火山引擎 TTS 2.0（字级时间戳） |
| **数据库** | PostgreSQL（revision 乐观锁 · 统一任务表） |
| **对象存储** | 火山 TOS（S3 兼容端点）：配音音频、Agent 视频与整课导出 |

---

## ⚠️ 当前状态与边界

- 本项目为**个人使用**；Remotion 4.0.534 符合个人免费资格
- 文稿生成、Scene Agent 与配音会调用 DeepSeek 与火山引擎 API，**会产生费用**
- Scene Agent 每轮都是一次付费模型调用；命令行须 `--confirm-paid`，工作台须逐次确认轮数上限
- Agent 生成的场景代码在本机渲染，有源码约定检查，但**不是安全沙箱**
- 工作台「Agent 生成视频」已在真实浏览器端到端跑通：确认弹窗与取消、失败路径（无效 Key，未计费）、成功出片（第 7 章，5 轮约 3.6 分钟，页面内可播放 MP4 并下载 SRT），以及在测试账号的课程副本中逐章生成、确认并导出整课（8/8 章，266 秒）
- 整课流水线已在真实付费运行中自动配音并生成 2 章；重新配音后的自动重渲染也已实测。生成中的实时关键帧只有单元与数据库测试，尚未在真实付费运行中观察
- 通过检查不等于画面好看，所有结果仍需人工观看确认
- 只用旧流程做过画面的课程，需要先用 Agent 逐章重新生成并确认，才能再导出整课
- 本地渲染与缓存对齐不产生额外 API 费用；火山 TOS 按存储量与下载流量计费
- 字体使用 `@fontsource/noto-sans-sc`（OFL 许可）
