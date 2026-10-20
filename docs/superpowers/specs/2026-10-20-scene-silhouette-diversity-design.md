# 分镜外形剪影多样性（方案 2）

用户已确认：仅靠 prompt 切换 `scene.type` 不符合「丰富组件」预期——预览翻章仍像同一套圆角框。目标取方案 2：**改渲染剪影 + 加强选型**，不新造场景类型；九类现有模板须一眼可辨；讲稿无材料仍不强造重型模板。

与 [2026-10-19-storyboard-template-diversity-design.md](./2026-10-19-storyboard-template-diversity-design.md) 的关系：该文档只做 prompt 选型，**本 spec 覆盖外形剪影与选型加严**，作为「翻章能看出组件不同」的验收口径。

## 目标与边界

- 静音草稿预览切换章节时，**无需看 `scene.type` 徽章**也能分辨当前模板族。
- 软模板五类剪影互不相同；重型四类保持专用面板，与软卡硬区分（见验收清单）。
- 选型：有定义→concept、有两边取舍→comparison、有步骤→单幕纵向 flow；仅当讲稿明确支持时使用重型四类。
- 本轮不做：新 schema type、组件图鉴页、演示样片课、硬性「≥N 种 type」失败门槛、自动二次模型重试、新 visual_style。

## 九类目标剪影与布局合同

| 类型 | 拓扑合同（可测） | SceneGraphics / 面板 |
|------|------------------|----------------------|
| `title_reveal` | 恰好 1 个主块：宽 ≥1400、高 ≥280、水平居中；schema 已 `maxItems:1`，不处理多元素 | `outline` 或弱填充 + 大字号（≥56）；禁止多卡网格 |
| `concept` | 定义角色：单块 `y` 明显小于支持卡，宽 ≥1200；支持卡在定义下方网格（沿用现有分支，加大尺寸差） | 保留 `concept_role` 标签；定义字号 > 支持卡 |
| `flow_diagram` | **全部**节点同一垂直中轴（各盒中心 `x` 差 ≤8px）；按拓扑序 `y` 严格递增；节点间距由 `flowRowGap`；**禁止**双列/`graphicFlow` 2×2 | 箭头走纵向 `flowPath`；有 icon/step 时节点加高（见下）以容纳 `GraphicContent`，仍单列 |
| `comparison_panel` | 偶数列左栏、奇数列右栏；左右中心 `x` 差 ≥ 半屏；可选中缝竖线 | 左栏 `accent`、右栏 `secondary`（已有对色）；**不得**与纵向 flow 共用「同轴单列」拓扑 |
| `card_sequence` | **新增专用分支**（今日落入通用 3 列网格）：单行横排，`y` 相同（差 ≤8px），`x` 递增；元素 >3 时折成最多 2 行但仍为横条带，非整页四宫格 | conclusion 可用 `panel_style` 强调；与 flow 单列、comparison 左右对决区分 |
| `code_walkthrough` | 不经 `layoutElements`；`CodeLesson` 代码面板 | 手工验收：出现等宽代码区，非圆角要点卡 |
| `state_diagram` | `StateLesson` 结构槽位 | 手工验收：数组/对象/栈槽，非卡片网格 |
| `execution_timeline` | `TimelineLesson` 泳道 | 手工验收：水平时间条，非卡片网格 |
| `data_chart` | `DataChart`；数值须用户确认（既有规则，见 `services/tests/test_data_chart.py` 与 storyboard chart 拒绝路径） | 手工验收：轴/柱/矩阵，非软卡 |

### flow + graphic 竖排尺寸

- 取消 `layout.ts` 中 `flow_diagram && hasGraphicStyle → 双列 2×2` 分支及对 `graphicFlow` 双列路由的依赖；纵向箭头复用/简化 `flowPath`（删除仅服务于双列的分支若变为死代码）。
- 竖排 graphic 节点建议：宽约 900–1100、高约 160–200（容纳 icon/step + 文案），仍居中单列；须通过现有 overflow / height 检查，并更新 `style-tokens.test.ts` 中冻结的 2×2 坐标断言。

