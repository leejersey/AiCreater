# 教学根任务账本与断点基础

## 范围

`services/visual/teaching_tasks.py`复用现有Store的PostgreSQL连接与事务，schema在同目录`.sql`。只提供内部宿主方法，尚未注册HTTP、队列或模型入口，`initialize()`也没有接到旧工作台启动。当前课程数据库未迁移。

每根任务固定最多2个模型请求槽：`plan`和`revision`各一次。根任务按项目、章节、项目版本、幂等UUID和完整输入快照冻结。相同幂等键的重复提交在运行、失败或取消后仍复用原任务；不同输入不得复用同一键。新键表示另一次明确确认的任务，不能由刷新或自动修复擅自产生。

## 派发与异常

- `reserve`持有根任务行锁，原子登记槽位并提交。只有首次调用的宿主获得dispatch_token，其他并发者只读到已有记录、`dispatch:false`。
- `dispatch_once`在提交占位之后才调用受信callback。callback必须代表一次供应商请求并关闭SDK自动重试；不是模型提供的代码，也不得在其中自行循环派发。
- 网络异常标记unknown，额度不退、不自动重发。进程在占位之后退出，重启也拿不到第二份许可；超过10分钟的未完成记录可由`reconcile`保守标记unknown，不判断是否实际扣费。
- 修订只在已记录初次响应之后才能占用第二槽。供应商响应succeeded表示响应已经持久化，不代表教学计划、画面或视频验收成功。
- 取消禁止新槽位；已经在途的请求可能仍返回，允许持久化该有效响应，但根任务保持cancelled。不能保证撤回已发给外部供应商的请求。

这保护本地at-most-once派发，不是外部供应商“恰好扣费一次”保证。提交后、真正网络I/O前中断也会保守占用额度。结果不明时停止，不为提高成功率冒险重复计费。真实供应商计费需另存usage证据。

## 缓存与断点

输入、完成响应和缓存均在等待数据库前转为私有JSON副本；哈希绑定同一份内容。严格限制字符串键、有效Unicode、有限JSON、深度32、节点100000和大小。新表使用PostgreSQL `json`而非`jsonb`保存内容，避免科学计数法及负零被数值规范化后误判校验失败；查询只依赖独立元数据/绑定索引。

缓存按根任务、kind、binding_sha256唯一，已存在的绑定不能被不同内容覆盖。允许保存plan、audio、captions、artifact；响应由finish原子保存为response-plan/response-revision。读取会重算内容校验和，失败修订不会清除初次响应、有效计划或素材清单。

账本只证明内容完整性，不替代T3/T6的计划解析、实际文件哈希、字体/时间轴校验或媒体检查。宿主必须在采用缓存前按对应协议重新验证；素材条目是清单，不会重新配音或自动下载。

`checkpoint`在项目范围内核对冻结输入，返回根任务状态、输入及缓存绑定索引；不返回dispatch_token，也不授予重新派发许可。新进程可以找回已有产物，而不是依赖内存重新生成。实际编排恢复与缓存采用留待后续worker接入。

## 兼容与生命周期

新表不改写旧visual_jobs，也不改变旧模式。用户显式删除项目/章节时，新账本及缓存按外键级联清除，不阻断既有删除事务；该操作不等于退回供应商费用。

后续实验后端已补齐HTTP项目授权与dispatched/unknown删除守卫，详见`docs/teaching-workbench-backend.md`。**启用真实worker前仍需补齐取消传播、请求收尾及队列接入。** 当前未启用这些worker，因此不能将独立账本基础标成整个生产链路完成。旧的`succeeded`和新的账本响应状态不能直接映射成“视频已生成”。

## 验证

```sh
.venv/bin/python services/tests/run_project_tests.py \
  services.tests.test_teaching_tasks \
  services.tests.test_teaching_failure_baseline \
  services.tests.test_visual_store.VisualStoreOfflineTests \
  services.tests.test_visual_workbench
```

使用仓库现有runner创建随机名、独立端口的临时PostgreSQL，结束后删除该测试容器；未连接当前课程数据库。测试只使用fake provider callback，无模型/TTS调用。

覆盖并发提交、16路并发占位、根任务双槽、失败/取消后重复提交、真实子进程占位提交后退出、重启/超时不退款、取消时迟到响应、项目范围、不可变缓存、数据库等待时原对象变化、数值JSON往返及旧项目删除兼容。新测试13项，相关Python回归30项；日志`/tmp/aicreater-teaching-ledger-final-tests.log`。

尚未验证真实供应商、工作台一键生成、队列重启恢复、容器视频渲染和新选题盲测；T7整体仍进行中。
