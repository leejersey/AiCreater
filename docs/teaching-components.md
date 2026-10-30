# T4 教学视觉组件

组件实现：`packages/custom-scenes/src/teaching-components.tsx`。浏览器共享语义能力位于 `teaching-capabilities.ts`，原 `teaching-plan.ts` 继续重导出以保持兼容；浏览器组件不依赖服务端哈希、Ajv 或文件系统。

## 已实现

| 引用 | 固定本地尺寸 | 可辨识构造 |
| --- | --- | --- |
| document | 180 × 240 | 折角、双层边线、正文线、状态标记 |
| document / payload | 108 × 92 | 宿主原生运输造型，完整标签至少16px；不是整体缩放 |
| wallet | 420 × 300 | 后壳、弧形前袋、缝线、侧搭扣、接收窗口 |
| classifier | 360 × 260 | 实体入口、中央处理部件、双分支出口 |
| loop-node | 260 × 300 | 六边外壳、内部回环、输入/输出插座、独立文字区 |
| container | 320 × 260 | 后挡板、托盘前唇、把手、前景遮挡 |
| indicator | 240 × 160 | 分段状态轨道、状态符号；无编造数值 |
| connector | 宿主提供端点 | 2–12 点非零正交折线；不负责避障 |

文件和钱包改编自 `examples/custom-scenes/context-wallet/WalletScene.tsx` 的折角、前后袋与搭扣构造；回环节点借鉴 `examples/custom-scenes/reviewed-loop/Scene.tsx` 的有内部构造的节点与返回线设计原则。分类器、托盘和指示器是宿主新实现，不冒充已认可样片的直接复制。所有图形由程序固定定义，不由模型生成 SVG。

`teachingAsset(kind, state, label)` 返回版本、固定 bounds、back/front 图形、接收窗口、端口、碰撞安全包络和文字排版。每个支持状态都有不同的可见状态符号，切换状态不移动端口或改变组件尺寸。状态符号不代替载荷数据，满容器不会自动捏造内容。

T5-B3推进后组件版本为`teaching-components:2`，新增原生`teachingPayloadAsset`及gateway/solids契约，分类器和循环节点的实际开口同步调整。运输造型由宿主选择，语义协议没有新增模型尺寸字段。`TeachingComponent`的payload呈现只允许document。详见`docs/teaching-motion.md`。

T5-C实际Chrome检查发现Noto Sans SC的ascent超出旧字框，组件升级为`teaching-components:3`：共享文字基线为字号的1.2倍、行高1.5倍，紧凑文件文字区调整为原生50px高，保留完整文字及至少16px字号。不是缩放整个组件或放宽审计阈值。实际DOM与连续预览记录见`docs/teaching-artifact-render.md`。

`TeachingComponent` 使用同一份资产绘制：后壳 → 裁切后的真实 children 载荷 → 不透明前景 → 组件文字。接收槽 clip ID 绑定对象 ID；调用方必须保证整场景对象 ID 唯一。非接收组件拒绝 children。children 是受信宿主构造，不是模型返回的 React 代码。

## 几何边界

- 所有坐标是组件本地坐标。对象移动、缩放、交接以及 cue 时间不由此模块决定。
- 接收组件的输入/输出端口落在接收窗口边界；stored 是槽内停靠点。document 的 grip/center、indicator 的 anchor 是非接收锚点。
- obstacles 是**保守矩形安全包络**及槽内实体核心，不是轮廓逐像素碰撞结果。包络会阻止从未开放的外壳边角穿行，即便该角落没有涂色；不能因为空白就绕过检测。
- T5 必须用指定端口和载荷实际尺寸求进入、离开、净空及遮挡；不能把整个接收窗口当成任意穿透豁免。中央分类部件等槽内实体仍是障碍。
- 接收槽与组件文字区不相交。文字按完整字符保留并换行，最小 16px；48 字符内仍放不下时明确失败，不截断、不省略、不静默放弃标签。
- 拉丁宽字符采用保守估计，中文采用独立字宽上界。已对宽英文、中文、空格做实际栅格边界回归；真实浏览器字体测量仍是后续渲染检查的一部分，不能以此保证所有字体的像素边界。

## 验证与图谱

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-components.test.ts
node_modules/.bin/tsx scripts/render-teaching-components.tsx
npm run custom:typecheck
```

图谱输出：`output/teaching-components/initial.png`、`receiving.png`，对应 SVG 及 `validation.json`。12 个图谱区域执行非空像素检查，钱包另有载荷槽内可见、槽外裁切及前袋真实遮挡的像素测试。图谱中的端口名字是开发标注，不是最终视频内容。

组件入口已通过 Remotion 浏览器打包检查（组件库入口使用 ignoreRegisterRootWarning，不运行 Scene）。这不是容器执行或视频渲染。未调用模型/TTS，未修改工作台、已有课程或默认模式，未进行 T9 盲测。T5–T9 仍未完成，图谱的 accepted 始终为 false。
