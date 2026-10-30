# 实际画面诊断回流与免费恢复

## 输入与证据

`prepareTeachingRenderRecovery`接收冻结产物、宿主保存的可信产物哈希、原始stills/continuous报告及宿主保存的可信报告哈希。先重建当前冻结产物，再核对报告序列化JSON绑定、产物绑定和严格有界的帧诊断。可信哈希不能来自不可信请求的自报字段；该哈希不是带缩进的原始报告文件字节哈希。

采样帧由宿主的共享`teachingSampledFrames`重算，连续检查必须覆盖整段所有帧；不信任报告自报的requiredFrames或顶层passed。缺帧、覆盖冲突、非法日志、无具体诊断的failed帧，均blocked并保留原证据。

字体加载失败、对象缺失、绘制/姿态与冻结数据不一致、非法几何等属于宿主检查或绘制问题，不触发内容重试。当前只有已知标签的overlap/obstacle/route/occluded/clipped问题可进入免费变体搜索，未知问题拒绝，不能把所有错误都丢给模型。

## 免费候选

宿主只有三个固定策略：default、upper、lower。后两者调整辅助槽位优先级、接收槽内排位和路线端点，保留主结构位置、全尺寸对象、完整文字、身份、动作、配音及cue。编译器v3重新执行原容量、12px净空、交接、路线及逐帧扫掠检查。

候选绑定为新`teaching-scene-artifact:2`，截图与视频不能继续用旧哈希。几何没有变化的候选跳过；无解或策略耗尽明确失败，不移除审计规则，不隐式切换源码模式。`candidate-ready`只表示等待新的浏览器检查，`accepted`始终false。

## 显式执行入口

`renderTeachingArtifactRecovering`为尚未默认启用的本地入口，调用`runTeachingRenderRecovery`：

1. 原版及至多两个后续宿主变体，每轮独立目录。
2. 每轮仍调用原`renderTeachingArtifact`，先实际截图审计，再整段逐帧审计和媒体完整性检查。
3. 只有诊断报告明确属于可修几何问题才进入下一轮。没有失败报告的异常、取消、媒体失败或检查矛盾均停止，不盲目重试。
4. 根目录保存`recovery-report.json`与每轮原始证据。成功时返回实际`previewPath`；检查失败不显示preview-ready。旧版视频/目录不覆盖。

纯编排函数的callback只能是受信宿主渲染器，不是模型源码。即使callback声称preview-ready，仍需完整continuous帧证据及媒体校验。数值/检查通过不代表视觉验收。

## 验证边界

本轮8项新测试使用合成的报告契约样本，覆盖真实报告形状、绑定篡改、缺测、错误分类、有限轮数、无变化跳过、原失败保留、虚假成功拒绝及媒体错误。这些测试没有执行Chrome或ffprobe，不能记为真实画面自动修复成功率。

相关Node回归155项和`custom:typecheck`通过；本机日志`/tmp/aicreater-teaching-dom-recovery-final-tests.log`。独立只读复核发现的“无诊断失败帧被其他帧几何问题放行”已添加先失败后通过的测试并修复，限定复核无剩余P1/P2。

尚未接工作台、付费修订、根任务恢复与预算扣减；尚无新浏览器恢复验收。主机构的其他整体布局变体也未实现。T6整体仍进行中，T7–T9未完成。本轮无模型/TTS费用，不改默认模式。

后续浏览器验证已有正常路径、真实越界阻断和通用标题排版预防的记录，见`docs/teaching-browser-recovery.md`；不是实际故障后切换变体成功的证明，T6仍未整体验收。
