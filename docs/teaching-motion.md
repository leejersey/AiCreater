# T5-B3 接收容量与整章运动

实现：`packages/custom-scenes/src/teaching-motion.ts`。`compileTeachingMotion(plan, brief, cues)`复用语义调度、布局、外部避障和既有`compileMotionIntent`，不接受模型坐标、路径或源码。

## 组件及容量

运输的document使用108×92原生文件造型，不是缩放竖版文件；折角、内边、正文线及状态符号保留，完整标签换行，字号不低于16px。放不下返回payload错误。不运输的对比文件等仍用原造型。

`teaching-components:2`同步更新实际造型和几何：分类器扩大真实侧入口并调整中央部件，循环节点开放实际侧通道。新增gateway开放区间和solids不可穿越实体；obstacles仍包含保守外壳包络。钱包/托盘使用顶部入口，分类器/循环节点使用侧入口；这些固定入口按停靠行列允许进出，其他出口图标不自动获得运输许可。

程序依据接收窗、开放入口、实体核心、完整载荷和固定12px净空选择位置。驻留载荷占用自己的槽位；组合逐个进入不同位置，不生成替身ID。无位置返回capacity。筛选上下接收区按实际组件高度及完整载荷通道留白，不调低净空。

## 路线与交接

外部路线仍把其他对象当作完整障碍。只有对应源/目标的交接阶段允许穿过该接收者的gateway与receiving联合区域；用矩形差集检查完整覆盖，不用外接大框扩大许可。intrinsic solids从不豁免。

到达endFrame-1后挂接固定接收者，下一次运输在startFrame释放；既有动作编译器验证交接连续性。驻留区间显式记录，最后驻留持续到章节结束。

整章编译后逐帧及相邻扫掠检查舞台、外壳、实体和载荷间相对运动。姿态scale/opacity均为1，不靠缩放/淡出消除问题。无足够空间、时间、锚点或动作额度时明确失败，不隐式回退自由源码。

## 证据与诊断

结果包含语义计划、调度、布局种子哈希、实际各状态资产、初始姿态、运输路线、驻留、动作意图和运动计划；geometrySha256绑定实际资产及画布，motionSha256绑定完整结果，递归冻结。

`TeachingMotionDiagnostic`从同一冻结数据绘制后景、载荷、前景与文字，驻留时使用接收窗裁切。它只是宿主诊断，不是正式生产装配；静态后/前层通过layer-owner关联，未冒充已适配原几何审计的单一DOM对象标记。

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-motion.test.ts
node_modules/.bin/tsx scripts/render-teaching-motion.tsx
npm run custom:typecheck
```

六类示例共44张采样图及冻结数据位于`output/teaching-motion/`。已查看流程、循环、筛选、组合关键帧；中文/宽英文紧凑标签有实际栅格边界回归，另覆盖顶部钱包出槽后进入侧入口分类器。

以上是B3阶段的程序回归示例，不是T9真实模型盲测。其数值编译结果固定renderable:false、accepted:false。后续T5-C已新增独立冻结产物、正式DOM审计和六类本地连续无声MP4，见`docs/teaching-artifact-render.md`；仍未做容器、音频字幕或新题盲测，不改变默认模式或旧课程。
