# 主题系统：架构设计与规划

状态：P0–P5 已完成（P5：2026-11-05）。参考 [garden-skills/web-video-presentation](https://github.com/ConardLi/garden-skills/tree/main/skills/web-video-presentation) 的主题体系（MIT）。

## 1. 参考项目的做法（要借鉴的部分）

- **主题 = 设计 token + 元数据**。每套约 25–35 个 token：表面色阶梯（shell / surface / surface-2 / surface-3）、文字阶梯（text / text-2 / mute / faint）、rule、唯一的 accent 及其透明叠层、四个字体家族，加上「性格旋钮」（卡片圆角、分割线粗细与虚实、hero 数字风格、舞台留白、阴影）与可选装饰层（网格、纸纹、扫描线、暗角）。元数据 `theme.json` 有 `mood`、`bestFor`、4 色预览。
- **章节必须主题无关**：颜色和字体只能用 token，字号、间距、动画时长可由章节自由决定。换主题 = 换 token 文件，章节代码一行不改；换主题后哪里坏了，bug 在章节里。
- **一课一个主题**，不在章节间切换明暗。
- **主题规则**：正文对比度 ≥ 4.5:1；只有一个饱和 accent，soft/glow 必须同色相；每套主题只押一个「设计签名」（虚线 rule / 扫描线 / 纸纹 / 粗边 …）。
- **`mood` 不写时长数值**，由写章节的 Agent 按气质自定节奏。

## 2. 我们的现状与差异

| 项 | 现状 | 对主题系统的影响 |
|---|---|---|
| 配色 | `packages/custom-scenes/src/theme.ts` 写死 5 个颜色（background / foreground / muted / accent / secondary），其实就是参考项目的 blueprint 配色 | 现有课程可直接映射为默认主题 `blueprint`，视觉零变化 |
| 画面载体 | Agent 写的是 **SVG**（`Scene.tsx`），禁止 `<style>`；参考项目是 HTML + CSS 变量 | token 以 **JS 对象**通过 `theme` prop 传入，而不是 CSS 变量；primitive class 不可用，改为 skill 中的 SVG 写法约定 |
| 字体 | 只有 `@fontsource/noto-sans-sc`；Remotion 离线渲染，不能用 Google Fonts | 每个字体都要以 `@fontsource/*` 本地打包（均 OFL），渲染前 `delayRender` 等字体就绪 |
| 主题无关 | 抽查最近 12 个 Agent 场景：7 个只用 `theme.*`，5 个写死了 hex（多为对/错的绿红、白色）或 `fontFamily="sans-serif"` | 需要补 `positive` / `negative` 语义色，并加一条「禁止字面颜色 / 字体」检查 |
| 审计 | `ink.ts` 的空白帧、空白区域检测按「与纯色背景的差异」计算 | 有网格/纸纹的主题会被当成「有内容」。审计渲染必须**不带装饰层**，装饰只在出片时由宿主叠加 |
| 字幕 | `workbench-video.tsx` 写死深色字幕条 `rgba(8,17,31,0.94)` | 字幕条颜色、字体也要取自主题，浅色主题要能读 |
| 旧字段 | `profile.theme_version='tech_explainer:1'`（模板时代遗留） | 由主题注册表取代 |

## 3. 架构

### 3.1 主题包 `packages/scene-themes/`

```
packages/scene-themes/
  themes/<id>.json       一套主题：元数据 + token（单文件，SVG 用不上 CSS）
  src/schema.ts          SceneTheme 类型与解析
  src/validate.ts        对比度、accent 唯一、字体已安装等规则
  src/registry.ts        内置主题列表 + 默认主题 blueprint
  src/fonts.ts           主题用到的 @fontsource 导入（渲染宿主引入）
  tests/
```

`SceneTheme`（`scene-theme:1`）：

```ts
type SceneTheme = {
  id: string; version: number; name: string; nameZh: string;
  descriptionZh: string; mood: string[]; bestFor: string[];
  dark: boolean;
  colors: {
    background: string; surface: string; surface2: string;      // 舞台与卡片层级
    foreground: string; muted: string; faint: string;            // 文字阶梯
    rule: string;
    accent: string; accentSoft: string;                          // 唯一饱和色 + 同色相叠层
    secondary: string;                                           // 兼容现有 5 色场景，降为次要强调
    positive: string; negative: string;                          // 对/错、通过/失败（新增，替代写死的绿红）
  };
  fonts: {display: string; body: string; mono: string};          // CSS font-family 串，只能是已打包字体
  shape: {radius: number; ruleWidth: number; ruleDash: string};   // 性格旋钮
  decoration: 'none' | 'grid' | 'grain' | 'scanlines' | 'vignette'; // 只押一个签名，由宿主绘制
  caption: {background: string; foreground: string};             // 字幕条
};
```

传给 Scene 的 `theme` prop 是 **旧 5 个键 + 新键** 的扁平合集（`theme.background`、`theme.accent` 继续可用），现有场景源码不需要改就能渲染。

### 3.2 数据与任务

- **项目级**：`projects.config.theme_id`，新建视频时选择，默认 `blueprint`；旧项目迁移时写入 `blueprint`（与现在画面一致）。
- **任务快照**：Agent 与导出任务的 `input` 冻结 `theme: {id, version, sha256}`，结果可复现；改了主题文件会让 hash 变化，旧视频仍能按快照说明来源。
- **换主题不重新调用模型**：Agent 产出的是源码，主题只在渲染时注入。换主题后：
  - 整课导出直接按新主题从源码重渲染（本机、免费）；
  - 已确认章节的预览 MP4 标为「旧主题预览」，提供免费的「按新主题重渲染本章」（render 队列新任务类型 `restyle`，或复用 `export` 的单章模式）；
  - 确认状态保留：确认的是源码版本，不是颜色。
- 后端用 Python 读取同一份 `themes/*.json` 校验 `theme_id`，不重复定义主题。

### 3.3 渲染宿主

- `workbench-video.tsx`、`stills.ts` 从快照读取主题：背景、字幕条、默认字体、字体导入。
- **装饰层**由宿主在 Scene 下方绘制（网格 / 纸纹 / 扫描线），Agent 不画。
- **审计用的关键帧不带装饰层**，`ink` / `emptySpace` 以主题 `background` 为基准；出片才叠装饰。

### 3.4 Agent 侧

- **分镜稿加主题段**：主题名、气质（`mood`）、是否深色、圆角与分割线性格、可用 token 清单。和参考项目一样不写时长数值，由 Agent 按气质定节奏。
- **skill**：`scene-contract.md` 增加「颜色与字体只能来自 `theme`」及每个 token 的用途；`craft.md` 增加「对/错用 `positive`/`negative`」、「卡片用 `surface`+`rule`、圆角用 `theme.radius`」；`examples.md` 改成只用 token。
- **检查**：`checkSource` 之后加「主题无关」检查，字符串里出现 `#rgb`/`#rrggbb`、`rgb(`、具名颜色作为 fill/stroke、或 `fontFamily` 字面量时给出 medium finding（不硬拒，先观察）；可选加强为「用第二套主题渲染一帧、比较审计结果」。

### 3.5 网页

- **新建视频**：主题选择（色卡预览 + 一张示例画面截图 + `bestFor`），按讲解风格给推荐：通俗科普 → 黑板 / keynote，知识干货 → blueprint / 终端。
- **工作台**：顶部显示当前主题，可更换；更换前提示「已确认章节不需要重新生成，导出时按新主题渲染」。
- 每套主题的示例截图在构建时用同一个演示场景渲染生成，不调用模型。

## 4. 首批主题（6 套，偏教学）

| id | 气质 | 适合 | 签名 |
|---|---|---|---|
| `blueprint`（默认） | 深藏青 + 青色，等宽 | 技术架构、系统拆解（即现有画面） | 制图网格 |
| `chalk-garden` | 深石板黑板 + 粉笔黄，手写感 | 通俗科普、课堂讲解 | 虚线 rule + 颗粒 |
| `terminal-green` | 纯黑 + 磷光绿，全等宽 | 编程、命令行、AI 工具 | 扫描线 |
| `paper-press` | 暖奶油纸 + 火热橙，衬线 | 概念讲解、文科、读书 | 纸纹 |
| `warm-keynote` | 奶油 + 青绿，大圆角 | 产品介绍、轻松科普 | 大圆角卡片 |
| `swiss-ikb` | 净白 + 克莱因蓝，极细字 | 数据、信息图 | 发丝网格 |

浅色主题至少两套，用来检验字幕、审计和 Agent 在浅底上的表现。字体需新增 `@fontsource` 包（如 noto-serif-sc、jetbrains-mono、ibm-plex-mono、inter），中文衬线体积较大，按 unicode-range 分片加载。

## 5. 分阶段计划

| 阶段 | 内容 | 产出与验收 | 费用 |
|---|---|---|---|
| **P0 契约** | `scene-themes` 包、schema、校验器、注册表；把现有配色定义为 `blueprint`，宿主（出片、关键帧、字幕）改为从主题读取 | 现有课程出片逐帧与改造前一致；校验器测试（对比度、accent 同色相、字体已打包） | 免费 |
| **P1 数据** | `projects.config.theme_id` 迁移（旧项目 = blueprint）、任务快照冻结主题、API 读写主题 | 迁移在库副本演练；导出按快照主题渲染 | 免费 |
| **P2 主题与字体** | 6 套主题 JSON、字体包、宿主装饰层；审计关键帧不带装饰；示例截图生成 | 用已确认的 RAG 8 章源码在 6 套主题下各出一遍（免费重渲染），人工看对比度与字幕 | 免费 |
| **P3 Agent** | 分镜稿主题段、skill 更新、`positive`/`negative`、「主题无关」检查 | 单元测试；再用 rag-ch4 在 2 套主题下各跑一次真实生成，记录到 `eval/runs.md` | **付费，需「开始」** |
| **P4 网页** | 新建视频主题选择与推荐、工作台更换主题、旧主题预览标记与免费重渲染 | 浏览器端到端：换主题 → 重渲染一章 → 整课导出 | 免费 |
| P5 可选 | 用户自定义主题（基于内置主题改 token，过校验器）、按文稿自动推荐 | 另行确认 | — |

P0–P2 不调用模型，可以先做完再决定 P3。

## 6. 风险

- **写死颜色的旧场景**：约四成抽查场景写死了绿/红/白或字体，换浅色主题时可能看不清。处理：重渲染时先跑「主题无关」检查，列出需要按意见修改的章节；必要时这类章节锁定原主题。
- **字体体积与渲染耗时**：每加一个中文字体，打包和首次渲染都会变慢；首批控制在 2 个中文字体以内。
- **浅色主题的审计阈值**：`ink` 容差（48）在浅底上的表现要用真实帧校准。
- **装饰层干扰阅读**：参考项目的原则是「注意到一次然后忘掉」，装饰透明度要按字幕区实测，字幕区不画装饰。

## 7. P0–P2 实施结果（2026-11-03）

- **P0**：`packages/scene-themes`（6 套主题 JSON + `parseTheme` 校验器 + 注册表）；出片宿主、关键帧渲染、类型检查都从主题读取。用改造后的代码重渲染 RAG 第 1 章（blueprint），与原视频的差异不超过改造前代码两次渲染之间的差异（982 帧中明显差异 2 帧 vs 4 帧，其余为编码噪声，平均 PSNR 约 66dB）。
- **P1**：`projects.config.theme_id`（旧课程读作 `blueprint`，无需迁移）、`PATCH /api/projects/:id/theme`、`GET /api/themes`；Agent 与导出任务的 `input.theme` 冻结完整主题，`input_summary.theme_id` 公开。换主题保留已确认的 Agent 视频，导出因 revision 变化需重新导出。
- **P2**：`scripts/theme-preview.ts` 从已确认源码在多套主题下渲染成片帧（含装饰与字幕，本机、免费）；RAG 8 章 × 6 主题 × 16 帧每套约 15–20 秒。审计关键帧在 4 套主题下问题数一致、覆盖率相差 < 1 个百分点；paper-press 整章出片正常。
- **旧场景的主题无关程度**（`literalStyles` 扫描）：8 章全部写死字体（主题字体对它们不起作用，字幕字体照常跟随主题），3 章写死颜色（对/错的红绿、白、琥珀）。另有场景把 `secondary` 当「错误」色用，浅色主题里会变成蓝色，P3 的 `positive`/`negative` 解决这类语义。

## 8. P3–P4 实施结果（2026-11-03）

- **P3**：工作目录带 `theme.json`，首条消息描述主题气质与形状（不列颜色）；skill 写明每个 token 的用途并新增 `positive`/`negative`；`literal-style` 检查要求收尾前改掉写死的颜色/字体（不阻塞关卡）。rag-ch4 在纸刊与黑板主题各跑一次，均 6 轮通过、零 literal-style；两份源码换到 6 套主题都是 0 个审计问题。
- **P4**：新建视频的主题选择（按讲解风格推荐，可改）；工作台侧栏「课程主题」免费更换；章节版本的主题与课程不同时提示，并可提交 `restyle` 任务（render 队列、无模型、环境里无密钥）按当前主题重渲染本章预览，确认状态不变。schema v7 新增该任务类型，所有更早的迁移块在 v7 存在时跳过（在线上库副本上初始化两次验证）。浏览器端到端：新建纸刊课程 → 8 章副本换为纸刊 → 第 1 章提示并免费重渲染（99 秒）→ 播放新视频，页面无报错。

## 9. 旧画面的字体（2026-11-05）

旧场景都写死了字体，换主题后只有字幕跟随。现在非默认主题的渲染（出片与审计关键帧）加一条宿主样式：`svg text` 统一用主题正文字体，字体名或内联样式含 `mono` / `Courier` 的文字保留原样（代码类文字仍是等宽）。默认主题 blueprint 不加这条样式，换主题之前确认过的视频画面不变。新场景本来就用 `theme.fontBody` 等字段，不受影响。

## 10. P5：课程强调色与按文稿推荐（2026-11-05）

- **课程强调色**：每门课可在所选主题上换一个强调色（如品牌色），`projects.config.theme_accent`；保存时检查在该主题背景上对比度 ≥ 3:1。任务冻结的主题快照里 `accent` / `accentSoft` 已替换，所以出片、审计和 Agent 都用同一个颜色；重渲染预览的「是否当前」按完整主题快照判断，换强调色也会提示「旧外观」并可免费重渲染。工作台侧栏「更换主题」里设置，可一键恢复主题自带颜色。
- **按文稿推荐**：新建视频时按文稿中的关键词推荐（代码/命令 → 终端，数据/统计 → 瑞士蓝，人文 → 纸刊，产品 → 暖色发布会，技术原理 → 蓝图）；命中不足 3 次或与第二名持平时按讲解风格推荐。不调用模型，推荐理由显示在主题选择下方，用户随时可改。
- 没有做完全自定义的主题（任意改背景、字体）：对比度、字体打包和审计阈值都与主题绑定，自由组合需要逐项校验，收益不大。
