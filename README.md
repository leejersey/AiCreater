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

AI Creater 是一个面向**中文知识教学**的 AI 视频生成系统。输入教学文稿或主题，系统完成章节拆分、配音与字幕对齐、逐章画面生成，最终输出 **1080P / 30FPS 的 MP4 视频与 SRT 字幕文件**。

当前主流程（工作台 `/courses/:id`）：

```
文稿 → 整理口播章节 → 火山 TTS 配音 + 实测对齐 → Scene Agent 逐章生成画面并出片 → 人工确认 → 整课 MP4 + SRT
```

早期的模板流程（DeepSeek 自动分镜 → 9 种教学模板画面 → 配音 → 导出）仍保留在 `/courses/:id/legacy`，页面上已不再提供入口。两条流程都已用真实 DeepSeek + 火山 TTS 2.0 跑通整课。

**新路线 · Scene Agent**：像 Codex 一样，给 Agent 一份分镜稿（口播 + 实测时间轴）和一套 skill，它在工作目录里自己写场景代码、渲染、看审计报告、修改，直到通过客观检查，再用现有配音和字幕出片。换模型只改配置；设计目标是模型越强、画面越好（尚未用更强模型对照验证）。RAG 课程 8 章已全部由 DeepSeek（开启思考）独立完成，详见下文 [Scene Agent](#-scene-agent分镜稿--skill--视频)。

---

## ✨ 核心特性

### 🎬 智能教学分镜（旧模板流程）
- **DeepSeek 自动分镜**：支持纯文本口播或口播＋素材 Markdown，AI 拆分场景并选择教学模板，保持口播原文不改写
- **9 种教学表达场景**：概念解释、标题卡片、逐步卡片、无环流程图、代码讲解、教学对比、数据结构状态图、执行时间线、数据图表
- **候选分镜系统**：AI 生成多套候选分镜，可读比较差异后确认接受

### 🎙️ 专业配音与对齐
- **火山 TTS 2.0**：原生字级时间戳，自动字幕对齐，短句组合可读字幕
- **实测对齐**：配音后按真实音频重算每句的时间轴，Scene Agent 按这些时间点安排画面变化
- **项目独立音色**：每门课程可设置独立音色 ID，不影响其他项目
- **批量配音**：旧模板流程支持整课批量提交配音任务，已有任务自动复用；主工作台目前逐章配音

### 🎨 视觉风格系统（旧模板流程）
- **5 种可选视觉风格**：原版（Legacy）、白板线稿（Whiteboard）、现代极简（Minimal）、纸质幻灯（Paper Slide）、机制演示（Mechanism，按已有漏斗/对话/处理链推进）
- **多种配色主题**：暗夜科技、自然教学、彩色信息图等
- **风格冻结**：保存后更新预览而不重新配音，历史版本保留完整风格快照

### 🖥️ 工作台
- **主工作台**（`/courses/:id`）：左侧章节列表与每章状态，右侧当前章节的「第 1 步 · 配音与对齐」「第 2 步 · 生成视频」，页面内播放本章 MP4、查看关键帧、下载 SRT；用法见下文 [Scene Agent](#-scene-agent分镜稿--skill--视频)
- **旧模板工作台**（`/courses/:id/legacy`）：Studio 三栏布局、Remotion Player 实时预览、章节概览 / 课程设置 / 原始讲稿 / 版本历史 / Token 消耗 / 持久任务六个 Tab、底部任务 Dock
- **本机草稿恢复**：新建视频向导与旧工作台的表单自动暂存，刷新或意外关闭后可恢复

### 📝 新建视频向导
- **左右双栏布局**：左栏配置主题与 AI 参数，右栏沉浸式讲稿编辑
- **AI 一键生成文稿**：新稿默认联合生成口播、画面素材与画面意图（内部 JSON 校验后显示为可编辑 Markdown）；可切回纯文本，旧草稿不改变格式
- **讲解风格选择**：通俗科普 vs 知识干货，可视化卡片切换
- **创建后**：进入主工作台，点「整理口播章节（免费）」按口播拆分章节（最多 20 章），不调用模型

Markdown 使用固定格式：每段 `## [s1] 标题`（ID 唯一），依次包含 `### 口播`、`### 画面素材`、`### 画面意图`。口播只写纯文本；命令/代码围栏放在画面素材中，无素材填“无”。最多20段、Markdown共24000字符、口播共4000 Unicode码点（含段落分隔）。切换格式不会自动转换已有输入；格式错误会拒绝保存，不会降级为旁白。

只有口播参与配音、字幕及时间锚点。以下素材与图片规划只用于旧模板流程：素材进入整课分镜和可唯一匹配原文的单章重生成，新任务使用完整引用分镜与图片规划协议（`:9`；无素材为 `:8`），不走只允许原文摘录的紧凑导演协议；旧协议任务按原快照执行；费用估算与任务快照同步携带素材。原稿保存在工作台「原始讲稿」的只读 Markdown 存档及导出版本 profile，不进入视频 DSL。创建后仍按现有章节编辑流程工作；原稿素材暂不提供在线修改入口，口播改动或原文匹配有歧义时不自动沿用旧素材。命令不执行，模拟输出须标注未经验证；不新增终端动画或富文本编辑器。

**个人中心图片服务配置**：账号导航进入「个人中心」，可保存/替换/删除 GPT Image 2 的自定义公网 HTTPS Base URL 与 API Key。密钥按账号在后端加密保存，不返回前端、不写 localStorage；地址不变时留空保留密钥，更换地址须重新填写。首次启用需在服务端私有 `.env` 配置 `ACCOUNT_CREDENTIALS_KEY`（Fernet 加密密钥，见 `.env.example`），备份并保持稳定；API 重启时自动初始化配置表。本地服务已按用户授权完成加密密钥配置与重启。保存仅检查地址格式，不做 DNS、连通性或模型验证，不请求供应商、不收费；这不是生图接入或兼容性测试。接通生图前仍须实现请求时 DNS 校验/IP 固定、禁跳转及明确费用确认，不能仅依赖保存时的校验。

**教学图片开发中（旧模板流程）**：新分镜会判断是否需要图片、说明教学理由，并为适用的默认卡片/对比场景规划最多两张独立对象素材（最多四个教学元素）。需求绑定已有元素与唯一口播原文，不是背景图；标签、命令和精确数据仍由组件绘制。工作台显示已接受分镜的只读图片计划；改变教学内容/锚点后标记需复核。图片计划与稳定需求ID保存在项目配置及版本profile，不进入视频DSL、配音或字幕；规划复用同一次分镜请求，不新增生图调用。当前没有GPT Image 2接入、图片收费确认或候选选择入口；代码组合模板及已绑定图片的重配音/重生成仍待完成，不能把本阶段称为全自动生图功能。

### 🤖 Scene Agent：分镜稿 + skill → 视频

```
口播 + 实测 cue ─▶ Agent 循环（写 Scene.tsx → 自动类型检查 / 渲染 / 审计 → 修改 → finish）─▶ 客观关卡 ─▶ 配音 + 字幕出片
```

- **原生工具调用**：代码只通过 `write_file` / `edit_file` 交付，不再把源码塞进 JSON；参数错误、截断都回给模型自行修正。
- **每次修改自动检查**：类型检查、关键帧渲染、几何审计（文字重叠、越出字幕安全区）、卡片互相遮挡、像素级空白帧检测，结果带文字内容与坐标交还模型。
- **客观关卡**：编译、可渲染、无 high 级问题（含空白帧）；模型自评只作记录。达标后未收尾时，框架回退到最后一个达标版本并标记为 `harness`。
- **skill**（`packages/scene-agent/skill/`）：场景约定、工艺规则、按内容类型（问题、机制、对比、列举、总结）的画面套路；只用 brief 中的事实。
- **模型适配层**：OpenAI 兼容（DeepSeek / Qwen / Kimi / GLM / GPT）与 Claude 官方 SDK，`packages/scene-agent/models.json` 切换。默认 `deepseek-flash-thinking`（思考 effort low）。
- **实测**：RAG 课程 8/8 章通过，每章 4–8 轮、由模型自行收尾；整课合计输出约 14.8 万 token。逐次记录见 [`packages/scene-agent/eval/runs.md`](packages/scene-agent/eval/runs.md)。

**工作台用法**（每章分两步，顺序固定）：

1. **配音与对齐**：添加配音，再「实测对齐」得到每句的真实时间轴。
2. **生成视频**：点 **「Agent 生成视频（付费）」**，一次确认最多 25 轮模型调用；通过后直接生成本章 MP4 / SRT，未通过则停止并显示实际用掉的轮数，不自动重试。运行中页面显示实时进度（如「第 3 轮 · 检查发现 2 个需修正的问题」「画面已完成，正在渲染视频」）。看完视频后点上方的「看完后确认此版本」。

- **整课进度**：左侧每章标注 待配音 / 待对齐 / 待生成 / 生成中 / 待确认 / 已确认；页头与工具栏显示「已确认 x/n」并列出未确认的章节。
- **批量生成**：「批量 Agent 生成 N 章（付费）」把已配音、尚无确认版本且不在运行中的章节一次排队，只确认一次（弹窗写明合计轮数上限）；每章结果仍需逐章观看确认。
- **整课导出**：全部章节确认后才可点击；每章使用最近确认的版本，Agent 版本与旧流程版本可以混合导出。
- **旧流程**：模板源码生成收在每章「第 2 步」下的折叠区「旧流程：模板源码生成」；高级设置已移除。

命令行用法见 [路径 D](#路径-dscene-agent-命令行)。

### 🔒 账号与权限
- 注册 / 登录 / 退出 / 修改密码
- 课程按用户隔离，草稿按用户隔离
- 会话过期后原位续登，不丢失编辑内容

---

## 🚀 快速开始

### 前置依赖

- **Node.js 22+** 与 **npm**
- **ffmpeg / ffprobe**（视频渲染需要）
- **Python 3.11+**（后端服务需要）

```bash
npm ci
```

> 以下**四条路径互相独立**，选一条即可（路径 D 的本地出片需要已有的配音参照目录）。

---

### 路径 A：本地示例视频（不收费、不需要数据库）

适合快速确认渲染效果。macOS 使用系统 `say` 配音。

```bash
npm run demo:create
npm run studio
# 另开终端导出视频：
npm run render -- examples/demo.json output/demo.mp4
```

可选视觉风格：`--visual-style=whiteboard`、`minimal`、`paper_slide` 或 `mechanism`。

---

### 路径 B：打开教学工作台（完整网页流程）

需要本机已有 PostgreSQL / Redis / RustFS 以及 `.env`、`.env.local-services` 配置。

```bash
# 1. 安装 Python 依赖
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. 检查服务状态
npm run workbench:status

# 3. 启动 API + 网页
npm run workbench
```

浏览器访问 **http://127.0.0.1:3000** → 注册 / 登录 → 我的视频 → 新建视频。

> **注意**：`npm run workbench` 只启动 API + 网页。登录、看课、新建讲稿、整理口播章节都可以正常使用。但点击「添加配音」「Agent 生成视频」「导出整课视频」后任务会进入队列，没有 Worker + Beat 时进度会停在 0%。

#### 启动 Celery Worker 和 Beat（执行配音 / Agent / 渲染任务）

> ⚠️ 以下命令会调用 DeepSeek、火山引擎等付费服务，**可能产生费用**。

`DATABASE_URL` 在 `.env.local-services` 中（不在 `.env`）；每个 Celery / API 进程都必须加载，否则会报 `Configure the local workflow database`。

**bash / zsh：**

```bash
cd /path/to/AiCreater
set -a; source .env.local-services; set +a
source .venv/bin/activate

# 终端 1：Workflow 消费者
python3 -m celery -A services.workflow.queue:app worker \
  -Q workflow --hostname=workbench-workflow@%h \
  --concurrency=1 --loglevel=WARNING

# 终端 2：Render 消费者（整课导出、旧流程预览）
python3 -m celery -A services.workflow.queue:app worker \
  -Q render --hostname=workbench-render@%h \
  --concurrency=1 --loglevel=WARNING

# 终端 3：Beat 定时调度（每 2 秒唤醒 Worker 从 PostgreSQL 取任务）
python3 -m celery -A services.workflow.queue:app beat \
  --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat \
  --pidfile=/tmp/aicreater-celerybeat.pid
```

**fish：**

```bash
cd /path/to/AiCreater

# 终端 1：Workflow 消费者
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m celery \
  -A services.workflow.queue:app worker -Q workflow \
  --hostname=workbench-workflow@%h --concurrency=1 --loglevel=WARNING'

# 终端 2：Render 消费者
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m celery \
  -A services.workflow.queue:app worker -Q render \
  --hostname=workbench-render@%h --concurrency=1 --loglevel=WARNING'

# 终端 3：Beat
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m celery \
  -A services.workflow.queue:app beat \
  --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat \
  --pidfile=/tmp/aicreater-celerybeat.pid'
```

Beat只开一个。新命令用Celery原生PID文件阻止重复启动；已有不带`--pidfile`的旧实例，须先在其终端正常退出，再换新命令，不能直接叠加启动。若报调度文件`Resource temporarily unavailable`，先查重进程，不要直接删除schedule文件。

Workflow 队列执行配音、Agent 生成（含本章出片）；Render 队列执行整课导出和旧流程的预览渲染，缺少它时导出会一直排队。旧模板工作台的「执行器响应检测」可核对是否检测到消费者，也可用 `python3 -m celery -A services.workflow.queue:app inspect ping --timeout=3`。完整启停细节见 [本地运维指南](docs/local-operations.md)。

#### 改过后端代码后重载 API

修改 Python 后端代码后，必须重载 API 和**全部** Worker，包括 Render 队列的 Worker（否则分镜/配音仍用旧代码，新路由会 404；各 Worker 都会回收超时任务，旧代码会按旧的时限误判新类型的任务）：

```bash
# bash / zsh
set -a; source .env.local-services; set +a
source .venv/bin/activate
python3 -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

```fish
# fish
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m uvicorn services.api.app:app \
  --host 127.0.0.1 --port 8000 --no-proxy-headers'
```

网页端使用 `npm run web`（或 `npm run workbench` 一并拉起）。

---

### 路径 C：命令行云端生成整课

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env   # 填写 API Key
npm run generate -- examples/script.txt output/cloud.json
npm run render -- output/cloud.json output/cloud.mp4
```

> ⚠️ 此路径会调用 LLM / TTS 服务，产生费用。

---

### 路径 D：Scene Agent 命令行

```bash
# 预演：只打印模型与预算，不调用模型
npm run scene-agent -- run packages/scene-agent/eval/cases/rag-ch4/brief.json \
  --cues=packages/scene-agent/eval/cases/rag-ch4/cues.json

# 真正运行：必须显式加 --confirm-paid（DeepSeek 计费；默认最多 25 轮）
npm run scene-agent -- run <brief.json> --cues=<cues.json> --confirm-paid [--model=deepseek-flash] [--max-turns=15]

# 本地出片（不调用模型 / TTS）：单章带配音预览、或多章拼整课
npm run scene-agent:preview -- <运行目录> <单章配音参照目录>
npm run scene-agent:course -- <输出目录> <整课导出目录> <第1章运行目录> <第2章运行目录> …
```

每次运行写入 `output/scene-agent/<id>-<model>-<时间>/`：`scene/Scene.tsx`、`stills/`、`checkpoints/`（达标版本）、`transcript.jsonl`（每轮请求与工具结果）、`result.json`。密钥读取项目 `.env` 中的 `DEEPSEEK_API_KEY`（Claude 用 `ANTHROPIC_API_KEY`）。

工作台的「Agent 生成视频」由 Workflow 队列执行（与上文 Workflow Worker + Beat 相同，无需新进程）；单个任务通常几分钟，租约上限 30 分钟。整课导出走 Render 队列。

---

### 运行测试

```bash
npm test                 # 前端、渲染器与各 package 的 TypeScript 测试
npm run typecheck
source .venv/bin/activate
npm run test:workflow    # Python 后端测试（未设置 TEST_DATABASE_URL 指向一次性 PostgreSQL 时，依赖数据库的用例会跳过）
```

已知失败：`npm test` 中 isolated render ownership 的 2 个用例；`custom-scenes` 中 6 个读取 `output/visual-agent/` 本地样本的用例（样本未入库，已在 2026-11-01 清理中删除）；`npm run typecheck` 中 `custom-scenes` / `video-components` 的 5 个类型错误。

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户浏览器                              │
│  首页(/) → 我的视频(/courses) → 新建(/courses/new)          │
│  → 工作台(/courses/:id) 三栏 Studio 布局                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP
┌─────────────────────▼───────────────────────────────────────┐
│                  Python API (FastAPI)                        │
│  账号认证 · 项目管理 · 场景编辑 · 费用估算 · 任务调度        │
└───────┬─────────────┬──────────────┬────────────────────────┘
        │             │              │
   PostgreSQL      Redis         RustFS
   版本保护        Celery队列     资产存储
        │             │
        │    ┌────────▼─────────┐
        │    │  Celery Workers  │
        │    │  ┌─────────────┐ │
        │    │  │ Scene Agent │ │  → 逐章画面（DeepSeek 等）
        │    │  │ 火山 TTS    │ │  → 语音配音
        │    │  │ Remotion    │ │  → 视频渲染
        │    │  └─────────────┘ │
        │    └──────────────────┘
        │
┌───────▼──────────────────────┐
│    Remotion 渲染引擎          │
│  Agent 场景 · 旧版 9 种模板   │
│  → 1080P / 30FPS MP4 + SRT  │
└──────────────────────────────┘
```

---

## 📂 目录结构

```
apps/
  web/                     Next.js 教学工作台（前端）
  renderer/                Remotion 渲染引擎与导出

packages/
  video-schema/            视频项目 JSON Schema 与类型定义
  video-components/        9 种教学场景 React 组件 + 5 种视觉风格
  custom-scenes/           自由画面场景：源码约定、几何审计、Remotion 渲染与整课导出
  scene-agent/             Scene Agent：模型适配层、工具、循环与关卡、skill、评测用例

services/
  api/                     FastAPI 后端服务
  accounts/                用户注册、认证与会话管理
  projects/                项目与场景的版本化管理
  visual/                  主工作台任务：章节整理、Agent / 预览 / 导出任务的存储与 Worker
  workflow/                Celery 任务调度（分镜、配音、渲染）
  tts/                     火山 TTS 2.0 配音适配
  workbench.py             `npm run workbench` 的 API + 网页启动器

scripts/                   工具脚本（Scene Agent 命令行与 Worker 入口、类型生成、示例配音、回环绑定）
examples/                  示例教学文稿与配置
docs/                      项目文档
```

修改 Schema 后运行 `npm run schema:types` 重新生成类型，不要手动修改 `packages/video-schema/src/types.ts`。

---

## 📚 文档索引

定制场景实验：[本地 Agent 自由画面生成与同稿对照](docs/custom-scene-lab.md)。独立入口 `npm run custom:studio`；保留现有模板和生产 DSL，不自动调用付费模型、不执行未经审核的生成源码。

两阶段生成：[视觉设计与场景代码 Agent](docs/visual-agent.md)。`npm run visual:agent` 支持实测音频时间导入、视觉设计、场景代码生成、截图审核及修订提示；新增 `GeneratedContext` / `GeneratedLoop` 两个真实生成后经本地修订的实验案例。

[定制视觉工作流](docs/visual-workbench.md)（实测配音 → 视觉设计 → 场景源码 → 精确哈希批准 → 几何与人工验收 → 统一 MP4/SRT 导出）现收在主工作台每章的「旧流程：模板源码生成」折叠区，主流程改为 Scene Agent。旧模板工作台页面不再显示入口，直接访问课程的 `/legacy` 地址仍可使用，不作为失败回退。每次付费生成、修复和本地执行分别确认。

| 文档 | 说明 |
|:---|:---|
| [Scene Agent 设计](docs/superpowers/plans/2026-10-30-scene-agent-loop-design.md) | 适配层、工具接口、关卡与反馈划分、里程碑 |
| [Scene Agent 运行记录](packages/scene-agent/eval/runs.md) | 每次真实模型运行的结果、用量与问题 |
| [快速上手](docs/getting-started.md) | 环境要求、安装、各路径详细指南 |
| [教学模板](docs/teaching-templates.md) | 9 种教学表达场景的字段约束与使用说明 |
| [API 参考](docs/api-reference.md) | HTTP 接口文档、任务管理、导出下载 |
| [本地运维](docs/local-operations.md) | 工作台启停、Celery / Redis / RustFS 配置 |
| [架构设计](docs/AI动态知识视频平台-技术架构.md) | 早期技术架构草案（v1.1，早于 Scene Agent） |
| [交付记录](docs/changelog.md) | 功能交付详情与验证报告 |
| [验收计划](docs/acceptance.md) | 教学验收方案与当前状态 |
| [依赖许可](docs/dependency-license-review.md) | 第三方依赖许可审查 |

---

## 🛠️ 技术栈

| 层级 | 技术选型 |
|:---|:---|
| **前端框架** | Next.js 16 · React 19 · TypeScript |
| **视频引擎** | Remotion 4.0 · FFmpeg |
| **后端服务** | Python · FastAPI · Celery |
| **AI 模型** | DeepSeek API（文稿、旧流程分镜、Scene Agent）；Scene Agent 可切换 Claude 等 |
| **语音合成** | 火山引擎 TTS 2.0（字级时间戳） |
| **数据库** | PostgreSQL（版本保护） |
| **消息队列** | Redis + Celery（双队列调度） |
| **对象存储** | RustFS（音频与渲染资产） |

---

## ⚠️ 当前状态与边界

- 本项目为**个人使用**；Remotion / Player 4.0.534 符合个人免费资格
- 文稿生成、分镜、Scene Agent 与配音会调用 DeepSeek 与火山引擎 API，**会产生费用**
- Scene Agent 每轮都是一次付费模型调用；命令行须 `--confirm-paid`，工作台须逐次确认轮数上限
- Agent 生成的场景代码在本机渲染，有源码约定检查，但**不是安全沙箱**
- 工作台「Agent 生成视频」已在真实浏览器端到端跑通：确认弹窗与取消、失败路径（无效 Key，未计费）、成功出片（第 7 章，5 轮约 3.6 分钟，页面内可播放 MP4 并下载 SRT），以及在测试账号的课程副本中逐章生成、确认并导出整课（8/8 章，266 秒）
- 批量生成的确认弹窗与取消已在浏览器中验证；运行中的实时进度只有单元与数据库测试，尚未在真实付费运行中观察
- 补充列举、总结套路后整课已重跑并全部通过检查；通过检查不等于画面好看，所有结果仍需人工观看确认
- 本地渲染与缓存对齐不产生额外 API 费用
- Redis 保留本机使用；若转为公司/第三方服务需重新核对[许可](docs/dependency-license-review.md)
- 字体使用 `@fontsource/noto-sans-sc`（OFL 许可）
- 详见 [后续跟进](docs/mvp-follow-up.md)
