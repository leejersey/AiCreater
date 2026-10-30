# Teaching-Plan 宿主闭环：离线接入

## 已连接的部分

`TeachingPipeline.run`把内部根任务账本接到真实Node教学协议、确定性编排和冻结产物：

1. 从PostgreSQL断点加载固定的`generation_mode: teaching-plan`、brief和cue输入；取消任务不派发。
2. Node宿主构建单次计划的提示词/Schema及逻辑请求哈希。模型callback只能在`dispatch_once`获得根任务槽位后调用。
3. callback返回的未通过教学协议校验的JSON响应先持久化，再由Node执行严格协议解析、免费布局/路线求解和完整数值检查。这不是供应商原始HTTP字节的证据；实际传输中的截断/非法JSON留存仍要在真实适配中补齐。
4. 若有效计划存在可修内容限制，保存可信诊断与修订绑定，最多占用同根任务的唯一revision槽。修订不得删对象/文案/关系/有序动作，只允许T6已支持的组件修正。
5. 完整数值编译通过才冻结并缓存计划/产物，返回`artifact-ready`、`accepted:false`、`execution:not-run`。它不是MP4完成。

不需要另一条代码生成请求，没有自由源码回退。非法协议或不支持能力明确停止；当前不自动修复任意畸形JSON协议，未使用的第二槽不会因此被隐式派发。

## 断点与边界

重启后优先读取当前阶段的冻结产物，先比对根任务原brief/cue，再交Node核对完整产物、运行时、字体和哈希；不能用合法的其他章节产物冒充本根任务。运行时变化导致旧绑定失效时明确停止，不自动迁移或重问模型。

已经派发但结果unknown/failed/dispatched的槽位不会再次调用callback。初次响应和失败修订均保留，重复运行只读取已登记的响应。修订诊断绑定也来自宿主缓存，不相信模型自报哈希。

`scripts/teaching-plan-host.ts`只有request/check/revision/artifact四个数据操作，禁止调用模型、执行生成源码、渲染或下载。stdin/stdout有16MiB限制，宿主子进程有60秒上限；环境白名单剔除全部供应商密钥和数据库地址。显式`revision:null`会拒绝，不能退化成初次校验。

真实模型传输适配尚未接入。callback是受信宿主函数，必须只做一次外部请求并禁用SDK重试；当前测试全部使用离线替身。逻辑请求哈希不等于供应商HTTP请求/usage证据，实际适配时仍要绑定模型配置和计费观察。

## 验证

真实临时PostgreSQL + 真实Node编排器 + 模型替身的9项新增测试覆盖：

- 一次初始计划后获得冻结产物，重新实例化服务后直接复用，不多派发。
- 初次容量不足，受约束组件修订后完整编译通过，共两次callback；无源码生成请求。
- 修订擅改原文被拒绝，第二次运行也不会第三次派发。
- 超时、取消、非法输入、未知source字段、空修订绑定、foreign artifact以及子进程凭据剔除。

相关Python回归39项通过，日志`/tmp/aicreater-teaching-pipeline-final-tests.log`。这些是协议与预算闭环测试，不是模型成功率、视频画质或新题盲测成绩。

相关Node回归156项及custom:typecheck通过，日志`/tmp/aicreater-teaching-pipeline-node-tests.log`。独立只读限定复核无剩余P1/P2；临时数据库由runner清理，未迁移当前课程数据。

## 仍未连接

尚未接真实供应商、实际worker队列、工作台按钮、音轨/素材根绑定、渲染任务断点及在途删除守卫。已有T6渲染恢复入口仍独立，当前pipeline停在冻结产物，不执行视频。旧工作台、课程和默认模式不变，T7整体与T8/T9均不能标为完成。
