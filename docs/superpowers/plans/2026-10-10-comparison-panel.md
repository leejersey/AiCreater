# 教学对比面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 未授权代理，默认主会话直接执行。

**执行记录：** 用户回复继续后直接执行，现已完成。协议/布局先红4项，提示先红1项；新鲜回归82 Node + 65独立Python + 61真实PG = 208实际执行，类型检查通过。仅扩展Schema枚举/2·4·6数量约束、layout/配色、共享生成提示与模板版本teaching:2；旧模板布局不变。examples/comparison-demo.json为macOS say合成样例，421帧14.033s，开始/入场/完成截图已读取检查。创建的examples/lessons/comparison.json是手写草稿，不能冒称模型输出。

已检查无活动任务后更新自有常驻API、workflow/render worker、beat，保留web热更新/卷/项目/旧导出；导入对比样例并实际HTTP编辑重开、音频引用保持、还原标题、冻结新快照、真实队列一次导出和下载SHA验证。收据output/workbench/comparison.json。无收费模型/TTS请求。旧teaching:1快照仍保留但重渲染受新runtime版本保护，须创建新快照；未做新浏览器端完整操作和云端实际生成/对齐验收，后两种组件/表单未完成。

**Goal:** 增加有限、配对、口播同步的左右教学对比，不改变旧四类项目。

**Architecture:** comparison_panel使用既有elements/cue/animations，2/4/6项，按左右成对分三行。Schema共享数量限制，layoutElements独立分支，Video复用渲染与字体检查。输入/API/DB字段不新增。

**Tech Stack:** JSON Schema、Python jsonschema/unittest、TS/Ajv、React/Remotion，零新增依赖。

---

设计：docs/superpowers/specs/2026-10-10-comparison-panel.md。实现前请用户审阅。当前无Git仓库，不伪造commit；未调未授权独立代理。

### Task 1: 协议红绿

Files: packages/video-schema/schema.json、packages/video-schema/src/types.ts；packages/video-schema/tests/既有验证测试、services/tests/test_teaching.py。

- [x] 读取现有测试夹具与错误代码，新增合法2/6项、非法1/3/5项、禁止混入code/edges以及旧四类兼容测试。
- [x] 先跑对应测试确认新类型尚不支持而失败，记录原因。
- [x] type enum追加comparison_panel；allOf中对该类型elements数量使用2/4/6三个精确区间的anyOf。其他类型不改变。
- [x] npm run schema:types；跑Python草稿/最终校验及Node测试转绿，检查生成类型不手写。

### Task 2: 固定布局与渲染

Files: packages/video-components/src/layout.ts、packages/video-components/src/Video.tsx；packages/video-components/既有布局测试。

- [x] 先测试成对元素左右同排，坐标固定、40字不占字幕区，与旧布局相同结果。
- [x] comparison_panel分支使用x80/976、y184+232*row、width864/height208；首排40号、后两排36号，wrapText20。
- [x] Video仅加左右配色及首排视觉区分；复用state(id)、字体宽度、字幕与音频，保持seek-safe。
- [x] 测试转绿、typecheck，检查旧code/flow/title/card分支无改动。

### Task 3: 生成与版本接入

Files: services/workflow/providers.py、services/tests/test_generation.py；检查模板版本实际定义并修改该处；apps/web/lib/editor.ts/tests只需验证现有patch仍适用。

- [x] 先测provider提示包含适用场景、成对顺序与禁止多行代码标签约定。
- [x] 更新共享提示，不改变原稿/单场景重生成约束；真实语义仍须人审。
- [x] 查所有type枚举/条件与profile模板版本，补必要调用方，避免API/worker旧schema与child新schema混跑。
- [x] 工作台无需新增字段，保存仍传elements；验证新场景编辑与旧项目兼容。

### Task 4: 不计费视觉样例与回归

Files: 新增examples/lessons/comparison.json及离线样例构建入口（复用既有demo合成音频方式），README.md、docs/MVP开发契约.md。

- [x] 用明确手写的正确/错误初始化或普通问答/RAG示例，保留各自前提与结果；不执行模型/用户代码。
- [x] 本地导出并截图开始、入场中点、完成；确认两列/文字/字幕无遮挡，记录为合成音频样例而非真实配音。
- [x] npm test、npm run typecheck、独立Python及真实PG回归；skip不记为实际执行。
- [x] 更新能力与边界，更新常驻服务前检查进行中任务，不误触付费任务；不改旧快照或清理旧资产。

未完成项保持未打勾；不在此宣称状态图、执行时间线或配音前表单完成。
