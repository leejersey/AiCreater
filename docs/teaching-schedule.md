# T5-A 教学节拍调度

`buildTeachingSchedule(plan, brief, cues)` 位于 `packages/custom-scenes/src/teaching-schedule.ts`，只完成确定性编排的前端，不返回可执行源码或坐标。

## 六类结构的首版边界

| 结构 | 拓扑与语义展开 |
| --- | --- |
| flow | 单条连通有向链，拒绝分叉、合流与断开的多条链 |
| loop | 单个简单闭环，按稳定 ID 选起点；每个载荷保留上一停靠对象，不能复制载荷 |
| comparison | 恰好一对比较对象，不混入运输或组合 |
| filter | 同源 keep/discard 分支；select 展开为选择强调及选中载荷送入 keep，丢弃按原候选身份送入 discard |
| composition | 一个组合批次，每个输入载荷依次进入同一个接收对象，不生成合成替身 ID |
| state-change | 一个对象身份的连续状态变换，不新增同名结果副本 |

未分组的对象保留为 annotations，不删除内容。永久子部件显式 ownerId 的独立布局尚不支持，返回 ownership 错误；组件内部固定构造不受影响。额外关系类型、混合结构动作和不支持的拓扑明确拒绝，不静默改成标题卡。

## 时间规则

时间只来自通过绑定检查的 cue。每个 cue 内按模型提供的动作顺序展开；运输至少 12 帧，强调、保持、选择及状态变化至少 6 帧；组合按输入个数计入所有运输。剩余帧按最小持续时间比例确定性分配，最后一个事件恰好结束于 cue.endFrame。

区间采用 `[startFrame, endFrame)`。动作不越过 cue，不相互重叠，cue 前后及中间的空拍显式记录为 holds。cue 不够长时返回 timing 错误，不延长旁白、不降低最小持续时间或丢弃动作。最多 128 个展开事件，超出返回 capacity；这不是模型调用预算，统一收费账本仍属于 T7。

## 绑定与安全状态

产物包含 planSha256、inputSha256（含时间轴）、组件版本及所有实际状态资产的 assetSha256，完整规范结果另生成 scheduleSha256。返回结果递归冻结，无共享的可变输入数组。

`renderable:false`、`accepted:false` 及 pending 的 layout/routes/motion/render-review 均为固定值。它不包含媒体素材哈希、路线、运动计划或场景源码，不能用作截图、预览或整课导出的冻结编译产物。T5-B/C 还需完成真正的几何和运动编译，并继续绑定画布、素材与审计结果。

没有调用模型、TTS、数据库、队列或渲染服务；未注册新的可收费生成入口。此模块没有自动重试或成功状态写入逻辑。

## 测试

`packages/custom-scenes/tests/teaching-schedule.test.ts` 覆盖六类示例、筛选/组合身份展开、循环停靠承接、状态及空拍、短 cue、混合/断链拓扑、组合重复、永久子部件、事件容量、时间绑定及 100 组不同动作数量的确定性检查。

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-schedule.test.ts
npm run custom:typecheck
```

离线调度通过不代表路线可解或画面达标，不能用这些测试替代容器渲染与新题盲测。
