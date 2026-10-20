# Regenerate Worker Implementation Plan

**Goal:** 分镜重生成任务能真正执行并产出待确认候选，成功发布与 attempt 检查是同一事务。

**Architecture:** 复用现有 DeepSeek 适配器，加入单场景模式。PostgreSQL 输入快照与 attempt 为最终权威；Worker 核心不依赖 Celery，先提供显式 --once 联调入口，再由 Celery 调用同一个执行函数。不会用后台线程充当生产任务队列。

**Tech Stack:** Python subprocess、httpx、PostgreSQL、unittest。

- [x] 复用候选验证/插入代码，在同一事务完成 source_job/source_attempt 与 job succeeded；取消、失效和旧 attempt 均不能发布。
- [x] 新增单场景 DeepSeek 请求：保留场景 ID 和原口播，只生成程序/AI教学图解，不执行示例代码。
- [x] 子进程限制120s，10s心跳，支持取消终止，限制输出大小；不暴露供应商原始响应/异常。凭据只在运行时给子进程，不写快照。
- [x] PG与替身Worker测试：成功、迟到结果、并发用户编辑、原文保护、事务回滚与取消。
- [x] 回归、文档更新。

验证结果：43项真实PG测试、37项不依赖PG的Python测试、71项TS测试均通过；类型检查及Python编译通过。PG项目在普通discover中跳过，另由临时数据库专门运行，不重复计数。真实子进程替身覆盖成功、超时、stderr保密与取消；DeepSeek单场景模式通过HTTP替身检验ID/空白/原文保护。未调用收费供应商；未声称完成Celery调度或完整教学验收。

本轮不接 TTS/preview/render，也不启动收费调用。Celery/Redis 调度与HTTP生成入口只有在真实调度可用后才启用；本地 --once 是调试工具，不冒充完整生产队列。
