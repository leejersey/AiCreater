# Celery 调度与任务 API

范围：按已批准的开发契约接入 Redis/Celery 与分镜重生成 HTTP；不提前开放未实现的首次生成、配音和渲染任务。

- Redis 只运输 argument-free wake-up，PostgreSQL 保存输入快照、状态、attempt 与重试预算。API 提交在数据库中落盘；Redis暂不可用时任务保持queued，恢复调度后继续，不丢提交。
- Celery Beat每2s发一个5s有效的poll；单worker槽、prefetch=1，复用run_once子进程执行器。所有付费重试仍由用户显式请求，Celery不自动重试付费工作流。
- HTTP：POST scenes/{id}/regenerate（expected_revision）、GET jobs/{id}、POST jobs/{id}/cancel、POST jobs/{id}/retry。返回公开状态，不返回input、attempt_id或密钥。
- 只增加实际使用的celery[redis]依赖；Redis宿主端口仅绑定127.0.0.1。

验证：真实临时Redis成功接受Celery固定空参数消息并清理容器；真实PG任务接口与Celery eager替身测试、既有回归。不连接付费供应商。常驻worker的真实供应商端到端运行仍需受控验收；首次生成、TTS/render任务和Next.js教学编辑器仍未实现。