### comparison 与 flow 的可测差异

单测用「签名」比较，而非肉眼：

- flow：`uniqueRoundedCenterX(boxes) === 1` 且 `ys` 严格递增。
- comparison：`uniqueRoundedCenterX(boxes) === 2` 且左右各至少 1 盒。
- card：`uniqueRoundedCenterY(boxes) === 1`（单行）或行数 ≤2 且同行 `y` 对齐（多元素折行）。

## 架构

```text
讲稿 → storyboard_request(选型) → DSL → coerce → scenes
                                              ↓
                         layout/SceneGraphics（软模板剪影）
                         Code/State/Timeline/Chart（重型）
                                              ↓
                                        预览翻章
```

### A. 视觉落点

1. [`packages/video-components/src/layout.ts`](../../../packages/video-components/src/layout.ts) — 上述拓扑；新增 `card_sequence` 分支；删除 graphic 四宫格。
2. [`packages/video-components/src/SceneGraphics.tsx`](../../../packages/video-components/src/SceneGraphics.tsx) — title 弱框/outline；comparison 中缝（可选 SVG 竖线）；flow 箭头随纵向；清理无用的 `graphicFlow` 双列路径。
3. 主题 token：仅在现有 `style.card` / padding 不够支撑 title outline 或竖排 graphic 高度时微调，**不新增** visual_style id。
4. 重型四类：本轮不改布局引擎；验收用既有 fixture 静帧确认与软卡不同即可。

### B. 选型落点（相对 2026-10-19 的增量字符串）

在 [`services/workflow/providers.py`](../../../services/workflow/providers.py) `storyboard_request` **追加**（勿只重复旧句）可测子串，例如：

- `Do not split a two-sided contrast into two flow_diagram scenes; use one comparison_panel.`
- `For ordered landing steps use one vertical flow_diagram; do not use icon/step fields to imply a 2x2 grid.`
- `Use code_walkthrough, state_diagram, or execution_timeline only when the script explicitly describes code, mutable state snapshots, or quantified timing; never for metaphor-only scripts.`

离线单测断言 prompt **包含上述新句**（popular 与 technical 共用追加，或挂在共享 Template 段后）。

## 边界情况（本轮明确）

- `title_reveal`：仅 1 元素（schema）；不扩展多标题。
- `flow_diagram`：1 步仅单盒无箭头；无 edges 时仍纵向排版；部分 edges 仍 `orderFlowElements`。
- `comparison_panel`：仅 2/4/6（既有 coerce）；6 元素仍左右栏各 3 行。
- `card_sequence`：1 元素居中横条；4–6 元素两行横排。

## 错误与兼容

- 校验失败码与 schema 不变；concept 摘录 coerce 保留。
- **渲染侧**：刷新 workbench 后旧分镜即用新外形。
- **选型侧**：须重新 generate / regenerate。
- 已导出成片不回溯。

## 测试夹具与断言

布局单测（建议 `packages/video-components/tests/silhouette.test.ts`）固定夹具：

| fixture | 设定 |
|---------|------|
| title | 1 元素 |
| concept | 1 definition + 2 feature |
| flow plain | 4 元素 + 链式 edges，无 icon |
| flow graphic | 4 元素 + 链式 edges，均带 `step`+`icon` |
| comparison | 4 元素 |
| card | 3 元素；另测 4 元素折两行 |

断言：签名互异；`flow graphic` 的 `uniqueRoundedCenterX === 1`（非 2）。更新 `style-tokens.test.ts` / overflow 中依赖旧 2×2 的期望。

Prompt：`services/tests/test_storyboard_diversity.py` 增加对新增量子串的断言。

手工九类清单（重生或既有 fixture）：title / concept / flow 纵 / comparison / card / code / state / timeline / chart 各至少一幕静帧，确认无「同一套软卡」误认。

## 文档

- 本文件为权威设计。
- `2026-10-19-storyboard-template-diversity-design.md` 已交叉引用本文件。
- README / getting-started 一句：预览按模板剪影区分；选型按讲稿语义，不新造类型。
