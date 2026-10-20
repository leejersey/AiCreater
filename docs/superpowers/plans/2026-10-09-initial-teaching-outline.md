# 首次教学分镜任务

按已批准契约，连接空白文稿项目与现有教学生成、PG任务及Celery执行器，不另建生成系统。

1. POST projects/{id}/generate(expected_revision)：仅允许尚无场景的项目；冻结原文、模型和profile，重复提交幂等。
2. 单一worker根据kind复用DeepSeek：generate产出完整分镜，regenerate产出单场景候选；保持原文含首尾空白，不运行教学代码。
3. 回写事务先锁项目，再检查attempt/取消/原文与草稿。仅项目revision未变且仍为空时附着首次分镜，场景needs_voice、generated_revision=1；其他情况保留任务draft结果，不覆盖编辑。
4. 数据迁移兼容既有regenerate；新增PG、HTTP和子进程替身测试，验证原文/版本/取消/无音频不可导出。
5. 本轮不调用付费供应商，不接TTS或渲染任务。真实教学事实仍需人工审阅。前端待后续阶段。

实施结果：以上首次分镜路径已实现，包括兼容旧regenerate任务的DDL、kind/scene_id约束、完成后的重复提交返回原任务、原文空白保留、迟到结果留存和needs_voice保护。修复了凭据缺失/401/403被归为不可重试教材验证错误的问题；配置修正并重启worker后可显式重试，仍受原attempt与15分钟预算约束。

验证：50项真实临时PostgreSQL测试、40项独立workflow测试、71项TS测试全部通过；类型检查与Python编译通过。HTTP→真实受限子进程→代码教学分镜回写使用维护的python-sum样例及替身，不调用供应商、不执行教学代码。首次分镜真实付费端到端尚未验证；TTS/render任务、Web编辑器、20组完整教学验收仍待后续。
