<p align="center">
  <strong>AI CREATER</strong>
</p>

<p align="center">
  从文稿到成片的 AI 教学视频生成平台
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-22+-339933?logo=node.js&logoColor=white" alt="Node 22+"/>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python 3.11+"/>
  <img src="https://img.shields.io/badge/Next.js-15-000?logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Remotion-4.0-6C47FF?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=&logoColor=white" alt="Remotion"/>
  <img src="https://img.shields.io/badge/License-Private-red" alt="License"/>
</p>

---

## 📖 项目简介

AI Creater 是一个面向**中文知识教学**的 AI 视频生成系统。用户只需输入教学文稿或主题，系统自动完成分镜拆解、画面生成、语音配音与字幕对齐，最终输出 **1080P / 30FPS 的 MP4 视频与 SRT 字幕文件**。

```
输入文稿 → AI 自动分镜 → 9 种教学画面 → TTS 配音 → 字幕对齐 → MP4 + SRT
```

已用真实 DeepSeek + 火山 TTS 2.0 跑通完整链路，产出多门完整课程。

---

## ✨ 核心特性

### 🎬 智能教学分镜
- **DeepSeek 自动分镜**：输入纯文本讲稿，AI 拆分场景并选择最佳教学模板，保持原稿不改写
- **9 种教学表达场景**：概念解释、标题卡片、逐步卡片、无环流程图、代码讲解、教学对比、数据结构状态图、执行时间线、数据图表
- **候选分镜系统**：AI 生成多套候选分镜，可读比较差异后确认接受

### 🎙️ 专业配音与对齐
- **火山 TTS 2.0**：原生字级时间戳，自动字幕对齐，短句组合可读字幕
- **项目独立音色**：每门课程可设置独立音色 ID，不影响其他项目
- **批量配音**：整课批量提交配音任务，已有任务自动复用

### 🎨 视觉风格系统
- **5 种可选视觉风格**：原版（Legacy）、白板线稿（Whiteboard）、现代极简（Minimal）、纸质幻灯（Paper Slide）、机制演示（Mechanism，按已有漏斗/对话/处理链推进）
- **多种配色主题**：暗夜科技、自然教学、彩色信息图等
- **风格冻结**：保存后更新预览而不重新配音，历史版本保留完整风格快照

### 🖥️ 现代化工作台
- **Studio 三栏布局**：左侧章节大纲、中间视频预览与分段 Tab 面板、右侧场景编辑
- **实时预览**：Remotion Player 内嵌预览，支持静音画面草稿与正式配音预览
- **Tab 面板系统**：章节概览与批量操作、课程设置、原始讲稿、版本历史、Token 消耗、持久任务六大面板一键切换
- **任务调度 Dock**：底部浮动任务进度条，后台任务状态一目了然
- **本机草稿恢复**：所有表单自动暂存，刷新或意外关闭后可恢复

### 📝 新建视频向导
- **左右双栏布局**：左栏配置主题与 AI 参数，右栏沉浸式讲稿编辑
- **AI 一键生成文稿**：输入标题即可 AI 生成教学讲稿，也可手动精修
- **讲解风格选择**：通俗科普 vs 知识干货，可视化卡片切换

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

> 以下**三条路径互相独立**，选一条即可。

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

> **注意**：`npm run workbench` 只启动 API + 网页。登录、看课、新建讲稿、手工编辑场景都可以正常使用。但点击「生成教学分镜 / 配音」后任务会进入队列，没有 Worker + Beat 时进度会停在 0%。

#### 启动 Celery Worker 和 Beat（执行分镜 / 配音 / 渲染任务）

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

# 终端 2：Beat 定时调度（每 2 秒唤醒 Worker 从 PostgreSQL 取任务）
python3 -m celery -A services.workflow.queue:app beat \
  --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat \
  --pidfile=/tmp/aicreater-celerybeat.pid
```

**fish：**

```fish
cd /path/to/AiCreater

# 终端 1：Workflow 消费者
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m celery \
  -A services.workflow.queue:app worker -Q workflow \
  --hostname=workbench-workflow@%h --concurrency=1 --loglevel=WARNING'

