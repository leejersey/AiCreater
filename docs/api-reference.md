# API 参考

本文档汇总 AiCreater 本地 HTTP API 接口、后台任务队列、Celery Worker 调度配置以及 Next.js 教学工作台的交互规范与安全限制。

---

## 服务启动与安全规范

### 服务启动命令

系统依赖本地 PostgreSQL、Redis、FastAPI 服务及 Celery 工作队列。原常驻API现已备份后受控加载账号认证；未登录访问课程资源返回401。25门旧课数据保留且未绑定，只有明确指定账号/清单后才通过本机命令认领。首页不再因账号接口404而开放匿名编辑器；开发网页使用已有webpack以避免Turbopack反复刷新。不因下列命令示例擅自启动消费者或收费。

```bash
# 1. 启动本地 PostgreSQL 与 Redis（先在 .env 中配置数据库密码及 DSN）
docker compose -f compose.postgres.yaml up -d

# 2. 启动 FastAPI API 服务（只绑定本地回环地址，不信任代理头）
python3 -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers
curl http://127.0.0.1:8000/health

# 3. 启动通用工作流 Celery Worker（分镜、配音、时间轴重算等）
python3 -m celery -A services.workflow.queue:app worker -Q workflow --hostname=workflow@%h --concurrency=1 --loglevel=WARNING

# 4. 启动渲染独立单槽 Worker（不阻塞分镜与配音；在另一个独立终端运行）
python3 -m celery -A services.workflow.queue:app worker -Q render --hostname=render@%h --concurrency=1 --loglevel=WARNING

# 5. 启动 Celery Beat 定时调度器（仅运行单实例）
python3 -m celery -A services.workflow.queue:app beat --loglevel=WARNING --schedule=/tmp/aicreater-celerybeat --pidfile=/tmp/aicreater-celerybeat.pid
```

Beat只开一个，统一PID文件防止重复启动；旧不带PID参数的实例须先在原终端正常退出，再用新命令，不能叠加启动。文件锁冲突先查占用，不直接删除schedule。

### 安全限制与运行规范

- **网络监听与来源约束**：API 仅绑定本地回环地址（`127.0.0.1`），严格拒绝非回环来源以及非白名单的 Host / Origin。仅允许本地 `http://127.0.0.1:3000` 与 `http://127.0.0.1:8000` 的前端 Origin。
- **请求体与超时预算**：HTTP 请求体累计大小上限为 512 KiB，网络接收预算为 15s；严格拒绝未知字段和非整数版本号（revision）。
- **输入校验与错误回显**：参数验证失败时返回包含 `path`、`code`、`message` 的错误信息，但不回显用户原始输入内容。
- **鉴权边界**：原常驻API仍是旧单用户版本；新代码默认认证并验证资源所属账号。仅内部显式契约测试可使用`create_app(..., authentication=False)`，没有环境变量绕过开关。Cookie仅适配现有回环HTTP，**仍严禁将端口直接暴露公网或通过公开代理转发**。
- **Redis 职责与安全性**：Redis 仅承载固定空参数的唤醒通知消息；所有任务状态均持久化保存在 PostgreSQL 中，Redis 断开不会丢失已提交的任务，连接恢复后可继续消费。本地 Redis 无密码鉴权，严禁对外公开端口。
- **计费与故障隔离**：任务执行失败时绝不会自动重试或触发新的外部收费请求；用户手动点击重试可能导致重复计费。
- **密钥安全与进程隔离**：第三方供应商凭据（如 DeepSeek、火山 TTS）仅保存在后端服务端，绝不流入版本快照或前端页面；配音执行子进程不接收 DeepSeek 密钥，渲染子进程不接收任何供应商密钥。

---

## 账号与资源权限（新代码完成，原API未加载）

浏览器通过现有Next的同源`/api`rewrite携带Cookie；不是新增认证服务/网关。下方既有业务接口示例保留旧单用户调用格式，新API实际写入必须另带有效会话Cookie、受信Origin及JSON Content-Type，不能原样匿名执行。除`/health`和注册/登录外均须会话，未知/过期会话401、非本人或不存在资源404；课程/场景/候选/版本/job及媒体/下载均在执行操作前校验归属。写操作还需现有白名单Origin与JSON Content-Type（拒绝表单式跨站写入）。密码scrypt+随机盐；43字符随机token只存SHA256摘要，Cookie为HttpOnly、SameSite=Strict、7天、当前回环HTTP下Secure=false；仅请求新页面不能绕过API校验。

| 方法/路径 | 请求 | 结果 |
|---|---|---|
| POST `/api/auth/register` | `username,password` | 201：公开`id,username`＋Cookie；用户名归一/唯一，不认领旧课 |
| POST `/api/auth/login` | `username,password` | 200：公开账号＋新Cookie；错误凭据401 |
| GET `/api/auth/me` | 无 | 当前公开账号；无有效会话401 |
| POST `/api/auth/logout` | `{}` | 撤销当前会话、清Cookie，`status:signed_out` |
| POST `/api/auth/password` | `current_password,new_password` | 更新密码、撤销所有旧会话并发当前新Cookie；返回公开账号 |

字段严格禁止额外值；用户名3–32位ASCII字母数字下划线、大小写归一，注册/新密码6–128字符。限次写在既有PostgreSQL，超限429并附`Retry-After`，没有新增Redis用途。浏览器401只通知原位续登，绝不自动重放失败写请求。

