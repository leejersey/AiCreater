# T6 本地浏览器验证

本轮执行真正的Chrome/Remotion与ffprobe，不调用模型/TTS，不注入假诊断，不手改视频的计划、对象或坐标。程序回归输入不是新题盲测，也不登记美学验收。

## 实际结果

| 用例 | 产物目录 | 结果 |
| --- | --- | --- |
| 组合入钱包、合法lower槽位、短中文标题 | `output/teaching-browser-recovery-1cFwEd` | 首轮通过、120帧、4秒无声MP4；没有失败，不计恢复成功 |
| 原实现、协议允许的80字中文标题 | `output/teaching-browser-recovery-6B9odL` | 实际采样发现title的label-out-of-bounds；根任务blocked，原9张截图及失败保留，没有MP4，也未盲目重试 |
| 最终共享标题排版及基线审计、同一80字输入 | `output/teaching-browser-recovery-cyMWsN` | 9张采样、120帧连续审计全部通过；1920×1080/30fps/H264/4秒/无音轨；首轮完成，accepted:false |

修正前后的语义计划、标题80字及cue完全相同，已逐项比较。改变的是共享宿主标题布局，不是针对该视频改坐标。中间版`output/teaching-browser-recovery-5RXwBA`也曾通过，但最终证据使用增加基线审计后的`cyMWsN`，不复用旧检查结果。

## 通用修正

`teachingTitleLayout`复用组件的文字测量预算与换行规则，头部区域固定1760×112，字号从32/28/24中选择；保留全部字符，不截断或让模型缩写。标题布局随产物冻结。

实际DOM审计检查每行的完整内容、数量、稳定ID、字号/可见性、实际字框和冻结x/y基线，相对根CTM必须保持单位变换。多行标题继续保留整体legacy覆盖，不能用两行重叠冒充合法换行。

相关Node回归156项及custom:typecheck通过，包含先失败后通过的80字标题测试、冻结数据篡改及重叠基线/父级平移反例。独立只读限定复核无剩余P1/P2。日志为`/tmp/aicreater-browser-recovery-final-tests.log`，实际渲染日志为`/tmp/aicreater-browser-long-title-final.log`。

## 重现

```sh
node_modules/.bin/tsx scripts/verify-teaching-browser-recovery.ts nominal
node_modules/.bin/tsx scripts/verify-teaching-browser-recovery.ts long-title
```

脚本每次创建新目录，要求最终preview-ready且只运行一轮；最终校验记录、实际MP4和原始DOM报告均在该目录。当前版本的long-title应直接通过，旧版失败证据不会覆盖。旧冻结运行时不能在新实现中静默重放。

## 未完成项

没有发现这个合法lower场景的真实可修几何故障，因此未得到“实际失败→自动切换宿主变体→成功”的浏览器案例，不把合成报告测试冒充该案例。已完成的是正常渲染、真实失败阻断与通用标题缺陷预防。

T6整体仍进行中，其他主机构布局变体、预算内模型修订、重启恢复、工作台接入、容器执行及12题盲测仍未验收。本轮没有付费调用或默认模式切换。
