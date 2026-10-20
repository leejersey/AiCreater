# 分镜模板多样性（按文稿语义选型）

用户已确认：画面偏单一（易整课只剩流程图）；希望按 AI 讲稿语义选用不同现有组件，使多幕画面更丰富。实现取方案 1：**只改分镜 prompt / 风格条款**，不新增场景类型；编排方式为 **C（定向编排，有材料才落对应模板）**；作用范围为 **3（generate + regenerate；technical 机制段仍可多用 flow，popular 更强调开场/概念/例子穿插）**。

> **后续：** 仅靠本文件的 type 切换不足以让预览「一眼看出不同组件」。外形剪影与选型加严见 [2026-10-20-scene-silhouette-diversity-design.md](./2026-10-20-scene-silhouette-diversity-design.md)。

## 目标与边界

- 整课「生成教学分镜」与单章「候选分镜」在选型时按口播教学动作切换现有模板，避免把整篇口播压成单一 `flow_diagram`。
- 有对应语义才用对应模板；没有不强造、不灌水场景。
- 继续遵守既有 schema（元素数、`concept_role`、comparison 仅 2/4/6、字段隔离、source-owned 旁白不改写）。
- 本轮不做：新场景类型/新视觉组件、硬性「≥N 种 type」失败门槛、自动二次模型重试（加倍费用）、改配音/对齐/渲染、UI 上手动选模板菜单。

## 选型指引（写入 storyboard prompt）

在 `storyboard_request` 增加明确的「教学动作 → 模板」条款（中英均可，与现有英文条款风格一致即可），核心语义：

| 口播语义 | 优先模板 |
|----------|----------|
| 开场、提出问题 | `title_reveal` 或 `card_sequence` |
| 定义 / 是什么 | `concept`（须满足既有 concept_role 规则） |
| 多步机制 / 流水线 | `flow_diagram` |
| 两边对比、取舍 | `comparison_panel`（仅 2/4/6 元素） |
| 收束 / 要点回顾 | `card_sequence`（可用既有 conclusion 类可选字段） |
| 代码走查 / 状态 / 时序 | 仅当讲稿明确相关时用 `code_walkthrough` / `state_diagram` / `execution_timeline` |

附加约束：

- 相邻幕尽量避免无理由地重复同一 `type`（短课允许机制连续两幕 flow，但整课不得只有一种类型——若讲稿确实只有纯步骤且无定义/对比材料，可整课 flow，不强造假 concept）。
- 仍偏好约 4–8 幕、按认知步骤切分，不按句硬拆。
- 不发明讲稿没有的对比双方或虚假定义来「凑多样性」。

## 与 teaching_style 的关系

- **`technical`**：机制段可继续偏好 `flow_diagram` 与短术语标签；但**禁止**把整篇口播压成单一 flow。讲稿中出现定义、分叉对比、开场/收束材料时，必须换用上表对应类型。
- **`popular`**：更强调开场/concept/例子卡与 flow 穿插；比喻向内容可用 concept 或 card，不要无步骤硬套长 flow。实现上用独立 `elif teaching_style == 'popular'` 附加段（与 technical 对称），穿插偏好以该附加段为单测断言来源；共享表只写通用选型规则。
- 既有 `teaching_style` 冻结进 job input 的路径不变；多样性条款挂在同一 `storyboard_request(..., teaching_style=)` 上，generate / regenerate / worker 均受益。
- 与 `2026-10-19-teaching-style-design.md` 的关系：该文档仍描述干货偏 flow；**本 spec 覆盖「有材料时必须换型 / 不得整课单一 flow」**。实现后可在 teaching-style 文档加一句交叉引用，避免读者只看旧文。

## 实现落点

- 主要改动：`services/workflow/providers.py` 中 `storyboard_request`：
  1. 增加共享「教学动作 → 模板」表（作为选型主依据）。
  2. 弱化/改写基座里易导致「全程 flow」的笼统 prefer 句，使共享表优先。
  3. 修订 `technical` 附加段（短标签 + 不得整课单一 flow + 有材料换型）。
  4. 新增 `popular` 附加段（开场/concept/例子与 flow 穿插）。
- 测试：离线断言 prompt 含多样性指引；technical / popular 附加段断言如上。验收「至少两种模板」仅作手工/smoke，不进硬失败单测。
- 文档：README 或 getting-started 一句说明「分镜按讲稿语义切换现有模板，不新增组件」。

## 错误与兼容

- 不因「类型种类过少」单独失败；仍只因 schema / cue / provider 错误失败。
- 旧 job / 旧 worker 无新 prompt 字符串不影响已冻结成功结果；新提交的 generate/regenerate 使用新提示。

## 验收直觉

- 类似「什么是 RAG」且含定义+流程+可选对比的讲稿：生成结果宜出现至少两种以上模板组合（例如 concept + flow，或再加 comparison/card），而不是一幕四框走完全程。
- 纯步骤、无定义材料的短稿：允许以 flow 为主，不强造假概念卡。
- 单章 regenerate：按该章旁白语义选型，不强迫与邻章不同类型。

本仓库不为流程强行打包无关未跟踪文件；设计文档写入后待用户审阅，再进入实现计划。
