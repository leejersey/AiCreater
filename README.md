# AiCreater

面向**中文知识教学**的图解视频平台。输入教学文稿，自动生成旁白驱动的知识讲解视频（MP4 + SRT）。

已用真实 DeepSeek + 火山 TTS 2.0 跑通完整教学链路，产出 Python 循环累加（2 分 39 秒）和 RAG 检索增强（2 分 44 秒）两门完整课程。当前不是完整 MVP；20 组批量验收和人工同步听检尚未完成。

## 核心能力

- **9 种教学表达**：通用概念解释、标题卡片、逐步卡片、无环流程图、代码讲解、教学对比、数据结构状态图、执行时间线、数据图表；concept手工创建/编辑已在原工作台启用，真实模型生成整课证据仍集中于编程与AI。
- **通用concept**：定义主卡＋特征/例证/总结支持卡，严格绑定cue原文，不凑事实或提前揭示。手工概念入口与角色编辑已在本机原工作台启用，实际浏览器验收创建、草稿恢复、角色保存/重开、旧卡片兼容与重排。验收项目清理后原数据/媒体不变，零任务/收费。真实模型选型、供应商配音、事实审校与听检仍未验收。[用法](docs/getting-started.md#手工概念场景本机已启用)/[原环境证据](output/workbench/concept-activation/receipt.json)/[原模板契约](docs/teaching-templates.md#10-通用概念解释-concept)。
- **视觉风格选择与冻结（本机已启用）**：原版 / 白板线稿 / 现代极简 / **纸质幻灯** 覆盖9类场景，独立于配色；保存后更新预览而不重新配音。纸质幻灯建议配浅色教学或彩色信息图主题（系列头、纸纹底、黄高亮、红印章、sticky 胶带）；非法阴影快照会拒预览，需重新保存风格。旧版本/排队任务保留完整风格快照，历史版本继续 legacy。[使用](docs/getting-started.md#工作台风格选择与冻结本机已启用)/[纸质幻灯设计](docs/superpowers/specs/2026-10-20-paper-slide-richness-design.md)/[原生验收](output/workbench/style-selection-activation/receipt.json)/[代码验收](output/workbench/style-selection-qa/receipt.json)。
- **手工流程连线编辑已启用**：现有节点间增删连线、保留原配音，严格无环/版本校验；[代码439项回归](output/workbench/flow-edge-qa/receipt.json)、[实际保存/重开/冲突/预览验收](output/workbench/flow-edge-activation/receipt.json)。工作台项目“流程连线实际保存验收副本（原稿配音不变）”第3章可查看三条连线；未修改原课程或触发配音/导出任务。
- **DeepSeek 自动分镜**：输入纯文本讲稿，AI 拆分场景并选择模板，保持原稿不改写；分镜按讲稿教学动作在现有模板间切换（有材料才换型），不新增组件；预览翻章按模板剪影区分；可选场景 `motif`（`funnel` / `dialogue_split` / `means_row` / `schematic`，非法则 coerce 为 default），须重新生成分镜后才写入；多样性为提示偏好、不因类型过少单独失败。设计见[纸质幻灯丰富度](docs/superpowers/specs/2026-10-20-paper-slide-richness-design.md)、[剪影多样性](docs/superpowers/specs/2026-10-20-scene-silhouette-diversity-design.md)。
- **火山 TTS 2.0 配音**：原生字级时间戳，自动字幕对齐，短句组合可读字幕
- **完整 Pipeline**：文稿 → 分镜 → 配音 → Remotion 渲染 → 1080P/30FPS MP4 + SRT
- **静音画面草稿**：已有分镜的待配音/待对齐章可直接播放画面、定位临时步骤，明确水印与临时时序，不读取旧音轨或派任务，不改正式分镜。已就绪章仍用真实配音；正式冻结导出条件不变。[用法](docs/getting-started.md#静音画面草稿)/[首批验收](output/workbench/ai-director-preview/receipt.json)。AI导演选择解释、局部重生成和确认后全链路串联仍是后续批次。
- **教学工作台**：Next.js 三栏编辑器，场景编辑、候选确认、[任务关联章节定位](docs/getting-started.md#从任务定位章节)、[取消等待确认](docs/getting-started.md#取消任务与确认停止)、[任务筛选](docs/getting-started.md#任务列表筛选)、[发布结果提示](docs/getting-started.md#任务完成与结果应用)、[后台刷新与超时](docs/getting-started.md#后台任务刷新与超时)、[整课原文核对](docs/getting-started.md#整课原文核对)、[已保存全文](docs/getting-started.md#查看已保存全文)、[项目读取恢复](docs/getting-started.md#项目列表与读取恢复)、Remotion Player预览与导出。支持未完成整课时预览已就绪章，并精确定位章首/已保存步骤；定位暂停，不自动播放，轮询不重置。未保存时禁用步骤定位，待配音/对齐章另用上方草稿临时时序；整课导出仍要求全部就绪。324项测试、typecheck、私有构建及12项无mock步骤检查通过。[用法](docs/getting-started.md#章节网页预览与定位)/[步骤验收](output/workbench/step-preview-qa/receipt.json)/[章节验收](output/workbench/chapter-preview-qa/receipt.json)。
- **候选稿可读比较**：接受前查看与已保存稿的变化字段、口播/代码/连线原值，以及步骤内容和触发范围概览；保留完整候选JSON。过期、已接受、跨章节或坏数据不能接受，取消确认不提交。330项测试、typecheck/私有构建、11项无mock只读及4项受控页面检查通过；未接受原候选或调用供应商。[用法](docs/getting-started.md#候选稿确认与差异)/[验收](output/workbench/candidate-review-qa/receipt.json)。
- **候选列表刷新与重试**：失败、超时或坏响应隐藏旧候选，可就地重新读取，保留未保存输入；切章晚响应不串列表，“重新载入”也会重读。334项测试、typecheck/私有构建、9项原生与9项受控检查通过，不自动生成或接受。[验收](output/workbench/candidate-list-qa/receipt.json)。
- **步骤触发位置手工编辑（本机已启用）**：现有步骤可填Unicode码点起止范围并预览原文；仅改cue保留音频、失效旧入场计划并待对齐，需显式本地重算。坏输入、409和刷新保留草稿，不自动配音/派任务。前期571项代码测试与隔离构建通过；本次19项原生API＋6项无mock页面检查通过，只在临时副本实际保存且已清理，原课程/旧版本/媒体/队列不变。消费者与收费试跑未启动。[用法](docs/getting-started.md#步骤触发位置手工编辑本机已启用)/[代码验收](output/workbench/manual-cues-qa/receipt.json)/[原生验收](output/workbench/manual-cues-activation/receipt.json)。
- **执行器响应提示（原工作台已启用）**：分别展示workflow/render队列响应与检查时间，支持手动刷新；失败/超时显示未知，不自动起消费者或改变提交规则。[原生验收](output/workbench/consumer-readiness-activation/receipt.json)/[代码验收](output/workbench/consumer-readiness-qa/receipt.json)。未响应不证明离线，响应不保证任务可执行。
- **提交前费用预估（本机已启用）**：分镜/候选/单章与批量配音及收费重试确认前显示参考金额、数量和官方价格依据；未知不报0元、取消不派任务。估价不是账单或硬扣费上限。[使用说明](docs/getting-started.md#提交前费用参考估算)/[代码验收](output/workbench/cost-estimates-qa/receipt.json)/[原环境验收](output/workbench/cost-estimates-activation/receipt.json)。
- **执行后用量记录（本机已启用）**：每次尝试独立记录供应商token/配音提交字符及冻结参考价；失败/取消不算免费，历史缺失不补账，已知部分和待核实分列。只读手动刷新，不自动对账或实施硬预算。原环境29项API、7项无mock页面检查通过，原58次尝试仅新增usage:null，其余数据/媒体不变，未启动消费者或收费调用。[使用说明](docs/getting-started.md#执行后用量记录本机已启用)/[原生验收](output/workbench/usage-records-activation/receipt.json)。
- **项目音色设置（本机已启用）**：每门课可免费固定公开音色ID，不改全局配置、不自动重配；已有音轨和旧版本保留，新任务按项目音色冻结、旧音色结果不覆盖当前音轨。含本机草稿与409保留输入；不提供付费试听。[使用说明](docs/getting-started.md#项目音色设置本机已启用)/[代码及受控浏览器验收](output/workbench/project-voice-qa/receipt.json)/[原环境验收](output/workbench/project-voice-activation/receipt.json)。
- **本机草稿恢复**：课程文稿、项目音色/视觉风格、场景/代码/原始JSON、图表及新增卡片本地暂存；重开后显式恢复，版本冲突只供复制，不自动写服务器或恢复人工确认。[使用说明](docs/getting-started.md#本机未保存草稿恢复)/[226项测试及浏览器验收](output/workbench/local-draft-qa/receipt.json)。仅同浏览器同地址、不加密；原页面只读加载已验证，无收费或原课修改。
- **整课批量本地对齐（本机接口已加载，执行未验）**：选择已保存/核对的待对齐章节，显式确认后原子登记；缓存/版本校验失败不留半批，不自动重试或配音。580项去重测试及10项受控页面检查通过；原API路由已加载；本轮独立数据库/API和实际子进程已跑通三类非编程场景，对齐不换音轨，坏缓存不留半批。仍未在原数据库或原队列执行、未启动消费者。[用法](docs/getting-started.md#整课批量本地对齐本机接口已加载执行未验)/[代码验收](output/workbench/batch-timing-qa/receipt.json)。
- **整课制作工作流（本机已启用）**：逐章核对后选择批量配音，复用已有任务与有效音频，不自动重试；整课任务数量/错误、导出阻塞与章节定位。[代码测试](output/workbench/course-workflow-qa/receipt.json)/[原课程实际验证](output/workbench/course-workflow-activation/receipt.json)。API/web与回环安全检查通过，配音/渲染消费者未启用，未调用收费服务。
- **场景管理已启用**：手工新增卡片、上移/下移、复制并复用已有音频、确认后归档删除；保留历史与媒体，防止删除活动任务和重试已移除章节。[485项代码回归](output/workbench/scene-management-qa/receipt.json)、[原环境实际保存/重开/快照保留验收](output/workbench/scene-management-activation/receipt.json)。工作台“场景管理实际保存验收副本（不改原课程）”可查看3个活动章节；未修改原课程或触发收费任务。
- **项目管理**：PostgreSQL 版本保护、Celery 双队列任务调度、RustFS 资产存储
- **口播/代码/连线旧新值已启用**：变化摘要中展开字段即可查看同次捕获的旧值与已保存新值；不读取未保存输入，不新增请求、回滚或费用。[367项本轮回归及真实/受控验收](output/workbench/version-field-values-qa/receipt.json)。
- **只读变化摘要已启用**：打开旧版详情，点击“与当前已保存稿比较”；按业务场景ID标出教学内容变化，不计入未保存输入、配音或派生时轴，不回滚。[初版回归/隔离构建及真实验收](output/workbench/version-change-summary-qa/receipt.json)；[草稿异常保护验收](output/workbench/version-compare-response-qa/receipt.json)402项Node/构建及6项页面检查通过，未配音草稿仍可比较。
- **只读版本历史已启用**：在 [工作台](http://localhost:3000) 展开“版本历史（只读）”，每页50条摘要、冻结旧稿/代码/完整场景，时间显示未记录；不回滚或影响当前编辑；支持[读取超时与手动重试](docs/getting-started.md#版本历史读取超时)。445项测试与实际dirty/刷新/受控分页/晚响应验收完成，[新激活记录](output/workbench/version-history-activation/receipt.json)/[预览](output/workbench/version-history-activation/preview.png)。当前浏览器扩展注入html属性触发Next hydration提示已记录，不为掩盖告警改代码/扩展；无新增任务或费用。

## 账号与课程流程（本机账号接口已启用）

已开发真实注册/登录/退出/改密、本人课程列表、免费新建、独立编辑地址及用户草稿隔离；后台覆盖课程、任务、版本、媒体/下载归属，不是登录页面套壳。`/courses/new` 可先同步生成讲稿或手写，核对后再免费确认草稿；生成接口不创建项目/任务、不计入 project_usage。**新建课可选讲解风格「科普 / 知识干货」**（缺省科普）：写入课程后影响同步生成讲稿与后续分镜/候选偏好；改风格不自动重跑已有场景。原位重新登录保留输入、不重发写请求；沿用现有预览/冻结/导出。419 Node＋348原生数据库环境Python测试（767项）及类型检查、私有副本生产构建通过。隔离真实浏览器已验证新根入口、注册、新建/编辑、草稿恢复、会话过期续编及改密；双账号完整UI/退出/前进后退链仍待补验，不能用后端隔离通过冒充全部页面通过。

**原8000现已启用账号认证**。针对未登录不跳转的反馈，移除404匿名回退，备份后受控重载原API/web；未登录首页/课程页真实浏览器跳转登录，接口401，缺账号接口只报错而不开放编辑器。本机开发改用已有webpack以避免Turbopack反复刷新。新增回归先红后绿，420 Node及类型检查通过。25门旧课数据保留且未绑定账号，新注册列表为空不代表课程丢失；仅能明确指定后本机认领。只供回环本机使用，不代表可公开部署。[用法](docs/getting-started.md#账号与课程流程本机账号接口已启用)/[计划](docs/superpowers/plans/2026-10-19-account-course-flow.md)/[首轮证据](output/workbench/account-course-flow/receipt.json)/[修复与启用](output/workbench/login-redirect-fix/receipt.json)。

## 功能优先本轮交付

不增加基础设施。同讲稿/配色下三种风格的9类场景及66个数量/长文边界已实际渲染；手工概念场景已在原工作台启用并实际浏览器验收；已有重排不重复实现；批量对齐的三类非编程场景已在独立副本实际执行。可编辑[非编程示例包](examples/lessons/README.md)附本地系统语音，两版有声视频见 `output/general-whiteboard.mp4`、`output/general-minimal.mp4`。模型/供应商配音闭环、制作效率试跑及20组正式验收仍待预算，不把本地示例算作收费链路验收。进度：[任务记录](docs/superpowers/plans/2026-10-19-function-first.md)。

## 快速开始

先装公共依赖（三种用法都需要 Node 22+、`ffmpeg`/`ffprobe`）：

```bash
npm ci
```

下面**三条路径互相独立**，选一条做即可，不要混着拷贝整段。

### 路径 A：只看本地示例视频（不收费用、不要数据库）

适合确认渲染能出片。macOS 用系统 `say` 配音。

```bash
npm run demo:create
npm run studio
# 另开终端导出：
npm run render -- examples/demo.json output/demo.mp4
```

可选风格：`--visual-style=whiteboard`、`minimal` 或 `paper_slide`。

### 路径 B：打开教学工作台（登录 / 我的课程 / 新建讲稿）

这是日常网页流程。需要本机已有 PostgreSQL / Redis / RustFS（compose 私有栈）以及 `.env`、`.env.local-services`。

```bash
# 1. Python 依赖（首次；bash/zsh）
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# fish：python3 -m venv .venv && source .venv/bin/activate.fish && pip install -r requirements.txt

# 2. 看端口是否健康（只读）
npm run workbench:status

# 3. 若 8000/3000 缺失，前台拉起 API + 网页
npm run workbench
```

浏览器打开 [http://127.0.0.1:3000](http://127.0.0.1:3000) → 注册/登录 → **我的课程** → **新建课程**（可生成或手写讲稿，确认后再创建免费草稿）。

**`npm run workbench` 只起 API + 网页，不起任务消费者 / beat。** 登录、看课、新建讲稿、手工改场景可以只用它；一点「生成教学分镜 / 候选 / 配音」就会进队，但没有 worker+beat 时进度会一直停在 0%（排队未开始，不是功能没实现）。

要跑这些任务时，再开**两个终端**（会调用 DeepSeek 等，可能产生费用）。`DATABASE_URL` 在 **`.env.local-services`**（不在 `.env`）；每个 Celery/API 进程都必须带上，否则 `aicreater.poll` 会报 `Configure the local workflow database`。

**bash / zsh：**

```bash
cd /path/to/AiCreater
set -a; source .env.local-services; set +a
source .venv/bin/activate   # 若使用 venv；也可用 .venv/bin/python -m celery ...

# 终端 1：workflow 消费者
python3 -m celery -A services.workflow.queue:app worker -Q workflow --hostname=workbench-workflow@%h --concurrency=1 --loglevel=WARNING

# 终端 2：beat（每 2 秒唤醒 worker 去 PostgreSQL 取任务；只起 worker 不够）
python3 -m celery -A services.workflow.queue:app beat --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat
```

**fish：** 不能 `source` bash 风格的 `KEY=value` 文件，也不要 `set -a`。用 bash 包一层，并**显式**走 venv 里的解释器（`bash -lc` 不会继承 fish 已激活的 `.venv`，否则会落到系统/Xcode `python3` 并报 `No module named celery`）：

```fish
cd /path/to/AiCreater
# 终端 1：workflow 消费者
bash -lc 'set -a; source .env.local-services; set +a; exec "'(pwd)'/.venv/bin/python" -m celery -A services.workflow.queue:app worker -Q workflow --hostname=workbench-workflow@%h --concurrency=1 --loglevel=WARNING'
# 终端 2：beat
bash -lc 'set -a; source .env.local-services; set +a; exec "'(pwd)'/.venv/bin/python" -m celery -A services.workflow.queue:app beat --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat'
```

整课渲染另需 render 队列；页面上的「执行器响应」可核对是否检测到消费者。完整启停、compose、render 见 [本地运维](docs/local-operations.md)。

**改过后端代码后**：必须重载 API（且重载 worker，否则分镜/配音仍用旧代码）。旧进程没有新路由会 404。先停掉占用 `8000` 的旧 uvicorn，再执行：

```bash
# bash/zsh
set -a; source .env.local-services; set +a
source .venv/bin/activate
python3 -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

```fish
# fish
bash -lc 'set -a; source .env.local-services; set +a; exec "'(pwd)'/.venv/bin/python" -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers'
```

网页一般用 `npm run web`（或 `npm run workbench` 一并拉起）。

### 路径 C：命令行云端生成整课（会产生 LLM/TTS 费用）

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env   # 填写 DEEPSEEK_API_KEY、火山引擎凭据
npm run generate -- examples/script.txt output/cloud.json
npm run render -- output/cloud.json output/cloud.mp4
```

### 可选：跑测试

```bash
source .venv/bin/activate   # 若尚未激活
npm test && npm run typecheck
```

更细的环境与功能说明见 [快速上手指南](docs/getting-started.md)。

## 目录结构

```text
apps/web/                  Next.js 教学工作台
apps/renderer/             Remotion 渲染与导出
packages/video-schema/     JSON Schema、类型生成、双语言校验
packages/video-components/ 9 种教学表达组件
scripts/                   示例配音、类型生成、回环绑定
services/                  Python 供应商适配、分镜、时间规划
examples/                  示例文稿与 DSL
output/                    本地视频输出（不纳入版本管理）
docs/                      文档
```

修改 Schema 后运行 `npm run schema:types`；不手改 `packages/video-schema/src/types.ts`。

## 文档索引

| 文档 | 内容 |
|---|---|
| [快速上手](docs/getting-started.md) | 环境要求、安装、本地/云端生成、自定义 DSL |
| [教学模板](docs/teaching-templates.md) | 9 种表达说明、数据结构与字段约束 |
| [纸质幻灯丰富度](docs/superpowers/specs/2026-10-20-paper-slide-richness-design.md) | `paper_slide` 视觉语言与场景 `motif` |
| [剪影多样性](docs/superpowers/specs/2026-10-20-scene-silhouette-diversity-design.md) | 分镜模板剪影切换约定 |
| [API 参考](docs/api-reference.md) | HTTP 接口、任务管理、导出下载、工作台操作 |
| [本地运维](docs/local-operations.md) | 工作台启停、Celery/Redis/RustFS 配置 |
| [重启后只读浏览器回归](output/workbench/post-cold-browser-qa/receipt.json) | 项目/选章/静音播放/高级 JSON、下载 CORS 与 Tabbit 扩展警告；非收费写流程验收 |
| [交付记录](docs/changelog.md) | 各功能交付详情、验证报告、历史尝试 |
| [验收计划](docs/acceptance.md) | 20 组教学验收方案与当前状态 |
| [架构设计](docs/AI知识视频生成系统架构设计_v1.5.md) | 系统架构文档（v1.5） |
| [开发契约](docs/MVP开发契约.md) | MVP 开发约束与边界 |
| [后续跟进](docs/mvp-follow-up.md) | 待完成事项与边界 |
| [依赖许可](docs/dependency-license-review.md) | 依赖许可初筛 |
| [待办事项](docs/TODO.md) | 当前待办 |

## 当前状态与边界

用户已确认个人使用；当前 Remotion/Player 4.0.534 符合个人免费资格，无需为此购买 Company License。Redis 保留本机内部使用，转公司/第三方服务或分发软件时重新核对[许可](docs/dependency-license-review.md)；个人资格不免模型/配音费。人工同步与 nums 发音已加入待办，后续主线为真实风格变化、轻量本地验证与通用教学表达；部署和运维功能扩展暂缓，不自动调用收费服务。字体来自 `@fontsource/noto-sans-sc`，许可随依赖保留；Remotion 和系统语音的商业使用条件需按实际用途另外核对。详见 [后续跟进](docs/mvp-follow-up.md)。
