# 个人中心自定义模型配置（替代 GPT Image 2）

用户已确认：新方案不再需要生图；个人中心改为可自行配置的 **OpenAI 兼容 LLM**（Base URL + API Key + 模型 ID），默认 DeepSeek；选方案 **A**（改造现有账号加密配置，真正接入全部 LLM 调用）；未配置时 **回退** 服务端 `.env` 的 `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`。

## 目标与边界

- `/account` 将「GPT Image 2 配置」改为「模型配置」：可保存 / 替换 / 删除当前账号的 Base URL、API Key、模型 ID。
- 默认值：`https://api.deepseek.com/v1`、模型 `deepseek-flash`；未保存过配置时 UI 与解析回退均按此默认展示/使用路径中的全局密钥。
- **生效范围**：全部现有 LLM 调用——网页大纲/讲稿生成，以及视觉 Agent（`scene-agent`）子进程。TTS / 对象存储 / Remotion 渲染不变。
- 保存仍不探测 DNS、连通性或模型是否兼容；不产生付费请求。
- 本轮不做：生图、Anthropic 官方适配器、多套配置切换、管理员代管他人密钥、保存时测通。

## 存储与加密

- 复用 `ACCOUNT_CREDENTIALS_KEY` + Fernet；密钥仅服务端解密，GET 永不回显。
- 物理表由 `user_image_settings` 演进为 `user_model_settings`（新库直接建新表；已有库 `RENAME` + 加列）：
  - `user_id` PK
  - `base_url` text NOT NULL
  - `model` text NOT NULL（ASCII 可打印、长度上限与现有 API Key 同级保守限制，建议 ≤200）
  - `encrypted_api_key` text NOT NULL
  - `updated_at`
- 旧行：加列后 `model` 默认 `deepseek-flash`。若某人曾保存过 OpenAI 生图地址，该行视为无效业务配置，用户需自行改成 LLM 地址或删除后重配；不自动清库。
- 换 Base URL 必须重填 Key（与现逻辑一致）；地址不变且 Key 留空则保留密文。

## API

路径改为（前端只调新路径；删除旧 `/api/auth/image-settings*`）：

| 方法 | 路径 | 行为 |
|------|------|------|
| GET | `/api/auth/model-settings` | `{ configured, base_url, model }`；未配置时返回默认 URL/模型且 `configured:false` |
| POST | `/api/auth/model-settings` | body：`base_url`, `api_key`, `model`（`extra=forbid`） |
| POST | `/api/auth/model-settings/clear` | 删除当前账号配置 |

校验：

- `base_url`：沿用现有 HTTPS / 无 userinfo·query·fragment / 拒绝显式非公网 IP 与本机域名规则。
- `api_key`：与现规则相同。
- `model`：非空、可打印 ASCII、长度上限；不做供应商枚举白名单（用户可填任意 OpenAI 兼容模型 ID）。

鉴权、CSRF、`Cache-Control: no-store` 与现账号接口一致。

## 运行时解析

新增服务端单一入口（名称实现自定，语义如下）：

```text
resolve_llm(user_id) -> { base_url, api_key, model, source: 'account' | 'env' }
```

- 账号有行且密文可解密 → `source=account`，使用行内三字段。
- 否则 → `source=env`：`api_key=DEEPSEEK_API_KEY`，`model=DEEPSEEK_MODEL` 或默认 `deepseek-flash`，**固定** `base_url=https://api.deepseek.com/v1`（讲稿与账号默认一致；Agent 无账号配置时仍走 `models.json` 内既有 `baseUrl`，不强制改 registry）。
- 两者都缺密钥 → 现有 `ProviderError(config, missing_setting, …)` 类失败，提示可去个人中心配置或设置环境变量。
- **禁止**把 `ACCOUNT_CREDENTIALS_KEY` 或数据库密文传给 Node / 日志。
- **主体**：视觉任务按课程 `projects.owner_id` 解析（与现有项目归属一致）；讲稿按当前登录 `user_id` 解析。

### 讲稿 / 大纲（Python）

