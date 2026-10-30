# 独立 Strict 工具输出实验

## 2026-10-25 $def 单次真实验证

用户要求直接调用后，使用修正后的$def请求派发1次，零重试。结果目录output/visual-agent/strict-object-rag-real-v3/；HTTP 200、finish_reason=tool_calls、单个工具调用。响应SHA-256：ad24ff99e16d433b30258298a23675233180ed739722b103cb69248f9cdd9341。

function.arguments为19879字节，JSON.parse在位置10341报Expected ',' or '}' after property value，未进入Schema/动作/几何校验。completion_tokens为7673，低于16384预算，且finish_reason不是length，不能将此简单归因于达到输出上限。原始内容不修补、不执行、不替换生产稿。

结论：$def请求获得正常HTTP响应，但仍不能保证有效JSON；仅对齐方言不足以打通严格数据生成。独立strict路径继续保持实验状态，不作为生产成功或自动复现证据。此次无TTS、渲染或Scene执行。

## 2026-10-25 递归区域离线审计及方言对齐

对v2原始数据分别检查：schemaVersion、designSha256、anchors、audit及去除artwork后的对象记录均通过各自Schema，仅代表结构校验，不代表动作或审计语义通过。50个绘图节点逐项检查发现58处不支持属性、64处非法属性值，报告保存在output/visual-agent/strict-object-rag-real-v2/offline-schema-audit.json。此扫描不是完整替代校验，也未修补数据或编译动作。

