# 受控手动启停实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户已要求实现当前书面设计；无独立代理授权，新Git尚无base commit/全目录untracked，按已批准本地设计原地执行，不先造首次提交/worktree或推送。

**Goal:** 前台`status|run`，仅API/web，已有服务不接管，任务检查后仅本次Popen进程组TERM。

**Architecture:** 一个services/workbench.py：可信配置、只读基础检查、lsof/ps归属和回环/健康核验、前台Supervisor。不保存PID、不启动Docker/worker/beat、不新增端口/启动模式开关。复用sys.executable+uvicorn、npm run web。

**Tech Stack:** Python3.10标准库/Popen/signals、已装dotenv/psycopg/httpx、macOS lsof/ps。

---

### Task1: RED与最小运行边界

Files: Create services/tests/test_workbench.py; Create services/workbench.py; Modify package.json。

- [x] CLIhelp/无worker入口先RED（2FAIL，其余17例待模块存在再跑），依赖/配置/只读DB/监听归属/回环/健康/真实进程组用例先写；`python3 -m unittest services.tests.test_workbench -v`最终25PASS。
- [x] trusted_config()拒绝symlink/非本人/非私有权限；只读activity()短超时/本机DSN；basic_ready()Redis/RustFS只读，无建桶/初始化。CLI不回显异常/配置/第三方command，不导入queue。
- [x] inspect_role()核验ROOT/API精确argv或Next cwd、所有listener回环、PID/starttime/CWD稳定与HTTPready；未知/不健康/race拒绝。
- [x] Supervisor握本次Popen/session，先APIready再web；busy/DB失败拒绝停止，idle仅owned活group TERM，不KILL；group仍活/信号失败阻塞。信号handler只置flag，启动失败也同guard，不接管已有服务。
- [x] npm便捷入口与py_compile/CLI/focused通过，未改原web命令。

### Task2: 隔离验证与当前复用路径

- [x] 真实dummy HTTP双角色启动/CTRL+C停机、Popen父子group回收；busy/DBerror阻塞、timeout/race/信号故障单测通过。随机回环fixture，无真实worker。
- [x] 本机status与run已有API/web复用路径通过，原containerID/StartedAt/6表hash/credentials/media不变，58attempts/0active。
- [x] discovery246例：159PASS、87数据库SKIP；必要真实PG只读/原hash检查完成，不重复未改业务的87DB与前端构建。output/workbench/controlled-startup-qa留证；真实生产冷启动未做。

### Task3: 文档和交付

- [x] README/手册/TODO同步前台命令、忙/DB失败阻塞、复用不控制、API真实启动的初始化/外部worker/查询后提交/SIGKILL孤儿边界；不增守护/GC/配额。
- [x] receipt/status/reuse无凭据，链接/配置/无queue imports或KILL核查，原服务未停止。
- [x] 自审与checkbox完成，新Git不作首次提交；冷启动/生产停写/人工听检/nums收费/许可/异地/资源策略继续TODO。

计划自审：信号handler不做阻塞IO；停机事务只读且有超时；正常TERM只对本次未reap活Popen group，无跨会话PID；服务身份不是仅HTTP200；race/退出不得误认成功；清理失败不返回完成，不通过KILL隐藏。当前设计用户m06586已确认实现，无需新的范围变更。

最终receipt：output/workbench/controlled-startup-qa/receipt.json。自审加红绿修复4个边界：父进程退出但活group仍在、正常延迟退出误判crash、argv子串伪装API、TERM权限错误。后续双dummy HTTP/Ctrl+C真实fixture通过；不等同生产冷启。临时核查脚本一次错用activity键，经main()明确输出tasks修正检查器，无产品修改/新任务。完成verification/finishing技能核查：无base commit可merge或PR，按用户本地实施范围保留工作区，不擅提交/删除/推送。
