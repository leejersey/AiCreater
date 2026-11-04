# 个人中心自定义模型配置（替代 GPT Image 2）

状态：已实现（2026-11-04）。实现中补充了两点，见「请求时的目标地址检查」第 5、6 条。

用户已确认：新方案不再需要生图；个人中心改为可自行配置的 **OpenAI 兼容 LLM**（Base URL + API Key + 模型 ID），默认 DeepSeek；选方案 **A**（改造现有账号加密配置，真正接入全部 LLM 调用）；未配置时 **回退** 服务端 `.env` 的 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`。

## 目标与边界

- `/account` 将「GPT Image 2 配置」改为「模型配置」：可保存 / 替换 / 删除当前账号的 Base URL、API Key、模型 ID。
- 默认值：`DEEPSEEK_BASE_URL = https://api.deepseek.com`、模型 `deepseek-flash`。这是唯一的默认地址常量：讲稿回退、账号默认展示与 `models.json` 的 DeepSeek 条目都用它（`/chat/completions` 由调用方拼接）。
- **生效范围**：全部现有 LLM 调用——网页大纲/讲稿生成，以及视觉 Agent（`scene-agent`）子进程。TTS / 对象存储 / Remotion 渲染不变。
- 保存不探测 DNS、连通性或模型是否兼容，不产生付费请求；**目标地址安全在每次发请求时检查**（见「请求时的目标地址检查」）。
- 本轮不做：生图、Anthropic 官方适配器、多套配置切换、管理员代管他人密钥、保存时测通。

## 存储与加密

- 复用 `ACCOUNT_CREDENTIALS_KEY` + Fernet；密钥仅服务端解密，GET 永不回显。
- 新表 `user_model_settings`，迁移时删除 `user_image_settings`（线上该表为 0 行，2026-11-04 核实；不迁移旧数据）：
  - `user_id` PK
  - `base_url` text NOT NULL
  - `model` text NOT NULL（可打印 ASCII，≤200）
  - `encrypted_api_key` text NOT NULL
  - `updated_at` timestamptz NOT NULL：配置版本，任务提交时冻结（见「任务冻结」）
- 迁移按 `jobs.sql` 的版本守卫惯例写成幂等块，初始化两次不报错。
- 换 Base URL 必须重填 Key（与现逻辑一致）；地址不变且 Key 留空则保留密文；任何保存都刷新 `updated_at`。

## API

路径改为（前端只调新路径；删除旧 `/api/auth/image-settings*`）：

| 方法 | 路径 | 行为 |
|------|------|------|
| GET | `/api/auth/model-settings` | `{ configured, base_url, model }`；未配置时返回默认 URL/模型且 `configured:false` |
| POST | `/api/auth/model-settings` | body：`base_url`, `api_key`, `model`（`extra=forbid`） |
| POST | `/api/auth/model-settings/clear` | 删除当前账号配置 |

校验：

- `base_url`：沿用现有 HTTPS / 无 userinfo·query·fragment / 拒绝显式非公网 IP 与本机域名规则（保存时只做语法检查）。
- `api_key`：与现规则相同。
- `model`：非空、可打印 ASCII、≤200；不做供应商枚举白名单。

鉴权、CSRF、`Cache-Control: no-store` 与现账号接口一致。

## 请求时的目标地址检查（SSRF）

保存的 Base URL 以前从不被请求；现在服务端与 Agent 子进程都会请求它，所以每次发请求前都必须检查，Python 与 Node 各实现一次：

