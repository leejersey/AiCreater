# Teaching Runtime 失败基线

任务 1 只新增脱敏证据、离线分类测试和本文档，不修改运行时或另一 agent 开发的 provider。

## 证据边界

| 案例 | 原始记录支持的事实 | 本次离线验证 |
| --- | --- | --- |
| `legacy-layout` | `93f7066e-10a9-494b-bdc5-96e9e244be18`：`layout_preflight`，6 条 `object-overlap`；stage 1，1 次请求，0 次自动重试 | 合成两个相交矩形，通过已有 `assertDesignLayout` 触发同类诊断，再移动矩形验证通过。不是原布局、完整设计或原场景重放 |
| `legacy-provider-json` | `8e382d50-986f-4b5d-b2ca-167e65548e92`：顶层仅记录失败和请求数；`provider-1.failure.json` 才记录 `invalid_json`、无可执行产物；stage 1，1 次请求，0 次自动重试 | 三个合成坏 JSON 被 Python 标准 `json.loads` 拒绝，并有合法 JSON 对照。未复制或推断原返回正文及具体语法错误 |
| `executor-missing` | 用户提供的运行观察：缺少执行器，排队约 8 分钟；没有核验原日志 | 仅断言 fixture 的分类约束：执行器基础设施阻塞，非生成慢、非成功、非已执行。不是生产分类器测试，也没有重放队列或等待 480 秒 |

两个历史任务的 `generation-mode.json` 均为 `source`，因此不得包装成新 teaching-plan/provider 的失败重放。执行器观察未确认模式，记为 `null`；480 秒是排队观察时长，不是模型生成耗时，生成耗时记为 `null`。没有证据的请求数、时间戳和 SHA 不补造。

**新 provider 边界：** 当前 `new_provider_verified=false`。标准 decode 拒绝不能证明新 provider 已拒绝这些响应；待其 API 就绪，由 provider 所属 agent 增加离线集成断言。本文不声称端到端修复或新 provider 验收通过。

## SHA256 与脱敏

fixture 的 `evidence` 保存仓库相对路径和下列原文件完整字节 SHA256，不是脱敏 JSON 的摘要。四份失败文件以及两个模式文件均只读；默认测试不依赖历史 output 目录，摘要核对是独立的只读验真步骤。

| 目录前缀 | 文件 | 原文件 SHA256 |
| --- | --- | --- |
| `93f7066e` | `failure.json` | `12c0a3a13eee0f29785ac76cb7c8b98e561fc4510e5f74206ebe8f43daeb3554` |
| `93f7066e` | `provider-1.failure.json` | `2ea0ce5c9504f8eb09fe080b48ef4f9fed8a49f494ff95c5be4d18bd5f8d69b5` |
| `8e382d50` | `failure.json` | `17c87eb4a0043b6716d4758c666176881a3a77af029f0080495b8f756f221f5c` |
| `8e382d50` | `provider-1.failure.json` | `883aecc5e1590d15c7726cc4e65f41031c7e1faf942a5cd9eec4d2cb153bc560` |
| 两个目录 | `generation-mode.json`（各自相同） | `d8d3c45e7b1dc5ac690d700d24d3b4cedfadd072413b6fe0eb58a45a96b26842` |

仅保留错误分类、数量、请求/重试计数、模式和摘要。丢弃原错误全文、对象名称、坐标和 detail，不读取 provider 正文或 request 文件；样本不含课程稿、模型返回正文、请求提示词、密钥或机内绝对路径。布局坐标和 JSON 字符串全部为独立合成探针，不能用于恢复原场景。测试额外约束相对路径、摘要格式、字段集合、体积和敏感标记。

## 运行

在仓库根目录，使用已安装的 Node、tsx 和 Python 标准库：

```sh
python3 -B -m unittest services.tests.test_teaching_runtime_baseline -v
```

不安装依赖、不读取环境配置文件、不访问 HTTP、模型、Docker、数据库或消息队列。唯一子进程是 Node 导入纯布局校验模块，使用白名单环境并禁用 tsx 缓存；缺少本地依赖会失败而非跳过。Python `-B` 避免写入字节码。

5 项测试覆盖脱敏与来源契约、旧 source 模式及错误层级、真实布局校验正反对照、标准 JSON 解码正反对照、observed 执行器分类。通过只表示这些离线约束成立，不表示真实场景可离线重放或生成成功。

本次实测：5 项全部通过。初始 shell 的 PATH 未包含 Node，布局项按预期报缺少运行时；将本机已有 Node 的 bin 目录加入 PATH 后重跑通过，未安装依赖、未在仓库写入机器路径。复跑前需确保 `node` 可通过 PATH 找到。