# 终端 2：Beat
bash -lc 'set -a; source .env.local-services; set +a; \
  exec "'(pwd)'/.venv/bin/python" -m celery \
  -A services.workflow.queue:app beat \
  --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat \
  --pidfile=/tmp/aicreater-celerybeat.pid'
```

Beat只开一个。新命令用Celery原生PID文件阻止重复启动；已有不带`--pidfile`的旧实例，须先在其终端正常退出，再换新命令，不能直接叠加启动。若报调度文件`Resource temporarily unavailable`，先查重进程，不要直接删除schedule文件。

整课渲染另需 Render 队列；页面上的「执行器响应」可核对是否检测到消费者。完整启停细节见 [本地运维指南](docs/local-operations.md)。

#### 改过后端代码后重载 API

修改 Python 后端代码后，必须重载 API 和 Worker（否则分镜/配音仍用旧代码，新路由会 404）：

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

### 运行测试

```bash
source .venv/bin/activate
npm test && npm run typecheck
```

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
        │    │  │ DeepSeek AI │ │  → 自动分镜
        │    │  │ 火山 TTS    │ │  → 语音配音
        │    │  │ Remotion    │ │  → 视频渲染
        │    │  └─────────────┘ │
        │    └──────────────────┘
        │
┌───────▼──────────────────────┐
│    Remotion 渲染引擎          │
│  9 种教学组件 · 5 种视觉风格  │
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

services/
  api/                     FastAPI 后端服务
  accounts/                用户注册、认证与会话管理
  projects/                项目与场景的版本化管理
  workflow/                Celery 任务调度（分镜、配音、渲染）
  tts/                     火山 TTS 2.0 配音适配

scripts/                   工具脚本（类型生成、示例配音、回环绑定）
examples/                  示例教学文稿与配置
docs/                      项目文档
```

修改 Schema 后运行 `npm run schema:types` 重新生成类型，不要手动修改 `packages/video-schema/src/types.ts`。

---

## 📚 文档索引

| 文档 | 说明 |
|:---|:---|
| [快速上手](docs/getting-started.md) | 环境要求、安装、各路径详细指南 |
| [教学模板](docs/teaching-templates.md) | 9 种教学表达场景的字段约束与使用说明 |
| [API 参考](docs/api-reference.md) | HTTP 接口文档、任务管理、导出下载 |
| [本地运维](docs/local-operations.md) | 工作台启停、Celery / Redis / RustFS 配置 |
| [架构设计](docs/AI知识视频生成系统架构设计_v1.5.md) | 系统架构文档 (v1.5) |
| [交付记录](docs/changelog.md) | 功能交付详情与验证报告 |
| [验收计划](docs/acceptance.md) | 教学验收方案与当前状态 |
| [依赖许可](docs/dependency-license-review.md) | 第三方依赖许可审查 |

---

## 🛠️ 技术栈

| 层级 | 技术选型 |
|:---|:---|
| **前端框架** | Next.js 15 · React 19 · TypeScript |
| **视频引擎** | Remotion 4.0 · FFmpeg |
| **后端服务** | Python · FastAPI · Celery |
| **AI 分镜** | DeepSeek API |
| **语音合成** | 火山引擎 TTS 2.0（字级时间戳） |
| **数据库** | PostgreSQL（版本保护） |
| **消息队列** | Redis + Celery（双队列调度） |
| **对象存储** | RustFS（音频与渲染资产） |

---

## ⚠️ 当前状态与边界

- 本项目为**个人使用**；Remotion / Player 4.0.534 符合个人免费资格
- 分镜生成与配音会调用 DeepSeek 与火山引擎 API，**会产生费用**
- 本地渲染与缓存对齐不产生额外 API 费用
- Redis 保留本机使用；若转为公司/第三方服务需重新核对[许可](docs/dependency-license-review.md)
- 字体使用 `@fontsource/noto-sans-sc`（OFL 许可）
- 详见 [后续跟进](docs/mvp-follow-up.md)
