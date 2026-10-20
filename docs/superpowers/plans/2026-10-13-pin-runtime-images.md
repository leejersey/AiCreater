# 固定运行镜像摘要实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 无代理/Git授权，内联自审，不创建worktree或提交。

**Goal:** 将当前验收版本锁为RepoDigest，并让真实隔离测试覆盖相同PG/Redis。

**Architecture:** 三个现有引用点仅替换image literal，沿用所有端口/卷/健康/清理/任务闸门。3个标准库静态测试保护固定摘要，不引入共享配置helper。

**Tech Stack:** Docker Compose/PostgreSQL16.13/Redis7.4.8、Python unittest/AST、现有Celery/RustFS/Remotion。

---

### Task1: 红绿最小配置变更

Files: Create services/tests/test_container_images.py；Modify compose.postgres.yaml、services/tests/run_project_tests.py、services/tests/run_queue_smoke.py。

- [x] 写3tests断言compose images / PG runner / queue container calls的真实literal与design固定digest一致；python3 -m unittest services.tests.test_container_images -v，实际3FAIL（当前浮动tag）。
- [x] 只替换postgres:16、redis:7-alpine镜像literal为spec RepoDigest，无其他运行逻辑变化。
- [x] 同命令3PASS；读所有调用点确认Docker实际参数/缓存digest/live configID一致。

### Task2: 隔离实测

- [x] python3 services/tests/run_project_tests.py，实际87项目/API/jobs/chart全通过，独立PG及随机回环端口，自动清理不碰原库。
- [x] python3 -m unittest services.tests.test_queue_smoke services.tests.test_container_images -v，6项通过；另discover221项=134PASS+87数据库SKIP，数据库已单独实际通过。
- [x] 原API持续运行。确认::1:8000空闲，临时复制queue runner只适配ROOT/测试API的IPv6地址/AF_INET6 preflight；供应商键保持空值。独立PG/Redis/RustFS+双worker/beat渲染已有350帧短课，冻结/编辑隔离、去重、取消0attempt、S3匿名拒绝/缺缓存回填/MP4 SRT验收。临时脚本不提交，不声称精确原IPv4 CLI端到端已执行。
- [x] 原stack containerID/StartedAt/DB6表hash/attempt58/媒体hash不变；清理所有本轮worker/容器/媒体，receipt无凭据。

### Task3: 交付

- [x] 同步docs/TODO.md、docs/local-operations.md、docs/dependency-license-review.md、docs/mvp-follow-up.md；README既有入口指向更新文档无需重复改，历史记录原tag不重写为当时已固定。
- [x] compose config --format json只在内存比较端口/卷/镜像，不输出插值凭据；测试/文档链接/密钥排除/容器无重启再核查。
- [x] 更新checkbox与验收事实，说明固定不等于升级/多架构验证或商用合规，其他待办保留。

状态：已实现并实证，receipt output/workbench/image-pin-qa/receipt.json。没有原stack up/recreate、版本拉取或供应商调用；无Git元数据，保留本地变更，不伪称提交/独立审查。下次compose up可能因引用变化重建容器，须走停写/队列/备份闸门。首次checkbox替换不唯一被edit安全拒绝，改用唯一块，不涉及代码/业务异常。
