# Teaching Worker 健康模块

独立模块 `services.visual.teaching_health.WorkerHealth`，仅依赖已有 `store.connection()` 和标准库线程；无需模型密钥。已由main接入显式Celery worker/beat信号及实验API准入，默认服务开关不变。

## 接口

| 调用 | 行为 |
| --- | --- |
| `WorkerHealth(store)` | 无数据库访问、无自动建表、无线程 |
| `initialize()` | 显式、幂等创建 `teaching_worker_health`；使用 Store 已有 search_path |
| `beat(role, instance_id)` | UUID 字符串或 UUID 对象；按 `(role, instance_id)` upsert，版本固定 `teaching-worker:1`，数据库 `clock_timestamp() + interval '45 seconds'` 过期 |
| `ready(roles)` | 非空角色集合中的每种角色都至少有一个未过期、版本匹配的实例才为 `True`；重复角色去重。空集合、未知角色、缺表、数据库错误均为 `False`，不使用本地缓存 |
| `require_ready(roles)` | 不就绪时抛固定脱敏 `StoreError`，code 为 `teaching_unavailable` |
| `lease(role)` | 每个上下文生成独立 UUID，先同步写心跳，再启动 daemon 线程每 10 秒续约；yield 自身 UUID。退出停止并 join 线程后，仅删除自身角色/UUID 行 |
| `lease(role, retry_initial=True)` | Celery启动显式使用；首次数据库写失败也启动续租线程重试，但成功写入前不会提供就绪资格；默认严格契约不变 |

合法角色只有 `teaching-plan`、`teaching-render`、`scheduler`。`beat` 的非法角色/UUID 抛固定 `validation` 错误，不访问数据库、不回显输入。建表/写入的数据库异常转为固定 `teaching_unavailable`，隐藏原异常链；读取异常返回 `False`。

表字段为 `role text`、`instance_id uuid`、`schema_version text`、`expires_at timestamptz`，全部非空，主键 `(role, instance_id)`。不同进程/同角色实例不互相覆盖。旧版本行和已过期行不提供就绪资格，无需先清理历史行。

## 接入约定

由 main 的显式初始化步骤调用 `initialize()`，不要在每个请求或 `ready()` 内隐式建表。与其他模块相同，schema/search_path 由 Store 管理。

```python
from contextlib import ExitStack
from services.visual.teaching_health import WorkerHealth

health = WorkerHealth(store)
health.initialize()  # Explicit startup/migration step, before workers serve.

with ExitStack() as lifetime:
    instance = lifetime.enter_context(health.lease('teaching-plan'))
    # Existing worker lifetime belongs here; no worker is started by this module.
```

后续 Celery signal 集成应在最终拥有 worker 的进程启动完成、fork 之后进入 lease，保存上下文直到该进程 shutdown 时退出；不得在启动 signal 回调返回时就退出 lease。scheduler 使用自己的生命周期与 `scheduler` lease，renderer 使用 `teaching-render`。同进程需要多个角色时各持有一个 lease。

API 准入按实际依赖调用，例如计划任务使用 `require_ready(['teaching-plan', 'scheduler'])`；需要渲染能力时再要求 `teaching-render`。模块只报告心跳存活，不证明模型权限、队列订阅、任务吞吐或渲染产物可用，也不是分布式互斥锁。准入检查与提交之间不是原子事务。

线程直接独立连接数据库，不依靠 Celery task、solo 主执行循环或定时任务续约。普通长任务/IO 等待不会阻断心跳；进程暂停、长时间持有 GIL 或数据库阻塞仍可能过期，这是 fail-closed 行为。

退出先等待在途心跳完成再删除，避免删后被续约复活。沿用 Store 的连接/语句/锁超时；调用方提供自定义 store 时也必须配置有界数据库超时，否则 join 可能等待其在途连接。清理失败不覆盖业务异常、不输出数据库详情，残留行最多活到最后一次成功心跳后的 45 秒。后台写失败静默等待下个 10 秒周期重试；数据库读取失败立即不就绪，数据库恢复后仍须有未过期心跳才就绪。

## 离线验证

使用项目已有 `.venv`，并将本地 PostgreSQL 的 `bin` 目录加入 PATH：

```sh
.venv/bin/python -B -m unittest services.tests.test_teaching_health -v
```

测试不读取环境配置文件，不使用 `DATABASE_URL` 或 `TEST_DATABASE_URL`。PG 测试自建临时 cluster，仅在私有临时目录开放 Unix socket，禁用 TCP，结束停止并删除；不接触当前课程库，不调用 HTTP/模型/Docker，不启动真实 worker。缺少 `initdb`/`pg_ctl` 时 PG 组明确跳过，不得据此声称数据库验证通过。

覆盖显式建表、UUID/角色校验、事务提交失败脱敏、数据库 wall clock、45 秒 TTL、旧版本/多角色过滤、后台 daemon 在调用方阻塞时续约、同角色多实例隔离、退出 join/清理、数据库故障恢复和清理失败后过期。续约测试把间隔缩短至 20ms，另外断言生产默认值为 10 秒；过期通过测试库时间更新触发，不实际等待 45 秒。

本次验证使用项目已有依赖和本地 PostgreSQL 16：12 项测试全部通过，PG 组无跳过；临时数据库已停止并清理。未运行真实 Celery signal/API 集成，留待 main 接线后验收。

main补充验证：新增“worker先启动、API后建表”恢复用例，心跳模块共13项自有PG/离线测试全通过，另4项Celery接线测试通过。没有启动实际Celery新模式或修改当前课程库，不能把mock信号测试说成完整部署验收。
