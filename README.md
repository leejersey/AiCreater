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

> 早期的模板流程（DeepSeek 自动分镜 → 9 种模板画面）和定制视觉流程已于 2026-11-02 删除，代码见 git 历史。这些流程留下的任务记录、候选与版本表已在 2026-11-03 的数据库迁移中删除。

---

## ✨ 核心特性

### 📝 新建视频
- **AI 一键生成文稿**：按主题、受众、时长和讲解风格（通俗科普 / 知识干货）生成口播，默认同时生成每段的画面素材与画面意图（可编辑 Markdown）；也可直接粘贴纯文本
- **整理口播章节（免费）**：进入工作台后按口播拆分章节（最多 20 章），不调用模型
- **编辑章节（免费）**：工作台里可修改本章口播、从光标处拆分、与下一章合并、删除章节；页面按约每秒 5 字估算时长，超过 110 秒提示拆分（Agent 只能生成 120 秒以内的章节）。改动后本章回到「待配音」，已有视频和确认失效

Markdown 使用固定格式：每段 `## [s1] 标题`（ID 唯一），依次包含 `### 口播`、`### 画面素材`、`### 画面意图`。口播只写纯文本；命令/代码围栏放在画面素材中，无素材填“无”。最多 20 段、Markdown 共 24000 字符、口播共 4000 Unicode 码点。只有口播参与配音和字幕；与章节口播完全一致的段落，其标题、画面素材和画面意图会写进该章给 Agent 的分镜稿。

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
- **客观关卡**：编译、可渲染、无 high 级问题（含空白帧）；模型自评只作记录。达标后未收尾时，框架回退到最后一个达标版本并标记为 `harness`。
- **skill**（`packages/scene-agent/skill/`）：场景约定、工艺规则、按内容类型（问题、机制、对比、列举、总结）的画面套路；只用分镜稿中的事实。
- **模型适配层**：OpenAI 兼容（DeepSeek / Qwen / Kimi / GLM / GPT）与 Claude 官方 SDK，`packages/scene-agent/models.json` 切换。默认 `deepseek-flash-thinking`（思考 effort low）。
- **实测**：RAG 课程 8/8 章通过，每章 4–8 轮、由模型自行收尾；整课合计输出约 14.8 万 token。逐次记录见 [`packages/scene-agent/eval/runs.md`](packages/scene-agent/eval/runs.md)。

### 🖥️ 工作台（`/courses/:id`）

每章分两步，顺序固定：

1. **配音与对齐**：添加配音（付费，先显示参考价），再「实测对齐」得到每句的真实时间轴。
2. **生成视频**：点 **「Agent 生成视频（付费）」**，一次确认最多 25 轮模型调用；通过后直接生成本章 MP4 / SRT，未通过则停止并显示实际用掉的轮数，不自动重试。运行中页面显示实时进度（如「第 3 轮 · 检查发现 2 个需修正的问题」「画面已完成，正在渲染视频」）。看完视频后点上方的「看完后确认此版本」。

- **整课进度**：左侧每章标注 待配音 / 待对齐 / 待生成 / 生成中 / 待确认 / 已确认；页头与工具栏显示「已确认 x/n」并列出未确认的章节。
- **按意见修改（付费）**：对已通过检查的版本写下修改意见（如「第 2 段的流程图太小」），Agent 从这个版本的代码出发只改你指出的地方，仍需通过全部检查并由你确认；原版本保留，最多 25 轮。
- **批量生成**：「批量 Agent 生成 N 章（付费）」把已配音、尚无确认版本且不在运行中的章节一次排队，只确认一次（弹窗写明合计轮数上限）；每章结果仍需逐章观看确认。
- **整课导出**：全部章节都有已确认的 Agent 视频后才可点击；每章使用最近确认的版本，在本机渲染，不调用模型或配音。
- **课程主题**：每门课一个画面主题（蓝图、黑板、终端、纸刊、暖色发布会、瑞士蓝），决定背景、配色、字体、字幕条与底纹；新建视频时选择（按讲解风格推荐），工作台侧栏可免费更换。Agent 交付的是源码，换主题后导出在本机按新主题重新渲染，已确认的章节不用重新生成；各章原主题的预览可一键免费按新主题重渲染
- **本机草稿恢复**：新建视频与项目音色的表单自动暂存，刷新或意外关闭后可恢复。

