# 流程图手工连线编辑

## 目标与范围

用户要求暂停异地备份、回到文稿→分镜→编辑→配音→导出核心功能，并同意优先流程图连线编辑。当前SceneEditor只读edges，Store.edit_scene的PATCH白名单不含edges，改变连接须付费生成AI候选；本次补上手工修改，不重复实现已有工作流。只改现有节点间的有向连线，不增删/排序节点、不变cue/topic/type，不做拖拽画布、自动布局算法或条件分支标签，不执行代码，不调用AI/TTS。

## 方案

推荐：把edges纳入现有flow场景PATCH，并在现有场景表单新增“来源节点→目标节点”的下拉行与增删按钮，共用“保存当前场景”。复用Store事务、共享Schema/DAG校验、SceneEditor未保存保护、Remotion渲染；没有新增API/数据表/依赖。

备选1：独立连线路由/编辑器，重复revision/save与错误处理，当前没必要。备选2：自由拖拽图编辑，增加依赖/节点位置协议/交互复杂度，超过当前核心缺口。交互沿用已有字段表单，不新增布局/视觉方案比较，不启动浏览器视觉伴侣。

## 前端

- 仅flow_diagram显示可编辑连线，每行两个select，选项来自当前elements的id+说明；提供明确的来源/目标aria-label与删除按钮。新增空行后须选齐两个节点才能保存，不擅自生成业务路径。
- 最多15条，与现有Schema一致；节点不足2个或已15条时禁用新增；允许删光，空edges符合现有协议。节点ID/顺序仍只读。不排序/去重输入，保持路径的顺序与用户意图。
- 本地提示未选齐或自连，阻止该状态保存；重复、成环/未知节点等仍由服务端权威验证，失败显示错误并保留全部输入，不另复制完整DAG算法或造最终DSL验证草稿。新增空行与删除也触发onDirty，撤离/轮询/收费按钮保留原保护。
- scenePatch仅对flow且显式改过连线时携带edges，未改边/非flow请求保持旧字段，避免常驻旧API未重载期间影响原编辑；变化按数组JSON比对不规范化顺序。表单当前步骤JSON依然仅elements，切换高级JSON不清除连线输入；非法步骤JSON仍阻止整个保存。
- 连线与口播/steps在同一次现有PATCH中保存；带当前scene expected_revision。保存成功刷新revision并清dirty；409/422保留本地口播、步骤、连线，不自动覆盖/重试。

## 后端与状态

在Store.edit_scene共享入口增加edges白名单，仅当前scene.type=flow_diagram允许。复用现有draft_valid/final_valid，拒绝未知字段、非数组/超过15、未知节点、自连、重复边、环；不增加Schema或放宽校验。失败回滚整个PATCH，包括同时修改口播/步骤；非flow携带edges即使空数组也拒绝。API形状仍PATCH /api/scenes/{id} {expected_revision,changes}。

实际核对发现：动画按节点ID/cue生成，连线透明度取两端节点入场透明度的min，现有拓扑布局在预览/渲染时计算。因此**仅改edges且节点/cue/口播不变，不必重算配音时间轴**：经草稿/ready最终校验后保留原ready/animations/captions/duration/audio资产，增加scene revision/user_revision与project revision，新的预览使用新的拓扑。原needs_voice/needs_timing状态保持，不因改边伪装ready；同PATCH口播变化仍按现有规则needs_voice并清派生产物。需要时间轴处理的既有场景继续使用显式本地timing，不自动提交任务。此处是对“必要时重算”的具体化，避免不必要重算及词缓存缺失阻塞。

编辑不更新旧project_versions/旧导出/候选；运行中的结果仍受既有base_revision/attempt fence保护。完全相同PATCH沿用无变化不增revision；连线数组顺序有渲染意义，不做规范排序。用户仍需判断连接是否符合讲解，DAG合法不等于技术事实正确。

## 改动面

- services/projects/store.py：允许edges，仅flow；复用原事务/验证/失效。
- apps/web/lib/editor.ts：scenePatch对flow携带edges，现有调用/测试同步。
- apps/web/app/SceneEditor.tsx：小规模现有表单增删/选择，与disabled/dirty/保存合并；若增长影响清晰度再用一个专用子组件，不预先搭框架。
- services/tests/test_projects.py、test_api.py、apps/web/tests/editor.test.ts：服务端与前端策略回归；现有Python/TS Schema无需改变，渲染器无需改动。实施前再读完整相关文件与Next本机文档。
- docs/MVP开发契约.md、README、TODO、mvp-follow-up同步支持字段/限制及验收证据；暂缓异地/nums/人工听检/20组收费状态不改。

## 验证与安全

先RED后GREEN：有效增删/清空/无变化、ready音频与时间轴保留、needs_voice/needs_timing不提升、同时改口播按原规则失效；过期revision409、不支持类型/自连/重复/环/未知节点/超15/未知字段422或既有invalid_patch；失败回滚、旧快照不变、旧候选/任务结果不能覆盖。前端测试flow patch/非flow不发送edges、输入保留/不提交不完整、自连与已有未保存保护。

临时PostgreSQL/API用例、离线Python/Node、typecheck/build；先自审，未授权独立代理或首次Gitcommit，保持当前HEAD未出生的工作区。实际浏览器仅在独立课程副本改连线，保存重开、保留原音频/字幕、预览两端出现/走线及冲突输入保护；确认原课程/旧版本/任务计数无新增收费动作。不自动生成/配音/重试；本地渲染若用于截图验收只单独确认范围后执行。若 API需重新加载只在明确授权后重启，不沿用过去一次性的维护窗口授权。

## 状态与自审

用户已确认书面设计并要求实现，随后单次授权API重载/独立副本真实保存验收。代码439项回归及实际保存重开/422成环回滚/409并发保护/旧候选拒绝/三条SVG预览均完成，功能已启用（output/workbench/flow-edge-activation/receipt.json）；未做新MP4或实听验收。已核对编辑器、scenePatch、Store候选/编辑、DRAFT共享验证、Python/TS DAG、Video节点动画/连线透明度和拓扑布局调用。没有新拖拽/连线文本/节点CRUD，边界与保留音频策略明确；不把结构合法或截图当作实听同步/事实验收。先完成代码/隔离测试，随后仅自有API原模式重载；常驻数据只增加独立验收副本9scenes与1冻结version/1手工candidate。所有原行/原课程/音轨/旧导出、web/队列/DB进程不改，无新收费或render任务；不沿用本次维护授权。
