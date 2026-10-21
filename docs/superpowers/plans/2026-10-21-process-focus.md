# Process Focus Implementation Plan

**Goal:** 在同一处理链段完成文字去重、对象连续性、注意力节奏三项优化；不扩模板/设施/收费。

**Architecture:** 新增可选`mechanism_focus`样式ID保留现有mechanism及旧冻结输出，其他场景沿用机制演示。新ProcessFocus复用processFrame、已有高亮/cue/显式连接与音轨；不猜参数/语义关键词。无高亮时不随意截断词句；当前完整句由字幕承担，过去步骤在不重复字幕时保留。一个稳定示意对象跟随明确连接，不冒充业务执行。演示连接至少24帧但不得跨过下一源事件；结论段不再触发全图移动。

**Tech Stack:** existing React/Remotion/TS/Node/native PG; no dependency or framework change.

## Tasks
- [x] 先补5项红测并确认新模块缺失失败；实现后通过：去重、单对象/缺边不假造移动、推进时长/结论静止、cue门禁/回退/容量、旧模式兼容。
- [x] 修改`packages/video-components/src/{theme.ts,visual-styles.json,demonstrations.ts,ProcessDemonstration.tsx}`，新增`ProcessFocus.tsx`；样式冻结仍旧shape，只新增ID，不给旧快照塞字段。
- [x] 修改`apps/web/app/VisualStyleSettings.tsx`说明，现有Python样式加载自动读新ID；补原生冻结/旧快照回归。
- [x] 14.73秒A/B共享正式渲染/冻结样式文件；完整解码/PCM相同，回退同帧相同，3旧金样及上一验收版mechanism帧逐像素相同。审看100/153/350帧对照，v2修正移动时引线需触及路径并加锚点，不用测试数代替视觉验收。
- [x] 505项全Node/类型、8项原生样式/冻结用例通过。真实隔离浏览器登录→选新模式保存200→刷新保持→同一对象移动/暂停→其他两图形路由通过，0页面错误/任务；旧冻结/音轨/场景不变并清理自有资源。原环境只读健康200/匿名401，新编译chunk含新模式及组件，无重启/原课程写入/收费；保留用户现有UI修改。未重跑全Python/生产构建。

未覆盖：跨场景/跨章节对象传承、自动提取新关键词、真实业务工具执行、重配音、人工逐词听检。只优化已获批同一处理段，其他两种图形不宣称同时重做。
