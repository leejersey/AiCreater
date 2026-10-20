# Visual Style Tokens Implementation Plan

> **For agentic workers:** Use executing-plans inline. No delegation authorized. Scope is the approved first vertical slice, not the whole audit roadmap.

**Goal:** 同一份卡片/流程图分镜通过独立风格选项改变形状、箭头、间距和动画，旧渲染默认不变。
**Architecture:** 本地JSON预设经theme模块注册；纯布局/运动函数消费参数；抽出共用SceneGraphics供实际渲染与SSR测试；CLI/Studio共用校验。
**Tech Stack:** Existing React/Remotion/TypeScript, JSON, node:test; no dependencies, DB or queue changes.
**Outcome:** 首批纵切完成：268Node、typecheck及同分镜/同配色三版真实CLI导出通过，各263帧，解码音频与SRT相同；早期/完成帧已查看。CLI临时副本与渲染进程正常退出，无原服务/数据操作。仅四类图文场景，不含专用模板覆盖、版本冻结、concept或人工听检。见[验收](../../../output/workbench/visual-style-tokens-qa/receipt.json)。

- [x] RED: packages/video-components/tests/style-tokens.test.ts 覆盖已有layoutElements/flowPath/entranceAtFrame的新参数与独立风格注册；apps/renderer/tests/render.test.ts 增加CLI选项兼容/拒绝测试。Run `node --import tsx --test packages/video-components/tests/style-tokens.test.ts apps/renderer/tests/render.test.ts`; require feature-missing failures.
- [x] GREEN: packages/video-components/src/visual-styles.json、theme.ts、layout.ts、motion.ts 实现最小参数与ID/场景校验，默认数值保持原样。
- [x] WIRE: 新增packages/video-components/src/SceneGraphics.tsx，复用Video.tsx原图文代码；GraphicContent.tsx使用共享风格。Video.tsx的实际渲染/Canvas校验一致消费。apps/renderer/src/index.tsx、render.ts传递并验证visualStyle。
- [x] VERIFY: SSR检查实际卡片/SVG和同色板双风格差异，六元素边界和输入不变；`npm test`、`npm run typecheck`。本地对照不得产生模型/配音调用或原数据写入。
- [x] DOCS: 记录第一批限制、CLI用法、验收证据与后续顺序；更新docs/TODO.md，不把所有模板或其他两个问题标为完成。

无HEAD，不提交基线、不创建worktree；本次主会话自审，不冒称独立审查。原工作台不增加尚不能冻结到版本的风格选择器。
