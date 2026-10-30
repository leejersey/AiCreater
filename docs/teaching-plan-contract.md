# 教学场景计划：第一阶段契约

本契约对应 T2、T3。它是离线语义协议，不是已实现的渲染模式。本契约本身不实现 T4–T9；组件及后续进度见稳定化任务清单，工作台默认模式、收费入口和旧协议不变。

## 职责边界

| 模型可以决定 | 宿主程序必须决定 |
| --- | --- |
| 六类教学结构中的一种 | 能力边界、是否可编译及是否可发布 |
| 对象含义、组件引用、简短文案 | 轮廓、内部构造、文字区域、字体与实际尺寸 |
| 永久部件归属、对象间语义关系 | 坐标、端口、遮挡、分层、连接线和运输通道 |
| cue 对应的强调、转移、选择、组合或状态变化 | 绝对帧号、动作时长、交接位置和运动曲线 |
| 依据诊断修订问题计划 | 类型/几何检查、预算、断点、容器执行、媒体验收 |

模型不得返回源码、SVG、表达式、坐标、尺寸、关键帧、审计绑定或“检查通过”声明。根对象及所有嵌套对象均拒绝未知字段。文案中出现 `fetch()` 等词只作为文本，不因此被执行。

## 协议与接口

实现位置：`packages/custom-scenes/src/teaching-plan.ts`。

- `buildTeachingPlanSchema(brief, cues)`：生成绑定当前输入的 JSON Schema，复用现有 brief/cue 校验及输入哈希。
- `parseTeachingPlan(value, brief, cues)`：验证结构与语义，返回独立、字段顺序固定的数据副本；不请求模型、不生成源码、不运行场景。
- `teachingPlanHash(value, brief, cues)`：对已验证规范数据做 SHA-256；对象字段顺序不影响哈希，数组顺序和文案改变会影响哈希。
- `buildTeachingPlanPrompt(brief, cues)`：仅构造提示词。模型参考上下文不含绝对帧号或画布参数；结构化输出绑定哈希和 cue ID。

根字段固定为：`schemaVersion: teaching-scene-plan:1`、`inputSha256`、`structure`、`objects`、`relations`、`beats`。不得回传口播、事实、画布、配音或其他宿主快照。

结构枚举：`flow`、`loop`、`comparison`、`filter`、`composition`、`state-change`。

对象字段固定为 `id`、`component`、`meaning`、`label`、`ownerId`、`initialState`。根对象的 `ownerId` 必须显式为 null；不推断缺失值。首版最多 12 个对象、24 条关系，每个 cue 最多 8 个有序动作；整个计划上限 64 KiB。

### 组件引用

以下是语义能力声明，不包含绘制逻辑。T4 的本地绘制与几何实现另见 `docs/teaching-components.md`，不允许静默映射成通用框或自由源码。

| component | 状态 | 可拥有永久部件/接收载荷 |
| --- | --- | --- |
| document | waiting、active、selected、rejected、stored | 否 |
| wallet | empty、receiving、full | 是 |
| classifier | idle、processing、emitting | 是 |
| loop-node | idle、active、complete、error | 是 |
| container | empty、receiving、full | 是 |
| indicator | idle、active、complete、error | 否 |

连接线由关系派生，不允许模型另建 connector 对象、路径或节点索引。内部固定图案使用拥有者的组件构造；确有独立语义状态的部件才单独建对象。永久归属不是临时搬运挂接，归属循环或不存在的拥有者会被拒绝。

### 关系与动作

关系字段为 `kind`、`from`、`to`、`label`；kind 为 flow、compare 或 branch。branch 还必须显式携带 `outcome: keep | discard`，不能从自然语言标签猜测结果。所有引用必须存在，不允许自引用或重复关系。flow/compare 的 label 可为空字符串，branch 标签必须非空。

| 动作 | 字段 | 语义 |
| --- | --- | --- |
| transfer / discard | objectId、targetId | 转移 document 载荷到接收组件；不能搬运永久部件 |
| highlight / hold | objectId | 强调或保持对象；不伪造状态过渡 |
| select | objectId、candidateIds | 从至少两个不同对象中选择其一，选中对象必须属于候选集 |
| combine | objectIds、targetId | 至少两个不同载荷进入接收组件，目标不能同时是输入载荷 |
| transition | objectId、fromState、toState | 使用组件支持的状态；fromState 必须承接上次状态或 initialState |

beats 必须按宿主 cue 顺序一一覆盖，不得重复或漏掉 cue。动作数组按顺序表达语义，不包含模型决定的并发、时长或绝对时间。

结构级约束：流程转移遵循已声明的流向；循环中每个载荷都必须遵循声明的节点和边，至少同一载荷沿闭环访问两个节点并返回首个访问节点；对比必须强调被比较对象；组合需要 combine；状态变化需要有效 transition。结构名称本身不能代替相应语义动作。

流程/循环 v1 仅支持 transfer、highlight、hold、transition；拒绝混入 select/discard/combine，防止绕过载荷轨迹检查。混合多结构教学须在后续版本显式扩展，不能靠附加动作隐式启用。

筛选 v1 明确限制为单次二分流：恰好一个同源 keep/discard 分支组，目标是不同的接收组件；恰好一次 select，从独立 document 候选中选一个。随后每个未选候选必须恰好一次 discard 到 discard 出口，不能丢弃已选对象或无关对象。宿主负责把选中载荷送入 keep 出口，不允许 transfer/combine 覆盖此路由。多次筛选、多保留结果等超出此版本能力时明确拒绝，不偷偷简化。

## 失败与发布边界

`TeachingPlanError.code` 区分 schema、binding、reference、ownership、state、coverage、structure、unsupported_structure。错误是修订数据，不是用户坐标待办，也不是执行许可。

第一阶段仅验证协议和部分语义，不能证明事实准确性、文字可读性、几何净空、路径可求解、遮挡或画面美感。有效计划也不能被标为可渲染或已验收。组件不可用时，后续编译器必须明确失败，不能改用自由源码或标题卡。

当前输入绑定包括完整 brief 与 cue 时间。配音后实际时间变化时，旧绑定必须失效。T5 再实现有独立证据的宿主重绑定/重编译；此处不静默重写哈希或承诺音画同步。

未来编译产物还须绑定编译器版本、时间轴与素材哈希；当前 planHash 不替代这些证据。两次模型请求的根任务账本与自动修订属于 T6/T7，本模块没有收费或重试逻辑。

## 离线验证

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-plan.test.ts packages/custom-scenes/tests/teaching-failure-baseline.test.ts
.venv/bin/python -m unittest services.tests.test_teaching_failure_baseline -v
npm run custom:typecheck
```

真实模型的协议接受率、实际画质和 12 题盲测尚未验证；这些不应由离线解析测试代替。
