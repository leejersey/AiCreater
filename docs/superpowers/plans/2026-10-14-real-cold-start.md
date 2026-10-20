# 已批准维护窗口：真实API/网页冷启动验收

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户m06803已允许短暂停止并恢复当前API/网页；不停止队列消费者、beat或基础容器，不提交任务，不改数据卷/配置，不作Git提交/委派。

**Goal:** 真实服务冷启、实际启动器owned停机与恢复验证；失败先恢复可用服务。

**Architecture:** 一次性assert闸门维护脚本，现场核验当前API/Popen组与web npm/next祖先链、身份/cwd/starttime，不用旧services.json、不用pkill/KILL。无产品代码变更。保留源码/数据/凭据及基础服务首尾hash。

**Tech Stack:** 现有macOS Python/ps/lsof、只读PG/Celery control/Redis检查、npm/uvicorn；不下载/升级镜像/依赖、不产生模型/配音/render。

---

### Task1: 准备（未停机前全部通过）

- [x] PG0active/58attempts，2消费者ping/active/reserved/scheduled空；Redis两队列list空，其他基础容器baseline保存。
- [x] 原API21059/group21059与web npm67402/cli67440/next67492/group67402全身份/cwd/starttime核验，组无其他进程；原web为dev命令。
- [x] BUILD_ID存在、首尾hash一致；额外真生产web:start验证不编译、不替代最终dev模式。
- [x] 6表/配置/原媒体/容器baseline和原命令保存，输出0700日志0600，无凭据进receipt。

### Task2: 真实窗口

- [x] 活动/身份复核后仅原两组TERM且确认端口释放，未KILL。
- [x] 真前台owned冷起APIgroup87038/web87063、项目/冻结版/WAV/MP4/SRT hash与Host/Origin403通过，dev17静态script200。
- [x] 真CTRL+C exit0且两端口释放，不改变外部消费者。
- [x] 相同API命令恢复，生产web:start与7静态script200、下载/安全通过，停本次prod组后最终恢复原dev网页17script。整个实际窗口未出启动/恢复故障，未触发应急分支。

### Task3: 恢复与证据

- [x] 原模式APIgroup87504/web87568恢复ready；原容器ID/StartedAt/6表/配置/媒体hash与73对象inventory一致，58attempts/0active。3个原workflow/render/beat的ROOT和启动时间早于窗口验证，未重启；不将API初始化DDL/桶检查说成只读。
- [x] 只应用服务层冷起，未重启机器/基础容器、无原子写锁/异地灾备/独立浏览器所有交互验收，TODO保留边界；PID属历史快照仍现场核验，实际日志cold-start-qa目录。
- [x] receipt/手册/README/TODO/followup更新，控制器实际exit0；只自审，无首次提交/委派/产品代码变更，因此不重复旧测试/构建。实际下载/安全/哈希/owned停机及恢复后status已核验。

维护脚本异常闸门：不输出第三方异常/配置；只对核验旧组或当次owned组TERM。部分失败先检查端口和任务，保留未知进程不误kill。若无法安全恢复，立即报告真实状态并停止扩大范围。外部消费者仍运行，用户已暂停提交；此窗口不是原子停写锁，也不承诺其他操作者无法并发提交。

自审/诊断：首次只读consumer PID检查用字串筛选误中其自身shell，assert拒绝；实际观测只有3个Python module consumer是旧启动时间，改精确shlex argv前缀并加入shell反例自检后通过。此为诊断问题，未停止consumer/未改业务代码。证据output/workbench/cold-start-qa/{before.json,receipt.json,queue-processes.json}。保留/private/tmp/real-cold-start.py及compile/assert记录供审查，不提供泛化一键生产恢复承诺。