- `generate_manuscript`（及同源 DeepSeek HTTP 调用）改为使用 `resolve_llm` 的 `base_url` + `api_key` + `model`，**去掉**写死的 `https://api.deepseek.com/chat/completions`。
- 请求路径：在规范化后的 `base_url` 后拼接 `/chat/completions`（默认得到 `https://api.deepseek.com/v1/chat/completions`）；禁止跟随重定向；超时与体积限制保持现状。
- 仅当 `model` 为已知 DeepSeek 闪模型（如现有 `deepseek-flash` / `deepseek-v4-flash`）时保留 `thinking: disabled` 特例；其它模型 ID 不附加该字段。

### 视觉 Agent（Node 子进程）

现状：`AGENT_MODEL = deepseek-flash-thinking` 必须存在于 `packages/scene-agent/models.json`；子进程环境只注入 `DEEPSEEK_API_KEY`。

目标行为：

1. **回退（无账号配置）**：保持现状——`models.json` 条目 + 环境 `DEEPSEEK_API_KEY`；工作台默认模型名仍为 `deepseek-flash-thinking`（与评测默认一致）。全局 `DEEPSEEK_MODEL` 若存在，仅影响讲稿回退，**不**擅自改 Agent 默认 registry 名（避免把 `deepseek-flash` 与 `deepseek-flash-thinking` 混用）。
2. **账号已配置**：worker 在启动该 job 的 Node 进程前解密 owner 凭证，经 **环境变量**（如 `ACCOUNT_LLM_BASE_URL` / `ACCOUNT_LLM_API_KEY` / `ACCOUNT_LLM_MODEL`）注入子进程；**不要**把明文 API Key 写入持久化的 `jobs.input`（该列会落库且参与相同输入去重）。`scene-agent-job` 在存在覆盖时构建一次性 OpenAI 兼容 Provider：`baseUrl`/`model`/`apiKey` 来自环境覆盖；`capabilities` / `budget` / 可选 `extraBody` **克隆** `models.json` 中 `deepseek-flash-thinking` 模板（thinking low），使未知供应商模型仍有关卡预算上限。覆盖模式下日志可用账号 `model` 字符串作标签。
3. `child_environment`：Agent 任务在覆盖模式下注入上述临时密钥变量，**仍不**传入 `DATABASE_URL` / `ACCOUNT_CREDENTIALS_KEY` / TOS 密钥。

CLI 本地 `npm run scene-agent` 可继续只读 `.env`；本需求以工作台 job 路径为准。

## 前端

- 组件/文案：标题「模型配置」；说明改为「仅当前账号；保存不调用模型；未配置时任务使用服务端 DeepSeek」。
- 增加「模型 ID」输入；默认值 DeepSeek。
- 导航 Tab 由「生图 / image」改为「模型 / model」（若存在）。
- 解析与测试同步改名（`model-settings`）；删除生图相关文案。

## 文档

- 更新 README、`docs/local-operations.md`：去掉「GPT Image 2 / 尚未接通生图」表述，改为模型配置与回退说明。
- `.env.example` 注释可注明：全局 `DEEPSEEK_*` 为未配置账号时的回退。

## 测试与验收

1. URL / model / 加密 / 留空保留 Key / 换 URL 必填 Key / 跨账号隔离（扩写现有 `test_image_settings`）。
2. `resolve_llm`：有配置用账号；无配置用 env；缺密钥报错。
3. 讲稿请求打到自定义 `base_url…/chat/completions`，Authorization 为账号 Key。
4. Agent worker：有覆盖时子进程 env 含账号 Key、无 DB/加密主密钥；无覆盖时仍为 `DEEPSEEK_API_KEY`。
5. 前端：默认 DeepSeek、三字段保存、删除配置后状态回到未配置。

## 明确非目标

- 不保证第三方 Base URL 与 Agent 工具协议兼容；不兼容时任务按现有 Provider/关卡失败表面暴露。
- 不在本轮迁移历史生图密钥到其它系统；不清理对象存储。