1. 解析主机名得到全部地址；任一地址不是公网单播（`is_global` 为假：回环、私网、链路本地、CGNAT、组播、保留段，含 IPv4 映射的 IPv6）就拒绝。
2. **连接到第 1 步检查过的 IP**（保留原主机名做 TLS SNI 与证书校验），不再二次解析，防止 DNS 重绑定。
3. 不跟随重定向；超时与响应体积上限保持现状。
4. 拒绝时报 `ProviderError(config, unsafe_destination, …)`，不发请求、不计费；错误信息不回显解析出的地址。
5. **不经过 `HTTP(S)_PROXY`**：代理会自己解析域名，等于绕过检查。Python 用 `httpx.Client(trust_env=False)`（否则 `pinned_post` 拒绝），Node 直接用 `node:https`。
6. **Fake-IP 代理**：Fake-IP 模式的本机代理把所有域名都解析到 `198.18.0.0/15`（开发机实测 api.deepseek.com、火山域名均如此），严格检查会拒绝所有请求。`LLM_FAKE_IP_CIDR=198.18.0.0/15` 声明该网段由本机代理接管、予以放行，其余非公网地址照旧拒绝；默认不设置。

服务端回退（`source=env`）的固定 DeepSeek 地址同样走这条路径。

## 运行时解析

新增服务端单一入口：

```text
resolve_llm(user_id) -> { base_url, api_key, model, source: 'account' | 'env', version }
```

- 账号有行且密文可解密 → `source=account`，使用行内三字段，`version=updated_at`。
- 否则 → `source=env`：`api_key=DEEPSEEK_API_KEY`，`model=DEEPSEEK_MODEL` 或默认 `deepseek-flash`，`base_url=DEEPSEEK_BASE_URL`，`version=null`。
- 两者都缺密钥 → 现有 `ProviderError(config, missing_setting, …)` 类失败，提示可去个人中心配置或设置环境变量。
- **禁止**把 `ACCOUNT_CREDENTIALS_KEY` 或数据库密文传给 Node / 日志。
- **主体**：视觉任务按课程 `projects.owner_id` 解析；`owner_id` 为空（旧数据、导入的课程）时按 `source=env` 处理。讲稿按当前登录 `user_id` 解析。

### 讲稿 / 大纲（Python）

- `generate_manuscript`（及同源 DeepSeek HTTP 调用）改为使用 `resolve_llm` 的 `base_url` + `api_key` + `model`，**去掉**写死的 `https://api.deepseek.com/chat/completions`。
- 请求地址：规范化后的 `base_url` + `/chat/completions`，经「请求时的目标地址检查」。
- 仅当 `model` 为已知 DeepSeek 闪模型（`deepseek-flash` / `deepseek-v4-flash`）且 `base_url` 为 `DEEPSEEK_BASE_URL` 时保留 `thinking: disabled` 特例；其它情况不附加该字段。

### 任务冻结（视觉 Agent）

付费是在提交时确认的，用哪套模型也在提交时定下来：

- 提交 Agent 任务时调用 `resolve_llm(owner)`，把 `llm: {source, base_url, model, version}` 写入 `jobs.input`（**不含 API Key**）。`input_summary` 公开 `llm.source` 与 `llm.model`，供页面和历史记录显示实际使用的模型。
- 执行时 worker 再次解析：`source`、`base_url`、`model`、`version` 与冻结值任一不同 → 任务判为过期失败（`stale`，提示「模型配置在提交后变更，请重新提交」），**不**换供应商继续跑，不计费。
- 确认弹窗写明本次使用的模型：「账号配置 · {model} · 按你的服务商计费」或「服务端 DeepSeek」。
- 结果校验：`result.model` 仍等于 `input.model`（registry 名 `deepseek-flash-thinking`）；实际使用的模型以 `input.llm` 为准，避免覆盖模式下付费跑完的任务因 `model` 不符被判失败。
- 同一章节、同一输入的去重键自然包含 `llm`：换了配置的重新提交不会被当成同一个任务。

### 视觉 Agent（Node 子进程）

现状：`AGENT_MODEL = deepseek-flash-thinking` 必须存在于 `packages/scene-agent/models.json`；子进程环境只注入 `DEEPSEEK_API_KEY`。

目标行为：

