# 三字段旧新值 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline。用户已确认设计并要求实现，无委派/初始Git提交授权，HEAD未出生，不开代理或worktree。

**Goal:** 现有变化摘要下只读展示同一比较快照的口播/代码/连线旧新值。
**Architecture:** ChangeSummary场景项加可选values数组，固定投影与文本捕获；VersionChanges原地details/pre渲染。不新增状态/请求/接口。
**Tech Stack:** 已安装TypeScript/React/Next16与Node test，零依赖。

### Task1 纯函数TDD
- [x] 修改apps/web/tests/version-changes.test.ts：口播换行/代码白名单与未设置/连线空数组、其他类别无values、输入及捕获值不变、边排序不报。
- [x] `npx tsx --test apps/web/tests/version-changes.test.ts` RED：values缺失。
- [x] apps/web/lib/version-changes.ts加可选values固定label/before/after，仅共有changed场景三字段；只捕获显示文本，code白名单，edges pair，不引用原对象。
- [x] 同命令GREEN，原有10tests不改语义。

### Task2 SSR TDD与呈现
- [x] apps/web/tests/versions.test.ts加折叠/两r号/三字段转义/空缺值区分/旧fixture兼容/无编辑或回滚；先RED缺少文本。
- [x] 读Next本地client文档；apps/web/app/VersionHistory.tsx仅VersionChanges map项扩展div/details，旧新h4/pre；原比较state/epoch/fetch保持原状，提示非逐字高亮。
- [x] focused Node GREEN、npm test、npm run typecheck、Python离线；不把旧94SQL说成本轮。
- [x] 隔离源码副本Next webpackbuild，原.next/进程不动；复用已有构建helper模式，校验所有3业务文件hash。

### Task3 实际只读QA与文档
- [x] 原组/六表/对象/媒体/jobs快照守卫。现有RAG副本r1/r4实际连线2→3，dirty口播不纳入；受控口播/代码、空值与长文本、失败/晚响应验证，明确mock不写live。
- [x] GET-only守卫/恢复native fetch、丢弃自有临时输入、保留输出页、真实截图；无新版本/渲染/付费/重启，若环境不可用不擅开服务。
- [x] README、MVP契约、TODO、follow-up、spec/plan与output/workbench/version-field-values-qa/receipt.json更新真实数量/限制。

自审：DTO可选values不破坏旧fixture；仅共有变更场景，空文本UI提示与缺code区分；保留既有labels/排序/身份校验与epoch，不创建重复请求。非逐字diff、不回滚、派生字段仍不比。