违规集中于$ref引用的绘图区域，与供应商递归约束处理异常的假设一致，但不能确认因果或排除其他服务端原因。[官方文档](https://api-docs.deepseek.com/guides/tool_calls/)使用$def及#/$def/...，实验请求此前使用标准$defs。当前仅在独立请求构造器增加方言投影：发送$def/#/$def/node，本地构造与解析仍用原标准$defs。未知引用立即拒绝，不展开递归、不放宽约束、不转换返回数据；生产调用路径不变。

新增回归先红后绿，确认投影反向还原后与原Schema完全一致、所有引用同步转换，并继续拒绝递归节点非法属性。32项聚焦测试及类型检查通过。零模型请求、零Scene执行，未重跑整仓测试。新方言是否能让服务端真正约束输出仍未验证；下文为此前各轮历史结果，不代表新方言已接受或验收。

## 2026-10-25 修正后单次真实验证

另行获批最多1次请求，已派发1次、未重试。结果目录output/visual-agent/strict-object-rag-real-v2/，不覆盖v1。复用相同冻结设计和现有配音，没有Scene执行、渲染或生产路径切换。

服务端HTTP 200，finish_reason=tool_calls，单个工具调用，返回12个对象。原始响应SHA-256：534c831746b6bf14253779af245ada8b2cfc561877746d6c533463a3da60966d。请求不再触发先前400，但返回数据未通过本地wire Schema：第一个g节点使用未允许的transform属性；下级绘图也包含字符串数值、原始十六进制颜色、stroke-width而非允许属性形式等不合规数据。不进行宽松转换或补丁，不生成decoded-payload/validated-assembly/source。

结论仅为修正后的请求获得200响应，不是strict约束有效性、原完整数据校验、动作或画质通过。未进入动作编译及几何验收。此次额度已用完，不追加模型调用；保留原始响应以便后续离线定位递归Schema/供应商约束执行情况，不能据此直接切换生产路径。

## 2026-10-25 单次真实验证

用户另行批准最多1次strict请求，本次已派发1次，未重试。复用冻结设计e631013ac745fd1f9b4bde7b1b067148c4eb071e636af9e258decc89db6217cc，不重新配音、不执行场景、不切换生产路径。

DeepSeek Beta返回HTTP 400、invalid_request_error：`Invalid tool parameters schema : field anyOf: one of type, anyOf, $ref field is required`。服务端未接受本次工具参数Schema，没有可供宿主解码的场景数据，也未进入动作、审计或几何验收。此结果不能证明strict能够改善实际生成质量；具体Schema不兼容节点仍待离线定位，不擅自将错误归因为$defs拼写。

证据目录：output/visual-agent/strict-object-rag-real-v1/，包括request.json（无密钥）、dispatch.json、response.raw.json及result.json。原始响应SHA-256：a937ed5fd1ac12ecb2fb69f13c073533f3c4d6e922e73e6b3d48ddffa0985a1a。此次1次请求授权已使用完毕；任何后续真实请求需要新的预算确认。

## 2026-10-25 离线定位与修正

逐节点检查上述已保存请求发现，仅三个Schema节点缺少type/anyOf/$ref：objects.items.actions.items.anyOf中move、attach、release分支的kind。它们由原const投影为仅有enum的节点，未保留显式类型。这与服务端错误及官方带type的enum示例吻合，但服务端未返回精确路径，因此仍不能证明这是唯一兼容问题。

新增递归回归断言，先确认旧实现失败，再在const投影时保留已有类型，或从标量常量推断string/number/boolean；不支持的常量类型立即拒绝。不修改$defs拼写、不改原内部Schema、不放宽动作/审计校验。修正后31项聚焦测试与custom:typecheck通过。零新增模型请求、零场景执行；修正后的服务端接受性仍未验证，生产路径未切换。原始失败请求与响应保持不变。

状态：仅离线模块，未接工作台、CLI、队列或生产模型适配器。没有HTTP客户端、密钥读取、请求派发、工具执行或源码生成。

实现：packages/custom-scenes/src/strict-object-tool.ts。

## 三个入口

- buildStrictObjectMotionSchema(design)：生成strict-object-motion:1传输Schema。
- buildStrictObjectMotionRequest(design, reference, options)：返回Beta Chat Completions URL及请求body，不发送请求、无headers。固定一个submit_object_motion函数、strict:true及指定tool_choice。
- parseStrictObjectMotionResponse(response, design)：只解析一个已完成的具名function call；解码到object-motion-data:1，调用现有完整parseObjectMotionData，返回payload、纯数据assembly及wire_sha256。不会按函数名执行任何操作。

## 传输与内部格式

全部wire对象属性必填、additionalProperties=false。锚点frame显式为{kind:"world"}或{kind:"object",objectId:...}，解码时才恢复旧objectId可选表示。世界分支不得偷偷携带对象ID，本地分支不会因自依赖而被自动改成世界坐标。

SVG属性为{name,value}记录列表，节点tag决定允许的属性名与值类型；g有children，text有text。重复属性直接拒绝，不使用后值覆盖前值。宿主恢复属性映射，不增加默认属性。

wire语法省去供应商不支持的字符串/数组长度关键词，内部原Schema与全部语义/审计检查不变。wire不能保证对象覆盖、动作无环、有效路线、碰撞或美观；这些仍由宿主验证。

wire_sha256对返回function.arguments原始字符串的UTF-8表示计算，不是解码后的payload哈希。未来若接入运行流程，必须先保留原响应及协议版本，并单独绑定wire/payload/assembly/source来源，不能直接复用当前生产intent_sha256冒充新wire证据。本模块未提供该生产接线。

## 拒绝与资源边界

只允许1个choice、finish_reason=tool_calls、assistant、1个正确名称的function call；拒绝非空额外正文、refusal、错误名称或截断结果。不会自动重试或降级。

参数最大128KiB，递归校验前迭代检查深度64及值数量50000；绘图解码仍限深度12、总节点1200。wire AJV采用fail-fast，避免宽畸形anyOf数组积累大量错误；原宿主校验不改。返回参数不存在或非法时不补audit，也不修复JSON。

## 尚未确认的外部能力

[DeepSeek strict文档](https://api-docs.deepseek.com/guides/tool_calls/)说明了Beta工具机制与Schema限制。本模块采用标准$defs/$ref递归，文档示例写作$def，服务端对具体拼写/子集及该请求的实际接受性尚未验证；本地AJV通过不等于供应商已接受，也不等于实际生成质量通过。

本次批准范围仅离线。不得据此直接切换旧Responses适配、发起模型请求或执行生成场景。后续必须先确定真实验证的预算、原始响应保存和失败即停策略；新源码仍需精确哈希审批。

## 验证

新模块与动作/审计聚焦31项通过，custom:typecheck通过，git diff --check通过。覆盖strict请求构造、required-only Schema、世界/局部坐标、挂接/释放、重复/非法属性、原始字符串哈希、非空嵌套审计、旧宿主长度/数量限制、畸形回复、过深/超长参数及4000个null属性项的fail-fast拒绝。

日志：/tmp/aicreater-strict-object-verified-focused.log、/tmp/aicreater-strict-object-final-typecheck.log。未重跑整仓/渲染，零真实模型/TTS、Scene执行或服务重载。