1. **回退（`llm.source=env`）**：保持现状——`models.json` 条目 + 环境 `DEEPSEEK_API_KEY`；全局 `DEEPSEEK_MODEL` 只影响讲稿回退，不改 Agent 的 registry 名。
2. **账号配置（`llm.source=account`）**：worker 在启动 Node 进程前解密 owner 凭证，经环境变量 `ACCOUNT_LLM_BASE_URL` / `ACCOUNT_LLM_API_KEY` / `ACCOUNT_LLM_MODEL` 注入子进程；明文 Key 不写入 `jobs.input`。`scene-agent-job` 用这些值构建一次性 OpenAI 兼容 Provider：
   - **不带** `extraBody`，**不开** `echoReasoning`（`thinking`、`reasoning_effort`、`reasoning_content` 回传是 DeepSeek 专有，其它服务常以 400 拒绝未知参数）；
   - `capabilities` 用保守通用值：`vision:false`、`parallelToolCalls:false`、`contextTokens:64000`、`maxOutputTokens:8192`、`promptCache:false`、`appendOnlyHistory:false`；
   - `budget` 沿用 `deepseek-flash-thinking` 的轮数与输出 token 上限（费用上限）；
   - 请求经「请求时的目标地址检查」（Node 端实现）；
   - Provider 建好后立即从 `process.env` 删除 `ACCOUNT_LLM_API_KEY`，渲染时启动的浏览器等孙进程不继承它。
3. `child_environment`：只有 Agent 任务在账号模式下注入上述三个变量；导出与主题重渲染任务不注入；任何任务都**不**传入 `DATABASE_URL` / `ACCOUNT_CREDENTIALS_KEY` / TOS 密钥。

CLI 本地 `npm run scene-agent` 可继续只读 `.env`；本需求以工作台 job 路径为准。

## 前端

- 组件/文案：标题「模型配置」；说明改为「仅当前账号；保存不调用模型；未配置时任务使用服务端 DeepSeek」。
- 增加「模型 ID」输入；默认值 DeepSeek。
- 导航 Tab 由「生图 / image」改为「模型 / model」（若存在）。
- Agent 确认弹窗与历史记录显示 `llm.model` 与来源；账号模式不显示 DeepSeek 价格参考，改为「按你的服务商计费」（`usage.py` 只有 DeepSeek 与 TTS 的价格）。
- 解析与测试同步改名（`model-settings`）；删除生图相关文案。

## 文档

- 更新 README、`docs/local-operations.md`：去掉「GPT Image 2 / 尚未接通生图」表述，改为模型配置、回退与任务冻结说明。
- `.env.example` 注释可注明：全局 `DEEPSEEK_*` 为未配置账号时的回退。

## 测试与验收

1. URL / model / 加密 / 留空保留 Key / 换 URL 必填 Key / 跨账号隔离 / 保存刷新 `updated_at`（扩写现有 `test_image_settings`）；迁移初始化两次。
2. `resolve_llm`：有配置用账号；无配置用 env；`owner_id` 为空用 env；缺密钥报错。
3. 目标地址检查（Python 与 Node）：域名解析到 `127.0.0.1`、`10.0.0.1`、`169.254.169.254`、`::ffff:127.0.0.1` 均拒绝且未发请求；公网地址按检查过的 IP 连接；重定向不跟随。
4. 讲稿请求打到自定义 `base_url…/chat/completions`，Authorization 为账号 Key；非 DeepSeek 不带 `thinking`。
5. 任务冻结：提交写入 `input.llm` 且不含 Key；提交后改配置 / 删除配置 → 执行时判过期，未启动子进程；未改配置 → 正常执行。
6. Agent worker：账号模式子进程 env 含三个 `ACCOUNT_LLM_*`、无 DB / 加密主密钥 / `DEEPSEEK_API_KEY`；Provider 请求体不含 `extraBody` 字段；env 模式仍为 `DEEPSEEK_API_KEY`；导出 / 重渲染任务两者都不注入。
7. 前端：默认 DeepSeek、三字段保存、删除配置后回到未配置；确认弹窗显示来源与模型。

## 明确非目标

- 不保证第三方 Base URL 与 Agent 工具协议兼容；不兼容时任务按现有 Provider/关卡失败表面暴露。
- 不迁移历史生图配置（线上为空）；不清理对象存储。
