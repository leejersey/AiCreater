# T5-B 布局与外部运输基础

实现位于 `packages/custom-scenes/src/teaching-layout.ts`。本模块完成六类静态布局和单个外部载荷的避障/动作编译基础，不是已完成的整章运动编译器。

## 静态布局

`buildTeachingLayout(plan, brief, cues)` 先复用语义解析及调度，随后由结构和组件真实尺寸生成坐标。仅支持1920×1080；画布的安全区域为x80–1840、y160–960，给标题及字幕保留空间。所有组件scale固定1，不以缩字或删对象腾空间。

- 流程沿链使用蛇形栅格，首版最多6个链节点。
- 循环按闭环顺序分配2–4个站点。
- 对比为左右成对区域，筛选为左侧候选、分流点和右侧双接收区。
- 组合将原输入集中在左侧、接收对象放在右侧；状态变化保持主对象居中。
- 不属于主结构的对象保留为标注对象；空间不足明确失败，不把它们隐藏。重复结构角色、越出安全区或间距不足均拒绝。

坐标、文字区、碰撞包络、接收窗和端口世界坐标均由同一份T4组件资产换算。模型对象数组重新排序不会改变摆放；输入、文案或资产变化会改变绑定哈希。返回结果递归冻结，renderable和accepted固定false。

## 完整载荷避障

`routeTeachingBody` 以载荷左上角为参考，把障碍按载荷宽高及固定12px净空扩展，在矩形配置空间中做确定性最短正交路线搜索。它检查的是整个矩形载荷，而不是一个中心点。

输入最多24个障碍；路径最多12个拐点；零尺寸、非有限坐标、超界端点、被障碍占用的端点、无解窄缝及弱化净空都会失败。不会自动删除障碍、放宽12px阈值或生成穿透路线。路线求解只处理静态AABB，不处理任意曲线轮廓或动态多体避障。

`compileTeachingBodyRoute(request, clock)` 把路线交给现有 `compileMotionIntent`，帧区间为[startFrame,endFrame)，最后一个运动关键帧落在endFrame-1。每段至少2个帧间隔，剩余时间按路线长度确定性分配；窗口不足时拒绝，不修改口播或cue。起点和终点在其余时间保持。

编译后逐帧重新计算实际姿态，对完整载荷及相邻帧扫掠检查舞台边界和障碍净空。几何声明单独复制并绑定geometrySha256，运动证据再绑定motionSha256。即便中心路线一样，不同载荷尺寸也不能共用同一个运动证明。

## 模块边界与后续接入

本模块本身不把整章transport接到容器；后续已在 `teaching-motion.ts` 实现原生可读载荷、容量/停靠分配、指定入口入槽/出槽和多载荷交接，详见 `docs/teaching-motion.md`。外部路线原语仍不允许排除整个接收容器的碰撞，也不能把AABB诊断矩形冒充真实文件。

外部运输原语的证明不覆盖接收过程，其pending保持原范围；整章数值证明由后续编译器给出。T5-B数值编译已推进完成，但T5-C正式绘图/DOM审计及渲染审核未完成，不能接生产导出或算作自动生成成功。

## 本地验证

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-layout.test.ts packages/custom-scenes/tests/teaching-components.test.ts
node_modules/.bin/tsx scripts/render-teaching-layouts.tsx
npm run custom:typecheck
```

诊断输出位于 `output/teaching-layouts/`：六类静态PNG/SVG及绑定数据、4张合成AABB运动采样、运动证明和validation.json。静态对象逐个执行非空像素检查；诊断结果accepted为false。它们不是容器截图、整章动画或画质验收，也不包含真实题目盲测。

本轮零模型/TTS、未执行生成源码、不操作队列/课程数据、不切换默认模式。
