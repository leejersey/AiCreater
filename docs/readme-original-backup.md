# AiCreater

当前待办：[TODO](docs/TODO.md) · [本地运行手册](docs/local-operations.md) · [依赖许可初筛](docs/dependency-license-review.md)。人工同步与nums发音已加入待办，后续先推进部署交付，不自动调用收费服务。

面向**编程语言与 AI 教学**的中文图解视频平台，不以通用宣传短片代替教学内容。第一阶段本地 DSL → MP4/SRT 已验证；第二阶段已实现 **DeepSeek 分镜 + 火山 TTS/时间戳 + 本地生成 CLI**；已用真实 DeepSeek + TTS 2.0 原生字幕时间戳跑通 5 场景文案 → 配音 → DSL → MP4/SRT。当前不是完整 MVP。

## 已实现

- 严格 JSON Schema，以及读取同一 Schema 的 TypeScript/Python 校验器。
- 标题、逐步卡片、无环流程图、代码讲解、教学对比、数据结构状态图、执行时间线和用户确认数据图八类模板；按帧动画，固定中文字体与字幕安全区。
- 本地音频校验：路径边界、软链、文件大小、SHA-256、真实音频时长。
- 场景组合、字幕全片偏移、1080P/30FPS H.264 + AAC 导出和 ffprobe 核验。
- 导出失败清理临时文件，拒绝覆盖已有 MP4/SRT。
- DeepSeek JSON 分镜，保持原始口播，复用 DSL 的模板/cue/流程图校验。
- 火山 2.0 WebSocket 原生字幕 / 1.0 HTTP 时间戳、新旧控制台鉴权和帧级编排；没有时间戳则拒绝发布 DSL。
- 字级时间戳按标点和长度组合为可读短句字幕；元素动画仍使用原始字词级时间。
- 原子发布生成 DSL，不覆盖已有文件；对齐失败保留音频，供应商错误不记录响应原文或密钥。
- Remotion Studio 本地预览；库的临时服务与 Studio 均限制到 127.0.0.1。

## 环境

- Node.js 22+、npm。
- Python 3.10+；`jsonschema` 用于协议校验，`httpx` 调用 HTTP 供应商，`websockets` 接入 TTS 2.0 原生字幕，`python-dotenv` 读取本地配置。
- PATH 中有 `ffmpeg`、`ffprobe`。
- 示例语音生成使用 macOS `say` 与已安装中文语音；其他平台可自备音频和符合协议的 DSL，渲染本身不依赖 macOS。
- 第一次导出会下载 Remotion 固定版本的 Chrome Headless Shell，需要网络和额外磁盘空间。之后渲染不需要在线字体或外部媒体。

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
npm test
npm run test:workflow
npm run typecheck
```

## 已有本机工作台的受控启停（macOS）

```bash
npm run workbench:status  # 只读健康/归属/任务/20GiB磁盘预警
npm run workbench         # 前台，仅启动缺失API和开发网页；Ctrl+C请求停止
```

需已有基础服务与本人0600配置；不启动Docker/worker/beat，不接管已运行服务。任务忙/DB不可达则拒绝自动停机，只回收本次子进程组且不强制KILL。现有二者都正常时直接报告复用并退出。生产网页仍用原`web:start`手动管理；工具不自动构建或切换模式。[边界与操作](docs/local-operations.md#受控前台启动器macos)。成功`status`的`disk`含ROOT文件系统可用bytes和20GiB阈值，低于阈值为`low`，读取失败为`unavailable`；只提示、不改变退出码/启停/任务。手动快照不保证渲染容量，Docker VM额度另算。

已在用户批准窗口完成真实API/开发网页冷起与Ctrl+C回收，并实测预编译生产`web:start`；现已恢复原开发网页模式，数据不变、无新任务。[冷启动记录](output/workbench/cold-start-qa/receipt.json)。不等同整机/容器重启或原子全系统停写。

## 生成与预览示例

```bash
# 生成 5 场景中文配音、DSL 与 Studio props。
npm run demo:create

# 启动后访问终端打印的 localhost 地址；Ctrl+C 退出。
npm run studio

