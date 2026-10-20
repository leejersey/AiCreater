# 步骤触发位置手工编辑

**状态：** 代码、隔离验收及本机启用均完成。前期571项测试/typecheck/隔离构建/10项受控页面检查见[代码验收](../../../output/workbench/manual-cues-qa/receipt.json)；本次19原生API＋6无mock页面检查、临时副本实际保存与清理见[原生验收](../../../output/workbench/manual-cues-activation/receipt.json)。原课程/旧版本/媒体/队列不变，无新增迁移、消费者或收费。范围输入＋原文预览，不做拖拽时间轴、音频波形、自动重生成或收费试跑。

## 目标与选择

修正已有步骤的口播触发范围，不必仅为改cue重新调用模型或配音。沿用现有场景保存、版本冲突、草稿及本地对齐链路。

- **采用：起止范围输入＋对应原文预览。** 结构不变、键盘可操作，沿用Unicode码点协议；实现与验证最小。
- **暂不采用：在口播里拖选、波形/帧时间轴。** 需要额外处理浏览器UTF-16选区、拖拽及时间映射，不是本次范围。也不新增模型自动猜触发点。

## 当前约束与修改范围

- 设计时`apps/web/app/SceneEditor.tsx`的cue只读，`services/projects/store.py:Store.edit_scene`拒绝cue变化；现已同时支持表单与后端校验，不能只因页面热加载就认定旧API进程已支持。
- 使用现有`PATCH /api/scenes/{id}`的`expected_revision`与`changes.elements`，不新增接口、表、列或依赖。
- element的ID、数量、顺序和topic角色继续只读。类型、图表数据、代码快照等现有校验不放松。
- 普通场景现有步骤表单增加范围输入；`data_chart`仍走已有图表JSON及人工确认入口，不绕过数字/来源确认，不为此复制第二套图表表单。
- 复用`Jobs.submit_timing`、缓存音频及`Jobs.publish_voice`的版本/音色/attempt发布护栏。没有新调度器或自动消费者。

## 用户操作与范围规则

每个现有步骤显示“起点（含）”“终点（不含）”、口播总码点数及对应原文。0起计数，例如`甲😀乙`的范围`1–2`选中`😀`，不是JavaScript UTF-16索引。预览按文本渲染，不能使用原始HTML。

- `0 <= text_start < text_end <= 原口播Unicode码点数`，必须为安全整数，原文切片非空白。
- 空输入、负数、小数、非数字、倒置或越界必须可见报错，保存被阻止，但不把空输入转成0、不截断、不自动改相邻步骤。
- `code_walkthrough/state_diagram/execution_timeline/data_chart`沿用既有起点严格递增规则；不能擅自对卡片/流程等其他类型增加不重叠约束。
- topic仍提前显示；修改其cue不会变成普通步骤，也不声称改变主题预告时机。
- 纯标点或没有对应词时间戳的范围仍可能无法本地对齐；显示现有对齐失败，不猜时间，也不回退到收费配音。
- 同时修改口播时以当前编辑口播校验范围，后端仍执行整份教学草稿验证。

## 保存后的状态与旧任务

| 修改 | 保存结果 |
| --- | --- |
| 所有内容相同 | 现有no-op，不递增revision、不创建任务 |
| 仅说明/样式等，cue与口播不变 | 保留已有状态及有效配音/字幕/时间轴 |
| cue变化、口播不变且有可复用音频 | 保留原narration/audio、资产、字幕及音频时长；删除失效的入场animations，状态`needs_timing` |
| 原来已`needs_timing` | 不提升ready，保持待对齐，不能使用旧入场计划 |
| 原来`needs_voice`，或同时改口播 | 仍按既有规则`needs_voice`；改口播清除旧音频引用与派生时间数据，不能因改cue伪装已配音 |

cue改动使用现有事务递增scene revision、user_revision及project revision；generated_revision不增。cue与手写captions一起提交时，若不能保持ready，应整笔拒绝，而非丢掉用户字幕后返回成功。

待对齐状态禁止当前稿预览/冻结导出；旧冻结版本及媒体不变，仍可按原版本访问。用户需显式点击现有“本地重算时间轴”并遵守消费者就绪护栏；不会因保存或刷新自动创建timing/voice/render任务。本地重算复用缓存、按既有规则重建字幕与入场计划，不能联网补音频；缓存缺失或对齐失败明确报错。机器计算成本不在“无新增模型/配音调用”的承诺内。

