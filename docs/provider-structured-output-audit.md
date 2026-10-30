# 结构输出适配审计

检查日期：2026-10-25（Asia/Shanghai）。本轮零项目模型/TTS请求，无Scene执行，不修改运行适配或旧失败稿。

## 结论

当前请求采用DeepSeek Responses的text.format json_schema，格式在[官方API文档](https://api-docs.deepseek.com/api/create-response/)中有定义。不能仅凭没有strict字段就认定根因。

[官方strict说明](https://api-docs.deepseek.com/guides/tool_calls/)针对Beta function工具调用，要求对象属性全必填，并排除minLength/maxLength/minItems/maxItems等参数。这不是当前text.format调用加一个开关即可切换的机制。官方宣称支持不能替代本项目的实际成功证据。

## 本地证据

- contract.ts固定调用https://api.deepseek.com/responses，传完整schema/name、max_output_tokens和reasoning.effort=none。
- 重建504107f7实际请求体，SHA与保留响应protocol.requestSha256一致；未使用或打印密钥。
- 该次完整stop响应缺少必填audit，原Schema的AJV校验正确拒绝，不能补空列表继续。
- 过去protocol-probes-v1的短JSON、短TSX、长TSX三次均通过Schema；protocol-controlled-v1四组中，有参考的两组返回非法JSON，无参考两组通过Schema。样本很少且任务不同，不证明长度、参考或模型某一特征是唯一根因；不应重做同样的短探针再宣称真实场景可靠。
- 近期真实任务还分别出现非法JSON、漏字段、自依赖、错误路线语义。后两者即使结构受约束也需要宿主语义/几何检查。

## Beta strict预迁移检查

扫描504107f7保留的object_motion_data_v1 Schema，仅遍历Schema节点而非enum内的业务数据：发现28处官方明确不支持的上述长度/数量关键词，以及73个未列入required的属性。

例如anchors/items的objectId是可选的，多种SVG attrs也按需省略。把这些全部设成必填，会改变当前世界/本地锚点及SVG语义，不能机械修改。allOf/contains及本地定义引用写法还需单独确认；本文不把未核实内容断言为Responses不支持。

这些是现Schema不宜原样发送给Beta strict的证据，不是当前Responses错误的已证实原因。

## 建议的下一步（尚未实施）

优先做独立、显式选择的strict-tool实验适配，先离线：定义供应商支持的wire Schema；对可选字段作有明确版本的编码/解码；继续用原完整Schema及动作/审计/几何约束验收，不通过删除业务限制来宣布成功。旧Responses路径、失败记录、请求预算和源码执行审批保持不变。

这项改造只能验证结构契约能力，不能承诺自动修复依赖环、夹取接触、碰撞或画质。另一选择是保留现适配，整理不含私密素材的最小复现后调查供应商差异，而非继续修改场景提示。

## 本轮验证范围

design-schema.test.ts及contract.test.ts共24项通过，日志/tmp/aicreater-provider-adapter-audit-tests.log。没有修改程序，因此未重跑整仓、类型检查或渲染。没有发起新供应商探针，也没有更换模型/接口或添加未经文档确认的strict参数。
