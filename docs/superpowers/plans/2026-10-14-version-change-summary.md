# 只读版本变化摘要实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline task-by-task. Steps use checkbox syntax. 用户已以“实现”确认书面设计；无委派/初始Git提交授权，HEAD未出生，在现工作区单写者执行。

**Goal:** 冻结旧版与点击时GET的已保存稿比较教学内容，不读取未保存输入。
**Architecture:** 新纯函数按scene.id投影教学字段，现有VersionHistory局部GET与epoch隔离；纯只读呈现组件供SSR。无后端变化。
**Tech Stack:** 已有Next16.4/React19/TypeScript/tsx Node tests。

### Task1 比较函数红绿
Files: apps/web/lib/version-changes.ts, apps/web/tests/version-changes.test.ts；apps/web/lib/editor.ts仅DraftScene可选chart类型同步。
- [x] 写测试：相同/对象键顺序、空稿、增删不误判重排、共有场景重排、口播/code/elements/edges/structure/timeline/chart/类型、缺theme/edges默认、派生变更忽略、重复ID拒绝、输入不变。
- [x] `npx tsx --test apps/web/tests/version-changes.test.ts` RED缺实现后最小实现；GREEN。投影只读、对象排序/数组保留、边按pair排序，Map身份，不加依赖。

### Task2 面板红绿
Files: apps/web/app/VersionHistory.tsx, apps/web/tests/versions.test.ts。
- [x] SSR先测试VersionChanges旧/新r、字段标签/范围提醒/转义、无修改控件，RED缺输出。
- [x] 读Next本地client文档后加显式“与当前已保存稿比较”；GET真实项目，校验id，compare busyRef+epoch/live，inspect/关闭详情/卸载清理，错误保留已读比较，详情加载禁比较；不传page缓存或setProject。
- [x] Node SSR GREEN，`npm test`/`npm run typecheck`；source-only私有副本构建避免覆盖正在使用的.next，不拷.env/媒体，不重载API/web。隔离副本移除不含秘密的临时源码/依赖link只需自有路径，不删原目录。

### Task3 真浏览器及交付
Files: docs/TODO.md/README/docs/MVP开发契约.md/docs/mvp-follow-up.md；output/workbench/version-change-summary-qa/receipt.json。
- [x] 离线Python回归；后端未改，已有94SQL分页回归仍为历史，不谎称本轮重跑。自审风险与所有caller、数据边界。
- [x] 独立现有RAG副本r1(2edges)与r4(3edges)真实GET比较，仅第3章连线变化；先临时未保存口播再比较，输入保留、不计入摘要、无PATCH。受控失败保留旧摘要、关闭/切旧版/切项目晚回被拒；GET only gate，数据/对象/任务首尾守卫，确认丢弃自有临时输入、留输出页，不调用providers。
- [x] 写真实/受控分开的receipt，更新文档与TODO，fresh验证后交付。无rollback/diff/旧媒体预览、无新任务/版本/费用。

自审：现有get_project(lock=True)提供项目锁内读取；用业务scene.id不用DB行UUID。仅忽略派生字段，不将“无教学字段变化”说成全版本一致。数组/共同相对顺序、edge pair集合与optional默认边界均测试；chart类型同步是现有Schema真实字段。旧epoch隔离继续保留；新对比隔离不侵入编辑或服务生命周期。

## 完成记录

199Node/164离线Python（94DB仅跳过、后端本轮未改未重跑）、typecheck、源码私有副本Next webpack生产build通过，未覆写使用中的.next/BUILD_ID或重启服务。纯helper10tests、SSR5tests红绿；旧theme缺失fixture的delete必选字段触发TS2790，只改为Reflect.deleteProperty后绿色，无放松产品类型。

真实RAG只报第3章连线，dirty不纳入且保留；受控错误保留旧摘要、关闭/换旧版/换项目晚响应/重复点击保护通过，模拟r2无live写入，恢复native fetch并确认丢弃自有临时口播。183捕获皆GET，原进程/六表/媒体/配置/容器/73对象及58attempts0active不变；记录截图和任务keep。验收守卫JSON键类型、诊断把group_active(bool)误当集合与finishCLI不支持参数均已更正，非产品故障，不弱化检查。

