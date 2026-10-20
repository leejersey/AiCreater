# 冻结旧版与当前已保存稿：只读变化摘要

## 目标与门禁

用户同意下一项做场景增删/顺序与口播、代码、步骤、连线变化摘要，不触碰未保存输入。方向与书面设计已确认，用户明确实现；前端代码、回归及真实只读验收完成，无服务重启或运行数据写入。沿用版本历史小面板，不做新的视觉布局。

## 方案选择

推荐：前端纯函数比较教学字段，复用已读取的冻结版本与现有GET当前项目；每次明确点击读取，不轮询。比逐字diff更小，不加库/新接口；不提供恢复/回滚。备选服务端diff或完整JSON差异会扩大接口与资产/派生数据噪声，均不采用。

## 数据来源与身份

历史详情增加“与当前已保存稿比较”按钮。单次GET /api/projects/{projectId}，比较所选冻结dsl与新返回Project，不使用page的project缓存（dirty时轮询停更），不读取编辑组件局部输入、不setProject/onDirty/Player/reviews。现有Store.get_project调用_read(lock=True)，在现有项目锁内读取项目和场景；本功能不改其事务语义。

冻结version.id/project_id保持现有校验，当前响应id也必须与面板projectId匹配。按DSL场景scene.id匹配，不用数据库row.id，不用数组下标当身份；当前顺序取API scenes数组，旧顺序取dsl.scenes。重复业务ID作为错误拒绝显示摘要，不静默覆盖。支持当前无场景的文稿草稿；不存在/无权限/读取失败仅更新比较错误，保留历史列表/详情/旧比较，绝不回写。

## 比较范围与语义

- 显示“旧冻结rX → 本次读取的已保存rY”，并提示未包含未保存输入/读取后修改，后续明确再次点击重读。主题单独比较，缺theme按tech_explainer。
- 新增/删除场景分别列出业务ID、类型及位置。共有场景按ID匹配，旧/新完整位置可显示；顺序变化只看共有ID的相对顺序，单纯插入/删除不把其余场景误判为重排。
- 每个共有场景仅列变化类别：类型、口播(text)、代码(language/source/array_name整个code)、步骤(elements含cue/高亮/状态/输入输出)、连线(edges)、数据结构(structure)、执行时间线(timeline)、图表(chart)。后3项覆盖已有模板，避免其内容变化被误称无变化。无需原文逐字高亮；完整旧稿仍在原详情中查看。
- 对象属性顺序不构成变化，数组顺序有教学意义须保留。连线按from/to对的集合比较，单纯调整边数组顺序不算新增/删除连线；不存在edges按空数组。缺code/structure/timeline/chart按无数据，缺失主题按旧默认；不进一步规范化步骤可选字段，保留真实教学状态差异。
- 不比较audio_asset_id、assets/checksum、duration、animations、captions、profile、job/revision状态、项目标题/创建时间等。零差异只能写“本摘要覆盖的教学字段无变化”，不能宣称整版本完全一致或音频/时轴一致。

## UI、竞态与安全

复用details/button/pre/hint，展示主题与场景类别列表，不引入侧栏/画布。按钮只受比较自身loading保护，不锁编辑、不中断当前Player。比较结果与冻结version.id、当前读取revision绑定；选择不同旧版/关闭详情时清理比较并递增请求epoch；卸载/切项目后晚响应不得写回。同一旧版刷新失败保留上次结果但明确错误，成功替换；旧结果的r编号不能改成新读取值。

沿用组件live/epoch和项目key，不新增全局缓存/轮询。详情与比较请求各自隔离，旧详情加载/切换期间防止触发错误版本比较；不只在useEffect后清理，响应提交还检查本次冻结ID/epoch。所有场景ID/文字由React文本输出，无innerHTML/代码执行；不展示profile/服务密钥，不调用媒体端点/任务，全部请求GET。

## 影响面

预计新增 apps/web/lib/version-changes.ts 纯比较函数及其Node测试；apps/web/app/VersionHistory.tsx 局部读取/呈现；apps/web/tests/versions.test.ts SSR覆盖；apps/web/lib/editor.ts 的DraftScene补充已有Schema的可选chart类型，避免比较图表依赖any（必要的类型同步，不改JSON/接口）。更新README/MVP契约/TODO/follow-up。

无后端/API/Schema/数据库/媒体/provider/worker/依赖改动。当前本工作台运行正常；不沿用上一维护授权，不为前端功能擅自重载API/停服务。后续实现读取Next本地文档，运行回归/构建时考虑正在运行开发页，实际验收仅独立副本和受控传输，不收费。

## 验证与验收

纯函数TDD：完全相同/对象键顺序、空稿、增删/共同顺序、同ID口播/code/elements/edges及structure/timeline/chart、仅配音/派生元数据变更不误报、缺theme默认/缺edges空、重复业务ID错误、输入未突变。

SSR：只读按钮/旧与新r/类别/范围提示/React转义、不显示profile或恢复/保存控件。实际浏览器独立RAG副本：冻结r1两条边对比已保存r4三条边，仅第3章连线变化；先加临时未保存口播再比较仍不将其计入，输入保留。受控晚响应/关闭旧详情/切旧版与项目、错误保留旧结果、重复点击保护；所有实际API请求GET。六表/原件/对象/任务守卫不变，不创建新版本或MP4。

完整Node/typecheck/build/离线Python/隔离PG回归按必要影响面核验；记录真实/受控测试区别与浏览器扩展hydration提示，不屏蔽既有警告。没有创建日期仍显示未记录。

## 自审与暂缓

已核对现有VersionHistory、page dirtyRef轮询、Project/DraftScene类型、Store锁语义及Schema chart字段，Git HEAD仍未出生；无委派/初次提交授权，只自审，不commit。确认以服务器读取稿为比较对象、身份隔离、范围准确/数组语义和晚响应边界，无额外收费或复制后端校验。人工听检/nums/20组付费/异地备份继续暂缓。

- [x] 用户同意只读变化摘要方向，复用现有面板，不需要视觉样稿。
- [x] 探索调用点与自审；无业务代码或服务改动。
- [x] 用户审阅并要求实现，已写计划/TDD完成代码/回归、真实dirty/受控竞态及原数据/进程守卫。
- [x] 隔离源码Next webpack生产构建通过，未覆盖原.next或重载服务；未把本轮说成默认Turbopack生产构建/94SQL重跑。

限制：摘要不是逐字diff、完整版本一致性或技术事实审查；配音/字幕/时轴不在比较范围，也不提供回滚/旧视频预览。