### 🔒 账号与权限
- 注册 / 登录 / 退出 / 修改密码
- 课程按用户隔离，草稿按用户隔离
- 会话过期后原位续登，不丢失编辑内容
- 个人中心可保存 GPT Image 2 的 Base URL 与 API Key（按账号加密保存，需在 `.env` 配置 `ACCOUNT_CREDENTIALS_KEY`）；目前没有功能使用它

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

需要本机已有 PostgreSQL / Redis、一个火山 TOS 私有桶，以及 `.env`、`.env.local-services` 配置（字段见 `.env.example`）。

- `.env.local-services`：`DATABASE_URL`、`CELERY_BROKER_URL` 等本机服务地址
- `.env`：DeepSeek / 火山 TTS 密钥，以及 TOS 的 `TOS_REGION`、`TOS_BUCKET`、`TOS_ACCESS_KEY`、`TOS_SECRET_KEY`（桶须私有、不加桶策略；AK/SK 建议用只授权该桶的 IAM 子用户）

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

#### 启动 Celery Worker 和 Beat（执行配音 / Agent / 导出任务）

> ⚠️ 以下命令会调用 DeepSeek、火山引擎等付费服务，**可能产生费用**。

`DATABASE_URL` 在 `.env.local-services` 中（不在 `.env`）；每个 Celery / API 进程都必须加载，否则会报 `Configure the local workflow database`。

**bash / zsh：**

```bash
cd /path/to/AiCreater
set -a; source .env.local-services; set +a
source .venv/bin/activate

# 终端 1：Workflow 消费者（配音、对齐、Agent 生成）
python3 -m celery -A services.workflow.queue:app worker \
  -Q workflow --hostname=workbench-workflow@%h \
  --concurrency=1 --loglevel=WARNING

# 终端 2：Render 消费者（整课导出）
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

Beat 只开一个。新命令用 Celery 原生 PID 文件阻止重复启动；已有不带 `--pidfile` 的旧实例，须先在其终端正常退出，再换新命令，不能直接叠加启动。若报调度文件 `Resource temporarily unavailable`，先查重进程，不要直接删除 schedule 文件。

可用 `python3 -m celery -A services.workflow.queue:app inspect ping --timeout=3` 核对消费者是否在线。完整启停细节见 [本地运维指南](docs/local-operations.md)。

#### 改过后端代码后重载 API

修改 Python 后端代码后，必须重载 API 和**全部** Worker，包括 Render 队列的 Worker（否则仍用旧代码，新路由会 404；各 Worker 都会回收超时任务，旧代码会按旧的时限误判新类型的任务）：

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

工作台的「Agent 生成视频」由 Workflow 队列执行，单个任务通常几分钟，租约上限 30 分钟；整课导出走 Render 队列。

---

### 运行测试

```bash
npm test                 # 网页与各 package 的 TypeScript 测试
npm run typecheck
source .venv/bin/activate
npm run test:workflow    # Python 后端测试（未设置 TEST_DATABASE_URL 时，依赖数据库的用例会跳过）
python3 services/tests/run_project_tests.py services.tests.test_api …   # 在一次性 Docker PostgreSQL 中跑指定模块
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
│  视觉任务（agent / export，/api/projects/:id/visual）· 文件下载     │
└──────┬───────────────────┬───────────────────────┬───────────────┘
       │                   │                       │
  PostgreSQL            Redis                   火山 TOS
  项目 · 章节 ·          Celery 消息        音频 · 视频 · 导出
  jobs（统一租约）           │
       │      ┌────────────┴─────────────┐   Beat 每 2 秒唤醒
       │      ▼                          ▼
  ┌────┴──────────────────────┐ ┌──────────────────────────────┐
  │ Workflow Worker            │ │ Render Worker                │
  │ · 火山 TTS 配音 + 实测对齐   │ │ · 整课导出                    │
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

配音、对齐、Agent 与导出任务都在同一张 `jobs` 表里，由 `services/projects/leases.py` 统一领取与续租：租约时限按类型设定（配音与对齐 15 分钟，Agent 与导出 30 分钟，超时由 Worker 回收），运行中靠心跳续租，每条队列（workflow / render）同时只运行一个任务；取消运行中的 Agent 任务时，Worker 在下一次心跳停止。付费任务（配音、Agent）只在用户确认后入队；Agent 未通过检查时停止并保留运行记录，不自动重试。