旧voice/timing任务即使稍后成功，只能依现有revision、音色与attempt检查附着；不得把旧cue/时间轴覆盖到新编辑上。旧候选接受仍须当前revision，旧渲染仍属于旧冻结版本，不伪装当前预览。新revision的人工核对不能自动勾选。

## 原始输入与草稿

在现有`scene`本机草稿中加可选`rawCues: Record<string,{text_start:string,text_end:string}>`（最多6项），按element ID保存原始字符串；旧v1草稿没有该字段仍可读，恢复时默认空映射，不迁移/删除旧记录。沿用256Ki字符上限、权限/容量错误提示、跨页字节比较和显式恢复。

- canonical steps与未完成的范围输入分开；空值/坏值、其他步骤、代码快照和连线不能因重绘、刷新或切换输入丢失。
- 保存前合并并验证rawCues，再用现有scenePatch；仅成功保存才清该场景备份，400/409/取消保持输入。未知step ID或畸形草稿报错，不静默丢掉。
- 表单切到高级JSON前，合法范围合并进steps后再清rawCues；非法范围不允许切换并给出原因。不能利用模式切换偷偷丢输入。高级JSON回表单仍走既有解析守卫。
- 跨revision草稿仍只能复制/丢弃，不自动套用；多标签保护仍是尽力字节比较，不声称原子锁。保存后按新revision重新人工核对。

## 最小文件边界与验证顺序

1. `services/tests/test_projects.py`先增加真实隔离PG红测试：仅cue改动/保音频、状态失效、no-op、越界/空白/布尔/浮点等回滚、ID/顺序/role仍不可改、旧快照不变；只在`services/projects/store.py`放松cue只读并处理失效，不改发布器算法。
2. `services/tests/test_api.py`和`services/tests/test_jobs.py`覆盖现有PATCH协议、过期revision/归档、显式本地重算保音频、改cue后的旧voice/timing结果不附着、无候选/版本/新收费任务副作用。用自有隔离数据库和缓存，不接原DB。
3. `apps/web/lib/editor.ts`增加最小纯函数进行原始范围合并/预览/校验；`apps/web/app/SceneEditor.tsx`接现有表单及错误提示；`apps/web/lib/drafts.ts`增加兼容可选字段。优先复用文件，不创建通用表单框架或新包。
4. `apps/web/tests/editor.test.ts`、`apps/web/tests/drafts.test.ts`、`apps/web/tests/local-draft-ui.test.ts`增加红绿测试：emoji码点、非法输入不归零、顺序、原文预览、旧草稿/坏草稿、保存/模式切换不丢输入。必要时增加本功能专用测试文件，不做无关重构。
5. 验证：`npm test`、`python3 -m unittest discover -s services/tests -v`（明确统计跳过DB项）、`python3 services/tests/run_project_tests.py`（独立PG，串行避免构建争用）、`npm run typecheck`和隔离源码Next webpack构建；收费供应商由拒绝调用的替身保护。记录实际计数，不套用上一阶段555项。
6. 独立受控页面验证合法/非法范围、原文、草稿恢复、409/切场景、topic提示、待对齐不能预览、保存不派任务。代码通过后再单独核对原服务边界；若要原生实际保存，仅自有明确标注的验收副本，不改原课程。后端未加载新代码前不宣称原环境已支持。

## 交付与非目标

README、TODO、API/使用说明及验收记录已更新。设计阶段无业务动作；代码阶段仅自有隔离PG/受控页面/私有构建。用户继续后，单独受控重载原监督器、在明确临时副本实际保存并事务清理；六表全量、媒体/对象/配置/容器/队列精确恢复原基线。未改原课程/旧版本/用户草稿、未新增迁移、启动消费者/对齐/渲染任务或调用供应商。

仓库当前无初始commit（已检查HEAD），不擅自创建初始提交/伪造worktree；后续隔离构建与自有数据库验证，不覆盖已有未提交文件。没有授权启动子代理，审查由主会话完成，不冒称独立审查。

不新增步骤CRUD、排序/角色编辑、拖拽、波形、自动对齐/配音、时间戳估算、硬预算、供应商账单核对或自动核对标记。人工0.5秒实听、nums读法与20组收费验收继续暂缓，收费验收仍放最后并需明确预算。
