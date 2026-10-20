# 教学模板

AiCreater 面向中文知识教学，内置9种基于Remotion的教学表达；新增concept为代码/隔离验证阶段，真实完整课程证据仍集中于编程与AI。所有模板均为纯前端 SVG / HTML 视觉渲染，**不解析也不执行任何用户或模型提供的代码**，确保教学展示的安全与确定性。

## 风格与语义（CLI/Studio九类覆盖）

全部9类场景支持legacy、whiteboard、minimal；代码讲解包括普通布局及视觉C，状态图包括array/object/stack，图表包括四种kind。`theme`仍管配色，`visualStyle`改变面板轮廓/填充/圆角、安全留白与揭示，不执行代码，不修改状态、事件/数据坐标、音轨或cue。

时间条只用不移位的揭示，完成后保留当前事件双框及执行/等待标记；图表不做数值插值，保留零高度、比例总量与矩阵原值/色阶。旧调用默认legacy；未知风格或未实现的新类型拒绝。工作台选择/完整token冻结已在本机启用，临时副本真实保存、实际Player和旧版本冻结已验；见[用法](getting-started.md#工作台风格选择与冻结本机已启用)/[原生验收](../output/workbench/style-selection-activation/receipt.json)。混合场景渲染仍见[混合静音样稿及验收](../output/workbench/dedicated-styles-qa/receipt.json)，不是事实审核、真实配音或声学听检。

## 模板概览

| 模板类型 (`type`) | 模板名称 | 主要用途 | 核心数据结构 / 关键字段 |
|---|---|---|---|
| `concept` | 通用概念解释 | 定义主卡与特征、例证、总结，保留原稿顺序 | `elements`（1–6项，`concept_role`必填，正文绑定cue原文） |
| `title_reveal` | 标题揭示 | 课程开篇、章节大标题呈现，支持首屏快速揭示 | `elements`（最多 1 项，支持 `role: "topic"`） |
| `card_sequence` | 逐步卡片序列 | 核心概念、要点罗列、图文步骤讲解 | `elements`（1–6 项，支持 `icon`、`highlight`、`source_label`、`panel_style`） |
| `flow_diagram` | 无环流程图 | 系统架构、处理链路、条件分支与决策流转 | `elements`（1–6 项）+ `edges`（有向边，最多 15 条） |
| `code_walkthrough` | 编程代码教学 | 代码逐行讲解、行高亮、变量快照与输出展示 | `code`（`language`、`source`）、`elements`（`code_lines`、`variables`、`output`） |
| `comparison_panel` | 教学对比面板 | 技术方案选型、概念优缺点对称对照 | `elements`（固定 2 / 4 / 6 项，双列最多三行） |
| `state_diagram` | 数据结构状态图 | 数组、对象、栈内存与逻辑状态演变可视化 | `structure`（`kind`、`name`）、`elements`（`items`、`active_item_ids`） |
| `execution_timeline` | 执行时间线 | 任务调度、串行/异步执行时序与等待分析 | `timeline`（`duration_ms`、`lanes`）、`elements`（`event`：`lane_id`、`start_ms`、`end_ms`、`phase`） |
| `data_chart` | 原生数据图表 | 柱状图、折线图、比例图、矩阵图数据呈现 | `chart`（`kind`、`title`、`unit`、`source_note`、`data`、`columns`、`confirmed: true`） |

> **扩展说明**：`code_walkthrough` 支持通过可选字段 `code.array_name` 开启**代码与教学状态同屏**布局（视觉 C 增强），在单屏内同时展示代码、数组、指针、循环次数与输入输出。

---

## 1. 标题揭示 (`title_reveal`)

用于视频开头、章节切换或核心主题宣告。

### 字段规格与约束
- **元素数量**：`elements` 最多包含 1 个元素。
- **内容限制**：`content` 长度不超过 30 个 Unicode 码点。
- **开场主题角色 (`role: "topic"`)**：
  - 元素可配置 `role: "topic"`。
  - 标记为主题的元素从第 6 帧（0.233 秒）即完全展示，早于第一句口播字幕，避免开屏黑屏或长时间空白。
  - 不能携带代码、变量、状态或图表结构。
  - 主题文字应为章节标题，不应是待揭示的题目答案。

---

## 2. 逐步卡片序列 (`card_sequence`)

用于要点罗列、分步原理解析或图文知识卡片展示。

### 字段规格与约束
- **元素数量**：`elements` 包含 1–6 个卡片元素，随口播 cue 依次入场。
- **内容限制**：每项 `content` 长度不超过 40 个 Unicode 码点。
- **首项主题角色**：支持首个元素配置 `role: "topic"` 提前展示。
- **图文增强样式**：
  - `icon`：可选图标类型，支持 `document`（文档）、`search`（检索）、`idea`（思路）、`code`（代码）、`check`（校验通过）、`warning`（警告）。
  - `highlight`：局部字词高亮，定义 `{text_start, text_end}` 字符区间。
  - `source_label`：来源标签（如“知识库”、“用户输入”），长度不超过 12 个码点。
  - `panel_style: "conclusion"`：将卡片高亮为“结论/产出”样式，采用主题重点色与选中底色。

---

## 3. 无环流程图 (`flow_diagram`)

用于展示数据管道、处理阶段、架构拓扑或判断决策分支（例如 RAG 检索链路）。

### 字段规格与约束
- **节点数量**：`elements` 包含 1–6 个流程节点，按口播 cue 触发淡入滑动。
- **连线定义 (`edges`)**：
  - 包含 `edges: [{from, to}]` 有向边数组，最多 15 条边。
  - `from` 与 `to` 必须引用当前场景中合法的元素 ID。
  - SVG 原生连线根据节点矩形边缘自动计算路径，末端带有箭头标记。
  - 连线透明度与两端节点的动画状态自动同步，形成平滑入场效果。

---

## 4. 编程代码教学 (`code_walkthrough`)

专门面向编程语言教学，左侧显示代码行与高亮，右侧同步显示当前步骤讲解、变量教学快照和标准输出。

### 字段规格与技术约束
- **代码定义 (`code`)**：
  - `language`：支持 `python`、`javascript`、`typescript`、`java`、`cpp`、`text` 语法高亮展示。
  - `source`：完整代码文本，**最多 16 行，每行最多 48 显示单位**，正文统一使用 32px 等宽字体。超限直接拒绝，不压小字号。
  - **安全原则**：仅作视觉展示，系统**绝不执行**用户或 LLM 生成的代码。
- **讲解步骤 (`elements`)**：
  - 包含 1–6 个步骤。每步 `content` 最多 32 个码点，阐述当前步的逻辑。
  - `code_lines`：当前步骤需要高亮的代码行号数组（从 1 开始计数，1–16）。
  - `variables`：教学变量快照数组，最多 3 个变量。每项包含 `name`（最大 16 码点）和 `value`（最大 20 码点）。
  - `output`：当前标准输出文本（最大 44 码点）。

### DeepSeek 教学分镜约束
- 编程教学提示词已注入严格约束：编程优先提供具体的代码实例与内存状态演变；AI 优先列出具体输入、处理逻辑、模型调用和实际输出，禁止仅生成宽泛的营销口号。
- 自动生成的技术内容仍需人工审核确认。

### 示例文件与生成命令
- 示例讲稿与分镜：
  - `examples/lessons/python-sum.json` / `.txt`：六步循环累加讲解（变量初始化、遍历取值、累加计算、重复循环、打印输出）。
  - `examples/lessons/rag.json` / `.txt`：检索增强生成原理、事实来源与无可靠依据分支。
- 直接使用已审核分镜渲染（跳过 LLM 分镜生成）：
  ```bash
  npm run generate -- examples/lessons/python-sum.txt output/python-new.json --storyboard examples/lessons/python-sum.json
  npm run render -- output/python-new.json output/python-new.mp4
  ```

---

## 5. 代码与教学状态同屏 (`code_walkthrough` 扩展模式)

在 `code_walkthrough` 基础上，当设置了 `code.array_name` 时启用的三卡同屏教学布局（视觉 C 规范）。左侧展示 16 行/48 显示单位代码与 30px 行高亮，右侧同屏展示当前数组容器、指针箭头、循环状态、变量快照以及输入输出。

### 字段规格与约束
- **启用条件**：`code` 对象中填写 `array_name`（1–8 个可见码点）。不填则保持传统两栏布局。
- **步骤增强字段（每个 element 必须显式提供）**：
  - `array_items`：当前数组状态快照，最多 6 项。
    - 每项结构为 `{id, key, value}`。
    - `key` 必须从 `0` 开始连续递增，`id` 唯一，`value` 不超过 8 个码点。
    - 空数组明确展示空容器占位。
  - `pointers`：指针列表，最多 2 个指针。
    - 结构为 `{name, item_id}`，`name` 不超过 6 个码点且唯一，`item_id` 必须引用当前 `array_items` 中的项。
    - 允许两个指针指向同一项；清除指针不会影响变量快照。
  - `loop`：循环轮次指示，可为 `null` 或 `{current, total}`。
    - 整数约束：`1 <= current <= total <= 1000000`。
  - `input`：输入说明文本，不超过 44 个码点。
  - `output`：输出结果文本，不超过 44 个码点。
  - `variables`：普通变量最多 3 个，`name` ≤ 6 码点，`value` ≤ 8 码点。
  - `content`：步骤讲解标题，不超过 20 个码点。

### 运行特征与工作台交互
- **纯文本展示**：所有内容均为教学快照纯文本，不解析数值也不在后台进行表达式求值。
- **文本换行安全**：ASCII 短数字和短列表保持整行，长文本安全自动换行，避免截断或溢出边框。
- **时间同步**：各状态快照严格按口播 cue 整体切换，支持随机 seek，不累积残留状态，不提前剧透输出。
- **工作台配置**：代码场景勾选“数组 / 指针 / 循环同屏（不执行代码）”并输入数组名，通过表单或高级 JSON 维护。停用时需二次确认以防误删状态字段。
- **参考示例**：`examples/lessons/code-state.json`。

---

## 6. 教学对比面板 (`comparison_panel`)

用于技术方案选型对比、正反案例对照或概念异同解析（例如：RESTful vs GraphQL，深度优先 vs 广度优先）。

### 字段规格与约束
- **元素数量**：复用 `elements` 与 `cue`，**仅允许 2、4 或 6 项**（固定双列布局，最多三行）：
  - 2 项：左标题 vs 右标题
  - 4 项：左说明 vs 右说明
  - 6 项：左结果 vs 右结果
- **严格约束**：拒绝奇数项元素，拒绝包含代码字段（`code`）或流程连线（`edges`）。多行代码必须使用 `code_walkthrough`，禁止硬塞入对比卡片。
- **排版与入场**：两列元素分别根据各自口播 cue 渐入，中文内容在预设列宽内自动安全换行。

### 示例命令与文件
- 生成对比面板示例项目：
  ```bash
  npm run demo:create -- --comparison
  npm run render -- examples/comparison-demo.json output/comparison-panel/video.mp4
  ```
- 示例原稿：`examples/lessons/comparison.json`。

---

## 7. 数据结构状态图 (`state_diagram`)

用于展示运行时内存结构快照，支持数组、对象和调用栈三种经典数据结构的可视化。

### 字段规格与技术约束
- **结构定义 (`structure`)**：
  - `kind`：支持 `"array"`（数组）、`"object"`（对象/键值对）、`"stack"`（栈）。
  - `name`：结构名称（最大 24 码点，如 `call_stack`、`user_map`、`scores`）。
- **步骤快照 (`elements`)**：
  - 包含 1–6 个讲解步骤，每个步骤 `content` 最大 32 码点。
  - `items`：当前步骤完整的元素数组，最多 6 项。
    - 每项结构为 `{id, key, value}`。
    - `key`：最大 12 码点；数组按连续索引编号，对象按键名，栈按自底向上顺序存放。
    - `value`：最大 16 码点。
  - `active_item_ids`：当前步骤高亮的项 ID 数组（最多 6 项，必须引用 `items` 中存在的有效 ID）。
- **渲染特征**：
  - 栈结构自动自底向上排列，并在最顶端项标注 `TOP · 栈顶`。
  - 预留 320px 标签安全区，并具备字体宽度防溢出检测。
  - 帧号严格决定当前状态快照，倒退 seek 绝不会残留后续步骤的值。
  - 纯教学展示，不解析指针或运行代码；重复字段 ID、不存在的高亮 ID、越界索引均报错拒绝。

### 示例命令与文件
- 生成状态图示例项目：
  ```bash
  npm run demo:create -- --state
  npm run render -- examples/state-demo.json output/state-demo.mp4
  ```
- 示例原稿：`examples/lessons/state.json`。

---

## 8. 执行时间线 (`execution_timeline`)

用于分析多任务时序、网络请求阻塞、事件循环（Event Loop）以及串行与并发/异步执行模型。

### 字段规格与技术约束
- **时间线定义 (`timeline`)**：
  - `duration_ms`：示意总时长（毫秒，1–3600000ms）。
  - `lanes`：任务轨道定义，包含 1–3 条轨道。每项包含 `id` 和 `label`（轨道名称，最大 12 码点，如 `主线程`、`网络 I/O`、`Worker`）。
- **步骤事件 (`elements`)**：
  - 包含 1–6 个步骤，每步关联一个明确的 `event`：
    - `lane_id`：所属轨道 ID。
    - `start_ms`：起始时间（毫秒，>= 0）。
    - `end_ms`：结束时间（毫秒，> start_ms）。
    - `phase`：阶段类型，可选 `"execute"`（执行中，实线渲染）或 `"wait"`（等待/阻塞，虚线渲染）。
- **区间与时序约束**：
  - **同轨半开区间禁止重叠**：同一条轨道内，任意两个事件的 `[start_ms, end_ms)` 不得相交。
  - **跨轨允许重叠**：不同轨道之间的事件时间可以重叠，表示并发或重叠等待。
  - **语义边界**：时间轴为明确假设下的示意时间，**非实际性能压测数据**，轨道重叠亦不代表真实的底层 CPU 并行保证；时间线毫秒数不决定视频配音时长。
- **视觉排版**：
  - 按口播 cue 逐步揭示事件；倒退 seek 实时隐藏后续事件。
  - 右侧始终标明当前事件的精确起止毫秒区间，不采用拉宽比例伪造耗时。
  - 零刻度位置经过校准（340px），避免与左侧说明文字重叠。

### 示例命令与文件
- 生成时间线示例项目：
  ```bash
  npm run demo:create -- --timeline
  npm run render -- examples/timeline-demo.json output/my-timeline.mp4
  ```
- 示例原稿：`examples/lessons/timeline.json`。

---

## 9. 原生数据图表 (`data_chart`)

基于原生 SVG 实现的高清数据图表，用于技术指标对比、算法复杂度对比或性能评测展示。

### 支持图表类型
1. **柱状图 (`bar`)**：单系列分类数值对比。
2. **折线图 (`line`)**：时序趋势或变化曲线，至少需要 2 个数据点。
3. **比例图 (`proportion`)**：横向分段比例图，总量必须为正数，自动按两位小数四舍五入百分比展示；在全部 cue 揭示完成后整体展开。
4. **矩阵图 (`matrix`)**：二维热力网格，支持配置 `columns` 列头，最多 6×6 规格。

### 字段规格与严格约束
- **图表数据结构 (`chart`)**：
  - `kind`：`"bar"` | `"line"` | `"proportion"` | `"matrix"`。
  - `title`：图表标题，不超过 24 个 Unicode 码点。
  - `unit`：数据单位（如 `ms`、`MB`、`%`），不超过 8 个码点。
  - `source_note`：数据来源备注（如“测试环境：8 核 16G”），不超过 32 个码点。
  - `confirmed`：必须为 `true`。必须经人工勾选确认，系统绝不允许 AI 模型未经确认自动填入或替换图表数据。
  - `columns`：列名数组（仅 `matrix` 必填，1–6 项，每项 ≤ 8 码点）。
  - `data`：数据行列表，1–6 行。每行包含：
    - `element_id`：引用的元素 ID（与 `elements` 一一对应）。
    - `label`：行标签，不超过 8 个码点。
    - `values`：数值数组（单系列图表每行限 1 个数值，矩阵图最多 6 个数值）。数值范围为 `0` 至 `10 亿` 的有限数（非负、非布尔）。
- **防溢出与排版保护**：
  - 标签 ≤ 8 码点，标题 ≤ 24 码点，来源 ≤ 32 码点。
  - 原始数字不拆位、不自动取整；零值柱状不伪造最小高度；文字超出安全宽度时抛出布局溢出错误。
  - 不支持负数、多系列折线、CSV/Excel 自动上传或 AI 自动提取，仅支持人工结构化填录。

### 工作台操作流程
1. 在工作台选中场景，点击“配置图表”。
2. 录入或粘贴图表 JSON，选择图表类型并核对标题、单位、来源、行列与数值。
3. 核对数据行与口播 elements cue 的对应触发关系。
4. 勾选“我已人工核对并确认图表数据”，保存生效。
5. 接口 `PATCH /api/scenes/{id}/chart` 要求提供 `expected_revision` 与 `confirmed: true`，严禁通过常规生成接口未经核对直接写入。

---

## 10. 通用概念解释 (`concept`)

用于历史、物理、生物等领域的概念解释。它不是普通等权卡片网格：定义占主锚点，其余内容为支持卡片；每项仍在自己的cue出现，例子先于定义的原稿也允许。

### 内容契约
- 1–6个元素，每项`concept_role`必填：`definition`定义、`feature`特征、`example`例证、`summary`总结。
- 恰好一个definition，summary至多一个；feature/example可重复或缺省。不要求四段齐全，不为凑结构补写事实。
- 正文不超过40Unicode码点，且必须是自身cue区间中的连续原文摘录；大小写、空格、标点、Unicode形式保持原样。固定角色标签不进入口播。
- 按cue起点严格递增，最终入场计划也必须保持先后；不允许topic提前揭示、编程/状态/图表字段、edges或装饰性图文字段。
- 上述规则由JSON Schema及Python/TS语义校验共同执行；原文摘录不保证语义完整、事实正确或角色分类正确，仍需人工核对。

### 渲染、编辑与兼容
- 支持legacy/whiteboard/minimal，同一内容与时间轴只切视觉参数；定义与支持内容有明确层级，角色不改配音或字幕。
- 正文/cue可用现有步骤编辑；ID、顺序及concept_role只读，后端同步保护。合法cue变化保留音轨并进入待对齐，必须显式本地重算；冻结旧版本不被改写。
- 旧8类场景不新增必填字段，无数据库迁移。新concept需新代码，旧部署不能识别；原环境本轮未受控加载。
- [历史](../output/workbench/concept-qa/history-whiteboard-silent.mp4)、[物理](../output/workbench/concept-qa/physics-whiteboard-silent.mp4)、[生物](../output/workbench/concept-qa/biology-minimal-silent.mp4)仅为静音/人工时间视觉样稿，不是实际教学配音或听检验收；完整[测试与导出记录](../output/workbench/concept-qa/receipt.json)。

## 导航

- 返回 [README.md](../README.md)
- 查看 [快速上手指南](getting-started.md)
- 查看 [本地运维指南](local-operations.md)