`GET /api/projects`新版本按本人过滤，并追加`revision,updated_at,scene_count,needs_voice,needs_timing,ready,active_jobs`摘要；旧项目时间为null表示未记录，不伪造历史。创建/import由服务端绑定当前用户，拒绝客户端`owner_id`。本机认领/重置命令见[指南](getting-started.md#账号与课程流程代码完成原api待切换)，不提供HTTP认领或公共密码重置后门。新版本仍共享本机供应商配置，没有团队权限/额度/计费平台，不可据此开放商业注册。

双账号后端全资源拒绝、副作用前验证、会话/限次/跨站/认领等8个新增原生用例通过；完整页面链尚未全验，详见[回执](../output/workbench/account-course-flow/receipt.json)。

## 消费者响应检测

### `GET /api/consumers`

已在原常驻API启用并完成原页面无mock验收，返回HTTP200、`Cache-Control: no-store`，见[原环境记录](../output/workbench/consumer-readiness-activation/receipt.json)：

```json
{"checked_at":"2026-10-15T00:00:00+00:00","code":"checked","queues":{"workflow":{"state":"not_detected","responders":0},"render":{"state":"detected","responders":1}}}
```

`state`为`detected`/`not_detected`/`unknown`；`code`为`checked`/`configuration`/`inspection_failed`/`invalid_response`。无响应是未检测到，配置/连接/响应格式错误是未知，原异常、worker名及broker不会返回。继承本机Host/Origin限制，不访问项目数据库或供应商、不派任务；独立控制客户端只查询队列订阅，连接/读/响应等待各1s并禁连接重试。未响应不证明离线，忙碌solo也可能暂不响应；响应不证明beat或任务执行可用。前端仅进入时及手动检查，5s超时后显示未知，不把旧状态作为当前就绪，不改任务提交规则。

## 新分镜任务协议V6（本机已启用）

新提交生成/候选采用`teaching-outline:6`/`scene-candidate:6`，对话角色为`context/message/initial_state/state_after`，非零统一原文摘录ID；估价仍按最多2次模型请求保守计算，用量支持v6。可选`dialogue.context_messages`标记前文，须属于消息证据且不得是更新来源，并至少保留一条当前消息；旧数据未提供该字段时保留原标签。图形草稿/保存/冻结保留字段，标签不再根据消息次序猜测。v1–v5已有任务不改，直接重试旧失败任务仍按旧协议执行；新提交才用v6。未自动重试旧任务或补历史用量，v6后续已在2次新授权内完成三段短验收课真实复验，并通过隔离原生PG冻结/实际CLI渲染/发布校验/MP4及SRT HTTP下载；不等于通用正确率或人工逐词听检，见 `output/workbench/v6-final-acceptance/receipt.json`。

## 每次尝试的用量记录（本机已启用）

### `GET /api/projects/{id}/usage`

只读repeatable-read/read-only事务，校验项目归属；成功200、`Cache-Control: no-store`。返回`summary`和按尝试开始时间倒序的`items`，排队但未领取的任务不伪造attempt。不创建任务/版本、不查询供应商账单或自动重试，沿用本机Host/Origin限制。

`summary`包含`attempts/known/unknown/historical_unknown`及`minimum_cny/maximum_cny`；金额只累加**已有参考价的部分**。若known=0、金额=0，表示无可核价记录，不代表实际支出0元；界面显示“暂无可核价记录”。未知/历史缺失另计，不补造旧账单。

每项仅含`job_id,attempt_id,number,kind,state,started_at,ended_at,usage`。历史`usage:null`保持未知；新attempt的usage包含`version:1`、kind、观察state（pending/submitted/reported/local）、quantity（input/output/cache-hit/cache-miss tokens或submitted_characters）、prices（CNY/快照日/公开型号/冻结费率/官方来源）及reference金额区间。模型仅接受严格校验的供应商usage；TTS字符是本地Unicode码点提交量，含空格标点，不冒充供应商计费确认。缺usage、网络中断、未知型号/协议或过期的新快照不报免费；本地timing/render为0新增供应商调用费，机器成本除外。

领取时冻结快照，子进程通过受控4KiB白名单元数据文件传递观察；完成、解析失败、超时/取消均在finally尝试留档。保留原重试/发布护栏：仅对应任务的所属attempt可记录，已记录reported不可覆盖，新重试另建attempt，历史NULL不回填；失败/取消不自动算0。旧费率不会因以后价格更新或日历过期被追溯改算，不记录密钥、原响应、原始口播、worker异常或文件路径。

原常驻数据库已受控新增`job_attempts.usage jsonb`可空列（无默认值），仅重载自有API/配套页面；消费者未启动。25个原项目和58次原尝试GET200/no-store，历史usage全NULL，其余原字段精确不变；无mock页面展开/刷新/切课/重载通过。未知项目404、非法UUID400、外部Host/Origin403；不为历史补造用量。见[原生验收](../output/workbench/usage-records-activation/receipt.json)。本版不是供应商账单、自动对账或硬预算拦截；尚未验证实际供应商计费。

## 只读费用参考估算（本机原常驻API已启用）

### `POST /api/projects/{id}/estimate`

```json
{"operation":"batch_voice","expected_revision":3,"scenes":[{"scene_id":"<uuid>","expected_revision":2}]}
```

严格拒绝未知字段/错误类型；operation为`generate`/`regenerate`/`voice`/`batch_voice`。generate不选章，voice/regenerate恰一章，batch_voice为1–20章、不得重复且必须待配音；项目/章节revision过期409、非本项目/非法选择422。repeatable-read/read-only事务，不创建任务、版本、媒体或访问供应商，不派发/重试任务。

HTTP200、`Cache-Control: no-store`，响应示例：

```json
{"status":"estimated","currency":"CNY","minimum_cny":0.0018,"maximum_cny":0.0018,"quantity":{"calls":1,"reused_jobs":0,"characters":6,"input_tokens_min":0,"input_tokens_max":0,"output_tokens_max":0},"prices_checked_on":"2026-10-15","sources":["https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh"],"notes":["仅公开按量参考，非账单或硬上限"]}
```

status为`estimated`/`unknown`/`no_new_call`；unknown的金额为null而非0，任一选章未知则合计未知。no_new_call只指本次登记没有新供应商调用，不包含旧任务将来执行费。哈希复用规则与真实submit共用，批量对继承默认音色的项目保留同章同版已登记任务复用；显式设置项目音色后还要求有效profile匹配，避免复用错音色（项目音色功能本机已启用）。不因有音频而判断重新配音免费。价格快照30天到期/未知型号与协议不硬套价；参考来源与偏差见[使用说明](getting-started.md#提交前费用参考估算)。

### `GET /api/jobs/{id}/estimate`

对收费显式重试使用任务原有冻结输入/模型/协议，按新的调用参考，不因原任务存在报免费；本地render/timing无新模型/TTS调用费。返回同上且no-store；仅估价不保证任务符合重试资格，实际重试仍检查状态、次数、期限与归属。两个接口继承本机Host/Origin限制；无供应商密钥/profile/原始口播或worker异常回传。原API已受控重载，原生11项接口检查及3次真实确认取消通过；原数据/媒体及队列计数未变，未启动消费者或调用供应商。见[代码/隔离验收](../output/workbench/cost-estimates-qa/receipt.json)/[原环境验收](../output/workbench/cost-estimates-activation/receipt.json)。

## 项目管理

### `POST /api/manuscripts/generate`

- **功能描述**：创建课程前，按标题及可选提示同步生成可直接朗读的简体中文口播纯文本（DeepSeek）；不创建项目或后台任务。
- **请求参数**（严格拒绝未知字段）：
  - `title` (string, 必填)：1–80 字符。
  - `audience` (string, 可选)：受众提示，最多 80 字符，默认 `""`。
  - `duration_hint` (string, 可选)：时长参考，最多 40 字符，默认 `""`。
  - `outline` (string, 可选)：大纲提示，最多 1000 字符，默认 `""`。
  - `teaching_style` (string, 可选)：`popular`（科普）或 `technical`（知识干货），默认 `popular`。缺省或旧客户端不传时按科普生成；非法值 HTTP 422。只影响本次同步讲稿的提示词，不写入项目（创建草稿时须另在 `POST /api/projects` 提交同一风格）。
- **响应**：HTTP 200，`{"text": "<讲稿正文>"}`；同步阻塞直至模型返回，不登记 Celery 任务，不写入 `project_usage` 或任务 attempt 用量。
- **鉴权**：与其他课程写接口相同，须有效会话 Cookie、受信 Host/Origin 与 JSON Content-Type；未登录 401。
- **校验与错误**：Pydantic Field 校验失败 HTTP 422，`code: validation` 及 `validation_errors`（含 `path`/`code`/`message`）。业务侧超长或非法字符（如 `input_limit`）、模型输出超过 4000 Unicode 码点或未正常结束（`output_limit` 等）HTTP 422，**不静默截断**。配置缺失 503（`missing_setting`），供应商传输失败 502（`transport_error`）。

### `POST /api/projects`
- **功能描述**：创建教学文案草稿。
- **请求参数**：
  - `title` (string)：项目标题。
  - `source_text` (string)：教学文案原文。
  - `mode` (string)：模式，当前固定为 `"script"`。
  - `teaching_style` (string, 可选)：`popular`（科普）或 `technical`（知识干货），默认 `popular`。写入 `projects.config` 并在项目读取时返回；缺失或历史非法值读取时视为 `popular`。
- **注意事项**：仅创建纯文本草稿记录，不会自动触发视频生成或分镜拆分。讲解风格影响之后登记的首次整课分镜与场景重生成任务，不自动重跑已有场景。

### `POST /api/projects/import`
- **功能描述**：导入已编排完成的教学项目并校验关联音频。
- **请求参数**：
  - `title` (string)：项目标题。
  - `dsl` (object)：符合教学规范的完整项目 DSL 数据。
- **注意事项**：导入时会严格校验 DSL Schema 规范及引用的本地音频文件有效性。

### `GET /api/projects/{id}`
- **功能描述**：获取指定项目的完整草稿数据、场景列表和最新版本号。
- **路径参数**：`id` (UUID) - 项目 ID。
- **项目音色（本机已启用）**：追加公开`voice:{resource_id,speaker}`和`voice_configured:boolean`。历史NULL配置继承本地默认，首次显式保存后固定项目资源与音色；不返回凭据。
- **讲解风格**：追加 `teaching_style`：`popular`（科普）或 `technical`（知识干货）。config 缺失或非法时返回 `popular`。

### `PATCH /api/projects/{id}/teaching-style`

```json
{"expected_revision":3,"teaching_style":"technical"}
```

只接受 `popular` / `technical`，严格拒绝额外字段；继承项目锁、`expected_revision` 与 Host/Origin 校验。过期 revision 409；非法枚举 400/422。初始整课分镜任务仍排队或运行时拒绝保存（与视觉风格/音色相同）。与当前有效值相同则 no-op，不升 revision。

200 返回当前项目；仅更新 `config.teaching_style` 与项目 revision，不改场景 revision/state、音轨、旧版本或任务，不登记 Celery 工作。改风格后**不会**自动重生成已有场景；之后新登记的 `POST /api/projects/{id}/generate` 与 `POST /api/scenes/{id}/regenerate` 在 job `input` 内冻结提交时的有效 `teaching_style`，执行中 worker 只读该冻结值，不回读 live config。已排队或已成功任务仍用各自 input 内快照。DSL 导出与本地对齐配置不包含 `teaching_style`（与 `visual_style` 一样从教学 DSL 剥离）。

### `PATCH /api/projects/{id}/visual-style`（本机已启用）

```json
{"expected_revision":3,"visual_style":"whiteboard"}
```

只接受受信任预设ID（当前legacy/whiteboard/minimal），不接受客户端tokens/CSS或额外字段。严格整数revision、项目锁和Host/Origin校验；过期409，未知ID/坏请求400或422，跨源403。初始分镜任务仍活动时拒绝保存。已保存的同一完整快照no-op，否则仅项目revision/config升版，场景/原音轨/字幕/旧版本/任务不变，不登记新任务或配音。

支持`legacy/whiteboard/minimal/paper_slide/mechanism`；`mechanism`按已有`funnel/dialogue/process`结构启用演示，其余场景普通回退，不改变分镜或触发模型。机制标记由稳定id在渲染时派生，不写入tokens或DSL；仅改变label不会把旧快照变为演示，额外tokens字段仍拒绝。200返回项目，GET项目也追加`visual_style:{id,tokens}`，未设置的项目只读返回legacy默认、不回填原记录。完整快照保存在config元数据，不属于教学DSL；预览、导出阻塞检查和本地对齐输入显式剥离，配音profile不含风格，主题/音色保存保留风格设置。新的版本profile冻结完整快照；历史无此字段版本维持v1/legacy。

前期隔离DB/worker/CLI验收见[记录](../output/workbench/style-selection-qa/receipt.json)。原API/web已正常重载，无新增迁移；16项原生API与8项无mock页面检查通过，3次成功风格保存和1个冻结版本仅在自有临时副本完成，清理后原六表/媒体/配置/队列不变，无任务或收费调用，见[原生验收](../output/workbench/style-selection-activation/receipt.json)。旧API缺字段/404仍保留草稿并提示未启用，不调用主题接口兜底。

### `PATCH /api/projects/{id}/voice`（本机已启用）

```json
{"expected_revision":3,"speaker":"public_speaker_id"}
```

仅免费保存本项目公开音色ID；`speaker`限1–200 ASCII字母/数字/下划线/连字符，严格拒绝额外字段/错误类型。继承本地资源，不接受密钥、任意resource_id或供应商URL；用户自行确认该ID的账号资源权限，本接口不联网验证或试听。项目锁内校验revision，409保留输入；初始分镜仍排队/运行时拒绝更改。同一已固定值不重复升版。

200返回当前项目，只更新`projects.voice`和项目revision，不改章节revision/state/音轨、旧版本或旧任务，不派发配音。现有`POST /api/projects/{id}/voice`仍是收费批量提交，不与本PATCH混淆。

新voice/timing、预览及新冻结版本使用项目有效设置；旧任务/显式重试使用原冻结输入，旧profile结果可完成但`attached=false`，不覆盖当前音轨。旧媒体引用仍保留，设置不追溯标注旧音轨的实际音色。项目任务列表追加`voice_current`：voice任务false表示历史音色；当前匹配任务即使超过最近50条也补齐，前端不让历史音色阻挡新选择，并禁用其按新音色重试入口。默认项目保持旧批量复用策略，显式项目按有效profile复用，匹配失败/取消任务仍不自动重试；只读估价与真实提交共用查询。

前端支持音色本机草稿，取消不PATCH、409保留输入、旧版草稿只供复制。旧API无voice字段时禁用表单，不虚构默认音色。**本机已添加可空`projects.voice`列并受控加载API**：原生9项API/6项无mock浏览器检查通过，保存仅用临时副本且已清理。25原项目仅新增voice:null，原有字段/音色、其他五表、媒体/对象和队列不变；未启动消费者或验证真实供应商音色。见[代码验收](../output/workbench/project-voice-qa/receipt.json)/[原环境验收](../output/workbench/project-voice-activation/receipt.json)。

### `POST /api/projects/{id}/generate`
- **功能描述**：针对文案草稿项目首次自动生成教学分镜。
- **请求参数**：
  - `expected_revision` (int)：期望的项目版本号，例如 `{"expected_revision": 1}`。
- **执行机制与安全限制**：
  - 仅用于**尚未包含任何场景**的初始文稿项目。
  - 任务写入 PostgreSQL 并在 Celery `workflow` 队列中异步执行，冻结模型配置、文稿原文及课程当前有效 `teaching_style`（缺省 `popular`），并保留首尾空白。
  - 首次生成成功且项目版本号未发生冲突时，自动将教学分镜附着至该项目，所有场景状态标记为 `needs_voice`；无音频前禁止创建导出版本。
  - 若执行期间项目版本号已被修改，生成结果将保留在 `job.result.draft` 中且 `attached=false`，不会覆盖用户已做的修改。
  - 若项目已有分镜，该接口拒绝执行，需使用场景级重生成接口。

### 场景结构管理（本机常驻实例已迁移与重载）

所有结构变更复用项目事务锁与 `expected_revision`；失败整批回滚，不截断数据、不产生配音/渲染任务。初始分镜任务排队或运行时拒绝结构变更。前端有未保存输入时禁用；409保留输入，切章/重载/关页沿用离开提醒。全课仍限20章、4000码点及实际5分钟，结构保存不代替配音后的时长与文件校验。

#### `POST /api/projects/{id}/scenes`
- **请求**：`{expected_revision, narration_text, content}`，严格拒绝额外字段；非空口播最多4000码点，展示要点最多40码点，整课总口播仍不能超过4000。
- **返回**：`201` 当前项目；在末尾追加一个 `card_sequence`、一个覆盖完整口播的步骤，状态 `needs_voice`、场景revision=1。不会自动分镜或配音。手工新增后已有章节，原首次整课生成接口不再可用。

#### `POST /api/projects/{id}/scenes/{scene_id}/duplicate`
- **请求**：`{expected_revision, expected_scene_revision}`；场景必须属于当前项目且未删除。
- **返回**：`201` 当前项目；在原章之后插入副本，新数据库ID和DSL场景ID，revision=1。完整保留专用模板字段及原状态；已有音频/时间戳直接引用，待配音/待对齐不升级就绪。仅调整序号，不修改其他场景revision或原件。复制后仍需人工确认新章，不复制历史候选/任务或复核记录。

#### `POST /api/projects/{id}/delete`
- **请求**：`{expected_revision, confirmed: true}`；必须是严格布尔 `true`。
- **返回**：`200` 与 `{"ok": true}`；从数据库移除项目及其场景、任务、候选与冻结版本行；**不**清理对象存储中的旧音频/渲染文件，无一键撤销。
- **拒绝**：项目 revision 不匹配 → `409 conflict`；`confirmed` 非严格 true → `422 validation`；存在 `queued`/`running` 项目任务 → `409 not_ready`（须先取消并等消费者确认）。

#### `POST /api/projects/{id}/scenes/{scene_id}/delete`
- **请求**：`{expected_revision, expected_scene_revision, confirmed: true}`；必须是严格布尔true，且至少保留一章。
- **返回**：`200` 当前项目；从当前稿移除并压紧活动序号。章节仍有排队/运行任务时拒绝，取消须等消费者确认；冻结版本渲染不阻塞移除。
- **保留边界**：数据库新增可空 `scenes.deleted_at`，归档行保留外键和历史任务/候选/媒体；不删除对象存储、音频、旧快照或下载产物，无一键撤销。归档章的编辑、候选、配音、对齐、预览、重生成及旧任务重试返回404；重试与删除统一先锁项目再锁任务，不能重新排队已移除章。项目任务历史仍可读，当前章最新任务补齐不包含归档章。
- **运行边界**：新增可空列已在原环境迁移，原API/web已受控重载，并在独立实际验收副本验证保存、重开、旧快照保留与归档拒绝；不再只限临时数据库/受控fetch测试。未启动配音/渲染消费者，旧队列保留，未调用收费服务；见`output/workbench/scene-management-activation/receipt.json`。

### `POST /api/projects/{id}/scenes/reorder`
- **功能描述**：重新排列项目中各场景的播放顺序。
- **请求参数**：
  - `expected_revision` (int)：期望的项目版本号。
  - `scene_ids` (array of UUID)：重排后的完整场景 ID 列表。

### `POST /api/projects/{id}/versions`
- **功能描述**：为当前项目创建不可变的只读快照版本。
- **请求参数**：
  - `expected_revision` (int)：期望的项目版本号。
- **注意事项**：只有当所有场景均处于 `ready` 状态且场景列表不为空时才允许创建快照。创建快照后，草稿的后续修改完全不影响已冻结的快照。新版本profile包含`visual_style:{id,tokens}`完整快照；旧版本缺字段继续legacy，不补写历史。新render/单章preview协议分别是`snapshot-render:2`/`scene-preview:2`，worker把冻结文件传`--visual-style-file`，不读取执行时的项目风格；v1仍可运行。选择风格不派任务，导出登记不等于消费者已运行或执行成功。

### `GET /api/versions/{id}`
- **功能描述**：获取指定不可变版本快照的完整 DSL 内容。
- **路径参数**：`id` (UUID) - 版本快照 ID。

---

## 场景编辑

### `PATCH /api/scenes/{id}`
- **功能描述**：更新指定场景的草稿字段（`elements/code/captions/narration_text/edges/graphics`）；不允许元素增删、ID/顺序/topic或concept_role变化。
- **请求参数**：
  - `expected_revision` (int)：期望的场景版本号。
  - `changes` (object)：需要更新的字段及其新值。
- **图形编辑（T9源码、隔离续登/对齐验收及原环境受控启用完成）**：`changes.graphics`为可选完整替换对象，仅允许`motif/funnel/dialogue/process/visual_actions`，不含渲染帧。`{}`清除旧图形设置；可与步骤/连线同笔修改，使用修改后的原稿和连线校验。未知键、引用/分组/cue错误原子拒绝，不静默替代。未传该字段的旧调用不受影响；已有音轨的实际图形变化进入`needs_timing`、保留配音并移除失效动作帧，no-op不升版本，保存不自动发任务或重新配音。后续已在零活动任务、私有备份与身份复核后短暂停/恢复原消费者并正常重载原API/web，9表/326文件不变；图形保存已启用；最新新任务已接通v5：模型先选每段表达方式，再按该方式的精确schema选择局部摘录，程序构造引用/时序（最多两次请求，standard在第二次转旧专用生成器，无第三次重试），已用一个真实有声样本验证三类图形，不代表通用准确率。
- **音频复用与状态流转规则**：
  - **复用音频与时间**：口播、cue不变时，沿用已有状态及合法音频/时间轴；原`needs_voice/needs_timing`不会因改说明而升级ready。
  - **标记 `needs_timing`**：仅cue变化、口播不变且原来非`needs_voice`，保留narration/音频引用、字幕、时长，删除失效的animations并待对齐；原来`needs_voice`仍待配音。保存不派发任务，须显式本地重算，缓存缺失/无法匹配词戳报错，不回退收费配音。cue变化不能与手改captions同时提交，以免吞掉用户字幕。
  - **标记 `needs_voice`**：口播变化则清旧音频引用/时长/字幕/入场计划，仍需显式配音。
- **手工cue（本机已启用）**：在完整`changes.elements`里仅改现有步骤的`cue.text_start/text_end`；0起Unicode码点、起点含/终点不含，须整数且`0 <= start < end <= len(口播)`，原文切片不能全空白。代码/状态图/时间线/数据图表起点严格递增；不为卡片额外禁止范围重叠。topic仍提前显示，图表数据确认仍走原chart接口。
- **版本与错误**：相同内容no-op；有效变化递增scene revision/user_revision和project revision，不增generated_revision。过期revision409、非法范围422、身份/顺序/role或不允许的组合400，均整笔回滚；旧voice/timing按既有revision/profile/attempt护栏不附着。当前待对齐稿禁止正式带音预览/冻结，可查看已保存分镜的临时时序静音草稿；旧快照/媒体保留。
- **验收边界**：前期571项去重测试与10项受控页面检查见[代码验收](../output/workbench/manual-cues-qa/receipt.json)。本机原API/web现已受控重载，19项原生API、6项无mock页面检查通过；只对临时副本做3次成功范围保存，原数据/旧版本/媒体/配置/队列不变，副本/自有页已清理，无新增迁移、任务、消费者或收费。Tabbit注入html属性导致的hydration提示按完整React diff记录，未改应用屏蔽。见[原生验收](../output/workbench/manual-cues-activation/receipt.json)。

### `POST /api/projects/{project_id}/scenes/concept`

- **本机已启用**：新增手工概念场景，201返回更新后的完整项目；不是生成/配音任务。
- **请求**：项目`expected_revision`、`narration_text`（1–4000字符）、`elements`（1–6项，含`id/content/concept_role/cue`）。每项正文为口播中唯一出现、按原稿顺序的连续摘录（1–40 Unicode码点），cue为0起、不含终点的码点范围；恰好一个definition、至多一个summary。
- **结果与保护**：只追加needs_voice章节，无音轨/任务；非法摘录或缺定义422，过期项目revision409，额外字段422，陌生Host/Origin403。无自动重试/配音。
- **原环境验收**：真实浏览器创建/草稿恢复/角色改存/重排、原生负例通过；临时项目精确清理，原六表/媒体不变，零jobs/供应商调用。见[记录](../output/workbench/concept-activation/receipt.json)。

### concept增量契约（原工作台已加载，真实模型课程待验收）

既有import/PATCH/候选/配音/本地timing路径支持新`concept`类型；首版未新增路由或数据库迁移，后续增加上方手工创建接口，无新增迁移。每项concept_role必填、恰好一个definition、summary至多一个；正文是自身cue原文连续摘录，禁止topic及专用/装饰字段，严格遵守原稿cue和最终入场顺序。完整[契约](teaching-templates.md#10-通用概念解释-concept)。

PATCH仍用原changes/elements格式；concept_role现可编辑并校验恰好一个定义、至多一个总结，不改变已有音轨或触发时间，仍保护ID/顺序/topic。非法摘录422、旧revision409均不改变原稿/音频/冻结版本。有效cue变化标记needs_timing，显式本地缓存重算可恢复ready；测试使用真实隔离DB与本地子进程，不调用供应商。

新分镜/候选任务登记`teaching-outline:5/scene-candidate:5`。模型经严格函数规划选择固定原稿段落内的整数摘录ID，不自行分章/编引用/造帧；程序构造图形与按原文排序的动作并整体验证。供应商若返回多份规划，仅安全合并不重复的段落，重复/错函数/非法引用拒绝，不执行任何业务工具。模型选择standard（代码/概念/对比等专用能力）时最多再调用一次既有生成器；估价计入tools/schema和两次上界，实际usage汇总后发布，部分失败保持未知，不漏计/无限重试。混合专用段落目前可能整课回退既有模板，这是保留旧能力的边界，不承诺所有段均用新图形。v1–v4冻结任务保留原协议，候选保留原图形并移除旧帧；估算非账单或硬预算。既有API/web/原worker角色已受控重载，仍1 worker/2 beat、9表326文件不变。已验证一个实际三图形有声课、正式渲染/冻结及隔离HTTP视频/SRT下载；未证明跨课程准确率、用户长课或人工同步听检，见[本轮记录](../output/workbench/reference-grade-visuals/compact/receipt.json)。

### `GET /api/scenes/{id}/candidates`
- **功能描述**：获取指定场景当前保留的所有重生成候选分镜。
- **路径参数**：`id` (UUID) - 场景 ID。
- **注意事项**：候选记录仅由后台重生成任务或内部仓库生成，系统不开放直接写入候选的 HTTP 接口。

### `POST /api/scenes/{id}/candidates/{candidate_id}/accept`
- **功能描述**：显式确认并采纳某个候选分镜。
- **请求参数**：
  - `expected_revision` (int)：期望的场景当前版本号。
- **候选确认机制**：
  - 保存候选分镜不会修改场景当前内容。
  - 采纳候选时，系统会同时核对场景当前 `revision` 与该候选生成时的 `base_revision`。若当前版本已发生变化，接口返回 `409 Conflict` 并保留候选内容。
  - 成功采纳后，场景的 `generated_revision` 自动递增，`user_revision` 保持不变。
  - 采纳候选为显式人工确认操作，不代表技术内容已被系统自动核验。

### `POST /api/scenes/{id}/regenerate`
- **功能描述**：提交单场景的 AI 重生成任务。
- **请求参数**：
  - `expected_revision` (int)：期望的场景版本号。
- **执行机制**：
  - 请求写入任务持久化落盘后立即返回 `202 Accepted`（任务状态为 `queued`）。
  - 场景重生成仅生成待确认的候选分镜，绝不自动覆盖当前生效场景。
  - job `input` 冻结登记时课程的有效 `teaching_style`（缺省 `popular`）；worker 执行分镜提示时只读该值，不回读项目 config。
  - 接口返回公开任务状态、执行进度及生成后的候选 ID，不泄露输入快照或内部 attempt ID。

### `POST /api/projects/{id}/voice`
- **功能描述**：对已人工核对并选择的待配音章节，一次登记多个独立配音任务。
- **请求参数**：`expected_revision` 为项目版本号，`confirmed` 必须为布尔 `true`；`scenes` 为1–20个不重复的 `{scene_id, expected_revision}`，其中版本号是场景版本。
- **事务与防重复费用**：项目加锁，全部归属/版本/状态校验通过才提交；任一失败整批回滚。仅允许 `needs_voice`；`ready` 与 `needs_timing` 不会批量重新配音。复用本场景当前 revision 已有的最新 voice 任务，即使配置改变或任务失败/取消也不隐式重建或重试。
- **返回值**：`202` 公开任务数组，不返回输入/profile/内部 attempt ID。关闭网页不取消任务。任务执行仍沿用现有单槽 worker、发布 fencing、显式重试及可能重复计费规则；此接口不启动消费者。
- **前端约束**：确认绑定当前保存的场景 revision，刷新后重确认；逐章人工确认与批量选择分开，不能一键替代人工核对。提交前按所选章数弹出付费确认；未保存修改时禁用。网络或409失败保留选择，无自动重发。

### `POST /api/scenes/{id}/voice`
- **功能描述**：单场景生成配音，或在口播修改后恢复配音状态。
- **请求参数**：
  - `expected_revision` (int)：期望的场景版本号。
- **执行机制与安全限制**：
  - 冻结当前场景内容与音色配置，直接调用原生字级时间戳 TTS 与字幕/动画编排，不再调用 DeepSeek LLM。
  - 配音子进程执行预算为 240s，子进程环境中不注入 DeepSeek API 密钥。
  - 任务成功后，仅在场景版本号及音色 profile 依然一致时，才将新生成的 `ready` 音频附着至场景并递增项目 revision；若因版本冲突导致结果迟到，产物保留在 `job.result.document` 且 `attached=false`。
  - 修改口播导致变为 `needs_voice` 的场景可通过此接口恢复就绪。
  - 重试可能导致重复产生云端 TTS 费用，系统不提供免计费断点续跑。

### `POST /api/projects/{id}/timing`（本机接口已加载，执行未验）

- **请求**：`{expected_revision, confirmed:true, scenes:[{scene_id,expected_revision}]}`；1–20项，不接受重复ID、额外字段、布尔/非整数revision或未确认提交。
- **202返回**：现有公开Job数组，不含冻结profile、缓存路径或私有payload。项目锁内验证项目/章节revision、活动归属、`needs_timing`及每章保存音频缓存；全组成功后同一事务登记，任意失败回滚本次全部新任务，不改稿件/字幕/动画/版本或生成attempt。
- **复用**：与单章timing共享冻结payload和完整input_hash；并发/单批重复复用相同任务。通过本次状态/revision/缓存校验后，即使匹配任务失败/取消也原样返回，不隐式重试。原单章仍支持ready或needs_timing，批量只接受needs_timing。
- **错误**：revision/状态409，归属/重复/缓存/请求校验422，Host/Origin403。缓存预检检查现有边界/音频checksum等，不保证词戳JSON、语义或匹配在运行时必定成功；缓存后改仍由既有冻结校验拒绝。
- **执行边界**：原子性仅限提交；各章后续独立成功/失败/取消。需要明确执行器操作，登记不等于就绪；没有模型/配音兜底、自动重试或消费者启停。旧revision/profile/attempt发布护栏保持不变。
- **前端**：人工核对与配音/对齐选择独立；dirty/未核对/无音频不能提交，取消零POST；错误保留选择，404提示未启用且不逐章兜底，晚响应不写入新课程。受控页面是替身验收，非原队列任务验证。
- **验证范围**：580项去重测试（258Node、190离线Python、132真实隔离PG）与10项受控页面检查通过，见[代码验收](../output/workbench/batch-timing-qa/receipt.json)。原API/web现随风格功能正常重载并只读确认路由，未新增迁移、登记或执行原生对齐任务，未启动消费者，见[加载记录](../output/workbench/style-selection-activation/receipt.json)。接口已加载不等于执行链路验收。

### `POST /api/scenes/{id}/timing`
- **功能描述**：本地重算时间轴（不重新调用云端配音）。
- **请求参数**：
  - `expected_revision` (int)：期望的场景版本号。
- **执行机制与安全限制**：
  - **支持状态**：仅适用于处于 `ready` 或 `needs_timing` 状态的场景。
  - **资产安全**：冻结当前音频资产文件及对应字词级时间戳侧车（word timestamp sidecar）的 SHA256 校验和。复用 `align_words`、`time_scene` 与任务发布保护机制。
  - **防误计费保护**：若本地缓存缺失、数据被篡改、区间越界或文本与音频不匹配，直接明确报错失败，**绝不自动转入收费配音流程**。
  - **沙箱隔离**：执行子进程不携带任何模型或语音供应商 API 密钥，不分配外部 HTTP 客户端；任务发布过程中不发生音频文件的远程上传或下载。
  - **幂等与版本控制**：重复提交的任务具有幂等性；过期结果不附着，已取消或旧 attempt 均禁止发布。
  - **使用限制**：依赖本机已有的原始 WAV 音频和词侧车文件；若导入外部音频或侧车丢失则无法重算，系统不凭空捏造时间戳；执行重算会覆盖局部的自定义动画/字幕微调时间。修改文案引起的 `needs_voice` 仍必须调用配音接口。

### 场景特殊属性：明确主题的自动开场预告 (`role: "topic"`)
- **元素角色定义**：
  - 场景中的教学元素（Element）可指定属性 `role: "topic"`。
  - **模板限定**：仅允许在 `title_reveal`（标题卡片）与 `card_sequence`（逐步卡片）模板中使用，每个场景最多只能包含 1 个主题元素。
  - **内容限定**：带有 `role: "topic"` 的元素严禁包含代码块、变量定义、输出结构、状态图或事件流结构。
- **自动开场编排规则 (`time_scene`)**：
  - 共享的 `time_scene` 调度逻辑会将该主题元素强制调整为从第 6 帧（frame 6）开始出现，入场动画持续时间（duration）固定为 1 帧（约 0.233 秒即可完整呈现），从而消除视频开场长时间空白。
  - 普通代码行、计算结果及流程步骤仍遵循原本的口播 cue 触发；讲稿原文、词级时间戳、配音音频及字幕完全不受影响。
- **编辑与防护要求**：
  - 编辑器中主题属性标记为只读；角色的变更必须通过候选分镜确认后，执行本地时间轴重算（`POST /api/scenes/{id}/timing`）生效，禁止通过普通保存绕过。
  - 未标记的旧场景数据不会被擅自提前。主题文本是否提前剧透讲解答案仍需人工审核。

---

## 任务管理

### `GET /api/projects/{id}/jobs`
- **功能描述**：返回最近50条任务，并补齐每个当前场景 revision 的最新 voice 任务，按创建时间与ID倒序，去重。最多为50加当前场景数，避免旧历史挤掉整课配音进度。
- **整课总览**：展示待确认/待配音/待对齐/就绪数量，以及本版任务排队/处理/完成/失败/取消数量；错误可定位章节，失败重试仍须显式确认。

### `GET /api/jobs/{id}`
- **功能描述**：查询后台异步任务的执行状态、进度与输出。
- **路径参数**：`id` (UUID) - 任务 ID。
- **返回字段**：
  - 包含公开任务状态（`queued`、`running`、`succeeded`、`failed`、`cancelled`）、执行进度、候选 ID 以及任务作用域标记（如单场景预览任务标记为 `scope=scene`）。
- **隐私保护**：不返回原始输入快照，不暴露内部 attempt ID。

### `POST /api/jobs/{id}/cancel`
- **功能描述**：取消正在排队或执行中的后台任务。
- **路径参数**：`id` (UUID) - 任务 ID。
- **进程管理机制**：在 macOS / Linux 环境中，系统会向包含 FFmpeg 等进程在内的整个进程组发送终止信号。取消后，任何未完成的旧 attempt 均被隔离，禁止向数据库写入结果。

### `POST /api/jobs/{id}/retry`
- **功能描述**：手动重试执行失败的任务。
- **路径参数**：`id` (UUID) - 任务 ID。
- **注意事项**：环境配置错误或凭据缺失属于可重试的 configuration 错误，修正 `.env` 后重启 Worker 即可重试；重新触发重试仍可能重复消耗第三方云端配额。

### 本地 Worker 联调（单次消费模式）
在进行本地排查或离线调试时，可脱离常驻 Celery 进程，使用单次消费命令执行排队任务：

```bash
# 只消费一个已排队任务；无排队任务时退出并输出 idle
python3 -m services.workflow.worker --once

# 为指定场景提交任务并立即进行单次消费（UUID 与 revision 从项目查询接口获得）
python3 -m services.workflow.worker --once --scene-id SCENE_UUID --revision 1
```

- **参数冻结**：读取 `.env` 中的 `DATABASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`；模型名称、原始场景数据及 `base_revision` 在提交瞬间冻结，API 密钥不会进入快照存储。
- **任务预算与心跳限制**：
  - 分镜生成子进程预算：120s
  - 配音 (voice) 子进程预算：240s
  - 渲染 (render) 子进程预算：840s
  - 工作流整体预算上限：900s，心跳间隔：10s
- **事务原子性**：最终候选分镜的生成与任务状态流转在同一数据库事务中提交，过期的旧 attempt 无法写入。

---

## 渲染导出

### `POST /api/projects/{id}/render`
- **功能描述**：基于已冻结的项目版本快照提交完整视频渲染合成任务。
- **请求参数**：
  - `version_id` (UUID)：不可变快照版本的 ID。
- **执行机制与安全限制**：
  - **先决条件**：必须先成功创建所有场景均为 `ready` 状态的不可变快照版本。
  - **快照只读性**：渲染器严格读取该版本快照，后续对项目草稿的编辑修改不会影响当前渲染。
  - **队列隔离**：渲染 Worker 绑定独立的单槽 `render` 队列，并发度为 1，不阻塞分镜拆分与配音生成。
  - **子进程预算与安全**：渲染子进程执行预算为 840s，执行环境中不注入任何第三方供应商密钥。
  - **输出校验与目录规范**：每个 attempt 运行于独立沙箱目录；发布前系统严格核验视频输出规格为 1080P/30FPS、H.264/AAC 编码、总帧数、时长及字幕的一致性。产物保存在 `apps/renderer/public/renders/{job_id}/{attempt_id}`，失败或取消的历史文件保留以供排查。

### `POST /api/scenes/{id}/preview`
- **功能描述**：已配音单场景本地渲染预览（无需整门课程全部就绪）。
- **请求参数**：
  - `expected_revision` (int)：期望的场景版本号。
- **执行机制与安全限制**：
  - **先决条件**：仅支持已保存且状态为 `ready` 的单场景。若场景处于 `needs_voice`、`needs_timing` 或关联资源不可用，接口明确拒绝。
  - **轻量快照协议**：将选中的场景内容、本地音频及含完整视觉风格的profile冻结为 `scene-preview:2` 协议（历史v1仍兼容）并写入 `job.input`，复用渲染队列、任务幂等控制、取消机制与 attempt fence。
  - **版本隔离**：不向 `project_versions` 表写入全局版本快照，不修改项目全局版本号。其他场景未完成配音不会阻塞当前场景的预览渲染。
  - **返回结构**：任务成功后返回 `scene_id`、`scene_revision`、`snapshot_checksum` 以及产物下载校验和，不伪造 `version_id`；查询接口中标识 `scope=scene`。

### `GET /api/renders/{id}`
- **功能描述**：只读查询视频导出任务的状态及下载元数据。
- **路径参数**：`id` (UUID) - 导出任务 ID（即 `render_job_id`）。
- **执行机制与规范**：
  - **纯只读模式**：内部直接调用 `Jobs.get` 查询数据库，不触发任务恢复、提交或重试，不读取本地磁盘文件，不调用外部存储。
  - **返回内容**：成功时返回公开状态及 `downloads` 列表（提供固定的 MP4、SRT 下载地址及已发布的 SHA256 校验和）；未完成或失败时 `downloads` 为空。
  - **状态码约定**：非 render 类型任务或 ID 不存在返回 `404 Not Found`；发布校验和数据不完整返回 `422 Unprocessable Entity`。
  - **说明**：元数据仅代表发布记录，不代替实际下载时的磁盘文件核验。

### `GET /api/jobs/{id}/files/mp4` 与 `GET /api/jobs/{id}/files/srt`
- **功能描述**：下载渲染导出的 MP4 视频或对应 SRT 字幕文件。
- **路径参数**：`id` (UUID) - 渲染或预览任务 ID。
- **安全检查**：
  - 任务未完成、已取消、文件缺失或磁盘文件的 SHA256 校验和与发布记录不符时拒绝下载。
  - 仅按系统内部任务路径寻址，严格不接受用户自定义的文件路径参数。

---

## 工作台与前端交互

### Next.js 本地教学编辑器启动

```bash
# 开发模式启动
npm run web
# 浏览器打开 http://127.0.0.1:3000

# 生产环境构建与启动（同样只绑定本地回环）
npm run web:build
npm run web:start
```

### 功能概述与交互规范

- **三栏式交互架构**：
  - 支持中文文稿录入、首次生成教学分镜、场景上下调整顺序、口播与代码/步骤/变量快照编辑、候选分镜比对与显式采纳、单场景配音恢复、单场景本地快速预览、基于 Remotion Player 的全视频流式播放预览、冻结快照版本发布以及 MP4/SRT 产物下载。
- **表单编辑与安全边界**：
  - 步骤说明、代码高亮行号、变量列表与输出内容支持结构化表单编辑，同时提供高级 JSON 原文编辑模式。
  - 元素编号、顺序及topic/concept_role仍只读（concept需已升级API）；流程边可在现有节点间手工编辑。步骤cue支持起止范围输入与原文预览（本机API已启用），非法原始输入可恢复且禁止保存/切模式；高级JSON合法切换不丢范围。图表仍须独立人工确认。大幅结构变化走显式候选确认，不做自由画布拖拽。
  - 步骤 cue 标记严格遵循 Unicode 码点计数，代码行号从 1 开始编号；代码仅用于高亮教学展示，前端与后端均不执行教学代码。
- **网络通信与状态同步**：
  - 前端浏览器直连本地回环 API（`http://127.0.0.1:8000`），服务端校验 Origin 仅允许本地 `3000` 与 `8000` 端口。
  - 第三方 AI 与 TTS 供应商凭据完全隔离在服务端环境中，前端不接触任何私密密钥。
  - 导出前检查复用 DSL 校验，展示未保存输入、缺分镜、待配音、待对齐、缺音频引用及字段/布局错误，并能定位对应章节；存在阻塞时禁用导出。前端不检查磁盘媒体字节，冻结接口仍为最终 DSL/实际音频校验边界；不替代人工听检。
  - 用户未保存的本地草稿不会被后台轮询的任务状态所冲掉；页面跳转或刷新具有放弃确认弹窗；遭遇 `409 Conflict` 冲突时保留当前表单输入。
  - 任务面板在重新打开项目后可持续查询进度；涉及计费的模型生成、配音恢复及任务重试操作均具有明确的二次确认机制。
  - 整门课程的完整视频预览与冻结导出要求所有场景均达到 `ready` 状态；单场景预览功能仅要求当前选中的场景达到 `ready`。

---

## 导航

- [返回 README](../README.md)
