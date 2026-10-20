# 纸质幻灯片丰富度（方案 3）

对标参考片：抖音风格「Agent 意图识别」知识讲解（纸纹底、黄高亮、红印章、系列头、漏斗 / 对话气泡+档案 / 三手段 / 示意网）。验收口径：同赛道气质与明显更丰富的构图；**不追求**逐镜手搓 1:1。诚实预期约 **60–70%** 结构/气质贴近。

与 [2026-10-20-scene-silhouette-diversity-design.md](./2026-10-20-scene-silhouette-diversity-design.md) 的关系：剪影多样性解决「不像同一套框」；本 spec 叠加纸质视觉语言与专用 motif。

## Phase 1 — `paper_slide` 视觉风格（无新 type）

- 新增 visual style id：`paper_slide`（标签：纸质幻灯）。
- 建议配色：`light_teaching` 或 `color_infographic`（UI hint；不强制改 theme）。
- 渲染：系列头用项目标题；纸纹底；`highlight`→黄标记；`source_label` / conclusion→红印章；软卡略 sticky。
- schema 不变；剪影合同仍适用。

## Phase 2 — 场景 `motif`（可选）

软模板可选字段 `motif`：`default | funnel | dialogue_split | means_row | schematic`。

| motif | 适用 | 约束 |
|-------|------|------|
| `funnel` | card_sequence / flow | 2–3 元素，纵向漏斗层 |
| `dialogue_split` | card_sequence / comparison | 2–4 元素：左气泡 + 右档案卡 |
| `means_row` | card_sequence / comparison | 2–3 元素横排手段 |
| `schematic` | card_sequence / concept / flow | 1–4 元素 + 侧旁示意网/状态机字形 |
| `default` / 缺省 | 任意 | 现有剪影布局 |

非法 / 不匹配基数 → coerce 为 `default`。分镜 prompt 按语义选型；无 AI 生图。

## 非目标

逐镜 AI 插画、口播真人出镜、素材库、演示课包、硬性 type 种类门槛、重写 code/state/timeline/chart 引擎。