# 导出；目标文件必须不存在。
npm run render -- examples/demo.json output/demo.mp4
```

生成文件：
- `examples/demo.json`：最终可渲染 DSL。
- `examples/demo-props.json`：Studio 的 `{project: DSL}` 输入。
- `apps/renderer/public/demo/*.wav`：真实本地中文语音。
- `output/demo.mp4`、`output/demo.srt`：视频和外置字幕。

示例生成默认语音为 `Eddy (中文（中国大陆）)`。若系统未安装，可运行 `say -v '?'` 查看可用语音，然后：

```bash
DEMO_VOICE='已安装的中文语音名' npm run demo:create
```

示例音频逐短语合成后拼接，因此短语区间来自真实文件时长，**不是自动强制对齐，也不是词级时间戳**。元素在对应短语开始时入场，不保证与短语内部关键词的偏差小于 0.5 秒。正式对齐与供应商接入属于第二阶段。

重新生成示例会更新示例输入和配音，不改已有导出。再次导出使用新文件名，例如 `output/demo-2.mp4`。示例生成文件、依赖和输出不纳入版本管理。

## DeepSeek + 火山生成文案视频

先复制 `.env.example` 为本地 `.env`，只在本机填写：
- `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`（账户实际可用模型）。
- 火山新版控制台填写 `VOLCENGINE_API_KEY`；旧版填写 `VOLCENGINE_APP_ID` + `VOLCENGINE_ACCESS_KEY`，两种鉴权不能混用。
- `VOLCENGINE_RESOURCE_ID` 与 `VOLCENGINE_SPEAKER`：已开通的资源与中文音色 **ID**，不是音色显示名。

```bash
# 不覆盖已有本地配置。
cp -n .env.example .env
# 使用编辑器在本机填好 .env；不要把密钥发到聊天里。
# 调用真实供应商，会产生 LLM/TTS 费用。
npm run generate -- examples/script.txt output/cloud-project.json
# 生成成功后复用原导出器。
npm run render -- output/cloud-project.json output/cloud-video.mp4
```

生成的音频放在 `apps/renderer/public/generated/<运行ID>/`，包括原始音频、24kHz 单声道 WAV 和供应商 words JSON。目录默认不纳入版本管理，不要删除仍被 DSL 引用的文件。失败时不发布最终 DSL，错误返回 stage、scene_id 和已生成资源目录。已有目标文件会在调用付费接口前被拒绝。

输入最多 4,000 个 Unicode 码点、20 场景、5 分钟；DeepSeek 只能拆分原文，不能改写或插入文案。原稿与供应商字词必须逐字对应，允许忽略空白与标点，数字读音替换或漏词会显式报错。人工听检与 0.5 秒精度验收仍不可省略。

`seed-tts-2.0` / `seed-icl-2.0` 自动使用 WebSocket V3 双向流式接口，启用 `enable_subtitle`，收集 `TTSSubtitle`(364) 的 `words[].word/startTime/endTime` 秒值和音频，等待 SessionFinished 后结束连接。目前支持中英文，不启用 SSML / LaTeX。

1.0 资源保留 HTTP 单向流式协议（JSON 行 `code=0` 为数据、`code=20000000` 为成功结束标记，base64 `data` 和 `sentence.words`）。此前 HTTP 2.0 返回空词表，不代表原生 WebSocket 字幕不受支持。时间戳缺失、句内重置、原文不匹配或字段不兼容时会失败，不猜测时间基、不按字数估时，也不自动增加 ASR 调用。

过长供应商短语的字幕会分成两行、每行最多 22 码点，细分时间属于插值，不冒充真实词级时间戳。900s 预算在工作流检查点验证；独立 Worker 的硬中止与任务恢复属于第三阶段，目前外部 I/O 使用超时而非进程级硬截止。初期生成失败不自动重试付费请求，也不自动恢复；原始音频保留供排错。

`npm run test:workflow` 使用 MockTransport / 模拟 WebSocket 验证请求、二进制协议、会话结束、晚到字幕、错误与超时，并验证真实 FFmpeg 转码；测试时间戳是替身，**不调用付费接口，也不代表真实语音对齐验收通过**。

## 编程 / AI 教学

- `code_walkthrough`：完整代码、行号和按口播切换的行高亮；右侧显示当前讲解、变量教学快照和输出。支持 python/javascript/typescript 展示，**不执行用户/LLM 代码**。代码最多 16 行、每行 48 显示单位，正文 32px；超限拒绝，不压小字号。
- DeepSeek 已增加教学约束：编程优先代码实例与状态；AI 优先具体输入、处理、模型和输出，不只生成营销口号。自动生成的技术内容仍需审核。
- `examples/lessons/python-sum.json` / `.txt`：六步累加讲解（初始化、取值、加法、重复循环、打印），维护测试实际验证固定示例输出为 5。
- `examples/lessons/rag.json` / `.txt`：检索增强生成、答案来源和无可靠依据分支。退货规则是虚构知识库教学示例，不代表现实政策。

可以直接使用已审核分镜，跳过 LLM（仍调用付费 TTS）：

```bash
npm run generate -- examples/lessons/python-sum.txt output/python-new.json --storyboard examples/lessons/python-sum.json
npm run render -- output/python-new.json output/python-new.mp4
```

本机已生成两个真实配音教学样例：
- `output/python-sum-teaching-v4.mp4` / `.srt`：约 17.067 秒，代码 32px，六步循环行高亮和变量变化。
- `output/rag-teaching-v2.mp4` / `.srt`：约 29.312 秒，问题到答案的图解与检索失败分支。
- `output/teaching-qa/`：关键步骤帧，抽查未见明显裁切；不代表所有帧或教学正确性自动验收通过。

## 教学项目保存与版本保护（第三阶段首批）

已有 PostgreSQL 仓库、本地 CLI、FastAPI、Celery任务队列、配音恢复与Next.js教学编辑器；完整教学质量验收尚未完成。

在本地 `.env` 设置 `POSTGRES_PASSWORD` 和 `DATABASE_URL`（不要提交）：
`postgresql://aicreater:<URL编码后的密码>@127.0.0.1:15432/aicreater`。然后：

```bash
docker compose -f compose.postgres.yaml up -d --wait
python3 -m services.projects.manage import output/python-sum-project-v2.json --title "Python 循环教学"
python3 -m services.projects.manage get <project_id>
python3 -m services.projects.manage edit <scene_id> patch.json --revision <scene_revision>
python3 -m services.projects.manage reorder <project_id> order.json --revision <project_revision>
python3 -m services.projects.manage version <project_id> --revision <project_revision>
python3 -m services.projects.manage export <version_id> output/frozen-lesson.json
npm run render -- output/frozen-lesson.json output/frozen-lesson.mp4
```

- `import` 输出项目/场景 ID 与 revision；场景数据库 ID 不同于 DSL 场景名。
- `patch.json` 仅可包含 `elements`、`code`、`captions`、`narration_text`；elements 提供完整数组并保留 ID、顺序和 cue。代码/变量/标签修改保留音频，需重新审核技术含义。
- 修改口播删除配音附着、字幕、时长、动画，标记 needs_voice；未补齐前不能创建快照。**本轮不自动调用付费配音恢复**。
- `order.json` 为场景数据库 ID 的完整、不重复数组；过期 revision 报 conflict，事务不会覆盖并发编辑。
- 快照保存 DSL、revision、主题/模板版本、字体 hash、配音配置与渲染参数；之后编辑不改旧快照。导入及快照重验音频哈希/时长/路径，不提供资产删除入口。
- 配音配置记录当前本地配置，导入旧音频的供应商来源无法仅凭 WAV 校验。中文字体 hash 已记录；代码系统等宽字体尚未打包，不保证跨机器逐像素一致。
- 本轮只启动过临时测试 PG，未替你启动长期开发库。不要用 `docker compose down -v` 删除需保留的数据卷。

```bash
python3 services/tests/run_project_tests.py
```

PG 测试使用自有临时容器和随机回环端口，结束删除，不访问用户已有库。普通 `npm run test:workflow` 会跳过 PG 项；不能把跳过当作通过。本轮另跑过真实 PG 的并发、代码编辑、失效、快照、CLI 和资源篡改测试，不调用付费供应商。

## 本地 HTTP API 与候选确认

配置上一节的 PostgreSQL 后启动（只绑定回环地址，不开启代理头信任）：

```bash
python3 -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers
curl http://127.0.0.1:8000/health
```

已开放：
- `POST /api/projects`：`title`、`source_text`、`mode=script`，仅创建文案草稿，不生成视频。
- `POST /api/projects/import`：`title`、`dsl`，导入已完成的教学项目并校验音频。
- `GET /api/projects/{id}`、`PATCH /api/scenes/{id}`（`expected_revision` + `changes`）。
- `POST /api/projects/{id}/scenes/reorder`（`expected_revision` + 完整 `scene_ids`）。
- `POST /api/projects/{id}/versions`（`expected_revision`）、`GET /api/versions/{id}`。
- `GET /api/scenes/{id}/candidates`、`POST /api/scenes/{id}/candidates/{candidate_id}/accept`（`expected_revision`）。

候选由内部仓库或重生成任务保存，不开放直接写候选的HTTP接口。保存候选不改场景；接受时同时检查当前revision和候选base_revision，过期返回409并保留候选。接受后generated_revision递增，user_revision不变。

口播不变且元素ID/cue/order不变时复用音频和合法时间；结构/cue变化保留音频但标记needs_timing；口播变化标记needs_voice。未ready或无场景不能创建快照。确认候选是显式操作，不代表技术内容已自动核验。

API严格拒绝未知字段、非整数revision、非回环来源、非白名单Host/Origin。只允许本地3000/8000端口的前端Origin；请求体累计上限512KiB、接收预算15s。验证错误提供path/code/message，但不回显原始输入。无多用户鉴权，**不要公开端口或通过公开反向代理转发**。

已开放 `POST /api/scenes/{id}/regenerate`（`expected_revision`）、`GET /api/jobs/{id}`、`POST /api/jobs/{id}/cancel`、`POST /api/jobs/{id}/retry`。提交落盘后返回202/queued；需启动以下worker和beat才能执行。返回公开任务状态、进度及候选ID，不返回输入快照或内部attempt ID。候选仍须显式接受。

```bash
# 本地 PostgreSQL 和 Redis；先配置 .env 的数据库密码及DSN。
docker compose -f compose.postgres.yaml up -d
# 先启动 API 完成数据库初始化，然后分别启动 worker 和 beat。
python3 -m celery -A services.workflow.queue:app worker -Q workflow --hostname=workflow@%h --concurrency=1 --loglevel=WARNING
# 渲染独立单槽，不阻塞分镜/配音；另一个终端运行。
python3 -m celery -A services.workflow.queue:app worker -Q render --hostname=render@%h --concurrency=1 --loglevel=WARNING
python3 -m celery -A services.workflow.queue:app beat --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat
```

Redis只承载固定空参数唤醒消息；任务状态在PostgreSQL，断开Redis不会丢失已经提交的任务，恢复调度后继续消费。只运行一个beat；本地Redis无鉴权，不得公开端口。任务失败不会自动触发新的付费请求；用户重试可能重复计费。

已开放 `POST /api/projects/{id}/generate`，body为 `{"expected_revision":1}`：仅用于还没有场景的文稿项目，走同一PG任务与Celery执行器，冻结模型/原文并保留首尾空白。首次成功且项目版本未变时附着教学分镜，场景标记needs_voice；没有音频不能建导出版本。版本已变时结果留在job.result.draft且attached=false，不覆盖编辑。已有分镜请使用场景regenerate。

已开放 `POST /api/scenes/{id}/voice`（`expected_revision`）：冻结教学场景和音色配置，复用原生时间戳TTS与字幕/动画编排，不再次调用DeepSeek。成功后仅在场景版本及profile一致时附着ready音频，增加项目revision；迟到结果留在job.result.document，attached=false。修改口播后的needs_voice场景可通过该接口恢复；重试可能重复计费，暂不做免计费断点续跑。

已开放 `POST /api/projects/{id}/render`（`version_id`）：必须先创建ready不可变版本；只读取该快照，当前草稿继续编辑不影响导出。每个attempt独立目录，发布前重新校验1080P/30FPS、H.264/AAC、帧数、时长与快照字幕。完成后可下载 `GET /api/jobs/{id}/files/mp4` 和 `/files/srt`；未完成、取消或校验和变更时拒绝下载，不接受用户文件路径。

渲染子进程不接收供应商密钥，预算840s，工作流总预算仍900s；字体/模板profile变化需重新创建兼容版本。仅有固定空参数唤醒消息进入Redis，渲染worker独立单槽。产物保存在renderer/public/renders/{job_id}/{attempt_id}，失败/取消目录留存供排查，暂不自动清理。

### Next.js 本地教学编辑器

先按上文启动PostgreSQL、Redis、API和两个Celery执行队列，然后：

```bash
npm run web
# 打开 http://127.0.0.1:3000
# 生产构建/启动（也只绑定回环地址）：
npm run web:build
npm run web:start
```

三栏工作台支持创建中文文稿、首次生成教学分镜、场景排序、口播/代码/步骤与变量快照编辑、候选确认、配音恢复、真实Remotion Player预览、冻结版本导出和MP4/SRT下载。步骤说明、代码高亮、变量及输出可用表单编辑，高级JSON仍保留；表单中的元素编号、顺序、cue和流程边只读，结构调整建议重生成候选，不是自由拖拽或代码IDE。步骤cue按Unicode码点，代码行号从1开始；代码仅展示，不执行。

浏览器直连固定回环API `127.0.0.1:8000`，来源仅允许本地3000/8000；供应商密钥只在后端。未保存输入不会被任务轮询覆盖；切换/刷新有放弃确认，409保留输入。任务列表可在重开项目后继续查询，付费生成/配音/重试需确认。所有场景ready后才能预览完整视频或冻结导出。

已用独立临时PostgreSQL+真实API+生产页面验证Python教学播放、步骤编辑并重开、非法JSON、轮询保留草稿、409冲突及新建AI文稿，截图 `output/editor-preview.png`。没有触发真实付费任务；真实Redis/Celery双队列的教学渲染与下载现已实测（见下节），两个案例的付费文稿→分镜→配音→编辑→导出闭环现已验证（见下节）；20组课程及同步质量仍待验收，RustFS真实对象存储与恢复已验证。

### 教学对比面板（第二阶段首个组件）

`comparison_panel`复用elements/cue，支持2/4/6项：左标题/右标题、左说明/右说明、左结果/右结果，固定两列最多三行；奇数项、代码字段和流程边均拒绝。中文内容安全换行，仍按各自口播入场。多行代码继续用code_walkthrough，不塞进对比标签。

```bash
npm run demo:create -- --comparison
npm run render -- examples/comparison-demo.json output/comparison-panel/video.mp4
```

样例是手写教学数据+macOS本地say音频（短语级时间，不是云端字词对齐），421帧/14.033s，仅演示组件，不是完整长课或真实模型验收。macOS之外请提供自有合法音频。开始/入场/完成截图在同目录，全文草稿为examples/lessons/comparison.json。

交付对比面板时，本机工作台曾更新至模板版本teaching:2，导入“对比面板 · 本地合成示例”，实际HTTP编辑保存重开、保持音频、冻结快照、真实队列导出及下载SHA验证通过；刷新http://127.0.0.1:3000可查看。本轮未调用收费模型/配音。新类型要求同版本validator/renderer；旧四类项目仍合法，旧导出不删除。模板版本保护下，旧teaching:1快照不能直接由新runtime重渲染，请从项目冻结新版本再导出，不能改旧快照的版本标记。状态图及执行时间线现已实现（见下节），配音前确认与基础表单也已实现（见下节）。

### 数据结构状态图（第二阶段第二个组件）

`state_diagram`使用`structure={kind:array|object|stack,name}`，每个讲解步骤保存完整`items=[{id,key,value}]`与`active_item_ids`。最多6项；数组按索引、对象按字段、栈按底→顶存储并显示TOP，支持空结构。帧号直接决定当前快照，倒退预览不会保留后续值。文本只是教学数据，不解析或执行代码；重复字段/ID、不存在的高亮、非法索引及控制字符均拒绝。

```bash
npm run demo:create -- --state
npm run render -- examples/state-demo.json output/state-demo.mp4
```

手写原稿在`examples/lessons/state.json`，本地say样例为903帧/30.1秒、1080P30 MP4+SRT；仅证明组件，不是完整长课、真实模型或云端字词对齐验收。实际字体校验发现栈顶与当前标签需要267.7px，已校准320px标签区并保留字宽防溢出检查。数组/对象/栈及六项长中文压力图在`output/state-demo-qa/`。

持久工作台已导入“状态图 · 数组对象栈 · 本地合成示例”，实际HTTP编辑/保存/重开保持音频、冻结新快照、真实双队列/RustFS导出及MP4/SRT下载SHA通过；交付`output/state-demo-qa/workbench.mp4`与同名SRT。浏览器播放/暂停和空数组可视状态已检查，`workbench-preview.png`保留；Tabbit注入html属性产生开发模式hydration警告，未用suppressHydrationWarning隐藏。状态图交付时模板版本为teaching:3（现为teaching:4），旧项目与旧下载保留；旧快照重渲染需重新冻结，不得修改原profile。

本机macOS常驻Celery的prefork子进程在初始化中崩溃，已将默认单槽worker池改为solo，并补红绿测试；任务仍在现有受限子进程内执行，两条队列和配音/渲染超时边界不变。所有自有进程在检查PID和活动任务后升级；未删除用户卷、旧导出或已有任务。

本轮108/108 Node测试、TypeScript检查、70个离线Python测试与62个真实PostgreSQL测试通过（unittest discover总132，跳过的62随后以临时数据库单独运行）。不增加依赖、收费请求、嵌套结构、树或新表单；Next生产构建本轮未重跑，使用既有开发工作台实测。当时下一步为执行时间线，现已实现（见下节）。

### 执行时间线（第二阶段第三个组件）

`execution_timeline`使用`timeline={duration_ms,lanes}`与步骤`event={lane_id,start_ms,end_ms,phase:execute|wait}`。最多3条任务轨道、6个事件；同轨半开区间不得重叠，跨轨可重叠，未知/重复/空轨道和非法区间均拒绝。轨道重叠不保证CPU并行。时间轴为明确假设下的示意毫秒，不是性能实测，也不决定视频配音时长。

按口播cue揭示事件，倒退seek移除后续事件。执行/等待有实线/虚线图例；短事件用实心/空心标记区分，右侧始终展示当前精确区间，不靠加宽伪造耗时。字幕安全区、草稿/配音/编辑字段保留、生成提示和字体测量均已接入。

```bash
npm run demo:create -- --timeline
npm run render -- examples/timeline-demo.json output/my-timeline.mp4
```

手写串行/异步假设原稿在`examples/lessons/timeline.json`，本地say样例636帧、约21.2秒、1080P30 MP4/SRT。已导入工作台“执行时间线 · 串行与异步 · 本地合成示例”，HTTP编辑保存重开保持音频/字幕/轴数据，冻结新版本、双队列/RustFS导出与MP4/SRT下载SHA通过。**推荐交付为`output/timeline-demo-qa/workbench-v3.mp4`及同名SRT**；浏览器播放/暂停、5个刻度与代表帧已检查，截图在同目录。

关键帧发现零刻度与说明文字重叠，已增加红绿回归并将刻度移至270px。重复冻结相同revision/profile会复用已有版本与导出；早期workbench-v2因此仍是旧布局，保留诊断、不推荐播放。最终接收一项明确示意标签修改后冻结新的版本与任务，实际queued→running→succeeded一次完成，未修改原快照或删除旧文件。

本机自有API/worker/beat已在检查PID和活动任务后升级至teaching:4；旧项目和下载保留，旧模板快照重渲染需重新冻结。133个Node测试、类型检查、73个离线Python测试与63个真实PostgreSQL测试通过（discover总136，跳过的63单独运行）。本轮零收费调用、未执行模型代码，也未跑Next生产构建；音频为本地短语级时序，不能视为原生字词同步或完整2–3分钟课程验收。当时下一步为配音前分镜确认及步骤/变量表单，现已实现（见下节）。

### 配音前分镜确认与基础表单（第三阶段）

工作台增加已保存分镜总览、当前场景revision复核及中文时长显示。确认只保存在浏览器会话，绑定场景ID/revision；编辑即撤销，重载或切换项目清空，不写数据库，也不限制直接API/CLI。工作台单场景配音/对应voice重试须先复核且无未保存修改，原计费弹窗仍保留，不自动调用服务。

ready时使用实际帧数/30；未配音部分按非空白Unicode码点200–300/分钟粗估并计入已知场景留白，混合状态相加。仅提示可能超5分钟，不截断；英文/代码可能偏差大，时间线示意毫秒不算视频时长，最终仍由实际配音与300秒限制裁决。

步骤表单支持说明文字；代码场景另有高亮行复选、变量增删（最多3个）及输出。高级JSON与表单同一数据源，修改保留cue/ID及状态图items、高亮、时间线event等原字段。无效JSON/字段类型会阻止切入表单及保存，保留输入；后端schema、失效/expected_revision仍为最终裁决。

本轮140个Node测试、类型检查、Next生产构建、73个离线Python和63个真实PostgreSQL测试通过。浏览器实测复核启用/编辑撤销/重载撤销、无效JSON保留、变量三项上限、说明/变量/输出保存重开及高亮选择；全部未点击收费操作。编辑示例已恢复，音频与字幕继续ready。截图`output/forms-qa/form-preview.png`。

验收发现旧Python示例遗留场景重排把print放在第二次循环之前；已恢复scene1→scene2→scene3→scene4→scene5并冻结新版本导出，旧文件未改。正确顺序短样例为`output/forms-qa/python-correct-order.mp4`及同名SRT，实际双队列/RustFS下载SHA通过，记录在`output/forms-qa/receipt.json`。这仍是短样例，不是完整2–3分钟课程；先前历史导出不会被自动替换。

不新增依赖、API/数据库/模板变更、服务端持久审核、专用状态/时间线表单或付费请求。技术事实仍需人审；下一步为完整Python/AI课程真实生成与人工验收，收费安排须另行确认。

### 完整课程首次尝试（历史：Python待听检，RAG结构校验阻塞）

两份文稿已离线复核并获准本轮收费尝试；首次Python分镜任务failed（attempts=1、storyboard/validation），没有发布分镜，随即停止，未调用RAG/TTS/导出，也未自动重试。receipt为`output/full-lessons-20261010-221550/receipt.json`。原响应/子码未留存，不能断言具体模型失败原因。

已补固定允许列表`storyboard_*`错误分类，未知值仍通用，原始正文/消息/认证信息不落库；这些校验失败保持不可直接付费重试。76个离线Python+64个临时PostgreSQL测试通过，闲置自有服务已安全升级，未新增供应商调用。随后获准再试Python一次，仍failed，已明确storyboard_incomplete_response（模型未正常结束，尚不知道具体finish_reason），立即停止，未调用RAG/TTS。第二receipt为`output/full-python-attempt2-20261010-223547/receipt.json`。

已离线为已知Flash模型显式关闭默认thinking，保持8192-token预算；length/内容过滤分别固定脱敏分类，未知值不泄漏也不直接重试。79个离线Python+64个临时PostgreSQL新鲜回归通过，自有服务已升级，未提交第三次收费任务。该调整未经真实输出验证，不能声称原故障已解决；完整2–3分钟教学课仍未验收，通过前需人工检查教学事实。之后再获准Python一次，模型已完整结束但失败于`storyboard_source_mismatch`：生成口播未严格保持原稿。记录`output/full-python-attempt3-20261010-230714/receipt.json`；立即停止，无配音/RAG/导出。下一步建议先改供应商内部协议，让程序持有原文、模型仅引用原文片段并生成图解，不通过反复付费或放宽校验解决。原文归属协议已批准并离线完成：程序无损生成source_parts，模型只引用source_part_ids，引用必须完整原序覆盖，再由程序恢复口播并沿用严格校验；旧完全保持原稿的响应仍兼容，现有项目/API/数据库/模板不变。88个离线Python+64个临时PostgreSQL回归通过，服务已安全升级；本轮未发起收费分镜/配音，未重跑未修改的网页构建。新协议尚未验证真实供应商成功，完整课程仍未验收；再次收费尝试仍须显式允许。详见`docs/superpowers/plans/2026-10-10-source-owned-storyboards.md`。详见`docs/superpowers/plans/2026-10-10-full-course-acceptance.md`。

随后获准一次真实Python生成，source-parts协议成功：11场景、原稿796码点含末尾换行完整保持。已人工核对正确代码AST/变量状态/打印5、单独错误版本3/空列表边界，校准动作cue及四行概览高亮；经人工候选与revision保护保存重读，项目r13、全部待配音。记录和复核在`output/full-python-attempt4-20261010-232159/`，项目“完整课 · Python循环累加 · 原文片段协议尝试4”可在工作台查看。未执行模型代码，也未调用TTS/RAG或导出；真实音频同步与完整课程验收仍待完成，下一步配音需要授权计费。

用户明确允许11段后，逐段真实配音全部成功、各attempts=1；已本地导出**2分39秒、1080P30 H264/AAC**完整Python课程：`output/full-python-attempt4-20261010-232159/python-full.mp4`及同名SRT。Schema/动画字幕边界、冻结版本、队列/RustFS与HTTP下载SHA通过，人工检查取值/打印/正误对比代表帧。详情同目录`delivery.md`；未新增分镜/RAG，不执行模型代码，无自动重试。原稿完整保留；发音及逐词同步仍待完整听检，RAG完整课尚未跑，不能认定全量教学质量验收完成。

2026-10-12获准仅1次RAG收费分镜生成，任务失败于`storyboard_schema_error`、attempts=1，不发布分镜；已停止，未调用配音/导出或自动重试。记录`output/full-rag-attempt1-20261012-153909/receipt.json`。具体失败字段及原始响应未保留，不能猜测根因或宣称已修复；下一步先离线排查结构约束，任何新增收费尝试仍需明确授权。

随后明确授权第二次仅1次RAG分镜，任务failed、attempts=1、`storyboard_invalid_cue`：图解cue未对应有效口播区间。按校验顺序，本次已通过字段结构与原稿保持检查，但具体场景/偏移未保存，不能据此宣称前次错误已修复。HTTP确认无分镜发布，816码点原稿不变；总attempts由24到25，无配音/导出/自动重试。记录`output/full-rag-attempt2-20261012-164253/receipt.json`。已停止付费尝试；下一步先离线排查cue与业务错误安全定位，不靠继续收费试错。

随后明确授权第三次仅1次RAG分镜，仍failed、attempts=1，但本次安全诊断已实际贯通：`storyboard_invalid_cue`、`cue_error.path=/scenes/2/elements/2/cue`、`reason=out_of_bounds`（第3场景第3元素的cue超过场景口播末尾）。没有发布场景，816码点原稿哈希不变，总attempts由25到26；没有配音/导出/重试。记录`output/full-rag-attempt3-20261012-170420/receipt.json`。操作回执起初误用API的id而不是job_id，随后仅查询原有任务找回ID，没有重提。实际越界偏移不保存，不能据此推断全稿偏移或Unicode计数等原因；下一步先离线设计定位修复，不继续收费试错。

### Python开场图形修正版（读音按用户要求暂不修改）

用户确认其他部分没问题，但开场约9.27秒才出现标题，且报告nums读音不正确；随后明确先不改读音。本轮只改当前课程开场，复用已有card_sequence三张卡：原主题、2 + 3、= 5。遵守动画最早6帧规则，标题0.233秒完整可见，早于首字幕0.467秒；算式0.833秒出现，结果3秒随原稿“五”出现，未提前显示结果。原稿、11音轨/字幕/时长及其他10场景不变，原项目/成片保留。

最新版`output/full-python-opening-only-20261012-205231/python-full.mp4`，配套`python-full.srt`、receipt.json、media-verification.json、dsl-opening-fixed.json。一次本地render，attempts40→41；4783帧/159.445秒完整解码/checksum通过，AAC+PCM与旧版相同，SRT逐字节相同。实际0.5/2.6/3.6秒抽检有主题、算式、按序结果，无明显裁切/重叠。

无模型/配音/重试/依赖或产品代码改变，操作脚本含源数据/资产/唯一cue/最小场景差异/最终验证/回读/音轨一致断言，未重复跑未变产品代码测试/构建。用户已确认修正开场；nums读音已明确延期未解决，未来发音控制需另行设计和收费授权。此为当前课程修订，未新增全局自动开场策略。

### Python完整课程：末句字幕校正版（后续开场另行修正）

RAG修复版用户回复“没问题，继续下一项”，已记录该问题关闭与交付接受（不冒充量化人工同步测量）。下一项检查既有Python课程，发现第7/8/11场景末字幕后0.7–1.067秒仍有音频信号（非独立语音判定），沿用批准规则导入副本，11场景仅末字幕end_frame改到音频边界；原796码点、代码/变量/高亮/配音/动作不变，旧project revision24和成片保留。

最新版`output/full-python-subtitle-tail-fixed-20261012-203403/python-full.mp4`、`python-full.srt`，约2分39秒；receipt.json/media-verification.json记录一次render succeeded，attempts39→40，0模型/配音/重试。4783帧/1080p/30fps/159.445秒完整解码/checksum通过，AAC流与PCM hash与旧版相同，字幕文字不变；92.6/109.6/158.8秒实际帧末字幕均存在。只复用现有已测试策略，无新产品代码/依赖/构建；待用户播放确认n/total读音、取值/累加/输出的教学顺序与整体声画，不自动标为听检通过。

### RAG末句字幕消失已修复（用户已确认）

用户整体反馈正常但末句字幕在声音结束前消失。复现：142.633秒字幕退场，143.5秒实际画面无字幕而音频仍非静音；供应商最后词时间戳早于17.280秒音频长度。共享`services/tts/timing.py`现在让每场景最后一句保留到音频边界`duration_frames−6`，不修改词时间戳、开场/动作/音频/文字。新回归先失败36≠97，再修复；107离线、70临时PostgreSQL、140Node测试通过。

最新成片`output/full-rag-subtitle-tail-fixed-20261012-202251/rag-course.mp4`、`rag-course.srt`。独立校正版项目`c21daa9f-925f-4e50-863c-f37ce21e870c`，旧项目/成片保留。9场景仅末字幕end_frame改变；报告句终点142.633→144.467秒。143.5/144.4秒实际帧均可见该句；4930帧/164.352秒完整解码、下载checksum通过，AAC流与解码PCM与旧版相同，字幕文字未改。一次本地render，attempts38→39，无模型/配音/重试。

receipt.json和media-verification.json保存证据；实施`docs/superpowers/plans/2026-10-12-caption-tail-fix.md`。无需重复收费配音。用户“整体没问题”记录为修复前带此例外的正面反馈；用户随后回复“没问题，继续下一项”，已记录交付接受及问题关闭，不将该反馈冒充量化人工同步测量。词级时间戳的声学精度不由本次句尾显示策略保证。

### RAG独立离线转写检查完成（13处识别差异待听检）

使用已缓存Whisper medium，CPU/int8离线推理1次（约103秒），无原稿提示、模型下载或云API。原始24段转写`independent-transcript.json`保留，仅比较时用系统Foundation简繁转换、空白/标点/大小写及单个数字等价处理，未改原稿或配音。比较后13组替换差异（含甲/假、乙/已/椅等可能同音），未见整段插入/删除分组；这是ASR差异，不是已证实错读，序列相似度97.64%不是准确率。

30动作与独立ASR估计词起点对照未发现>0.5秒差值（最大0.5秒，开场是主题标题例外），但Whisper时间戳不是声学真值，仍不能勾选人工验收。`independent-asr-review.json`、`asr-listening-checklist.md`列出时刻；优先听`listen-52_5-57_5.wav`，确认“收到问题后，检索模块…”是否清楚（识别为“说到/减速”）。5秒片段来自成片解码PCM，不重新配音。

成片SHA256与总attempts38保持，无项目/渲染/供应商改动。真实读音、自然表达和人工同步仍需要实际播放审阅，不依据ASR结果自动改稿或重配音。

### RAG逐场景自动时序/动作窗口检查完成（人工听检仍待确认）

校正版9段配音缓存checksum/原稿对齐通过，30动作、68字幕与原供应商词时间戳重新计算完全一致；相对词时间戳的帧量化偏差最大0.031667秒，未发现cue从供应商词中间开始。实际MP4共60个动作前/后帧，30个窗口均检测到图形区域变化（排除字幕/页眉）；6对代表帧人工图像抽检未见明显错序/裁切。此检测不识别具体目标或实际读音，不能据此宣称人工0.5秒语义同步通过。

同输出目录`timing-audit.json`、`action-window-contact-sheet.png`与`human-review-checklist.md`；30动作时间/原文已列出，所有人工复选框保持未勾选。核对原项目revision15、校正版revision1、视频SHA256、总attempts38均不变，无模型/配音/渲染或项目改动。FFmpeg新版移除-vsync导致首次抽帧命令失败，改为-fps_mode passthrough后完成，未改成片。下一步需要实际播放的人审：读音、表达、镜头衔接及0.5秒同步，不再重复自动检查冒充验收。

### RAG开场校正版已导出（原版保留，无新增模型/配音）

按批准方案，导入独立校正版项目`0a4dc12e-1c35-41ea-a8fd-61b3bb40ca8c`，只改首元素cue与该标题动画start_frame：334→15（11.133→0.5秒，与首句字幕同帧）。原项目revision15及原MP4保留，其余DSL字段/九段音频资产不变；严格final_valid和回读断言通过，不绕过编辑只读/needs_timing保护。

一次本地render成功，总attempts37→38。成片`output/full-rag-opening-corrected-20261012-185336/rag-course.mp4`，字幕`rag-course.srt`；4930帧/1080p/30fps/164.352秒，全片解码与下载checksum通过。字幕逐字节相同，AAC音频流和解码PCM的SHA256均与原版一致。`opening-before-after.png`抽检1秒/5秒/11.933秒：校正版开场已有标题，无新增明显裁切/重叠；`receipt.json`、`media-verification.json`保存证据。

没有新模型、配音、重试、依赖或产品代码改变；未重跑未变代码测试/构建。仅修正已确认开场问题，不宣称完成全片人耳听检或人工0.5秒语义同步验收，既有供应商账单仍未核对。实施记录`docs/superpowers/plans/2026-10-12-rag-opening-correction.md`。

### RAG本地MP4/SRT已导出（原版曾发现开场节奏问题）

独立授权本地导出后，冻结revision15快照并仅提交1个snapshot-render:1任务，一次succeeded；总attempts36→37，本项目1generate+9voice+1render，无重新分镜/配音/重试。下载MP4/SRT的SHA256与发布结果一致，原稿与项目revision不变。

视频`output/full-rag-export-20261012-183518/rag-course.mp4`（1920×1080，30fps，4930帧，164.352秒，H.264/AAC，8,674,610字节），字幕`rag-course.srt`（68段）。全片解码通过、字幕时序有序；音轨mean -24.8dBFS/max -9.6dBFS，无超过1.5秒的-40dBFS静音。18张抽帧接触表`contact-sheet.png`未见明显裁切或重叠，但开场首图形11.133秒才出现，前段只有字幕，需复核教学节奏。`media-review.json`、`receipt.json`记录技术/抽样检查，不冒充人工全片听检或0.5秒同步验收。

未改生产代码或重跑未变代码测试/网页构建；无供应商新增调用，实际配音/模型账单仍未核对。下一步可复用现有配音免费调整开场再本地导出，或先人工播放审阅，未自动修改开场。

### RAG完整课程配音：9场景成功（随后已本地导出）

用户明确授权最多9个场景逐一配音，全部9个native-voice:1任务succeeded、各attempts=1、attached=true。项目修订号6→15、全部ready；原816码点与校对后的元素/标签/cue保持。时间线4930帧/30fps=164.333秒（约2分44秒），9段纯音频合计160.584秒，差额为既有镜头余量，不人为填满时长。9个本地WAV checksum及ffprobe时长/声道核验通过。本项目1generate+9voice，总attempts27→36，无重试、重新生成或导出。

记录`output/full-rag-voice-20261012-182524/receipt.json`，规范DSL`dsl-after-voice.json`、`project-after-voice.json`、`audio-verification.json`。第1配音任务本身成功，记录脚本曾误读audio_id（规范字段audio_asset_id），只读定位后继续剩余8个，未重复付费配音；错误已保留为operator_check_incidents。

未改产品代码/未重跑未变代码测试或网页构建；未创建导出快照或render任务，未听检/截图/0.5秒同步验收，实际账单未核对。后续已本地导出（见上），人工声画检查和开场节奏验收仍待完成，不把ready状态当作最终课程验收。

### RAG新引用协议：单次真实分镜成功（随后已配音）

明确授权仅一次生成后，新任务`teaching-outline:2`一次succeeded，发布9个场景（4个流程图、3个卡片序列、1个标题、1个对比面板）。原816码点文稿与SHA256不变；全部needs_voice，存储cue已还原为规范数字区间，不残留quote/source_part_ids。总attempts从26到27，本项目仅1个generate，无配音/导出/重试。

记录`output/full-rag-attempt4-20261012-175407/receipt.json`，规范草稿`draft.json`，只读初审`draft-review.json`；工作台项目ID`f63fb494-f4d0-4054-b109-48c06b275689`。结构通过不等于教学验收：第3/4/5场景有节点cue晚于初次概念引入，第8场景右侧说明cue早于标题，后续已免费人工校对4场景7个cue，走现有候选修订/采纳而非绕过只读保护。原口播、标签、ID、布局配对及其他字段不变，项目修订号2→6，全部仍needs_voice，总attempts仍27。原始草稿/初审保留；最新`draft-corrected.json`、校对回执`cue-review-correction.json`。这些修正只验证文本定位与顺序，不等于真实声画验收。示例答案的“未拆封”条件与无依据分支保持。没有测配音时长、渲染或声画同步，实际账单未核对；后续已按独立授权完成9场景配音，见上；不继续生成试错。

### 原文短语定位cue（新协议，离线验证完成）

新分镜请求只接受`cue:{"quote":"原文短语"}`，在原样恢复的当前场景口播中精确且唯一匹配，再由程序计算Unicode码点`[text_start,text_end)`。短语不存在、重复（含重叠匹配）或仅空白均拒绝；不归一化、不猜首个重复、不clamp，也不接受新响应回退到数字偏移。原稿、最终DSL、配音和既有快照不变。

新任务版本为`teaching-outline:2`/`scene-candidate:2`，去重区分版本，旧v1冻结任务继续使用旧适配器，旧有效草稿仍严格兼容。引用失败仅公开固定原因`quote_blank`/`quote_not_found`/`quote_ambiguous`和场景元素路径，不保存引用内容或数值偏移。

新鲜106项离线、70项临时PostgreSQL/API/任务集成通过；覆盖中文/emoji/CRLF/组合字符、场景局部性、重复/重叠、单场景重生成、输入不变、旧版本及去重。首次集成跑失败源于新增测试的排队任务未纳入清理，已修正测试清理范围并全量重跑通过，未改队列逻辑。无新增收费调用、依赖、迁移或用户数据库写入；现有API/workflow已在空闲时重启加载新协议，beat恢复；API ready、网页HTTP 200和workflow/render ping通过，总attempts仍为26，无新增执行。激活记录`output/workbench/quoted-cue-activation.json`。未改网页或重跑构建。模型仍可能给出不存在/重复的引用；随后已单次验证RAG分镜成功（见上），但完整课程与教学声画验收仍未完成。设计与实施记录`docs/superpowers/specs/2026-10-12-quoted-cue-design.md`、`docs/superpowers/plans/2026-10-12-quoted-cue-plan.md`。

### 安全cue诊断（离线验证完成）

`storyboard_invalid_cue`现在可附带`error.cue_error`，仅含场景/元素路径和固定原因。例如`{"path":"/scenes/0/elements/0/cue","reason":"out_of_bounds"}`。原因限定为空/反向区间、越过场景末尾、仅空白；ProviderError、子进程、任务/attempt持久化及HTTP结果贯通，父进程重新白名单过滤，不保存原文、标签、模型ID或数值偏移。既有严格校验与不自动重试规则不变。

新鲜97项离线测试及68项临时PostgreSQL/API/任务集成测试通过；无新增收费调用、依赖或数据库迁移。现有API/workflow worker已在任务空闲时重启加载cue诊断，beat已恢复；API ready、网页HTTP 200、workflow/render ping通过，任务尝试数保持25，无新增执行。激活记录`output/workbench/cue-diagnostics-activation.json`。未改网页或重跑网页构建。只修复未来失败的安全定位，上次实际cue错误无法恢复，不能宣称RAG生成已修复。见`docs/superpowers/plans/2026-10-12-safe-cue-diagnostics.md`。

### 安全结构诊断（离线验证完成）

经确认，`storyboard_schema_error`现可附带最多3条`error.schema_errors`，每条仅含公开Schema字段路径与规则类型，如`{"path":"/scenes/0/type","rule":"enum"}`。校验→ProviderError→子进程→任务/attempt持久化→HTTP结果贯通；未知属性名截断，附带message/原始值丢弃，父进程再次过滤。不能取得安全诊断时保留通用失败，不让无效分镜通过。

94项离线Python与66项临时PostgreSQL/API/任务集成测试通过，包含缺字段、类型/枚举/额外字段、秘密字段过滤、子进程与HTTP持久化边界。无新依赖、数据库迁移、文稿/Schema放宽或付费请求；仍不可直接付费retry。历史RAG错误无法补回，不代表实际模型问题已修复。现有API/workflow worker已在任务空闲时重启加载新代码，beat已恢复；API健康、网页HTTP 200及workflow/render worker ping通过，任务尝试数仍为24，无新增执行。未改网页，未重跑网页构建。见`docs/superpowers/plans/2026-10-12-safe-schema-diagnostics.md`。

### 完整教学短课（第一阶段）

以讲清楚为准，通常2–3分钟，真实配音装配后最长300秒；不靠慢放、扩写短稿或重复卡片凑时长。共享分镜提示已去掉固定5场景倾向，改为按教学动作/认知段落拆分（最多20）；强调取值和累加分别定位cue，以及AI回答保留依据中的适用条件。原文保持、短稿、单场景重生成和现有协议均兼容。

两份可校对的完整口播：
- `examples/lessons/full/python-loop.txt`：Python循环、逐轮状态、错误初始化和空列表。
- `examples/lessons/full/rag.txt`：问题/文档/索引/检索/上下文/答案条件/无依据与安全边界。

将txt全文贴入工作台文稿输入即可走现有流程。核查表在 `examples/lessons/full/README.md`；这只是文稿和生成规则，不是已生成的2–3分钟视频，字数不能证明时长。未新增付费调用，模型指令仍需真实生成后人工复核。对比面板及数组/对象/栈状态图已实现，执行时间线也已实现，分镜确认和基础表单也已实现；完整长课真实生成与人工教学验收仍待完成。

### 两个真实付费教学案例（已跑通）

本轮按用户确认只验证Python循环累加与RAG，不批量调用20组。真实DeepSeek分镜、原生TTS2配音、PostgreSQL/Redis/Celery双队列、RustFS、HTTP编辑保存重开及快照导出通过。每例5个场景，10个配音任务及两个导出任务均一次执行成功；编辑标签不重新配音，演示编辑后恢复原标签再导出。

首次闭环产物目录 `output/paid-teaching-pair-20261010-145916/`（原始结果保留，推荐播放下方复核版）：
- `python-sum/video.mp4`：622帧、20.736秒，代码高亮、变量及输出5；同目录SRT、最终DSL、版本/任务报告和code-preview.png。
- `rag/video.mp4`：959帧、31.979秒，检索/提示构建/回答来源与无依据处理；同目录SRT、最终DSL、版本/任务报告和flow-preview.png。

联调发现配音worker给草稿误加schema_version，导致真实草稿校验失败且尚未调用TTS；修复共享入口并增加真实校验回归。Python复用首次已付费生成的分镜，没有重复调用模型；RAG本轮完整生成后直接配音导出。未自动重试失败付费任务；实际费用以供应商账单为准。执行用自有临时容器并已清理，交付物和真实音频保留。本次编辑通过真实API验证，不额外声称新一轮浏览器全流程或0.5秒同步听检通过；代表帧已检查，全面教学验收仍待人工审核。

### 当前本机的持久工作台

已启动并导入两个复核案例：访问 **http://127.0.0.1:3000**，在项目列表选择Python或RAG。两例已重新冻结导出，持久任务中可下载MP4/字幕；口播、代码和步骤可在右栏编辑。本次只复用已有配音并渲染，不产生新的模型/配音请求。

本机服务使用compose project `aicreater-workbench`：PostgreSQL15432、Redis16379、RustFS19000、API8000及Next.js3000均回环绑定。私有随机凭据保存在已忽略的`.env.local-services`（0600），原`.env`未改；不要删除该配置或将它发到聊天/提交版本库。项目、对象和队列用named volume持久化，应用进程暂未做系统开机自启。

进程/项目/导出ID见`output/workbench/services.json`，日志在同目录。若应用退出，先`set -a; source .env.local-services; set +a`，再按上文启动API、workflow/render worker、beat与web；**先检查端口/进程，不要重复启动**。数据库服务可用`docker compose --project-name aicreater-workbench --env-file .env.local-services -f compose.postgres.yaml -f compose.storage.yaml up -d --wait`恢复。停止数据库时用同样compose参数执行`down`，不要添加`-v`；应用进程另行检查停止。

后续点击生成/配音仍会调用原`.env`配置的收费服务；本机服务运行本身不自动发起它们。浏览器已验证两个项目、ready场景、编辑表单、预览控件和RAG正确任务的字幕下载；这不替代同步听检。

### 两例教学画面复核（不再计费）

提取原视频72张关键帧，检查10个场景概览及修复后的重点帧。发现模型把“取出数字”和“累加”放进同一cue，Python累加高亮比对应讲解提前26帧（约0.87s）；复用原生字词时间修正scene3/4，累加改为第73/74帧，取值改为47/48帧。RAG回答标签补回“未拆封”条件，并缩短文字避免单字换行。

推荐播放：
- `output/teaching-reviewed-20261010/python-sum/video.mp4`
- `output/teaching-reviewed-20261010/rag-readable/video.mp4`

同目录有最终DSL、SRT、review.json和修后截图；原视频及全部审核关键帧保留在原目录visual-audit/。重新导出通过协议/资产/1080P/帧数/音频检查，配音、口播和字幕未改且没有付费调用。修正是对这两份交付物的人审调整，**不是自动生成器已消除所有语义错误**；原生时间一致性不等于0.5秒实际听检通过。详见 `docs/teaching-visual-review.md`。

### 20组编程/AI教学验收

固定输入与人工检查要点在 `examples/acceptance/cases.json`：8组Python/JavaScript/TypeScript教学、12组AI教学，覆盖循环重复行、分支、函数、变量输出、RAG无依据分支、Agent授权、Token/emoji、中英数字标点及不同长度。

固定20组清单的6处旧bullet_cards已统一为实际card_sequence，检查器模板名直接取Schema，18/20标准不变。123离线Python回归通过；重新检查既有交付物仍2/20通过、18组缺失，正式pending，不新增收费或伪计成功。报告`output/acceptance-template-fix-20261013-111629/report.json`。

每组已生成的交付物按 `<results>/<case-id>/project.json、video.mp4、video.srt` 放置；project.json是最终DSL（可从不可变版本的dsl字段保存），不是draft或API整个版本响应。音频仍须可在renderer/public校验，缺失缓存应先通过资产API恢复。

```bash
npm run check:teaching -- --results output/teaching-results --report output/teaching-check-new.json
```

该命令**不生成视频、不调用供应商、不执行代码**。复用生产校验器检查原稿不变、教学模板/编程语言、资产、1080P/30FPS视频帧数时长和快照SRT；缺失/非法交付物计为失败，报告不能覆盖旧文件。20组中至少18组结构通过才退出0，但报告formal_acceptance始终pending：真实供应商来源、端到端900s、截图/事实核查及0.5s同步听检仍需单独验收，不能靠自报耗时或此报告证明。

已用既有RustFS真实Python/RAG交付物复跑：2组结构通过、18组缺失，整体未通过；报告 `output/teaching-acceptance-check-20261010-143740/report.json`。这不是20组视频验收完成，后续真实批量生成需另行确认费用预算。

### 私有RustFS/S3兼容存储（已完成本地真实联调）

执行 `pip install -r requirements.txt`，在本地 `.env` 配置 `.env.example` 中的 `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`（保留配置名以兼容S3客户端，不部署旧MinIO服务）。设置唯一access key和强随机secret（可在本地执行 `openssl rand -hex 32`，不要发送到聊天），使用 `MINIO_ENDPOINT=http://127.0.0.1:19000` 后启动：

```bash
docker compose -f compose.storage.yaml up -d
# 查看回环健康端点，不输出凭据：
curl --fail http://127.0.0.1:19000/health
```

然后重启API与Celery消费者，使它们读取本地S3配置。镜像固定RustFS1.0.1及sha256摘要，Apache-2.0，非root、仅发布回环19000，控制台关闭，named volume持久化。ENDPOINT留空保持原本地模式；配置后存储失败会阻止成功发布，不静默降级。HTTP只允许回环/minio，远程需HTTPS。桶默认私有且不得存在bucket policy；外部S3的IAM、ACL和账户级public-access-block需另行检查，尚未验收。

音频和MP4/SRT按sha256+扩展名存为不可变对象。上传先封存/校验；本地缓存缺失时限额下载、核对sha256后原子恢复，已有损坏缓存拒绝而不覆盖。浏览器继续使用项目资产/任务下载API，不获取存储密钥或对象URL；Node/供应商子进程不接收MINIO/RUSTFS存储环境变量。已引用音频在导入、冻结版本及渲染验证时上传，旧导出不会自动批量迁移。未引用对象暂不GC，需预留存储空间。

已按确认从归档的旧MinIO社区服务改用RustFS；官方仓库未归档，1.0.1镜像已实拉取，客户端仍用未归档的minio-py S3 SDK。真实RustFS+PostgreSQL+Redis+API+Celery双队列已验证Python/RAG教学导出，匿名对象GET返回403，删除音频及导出缓存后按sha256恢复。另验证了compose容器删除重建后named volume仍保留对象、6MiB multipart上传和恢复。没有付费调用或商业AIStor许可依赖；仍不代表集群HA、外部S3/IAM或生产容量验收。

可在空闲8000上复跑隔离验收；脚本创建自有RustFS/数据库/Redis，复制样例音频到自有缓存、删除缓存验证恢复，不改用户原音频，结束清理自有容器/进程。输出目录必须是新的：

```bash
npm run test:queue -- --rustfs --project output/python-sum-project-v2.json --output output/rustfs-python-check-new
npm run test:queue -- --rustfs --project output/rag-project-v2.json --output output/rustfs-rag-check-new
```

已验证产物 `output/queue-rustfs-python/teaching.mp4`（512帧/17.067s）、`output/queue-rustfs-rag/teaching.mp4`（879帧/29.312s），同目录有SRT/报告。`--minio --minio-image`仅保留为已有受信私有镜像的兼容入口，不作为默认部署。

### 真实队列教学渲染回归（不调用付费服务）

```bash
# 需要Docker、已安装依赖/FFmpeg，以及已有最终DSL和对应本地音频。
# 8000必须空闲；脚本不停止已有用户服务。输出目录必须是新的。
npm run test:queue -- --project output/python-sum-project-v2.json --output output/queue-check-python-new
npm run test:queue -- --project output/rag-project-v2.json --output output/queue-check-rag-new
```

脚本使用自有随机临时PostgreSQL/Redis，启动真实API、Celery workflow/render消费者及beat；通过HTTP导入教学样例、冻结版本、提交渲染，观察queued→running→succeeded、检查下载校验和及1080P/H.264/AAC/帧数/时长。渲染期间修改场景并断言冻结DSL/导出不变；验证重复提交去重，以及排队生成任务取消后attempt仍为0。禁用供应商凭据、不执行付费任务，结束清理自有进程/容器/中间产物，不读取用户数据库。

实测产物：`output/queue-smoke-python-v2/teaching.mp4`（512帧、17.067s）和 `output/queue-smoke-rag-v2/teaching.mp4`（879帧、29.312s）；同目录有SRT和`report.json`。这只证明真实教学渲染队列，不代表付费生成/配音全链路或教学内容正确性已验收。

### 重生成 Worker 联调（会调用收费 LLM）

```bash
# 只消费一个已排队任务；无任务返回 idle。
python3 -m services.workflow.worker --once
# 为现有场景提交任务并消费一个排队任务；ID/revision 从项目查询获得。
python3 -m services.workflow.worker --once --scene-id SCENE_UUID --revision 1
```

这是本地调试入口；正常调度使用上面的常驻 Celery worker/beat。复用 `.env` 的 DATABASE_URL / DEEPSEEK_API_KEY / DEEPSEEK_MODEL；模型、原场景、base_revision 在提交时冻结，密钥不进入快照。分镜子进程预算120s、voice预算240s、render预算840s，10s心跳；macOS/Linux取消时先终止包含FFmpeg的进程组，Windows未验证；最终候选和任务成功在同一事务发布，旧attempt不能写入。场景重生成只改变待确认候选；首次generate仅在项目仍为空且版本一致时附着初稿。两者均不执行教学代码或同步生成配音；配音通过独立voice任务运行，子进程不接收DeepSeek密钥。缺失/无效凭据是可显式重试的configuration错误；修正.env后需重启worker。Worker丢失后的显式重试仍可能重复计费。

## 使用自己的最终 DSL

把音频放在 `apps/renderer/public/` 内，例如 `audio/scene_1.wav`；DSL 的 storage_key 对应 `audio/scene_1.wav`，不是绝对路径或 URL。复制示例结构修改，并更新真实音频的 checksum 与 duration_ms。

```bash
python3 packages/video-schema/validate.py examples/demo.json
npm run render -- path/to/project.json output/custom.mp4
```

Python CLI 只检查 DSL，不检查磁盘上的音频；导出 CLI 还会核验真实资产。非法 JSON、未知字段、未来 Schema、无效引用、循环流程、cue 越界、字幕重叠、超长内容均拒绝。

时间轴使用场景局部帧号；字幕区间为 `[start_frame,end_frame)`，全片偏移由导出器计算。前后各留 6 帧；场景时长必须为 `ceil(duration_ms × 30 / 1000) + 12`。cue 区间按 Unicode 码点计数，不是 JavaScript UTF-16 下标。

Studio 直接预览输入 props，不代替完整导出前的资产核验。仅在可信本机使用，不暴露公网。为限制网络绑定，`scripts/loopback.cjs` 使用了固定版本 Remotion 的内部配置 API；升级依赖时必须重新跑回环配置测试和实际监听检查。

## 目录

```text
apps/web/                  Next.js教学工作台、Player、场景编辑与任务面板
apps/renderer/             Composition、本地导出、媒体核验、字幕
packages/video-schema/     Schema、生成类型、双语言验证与测试
packages/video-components/ 八类教学模板、布局和纯帧运动
scripts/                   示例配音、类型生成、回环绑定
services/                  Python 供应商适配、分镜、时间规划、本地 CLI 和测试
examples/                  运行 demo:create 后生成的示例
output/                    本地视频与截图（忽略版本管理）
docs/                      架构、开发契约、阶段计划
```

修改 Schema 后运行 `npm run schema:types`；不手改 `packages/video-schema/src/types.ts`。

## 只读导出结果查询

`GET /api/renders/{render_job_id}`复用现有导出任务，返回公开状态与`downloads`。成功时提供固定MP4/SRT地址及已发布SHA256；其他状态downloads为空，非render/未知ID404，发布校验值不完整422。查询只读Jobs.get，不恢复/提交/重试任务，不读文件或调用存储；下载仍由原files接口实际校验，元数据不保证文件此刻在磁盘。

新接口5项红绿测试、120离线Python+77临时PostgreSQL/API/jobs通过。空闲时仅API重启，已有成功导出真实查询返回2下载项，jobs/attempts均44→44，无模型/配音/渲染任务。`output/workbench/render-info-qa/{receipt.json,info.json}`留证。未改前端/worker/schema/数据库，未重复跑未变Node/build，无新依赖；只自审，无Git元数据。

## 已配音单场景预览

`POST /api/scenes/{id}/preview`携带expected_revision，仅ready场景。冻结选中场景、原音频及当前profile到job.input的scene-preview:1，复用render队列/幂等/取消/attempt fence；不写普通project_versions或改项目。成功结果包含scene_id/scene_revision/snapshot_checksum和下载checksum，不返回假version_id。jobs/renders查询标记scope=scene，files仍走安全校验；未知渲染协议拒绝。

网页“预览本场景（本地渲染）”仅已保存ready启用，保留既有Player。其他场景未配音不阻塞，任务列表区分预览与整课，本地render重试不提示模型/配音收费。120离线Python/81临时PostgreSQL/156Node/typecheck/web build通过。浏览器独立副本（其他场景needs_voice）一次成功，18.752秒/562帧/1080p/30fps/8字幕；checksum/全片解码/冻结checksum/原音频/原项目不变、无普通版本记录核对通过，attempts44→45仅render。证据与样片`output/workbench/scene-preview-qa/{preview.mp4,preview.srt,receipt.json,workbench.png}`。

没有新表/SQL/队列/依赖/模型或配音调用，API/render/beat已空闲刷新；无Git元数据/独立委派审查。初次新增API测试遗漏取消干扰共享队列、版本计数未限定项目，修正测试后重跑81通过，未放松生产队列；抽帧-ss .5改0.5无重提。浏览器Tabbit注入html属性产生开发态hydration警告，已定位，不用suppressHydrationWarning隐藏。needs_voice/needs_timing/资产不可用明确拒绝；视频编号1/1仅代表预览范围，渲染仍占用本地资源。

## 明确主题的自动开场预告

Element可选`role:"topic"`，仅title_reveal/card_sequence、每场景最多1个，不能携带代码/变量/输出/状态/事件结构；Python/TS校验一致。共享time_scene只让该主题从frame6/duration1出现（0.233秒完整可见），普通计算结果/流程仍按原cue，原文/词时间戳/配音/字幕不改。模型提示明确主题不应是待揭示答案，网页标记只读，角色变更须候选确认并免费重算，不能借保存绕过。

115离线Python、77临时PostgreSQL、155Node、typecheck/web build通过，API/workflow/render/beat已空闲重启同版Schema。独立验证副本把晚cue标题从278帧重算到6帧，其他动画25/90帧未变；实际0.5秒有主题、2.6秒无结果、3.6秒有=5。一次timing+一次本地render，attempts42→44，无模型/配音；AAC/PCM/SRT与原版一致，原项目revision1及冻结版本未改。证据与成片`output/workbench/topic-opening-qa/{receipt.json,preview.mp4,preview.srt}`。

无标记旧数据不擅自提前，不能保证任何模板/模型输出都不空白；主题自然语言是否泄露答案仍需人审。没有新模板/依赖或修改验收原件，nums读音继续暂缓，未委派独立审查/无Git元数据。

## 本地时间轴重算（不重新配音）

`POST /api/scenes/{id}/timing`，`expected_revision`，支持ready/needs_timing，冻结音频asset与词侧车SHA256。复用align_words/time_scene、既有持久任务与发布保护；缓存缺失、篡改、越界或原文不匹配明确失败，绝不转收费配音。子进程不带模型/语音密钥或HTTP客户端，发布不下载/上传音频，修改原稿后的needs_voice仍需明确授权配音。重复任务幂等，过期结果不附着，取消/旧attempt不发布。

网页独立“配音（收费）”和“重算时间轴（不重新配音）”，后者会替换动画/字幕时间，不改变声音，仍需保存并核对当前场景。112离线Python、76临时PostgreSQL、141Node、typecheck和web build通过。API/workflow已空闲重启，浏览器一次真实点击在独立副本needs_timing→ready，9音频checksum和其他场景不变；原验收项目/冻结版本保留，attempts41→42仅新增本地timing，无模型/配音/渲染调用。记录`output/workbench/local-timing-qa/receipt.json`和`workbench.png`。

限制：只有本机已有原WAV/词侧车可重算，导入外部音频或丢失侧车会失败，不造词时间戳；局部手动动画/字幕时间会被重新计算覆盖。nums读音/全局开场策略/20组验收未扩，独立审查未委派，当前目录无Git元数据。

## 后续与边界

最新两份课程画面交付已获用户确认，Python nums读音按要求暂缓；20组及量化同步、账单/许可仍未完成。已补只用保存音频/词时戳的独立重算入口，避免改cue后恢复对齐再次配音收费；缺缓存不会自动转收费。详细缺口与待确认范围：[docs/mvp-follow-up.md](docs/mvp-follow-up.md)。

第二阶段已实测 DeepSeek + TTS 2.0（seed-tts-2.0 / zh_female_vv_uranus_bigtts）原生字幕的完整短文案链路。示例 `output/native-video-v2.mp4` / `.srt` 为 5 场景、747 帧、约 24.917s、1080P/30FPS、H.264/AAC；字幕按短句组合，抽查了五个场景截图。此样例不等于完整 MVP 验收。第三阶段已接 PostgreSQL 项目仓库、版本冲突、口播失效和不可变快照；已接 FastAPI 与显式候选接受；已有Celery/Redis调度、首次教学分镜及场景候选生成；已接单场景配音恢复和不可变版本渲染/下载；已接Next.js本地教学编辑器；私有RustFS/S3兼容存储及本地真实恢复联调已完成；完整课程验收仍待完成。

当前有 PostgreSQL 仓库、本地 CLI、HTTP 编辑/重生成任务接口与 Celery/Redis 调度，以及Next.js本地教学编辑器；已验证一个真实自动分镜样例、两个维护的教学样例及短句，未进行 20 组完整 MVP 验收、人工语音听检或 0.5 秒同步精度验收。字体来自 `@fontsource/noto-sans-sc`，许可随依赖保留；Remotion 和系统语音的商业使用条件需按实际用途另外核对。

## 视觉B：用户确认的数据图

新增`data_chart`：柱状、折线、比例、矩阵四种原生SVG图，共用视觉A三主题，保留旧兼容主题。不新增图表库/SQL，不由模型填数或替换；后台恢复/候选/生成发布也阻止模型chart。

在工作台选场景→“配置图表”→录入/粘贴JSON，填写`chart:{kind,title,unit,source_note,confirmed,data:[{element_id,label,values}]}`及原稿内合法cue的`elements`，矩阵另填`columns`→核对来源/数值/行列/触发→勾选→保存。空模板没有示例数字，不会自动确认。`PATCH /api/scenes/{id}/chart`还需`expected_revision`、严格`confirmed:true`；不接受修改口播/资产的字段。转换或绑定变化需本地重算，缺词缓存明确失败而非配音；仅同elements的数据修改保留ready与时序，旧快照不改。

首版单系列1–6行、矩阵最多6×6、标签≤8/标题≤24/来源≤32Unicode码点、有限数字0–10亿（非bool）。每行与元素同序一一引用；line至少2点，比例总量必须正数。比例整体在所有cue入场完成后展示，百分比明确两位四舍五入；原始数字不拆位/取整，零柱不伪造最小高度，太宽报布局错误。未支持负数、多系列、CSV/文件导入、AI自动提取或来源事实核验，JSON仅结构化手工粘贴。

129离线Python、86临时PG/API/jobs、172Node、typecheck/production build通过。浏览器独立已配音副本确认四种图并进行1次免费timing、4次preview；自审发现大数换行后红绿修复，另1次深色5×6长标签/10亿边界preview。48→54attempts仅1timing+5render；所有MP4/SRT SHA、冻结数据、原9音频/词缓存/原交付物/旧version核对，五片解码音频一致，和原WAV按6帧对齐相关性0.9999587，未调用模型/配音。证据`output/workbench/visual-B-qa/`。

**该预览使用明确标记的合成数据与原RAG音轨，只验组件/时间触发/音轨复用，不冒称数字口播对应或真实实验验收。** 完整图表课程、全部主题/6×6最大行数实测仍待后续；当时C未实现，现见下节。20组收费验收与nums修正继续暂停。

## 视觉C：代码与教学状态同屏

code_walkthrough可选`code.array_name`（1–8可见码点）启用新布局；不填保持旧布局。左侧16行/48显示单位代码、30px高亮，右侧当前数组/指针、变量及输入输出，按原cue完整切换，随机seek不累积，不提前出现输出，不执行代码。六步维护例稿`examples/lessons/code-state.json`包含枚举索引与循环结束后保留i值，指针是独立字段。

新布局每一步明确填写`array_items:[{id,key,value}]`（最多6项，key从0连续，ID唯一，value≤8码点）、`pointers:[{name,item_id}]`（最多2个，name≤6且唯一，仅引用当前项）、`loop:null|{current,total}`（整数1≤current≤total≤100万）、`input`（≤44码点）。变量最多3个、name≤6/value≤8，output≤44、步骤标题≤20；可见纯文本，不解析数值或计算结果。两个指针可指向同一项，清除指针不清变量，空数组明确显示。ASCII短数字/列表保持整行，其他长值安全换行，不截断。

在右栏代码场景勾选“数组 / 指针 / 循环同屏（不执行代码）”，填数组名，各步JSON明确填写四个新字段。启用只建立空快照，不造示例结果；停用需确认清除新字段，保留代码/变量/输出。无效JSON阻止保存/切换，输入保留；高级JSON与原表单同源，后端Schema、revision冲突和资产检查仍为最终裁决。字段通过原候选/恢复/配音/timing/冻结链路保留；未新增API/表/依赖。

131离线Python、87独立临时PG/API/jobs、181Node、typecheck及web生产构建通过。真实浏览器检查编辑/保存、非法输入保护、16行48单位/6项/2指针/长文本边界；发现ASCII被拆位、数组索引和输出靠近边框后红绿校准，最终DOM证明三卡内容包含在边界内。独立11场景Python副本只补七个代码布局，不改原口播/音频/词缓存/动画/字幕，三主题各一次本地preview，均350帧/11.669秒/1080P30且attempt1。54→57仅3render，MP4/SRT SHA和冻结字段检查、三段解码音轨一致、原WAV按6帧起点相关性0.9999608；原项目/已交付视频/音频/缓存/旧快照哈希不变。证据`output/workbench/visual-C-qa/receipt.json`、`render-verification.json`、三主题MP4/SRT和关键帧。

仅教学快照，不是沙箱或事实自动核验。示例用已存在Python音轨，未新增模型/配音/重试；nums读音、20组收费回归及全片人耳0.5秒同步仍暂停/未验收。仅自审，无独立委派/Git提交。三主题样例实际验第一轮取值场景，不冒充全片每状态/每组合重渲染。完整课程模式可在工作台QA副本预览；原课程不会自动升级。

后续用户继续后，已冻结副本revision17并完成一次**完整C彩色课**：`output/workbench/visual-C-full/python-full-C.mp4`（11章/7代码章、4783帧/159.445秒、1920×1080/30fps）及同名SRT。57→58只增1本地render/attempt1，不增模型/配音/timing/重试；新version是正常整课版本，QA当前项目也未改。视频下载SHA核对，字幕和原全课逐字节相同、整轨解码PCM也逐字节相同，原项目/已交付文件/缓存/旧version哈希不变。`chapters.json`列章节/状态时间点；关键帧自审确认两轮指针0→1、total0→2→5、末章stdout5且n仍3，未执行代码。全课仅彩色主题，其他主题仍短片验证；首cue前等待面板保留，不用后续状态填充。未新增人耳/逐帧/0.5秒验收，待用户播放反馈。证据`output/workbench/visual-C-full/verification.json`。

开发契约：[docs/MVP开发契约.md](docs/MVP开发契约.md)。
