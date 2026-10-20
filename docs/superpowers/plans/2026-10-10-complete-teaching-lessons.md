# 完整教学短课 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目默认直接执行，不派发未获授权的子代理。

**执行记录：** 用户审阅后回复继续，第一阶段已完成。新规则先红2测试、文稿缺失先红2测试，随后转绿。新鲜回归74 Node + 63独立Python + 61真实PG = 198实际执行测试，类型检查与py_compile通过；discover的61 skip由PG runner另行实际执行。文稿796/816码点（Python最后补充“回到正确版本”以明确空列表边界），教学核查点已人工对照。生产仅改共享模型提示，接口/协议/数据库/旧资产不变，无新增收费任务或服务重启。未做真实长课程生成、听检或独立代理审查，阶段二/三未实现。

**Goal:** 内容决定时长，以2–3分钟为主要课程体量、5分钟为硬上限；先交付完整编程/AI课程文稿与清晰分镜规则。

**Architecture:** 沿用现有文案驱动/原文保持/四模板协议和持久任务。第一阶段只改共享模型提示、增加两份离线课程文稿及测试，不改HTTP/数据库/DSL，不增加依赖。后续组件和表单独立设计实现。

**Tech Stack:** Python unittest/httpx MockTransport，既有Next.js/FastAPI/Remotion。

---

设计：docs/superpowers/specs/2026-10-10-complete-teaching-lessons.md。开始执行前请用户审阅该设计。当前目录无Git仓库，不伪造提交或创建额外仓库；本轮计划/设计未做独立代理审查。

### Task 1: 生成规则红测试

**Files:** Modify services/tests/test_generation.py。

- [x] 添加MockTransport测试，返回合法多场景草稿，断言原输入保持、提示不再包含`prefer around 5 scenes for a 60-second script`。
- [x] 断言教学动作分别定位、保留答案适用条件、内容决定时长和20场景边界进入system提示；不把提示文本断言当成实际模型遵守的证明。
- [x] 短文测试仍返回原稿一个场景；单场景重生成维持原ID约束。
- [x] `python3 -m unittest services.tests.test_generation -v`：确认新规则测试先失败，记录失败原因，不调用真实API。

### Task 2: 最小共享提示更新

**Files:** Modify services/workflow/providers.py:deepseek_storyboard。

- [x] 仅替换固定5场景提示并补充课程结构/动作cue/条件保留指南；不改变签名、原文保持或max_tokens/安全边界。
- [x] 明确短稿无需扩写或六段结构强行补全，不增加无内容停留。
- [x] 跑Task1命令转绿，检查既有重生成/异常/敏感数据测试不回归。

### Task 3: 两份完整课程文稿

**Files:** Create examples/lessons/full/python-loop.txt、examples/lessons/full/rag.txt、examples/lessons/full/README.md；Create services/tests/test_full_lessons.py。

- [x] 先写文稿检查测试：每份非空且≤4000码点，具备问题/具体示例/结果/误区或边界，并与固定已知示例对应。无外部网络和动态代码执行。
- [x] 确认缺文件时测试先失败。
- [x] 编写两份可人工校对的完整自然口播，内容量参考2–3分钟，不把字数推测当实测时长。
- [x] README列出Python已知正确状态和输出5，以及RAG示例文档条件/无依据边界；既有短案例文件不变。
- [x] 测试转绿，人工核对文稿里的代码/数字/条件一致性。

### Task 4: 回归与交付检查点

**Files:** Modify README.md、docs/MVP开发契约.md；Update this plan。

- [x] `npm test`、`npm run typecheck`。
- [x] 独立Python测试与`python3 services/tests/run_project_tests.py`分开记录；不把skip计成实际执行。
- [x] 文档明确内容优先和300秒实际硬上限，记录仅提示改善未承诺语义无误。
- [x] 保持现有持久服务与两个复核案例，不清理付费音频或修改旧快照。
- [x] 提交可审阅文稿和离线结果；真实收费生成另行安排，不自动扩大到20例。

下一阶段：根据课程中真正需要表达的对比、状态和时序分别定义组件数据；待单独设计确认后扩协议、渲染、模型提示与编辑器，再实现配音前分镜确认及表单。
