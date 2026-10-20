# 单场景配音恢复

按已批准契约继续POST scenes/{id}/voice(expected_revision)。冻结场景草稿和voice profile，复用generate_project(draft=...)，不再次调用DeepSeek。API只入队；子进程运行TTS/FFmpeg，父进程保留心跳、硬超时与取消。

产物先校验DSL和本地音频，再在project→job锁顺序下检查attempt、取消、scene revision/profile；仅一致时附着ready场景及资产并提升project revision。迟到产物留存在任务结果，不自动覆盖，也不删除被旧版本引用的文件。失败部分资产保留；重试可能重复计费，不宣称断点免计费。

## 实施结果

- [x] voice任务类型/迁移、去重、冻结草稿/profile及POST /api/scenes/{id}/voice已接入；queued阶段即标记tts。
- [x] 配音子进程只取得TTS鉴权，不取得DeepSeek密钥；缺少LLM凭据仍可走voice。复用generate_project(draft=...)，保留口播首尾空白和码点cue。
- [x] 本地音频/DSL校验后事务附着；旧版本不变、迟到结果留存、无效音频/错误场景拒绝发布，取消不会附着。
- [x] needs_voice→ready→新不可变版本的真实PG用例通过；scene/user revision不因派生音频变化而伪增，project revision提升。
- [x] macOS/Linux取消与超时终止进程组，并处理子进程退出竞态；Windows未验证。
- [x] 最新验证：55项真实PG、43项实际运行的Python非DB、71项TS测试，共169项通过；类型检查/compileall通过。工作流discover显示98项，其中55项DB跳过，已在独立PG命令实际运行，不重复计数。

本轮用本地音频和TTS替身验证，没有触发真实供应商调用；不宣称新的真实voice队列端到端或0.5s同步验收通过。渲染任务与Web编辑器留到下一阶段，完整编程/AI整课教学验收仍待完成。
