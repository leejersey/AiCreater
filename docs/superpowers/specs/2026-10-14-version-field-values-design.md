# 教学字段旧值/已保存新值只读对比

## 目标与门禁

用户已同意在已交付变化摘要下展示口播、代码、连线旧值与新值。用户已审阅并明确实现；前端代码、TDD与回归/实际只读验收已完成，无运行数据或服务生命周期改动。复用现有面板样式，不新开视觉方案。

## 最小方案与取舍

推荐在已有变化场景项下加折叠“口播/代码/连线：旧值与已保存新值”，按旧值、新值纵向呈现。复用details/pre/hint和当前换行/滚动样式；不做左右布局、逐字/逐行高亮或新增diff库。逐字diff和恢复按钮扩大依赖/冲突及音频失效范围，不采用。

首批只给共有scene.id且对应字段确有变化的项展示明细。新增/删除、位置、类型及步骤/结构/时间线/图表/主题仍保持现有摘要，不自动扩展所有字段或整份profile/DSL。连线单纯数组排序不变时仍不展示差异。

## 数据流与边界

在现有summarizeVersionChanges的同一次调用中捕获旧dsl及GET返回已保存Project的值，不另发请求、不读父缓存或编辑表单。ChangeSummary每个场景增加可选的字段值列表（旧调用/测试只提供类别仍可呈现）；每条只有固定字段标签与before/after只读文本（缺code为null，与空文本区分），不保存整个Project/profile引用，不改变函数参数和既有changes/位置语义。

- 口播：原始narration.text，包括空白/换行，不作修订或归一化；空文本显示明确“空文本”提示。
- 代码：只取language/source/可选array_name，JSON缩进展示；无code明确“未设置”，不等同于空source，不显示任何额外配置/profile。仍是教学代码文本，不执行、不声称实际运行结果。
- 连线：仅from/to对，保留快照中的数组顺序以便读取；缺edges按[]。比较仍按pair集合顺序无关，只有确有连接变化时才列旧新数组。空数组是合法无连线，不写成加载失败。

比较完成即生成文本快照，不保留可被后续对象修改影响的引用；先检查重复scene.id、项目/id及原有epoch条件，失败不会部分提交新结果。输出只通过React文本/pre转义，无HTML注入/代码执行，不展示密钥、profile、资产地址或派生时轴。

## UI与并发

保留头部“旧冻结rX → 本次读取的已保存rY”及不含未保存输入/配音/字幕/时轴的范围提示。每个展开字段明确“旧冻结rX”和“本次读取的已保存rY”；空值提示与实际字符串严格区分，长值不截断，沿用max-height滚动pre。

不新增state/fetch/轮询，不改变VersionHistory的compareEpoch/live/busy/project检查、关闭/切旧版/卸载清理或错误保留策略；字段值与同一个comparison版本号一并提交，不会在旧r号下拼入新读取值。刷新比较成功替换整份结果，失败保留旧结果。当前dirty、场景选择、Player/reviews完全不动。

## 范围与调用点

预计修改apps/web/lib/version-changes.ts（可选明细类型、固定投影与序列化）、apps/web/app/VersionHistory.tsx的VersionChanges纯呈现、apps/web/tests/version-changes.test.ts和apps/web/tests/versions.test.ts；文档同步README/MVP契约/TODO/follow-up。已grep全部ChangeSummary/VersionChanges调用，当前只有本模块、历史面板及测试，不需新组件包装层。

无API/数据库/Schema/provider/worker/媒体/依赖或服务启动配置改动，不新增GET/PATCH/POST、版本、任务、回滚或费用；不沿用任何重启授权。后续实现读取Next本地文档；构建沿用隔离源码副本，避免覆盖正在使用的.next。

## 测试与验收

- 纯函数TDD：仅三字段变化产生对应完整旧新文本；其他类别无多余明细；无变化/仅边排序无明细；缺code与空edges、源换行/空白、代码language/array_name；调用后修改输入对象不影响已产文本、输入自身未被比较修改、旧类别和身份保护继续通过。
- SSR：仅折叠只读文本，旧新r号清楚、空/缺值区分、恶意文本转义；不出现编辑/覆盖/回滚控件、profile或资产数据；旧手工ChangeSummary fixture没明细也能正常展示。
- 实际浏览器只用现有RAG副本r1两边/r4三边：展开连线旧新值，与实际GET一致；临时未保存口播不计入且保留。代码/口播变化与缺code/空数组/长文本用明确标注的受控响应，不创建live版本/改原稿；关闭/切旧版晚响应、读取失败保留同份文本/r号，实际API均GET。
- 完整Node/typecheck、必要离线Python与隔离源码Next webpack构建。后端未改则不把历史94SQL回归说成本轮重跑；记录真实与受控测试区别，原六表/媒体/对象/进程/任务守卫不变，无新增MP4。

## 自审与状态

- [x] 已探索现有summary/helper/presenter、全部caller和pre样式，用户同意三字段只读方向。
- [x] 选择复用文本折叠而非逐字diff/回滚；确认捕获值与r号同快照、空值语义/范围/竞态及转义，不复制后端校验。
- [x] 无委派/初始Git提交授权，HEAD未出生；只自审，不启动审查代理或commit。
- [x] 用户审阅并要求实现，已写计划/TDD，203Node/164离线/类型/隔离build和真实/受控只读QA通过。

限制：不是逐字diff、全部字段明细、执行验证或完整版本一致性审查；不比较配音/字幕/时轴，不提供回滚或旧视频预览。人工0.5秒实听、nums、20组收费及异地备份继续按TODO暂缓。
