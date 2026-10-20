# 讲解风格：科普 / 知识干货

用户已确认：新建课需可选「科普」与「知识干货」；风格写入课程并贯穿后续分镜/候选（方案 B）；干货画面为流程为主、关键处分对比（选项 3）；旧课与未设置默认 **科普**（选项 A）。实现取方案 2：持久化 `teaching_style`，改讲稿与分镜 prompt，不新增专用图形组件。

## 目标与边界

- 在 `/courses/new` 增加讲解风格二选一：**科普**（`popular`）/ **知识干货**（`technical`），默认科普。
- 创建草稿时把风格写入项目；课程设置可改；**不**因改风格自动重跑已有场景或派收费任务。
- 「生成讲稿」按风格调整口播：干货覆盖要点术语与机制；科普可偏比喻与概念。
- 「生成教学分镜 / 候选分镜」读取课程当前风格：干货优先 `flow_diagram`，分叉用 `comparison_panel`（仅 2/4/6 元素），少用大段纯文字卡；科普保持现有通俗倾向。
- 本轮不做：新场景类型、新视觉组件、风格变更自动 regenerate、费用确认变更、团队/计费平台字段。

与既有契约：`source_text` 仍为分镜唯一口播来源（source-owned）；风格只影响**如何表达**讲稿与模板选择偏好，不改写已保存旁白。

## 数据模型

- 在 `projects.config` 增加可选键 `teaching_style`：`"popular"` | `"technical"`。
- 读取时缺失或非法 → 视为 `popular`（旧课兼容）。
- 写入路径：
  - `POST /api/projects` 创建时可带 `teaching_style`（缺省 `popular`）。
  - 新增免费 `PATCH /api/projects/{id}/teaching-style`（与 `/voice`、`/visual-style` 对称）：body 含 `expected_revision` + `teaching_style`；校验枚举；原子更新 `config`；**递增 project revision**。
- 不放入全局 profile / 字体 hash；不进入配音 profile 相等性比较（避免无关改风格导致 voice 任务误判）。

## 页面与本地草稿

1. 新建页：讲解风格控件（默认科普）；干货时要点 placeholder 引导术语链路（如 embedding → topK → rerank）。
2. `LocalDraft` course 数据增加 `teaching_style` 字符串字段；恢复/丢弃规则不变。
3. 课程编辑页「课程设置」展示当前风格并可保存；说明「仅影响之后新生成的分镜，不改已有场景」。
4. 列表摘要可选只读展示风格标签（非必须，首版可省略以减小范围）。

## 讲稿生成

`POST /api/manuscripts/generate` 增加可选 `teaching_style`（同枚举；缺省 `popular`）。

- **popular**：比喻与概念可占更大比重；术语可选。
- **technical**：禁止「这里不展开」类跳过；英文术语可保留并跟中文解释；仍禁止编造具体不可核实数据；仍输出纯口播文本（无 Markdown/代码块）。
  - 若 `outline` 非空：必须覆盖其中的术语与步骤。
  - 若 `outline` 为空：从标题/主题提炼可操作的机制与常用术语（如 RAG 场景下的 embedding、召回、rerank），不得只写空泛比喻。

创建草稿时前端把所选风格一并提交；生成讲稿请求也带上，避免「生成时干货、创建时丢风格」。Workbench 若仍有遗留「粘贴讲稿创建」路径，缺字段时服务端默认 `popular`。

## 分镜与候选

- 不得整课单一 flow、讲稿有定义/对比/开场/收束等材料时必须换型等多样性规则见 [`2026-10-19-storyboard-template-diversity-design.md`](2026-10-19-storyboard-template-diversity-design.md)（覆盖本文仅写「干货偏 flow」的笼统印象）。
- `submit_generate` / `submit_regenerate` 的 job `input` 增加 `teaching_style`（取自课程当前有效值，冻结进 job，与 voice profile 一样不可在执行中漂移）。
- Worker / `deepseek_storyboard` **只读 job input 中的风格**（缺省 `popular`），执行中不回读项目 config。
- DeepSeek storyboard 提示按风格分支：
  - **technical**：偏好流程与对比；术语可作短标签；少用无结构长文案卡；继续遵守既有 schema（含 comparison 元素数、concept_role、字段隔离）；继续走现有 `coerce_storyboard_draft`。
  - **popular**：保持当前通俗模板偏好。
- 改课程风格后：新 generate/regenerate 用新值；已排队/已成功 job 仍用其 input 内冻结值。因 PATCH 会升 revision，现有 generate dedup（按 base_revision）仍安全；本轮不把 `teaching_style` 纳入 dedup 键。
- 整课配音/对齐/渲染不读 teaching_style。

## 错误与兼容

- 非法 `teaching_style` → 400/422，不写入。
- 旧 API/旧前端缺字段 → 服务端按 `popular`。
- 风格 PATCH 409（revision）时前端保留表单输入（对齐 voice/style 草稿行为）。

## 测试与验收

1. 新建选干货 → 生成讲稿请求含 `technical` → 创建后 project.config 为 `technical`。
2. 缺字段旧课读取为科普；分镜 job input 为 `popular`。
3. 干货分镜 prompt / input 含 technical；科普不含干货强制条款。
4. PATCH 改风格升 revision；已有 scenes 不变；其后 generate 带新风格。
5. LocalDraft 恢复含 teaching_style；非法值拒绝。
6. 回归：无风格字段时创建/生成仍可用（默认科普）。

## 实现落点（摘要）

- 后端：`store` 读写/校验；`create_project` / settings PATCH；`manuscript.generate`；`jobs` submit 冻结字段；`providers` storyboard 提示分支。
- 前端：`courses/new`、课程设置、drafts 类型、必要文案。
- 文档：README / getting-started 一句说明两种风格差异。

本仓库不为流程强行打包无关未跟踪文件做首提；设计文档写入后待用户审阅，再进入实现计划。
