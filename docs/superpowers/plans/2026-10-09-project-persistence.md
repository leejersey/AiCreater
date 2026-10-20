# 教学项目持久化与编辑 Implementation Plan

> **For agentic workers:** 使用 executing-plans 顺序执行，不启用代理，不创建 Git 提交。

**Goal:** 先交付第三阶段的一小块：将已有教学视频项目保存到 PostgreSQL，支持带版本保护的内容修改、排序和不可变快照。

**Architecture:** 保持既定 PostgreSQL 路线，不改 SQLite。事务锁项目行后修改场景，场景和项目 revision 一起递增；所有参数用绑定或 SQL Identifier。复用 Python DSL/草稿校验与 Node verifyAssets；保存已生成资产引用，不重新请求 LLM/TTS。先给本地 CLI，FastAPI/Worker/编辑器后续接同一仓库。

**Tech Stack:** PostgreSQL 16、已安装 psycopg 3.3.3、Python、现有 Node/FFmpeg。

## 文件与步骤

- [x] `services/tests/test_projects.py`：先测试导入/重启读取、过期编辑/排序冲突、不重配音、口播失效、快照不变、事务回滚、资源篡改与非法元数据。
- [x] `services/tests/run_project_tests.py`：独立临时 postgres:16 容器，只绑定127.0.0.1随机端口；随机密码仅放子进程环境，退出清理自身容器，不访问/删除用户已有库。不把未跑真实 PG 的测试记为通过。
- [x] `services/projects/schema.sql`：projects/scenes/project_versions，外键、唯一场景名/位置、非负版本计数；版本无更新或删除入口。
- [x] `services/projects/store.py`：导入完整 DSL、读取、编辑、完整排序、快照和版本读取；输入失败不得写库。库操作有限连接/语句超时，错误不暴露 DSN/密钥。
- [x] `scripts/verify-project.ts`：复用 verifyAssets 与 validateProject；检查文件范围、哈希、时长，不打印供应商密钥或原始异常体。
- [x] `services/projects/manage.py`：import/get/edit/reorder/version/export 本地命令。DATABASE_URL 只从本地环境读取，不作为命令行参数或输出。
- [x] README/开发契约/依赖：精确说明第三阶段仅仓库和 CLI，不宣称队列、Web 编辑器已实现。

## 本轮边界

- 修改 elements 时保留原有元素 ID/cue，只允许标签和代码步骤状态的编辑；结构/cue/模板更改留给后续编排任务，不偷偷复用旧动画。
- 代码与视觉内容修改后按完整 DSL 重验，保留音频引用/字幕/合法时间；不调用付费服务。技术含义仍需用户审核。
- 修改口播删除音频附着、字幕、时长与动画，保存合法草稿，state=needs_voice；不自动请求付费配音。未 ready 禁止快照。
- 快照内保存完整 DSL、项目 revision、主题/模板版本、字体内容 hash 和配音/渲染配置；不持久化 API Key。创建前验证所有本地音频；资产文件仍由本地磁盘持有，不提供删除入口。
- 首版有编辑 expected_revision、项目排序/快照 expected_revision；并发冲突必须显式返回 conflict，不覆盖。
- 不实现候选接受、任务执行/重试、HTTP 服务、S3/MinIO 或自动布局截图。这些仍是第三阶段的后续子任务。

运行预期：`python3 services/tests/run_project_tests.py` 先因为 store 模块缺失失败，完成后全部 PG 集成测试通过；再运行原有 Python/TS/类型检查。新测试不得调用 LLM/TTS。

## 实施结果

上述文件和 CLI 已实现。真实 PostgreSQL 16 集成测试13项通过（含并发编辑、代码/变量修改复用音频、口播失效、资产篡改、不可变快照、CLI导入/导出和拒绝覆盖）；既有34项 Python、71项 TS 和类型检查通过。普通工作流测试跳过PG项，已用专用临时容器单独核验，未把跳过计为成功。Compose配置校验通过；测试容器已清理，没有替用户启动长期数据库或调用付费供应商。

修复了测试环境就绪竞态：官方 postgres 镜像初始化时的 UNIX socket 已 ready，但宿主机 TCP 尚未监听；通过真实宿主机认证查询等待就绪，不以内部 pg_isready 冒充可连接。修复非法 narration_text 类型在 join 前未验证的问题；事务回滚测试通过。

CLI字体 hash 聚合实际 Noto Sans SC 400 woff2 内容与本机平台标识；系统等宽字体尚未打包，不保证跨机器逐像素一致。快照 voice 字段记录当前配置，不声称已验证导入音频的历史供应商来源。快照再次导出后继续使用既有 renderer 的资源和输出验证。

剩余：FastAPI、候选接受、配音/编排恢复、Celery任务状态与幂等、内部renderer快照接口、资产存储和Next.js教学编辑器。当前代码/元素编辑保留ID/cue/结构；这些是显式首批边界，不是全功能编辑器。
