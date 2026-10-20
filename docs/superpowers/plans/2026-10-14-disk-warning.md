# 只读磁盘预警实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户已确认书面设计并要求实现；无委派/首次提交授权，HEAD未出生，保持当前工作区，不造初始commit/worktree。

**Goal:** status新增ROOT文件系统20GiB只读预警，不改变任务/启停/退出码。

**Architecture:** services/workbench.py小函数用已导入shutil.disk_usage(ROOT)，成功status输出新增disk。保留code/services/tasks；run和基础失败路径不查询；异常明确unavailable、不记录错误/路径。

**Tech Stack:** Python3.10现有stdlib/unittest及已装CLI依赖；无新依赖/schema/数据库/前端。

---

### Task1: 红绿行为

Files: Modify services/tests/test_workbench.py、services/workbench.py。

- [x] 增加5tests：零/低/等/高20GiB、OSError unavailable、status保留字段/exit0无Popen/killpg（low/unavailable）、run不查询、原基础失败不变。只系统边界mock，不填盘。
- [x] focused RED缺helper/disk：4failures（含status2subtests），无errors；原run/基础失败守卫PASS。
- [x] disk_status()小函数与成功status字段完成，固定bytes严格小于规则、读失败明确None，无新配置/命令，ponytail注释限制ROOT/VM。
- [x] focused30GREEN、py_compile，discover251中164PASS/87DBskip。不重跑未改数据库全套/前端构建。

### Task2: 实证与交付

Files: Modify README.md、docs/local-operations.md、docs/TODO.md、docs/mvp-follow-up.md；Create output/workbench/disk-warning-qa/receipt.json及status.json。

- [x] 实际npm只读status字段/返回码通过，55887339520可用bytes约52.05GiB为ok，阈值21474836480；前后stat读值55887392768/55887331328，未搬用旧52.6。基础错误守卫非零。
- [x] 原containerID/StartedAt/6表/配置/媒体hash首尾相同、58attempts/0active，无新任务/服务启停/清理；receipt无凭据，旧receipt不改。
- [x] README/手册/TODO/follow-up/设计更新，手动快照与ROOT/VM/失败路径限制明确；所有待授权项保留。
- [x] 自审分支/严格阈值/返回码/兼容/无新增入口与链接，保存output/workbench/disk-warning-qa/{receipt.json,status.json,readings.json}；不作Git首次提交/merge/PR。

Plan self-review: bytes严格小于才low，读失败不伪报ok；OSError覆盖OS读取，不吞基础服务错误；不额外加磁盘监控命令/缓存/定时任务/GC。5新增例和旧25均覆盖，真实CLI验证不复制业务数据或触发调用。已核查verification与finishing技能；无Git base不能merge/PR，按批准本地范围保留工作区。无委派授权，只自审。初次读取testing-anti-patterns参考路径错用父目录，已按TDD skill目录正确读取，非产品bug；所有实际红绿日志留在/private/tmp/disk-warning-{red,green,offline}.log。