媒体以火山 TOS 私有桶为主副本，经 S3 兼容端点访问，不开放公共链接，下载都经过 API 校验哈希。配音音频、Agent 视频（源码、MP4、字幕、审查帧）与整课导出都存入 TOS；本机目录只是渲染缓存，缺失时下载或导出会自动从 TOS 取回。Agent 视频上传失败时任务仍会发布、付费结果不丢，之后执行 `python -m services.projects.sync_storage` 补传（可重复执行）。

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

services/
  api/                     FastAPI 后端（账号、项目、配音、视觉任务路由）
  accounts/                用户注册、认证与会话管理
  projects/                项目、配音/对齐任务、统一任务表与租约（leases.py）、费用参考、TOS 存储（storage.py）与补传命令（sync_storage.py）
  visual/                  Agent 与整课导出任务、章节编辑与 Worker
  workflow/                Celery 调度、文稿生成、配音与本地对齐
  tts/                     火山 TTS 2.0 配音与字级时间戳
  chapters.py              章节数据结构：口播、配音音频、时长与实测字幕的校验和计时
  workbench.py             `npm run workbench` 的 API + 网页启动器

scripts/                   Scene Agent 命令行与 Worker 入口、配音音频校验、本机回环
docs/                      Scene Agent 设计、本地运维、依赖许可，及仍在使用的功能的设计记录
```

---

## 📚 文档索引

| 文档 | 说明 |
|:---|:---|
| [Scene Agent 设计](docs/superpowers/plans/2026-10-30-scene-agent-loop-design.md) | 适配层、工具接口、关卡与反馈划分、里程碑 |
| [Scene Agent 运行记录](packages/scene-agent/eval/runs.md) | 每次真实模型运行的结果、用量与问题 |
| [本地运维](docs/local-operations.md) | 工作台启停、Celery / Redis / 火山 TOS 配置 |
| [依赖许可](docs/dependency-license-review.md) | 第三方依赖许可审查 |
| [设计记录](docs/superpowers/) | 账号、配音、对齐、存储、费用参考等功能的实现计划与设计 |

---

## 🛠️ 技术栈

| 层级 | 技术选型 |
|:---|:---|
| **前端框架** | Next.js 16 · React 19 · TypeScript |
| **视频引擎** | Remotion 4.0 · FFmpeg |
| **后端服务** | Python · FastAPI · Celery |
| **AI 模型** | DeepSeek API（文稿、Scene Agent）；Scene Agent 可切换 Claude 等 |
| **语音合成** | 火山引擎 TTS 2.0（字级时间戳） |
| **数据库** | PostgreSQL（revision 乐观锁 · 统一任务表） |
| **消息队列** | Redis + Celery（双队列调度） |
| **对象存储** | 火山 TOS（S3 兼容端点）：配音音频、Agent 视频与整课导出 |

---

## ⚠️ 当前状态与边界

- 本项目为**个人使用**；Remotion 4.0.534 符合个人免费资格
- 文稿生成、Scene Agent 与配音会调用 DeepSeek 与火山引擎 API，**会产生费用**
- Scene Agent 每轮都是一次付费模型调用；命令行须 `--confirm-paid`，工作台须逐次确认轮数上限
- Agent 生成的场景代码在本机渲染，有源码约定检查，但**不是安全沙箱**
- 工作台「Agent 生成视频」已在真实浏览器端到端跑通：确认弹窗与取消、失败路径（无效 Key，未计费）、成功出片（第 7 章，5 轮约 3.6 分钟，页面内可播放 MP4 并下载 SRT），以及在测试账号的课程副本中逐章生成、确认并导出整课（8/8 章，266 秒）
- 批量生成的确认弹窗与取消已在浏览器中验证；运行中的实时进度只有单元与数据库测试，尚未在真实付费运行中观察
- 通过检查不等于画面好看，所有结果仍需人工观看确认
- 只用旧流程做过画面的课程，需要先用 Agent 逐章重新生成并确认，才能再导出整课
- 本地渲染与缓存对齐不产生额外 API 费用；火山 TOS 按存储量与下载流量计费
- Redis 保留本机使用；若转为公司/第三方服务需重新核对[许可](docs/dependency-license-review.md)
- 字体使用 `@fontsource/noto-sans-sc`（OFL 许可）
