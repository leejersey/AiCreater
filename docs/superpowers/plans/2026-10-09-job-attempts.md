# Durable Job Attempts Implementation Plan

**Goal:** 完成任务控制面的 PostgreSQL 状态机、幂等、取消与失效 attempt 隔离，随后才能安全接真实执行器。

**Architecture:** 沿用 PostgreSQL/Store 事务与错误去敏。首个任务类型是分镜重生成，输入由服务端按场景 revision 冻结，不接收自由 payload。执行器仍规划使用 Celery；本轮不加未使用的依赖，不开放虚假的 regenerate/voice/render 202。

**Tech Stack:** Python、psycopg、PostgreSQL 16、unittest。

## 工作清单
- [ ] 新增 services/tests/test_jobs.py，测试幂等、并发单 claim、取消、重试三次上限、过期心跳、旧 attempt 写入拒绝、输入快照与配置哈希。
- [ ] 新增 services/projects/jobs.sql：jobs、job_attempts、唯一输入哈希、心跳/取消标志/尝试数；任务关联项目/场景。
- [ ] Store.initialize 加载独立 jobs 迁移。
- [ ] 新增 services/projects/jobs.py：submit_regenerate/get/claim/heartbeat/fail/cancel/retry/recover；终态和 current attempt 在事务内保护。
- [ ] 扩展 services/tests/run_project_tests.py 跑真实 PG 测试。
- [ ] 验证正常回归、PG、类型与编译检查并更新 README。

## 本轮明确边界
没有任务执行器、成功产物发布或 API 生成入口。succeeded 状态保留在协议中，但不能通过本轮方法伪造成功。下一阶段必须把 candidate 插入与 job 成功写入放进同一 fenced 事务，增加 source_job/source_attempt 外键，再接 Celery；不允许先发布候选再检查 attempt。

重试显式进行，暂时错误最多三次尝试，2/4s退避；验证错误不可重试。claim 检查单 workflow 活跃尝试，60s无心跳或900s总运行时间则失效。取消 running 只置请求标志，执行器确认后才 cancelled。任务快照可能包含教学文稿，不包含供应商认证或连接串。

用户已批准既有契约的连续开发，主代理内联执行；不委派、不提交 Git、不启动长期服务、不调用付费供应商。
