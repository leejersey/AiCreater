# 教学冻结场景与本地预览

## 产物边界

`freezeTeachingScene`把brief、cue、语义计划、完整编译数据、主题、字体及运行时清单绑定为`teaching-scene-artifact:2`，生成artifactSha256。v2还绑定宿主`layoutVariant`枚举(default/upper/lower)，不接受模型坐标。`validateTeachingArtifact`不信任输入中的SVG/坐标/成功字段：重建可信编译，读取当前固定字体/运行时，再逐项比对完整结果与调用方持有的预期哈希。旧v1本地预览属于历史证据，当前入口明确拒绝，不静默迁移；此变化不修改旧课程的其他模式。

渲染器只使用校验后数据。复制时再次核对清单，把**同一批已验证字节**写进私有构建目录；截图和连续视频复用同一个bundle。运行时变化会明确拒绝旧绑定，不静默升级。现阶段没有旧版本运行时自动迁移或整课入口，相关集成留到T8/T9。

字体来自已安装的Noto Sans SC 400，CSS与所有400字重woff/woff2都绑定内容哈希。用已锁定的PostCSS解析unicode-range，超出冻结字体及首版支持字集的标题/标签明确拒绝，不使用未绑定的系统emoji字体。没有下载新字体或模型素材。

## 同源绘图与审计

`TeachingScene`从冻结状态资产、姿态、驻留与入口绘制后景、唯一身份的载荷、前景和文字。文字使用Noto字体实测后校准的baselineOffset及行高；紧凑文件完整文字保持至少16px。

`measureTeachingScene`用实际SVG CTM/getBBox测量：对象身份/状态/姿态、完整文案、实际字框与接收窗、字体加载、实体几何、活动路线及跟随对象。复用原`analyzeGeometry`的标签相交与2px路线偏离规则，没有删掉失败记录或降低阈值。

前景依冻结清单逐项检查ID、owner、tag、有限数值属性和实际CSS fill/stroke/线宽。可见性检查一直遍历到HTML祖先，累乘透明度，防止父容器隐藏而子节点字框仍正常。实体要求ID唯一且与冻结世界坐标一对一，不能用重复实体凑够数量。对绘制在文字之后的其他组件前景，用SVG实际fill/stroke命中采样检查文字区域；缺失覆盖或超过采样预算都会失败。此检查保守且有界，不是逐像素美学证明或刚体物理模拟。

当前可见运输线使用正在行走的真实线段，跟随点是同一运动计划的实际原点；不是自行画一条与运动无关的装饰路线。静态对比/状态变化允许0个运输对象，但只有在冻结计划确实无运输时才允许。

## 成败与媒体

先采样检查，失败则不渲染MP4。通过后逐帧收集整段视频的实际DOM检查，不能用零条记录推导成功；旧失败不能被同帧后续通过日志覆盖。

视频先写preview.pending.mp4。完整帧检查通过后再用ffprobe解码核对1920×1080、30fps、H264、精确帧数、无音轨、有限时长及0起始时间，最后才更名为preview.mp4。NaN、空时长或缺失起始时间不能通过。

报告区分preview-ready与accepted，后者始终为false，visual始终pending。用户视觉评价、连续视频审阅、容器执行和新题盲测不是DOM零告警的推论。

## 重现

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-artifact.test.ts packages/custom-scenes/tests/teaching-render-policy.test.ts
node_modules/.bin/tsx scripts/render-teaching-scenes.ts
npm run custom:typecheck
```

批次每次创建新目录，任一结构失败立即停止，不自动重试或覆盖旧证据。程序回归示例包含中文标题/标签，每类120帧、4秒；不是付费模型新题生成。所有运行都零模型/TTS，现有课程、工作台和默认模式不变。

显式免费恢复入口为`renderTeachingArtifactRecovering`，不替换上述单轮默认行为。它使用宿主变体准备、原始DOM证据和原渲染器完整复检，详见`docs/teaching-render-recovery.md`。新增入口目前只完成离线控制流验证，未作为新的浏览器恢复成功案例验收。
