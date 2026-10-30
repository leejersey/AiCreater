# 宿主组件绘图实验

## 工作台接入更新

可选host-components模式已接入当前改造版工作台，未切换默认；生成/修订/预览/导出的来源校验和审批沿用原流程，路线预检前置到源码装配。详情见docs/component-workbench.md。下文“未接入”表述为各历史阶段当时状态，不代表当前状态；新工作台入口的真实模型复现和最终视觉验收仍未完成。

## 2026-10-25 已批准带配音诊断预览

用户另行批准诊断MP4后，复用相同源码哈希、原音频SHA-256 62011a2e3854005ab182cd4a140897b64984cea3434ed8a160f9d114ac710217及15条原字幕，音频仍从第6帧起播。以env -i清除密钥环境，复用renderWorkbench并在导入执行前核对源码审批、设计绑定和validateWorkbenchScene。

输出output/visual-workbench-diagnostics/component-motion-rag-label-v2-audio-preview/video.mp4，SHA-256 42250bf35e2df20c0fa25f593f130b0028e80bd7242307d0bb1f3374c9b167fe；1920x1080 H.264、30fps，视频31.266667秒，AAC音轨31.275秒、非静音（均值-24.3dB、峰值-10.9dB）。原音频30.84秒，加0.2秒起播偏移未超出视频时长。

从实际MP4抽取94、378、715、911帧，人工查看378、715、911帧，字幕在底部独立区域可读，未压住机制主体。verification.json记录技术结果及边界：未逐句听审，未将连续动作、画质、音画感知同步或自动生成复现标为通过。这是人工修订候选的诊断预览，不是生产稿，也不代表工作台已接通新模式。

本轮零模型/TTS调用，不覆盖旧稿、不替换生产，等待用户观看确认。

## 2026-10-25 文字修订候选采样几何通过

用户批准7a399e3e62a5929912d97061b6cf16ff3673ee59c7ba720507deb3b365215462后，以env -i执行stills-only。完成39张截图，目录output/visual-agent/component-motion-rag-label-revision-v2-stills/。report.json几何passed、issueCount=0、motionChecks=4、unsupportedFrames=0。路线/跟随/障碍声明与前一轮22条告警候选相同，在相同39个采样帧中未再发现这些文字告警。此比较不能扩展成与最早127条候选的同覆盖率比较。

人工查看0、378、715、937帧，开场、搬运、进料及最终标签可读，无此前明显堆叠；独立diagnostic-review.json仍保留accepted=false。采样几何通过不是全帧无碰撞、接触正确、连续动作、音画同步、字幕叠加、画面精致程度或自动生成复现通过。尤其采样间短暂交线仍可能存在。

零模型/TTS、未导出MP4、不替换生产稿。下一步应复用现有音频/字幕做连续诊断预览；当前授权仅截图，任何MP4预览需另行批准。

## 2026-10-25 文字区第二轮离线修订

在保留39张截图、22条原告警和failed状态的前提下，新建output/visual-agent/component-motion-rag-label-revision-v2/。宿主夹爪标签基线下移到40%高度，处理器标签上移到20%高度；通用提示袋标签预留在口袋下部78%高度。新增回归先确认旧实现失败再修正，44项聚焦测试、模块类型检查通过。

本RAG候选将“问题提示”文字从移动袋体中移到固定阶段标注，坐标880,650，文字完整保留。理由是袋体及其载荷进入生成器时不能同时要求其随行文字又始终避开生成器实体；固定阶段标注保持可读，不删除或透明化文字。新增标注对象及设计绑定，原动作、路线、跟随窗口及四个障碍标记保留，未修改原失败候选。

候选经完整数据解析、逐帧已声明路线原点检查和宿主源码装配，源码类型检查通过。审批哈希7a399e3e62a5929912d97061b6cf16ff3673ee59c7ba720507deb3b365215462。零模型/TTS、零Scene执行；geometry/visual保持pending、accepted=false。静态文字区检查不能证明整个运动过程都无文字交线，尤其垂直抓取/插入时的短暂交叉仍须另行检查，不预先声称22条告警全部消除。

## 2026-10-25 新哈希截图诊断：路线偏离消失，文字尚未通过

用户批准462167629516b9051e7f856a1360413592bd4d84fc2f74dd6400f52e9f06b77c后，env -i下执行stills-only，完成39张截图，目录output/visual-agent/component-motion-rag-layout-revision-v1-stills/。零模型/TTS请求，无MP4，不替换生产稿。

原report.json几何状态failed：22条跨帧告警（包含重复），label-route 4、label-overlap 17、label-obstacle 1；path-deviation为0，motionChecks=4、unsupportedFrames=0。与旧版127条不能视为同覆盖率改善：修正了错误静止follower，分离路线并缩小到真实水平搬运窗口，motionChecks从42变为4。未审计抓取/插入/返回段的全部碰撞或接触。

人工查看0、378、715、937帧：开场标签不再堆叠；搬运时夹爪文字仍靠近轨道；装袋后片段标签和提示袋文字重叠，进料时文字区相交；最终答案在生成器上方可读，不再遮挡底部步骤标签。独立diagnostic-review.json保持accepted=false，未覆盖原failed。下一步聚焦夹爪/提示袋文字区及进料净空；尚未做音画同步、字幕实际叠加或连续MP4验收，整体美观未获认可。

## 2026-10-25 人工离线布局/交接修订候选

新目录output/visual-agent/component-motion-rag-layout-revision-v1/，明确标记manual offline revision，不是模型自动复现。原稿和39张失败截图保持不变。新增标题及独立提示袋进料线；保留原brief、口播、时间及原有对象尺寸。宿主夹爪由全宽支架改成居中窄抓取结构；其文字区修正沿用前轮。

重算两次抓取的夹爪位置，使片段中心对齐夹爪中心、片段顶部对齐夹爪接触高度；离线断言通过。这不是完整物理接触/净空证明。片段释放到提示袋的同帧重新挂接提示袋，确认600至640帧两片段均随袋平移170px；进料后释放并淡出。答案改为向生成器上方输出，标题补充上方层级。

审计修订有明确语义变化：删除错误的“静止步骤标签跟随底部装饰箭头”关系，保留该可见箭头；实际夹爪水平搬运与提示袋水平进料改为两条独立的真实绘制路线，跟随窗口限于对应水平搬运阶段，不将抓取/插入关系伪装成路线跟随。原四个障碍标记全部保留。此变更不是保留原审计下消除全部告警，不能与旧127条直接比较为同一覆盖范围。

componentRouteFindings对本候选所有已声明跟随窗口逐帧检查，结果为空；仍不覆盖抓取、插入、返回段的全部碰撞、文字或美观，几何/视觉保持pending、accepted=false。43项聚焦测试及类型检查通过，候选源码独立类型检查通过。零模型/TTS、零新Scene执行、未导出MP4、不替换生产路径。

新审批哈希（brief+source）：462167629516b9051e7f856a1360413592bd4d84fc2f74dd6400f52e9f06b77c。必须另行获批才可截图，旧审批不适用。

## 2026-10-25 首轮布局修正与路线离线定位

未调用模型、未执行新Scene。宿主gripper标签改到右上独立文字区，sleeve标签上移离开袋口，按各自剩余宽度重新计算字号；不删除文字，不修改已有artifact或其审批哈希。先添加失败回归再修正，42项聚焦测试与类型检查通过。尚未渲染修改后的组件，因此不能声称重叠已全部消除。

新增component-route-check.ts的componentRouteFindings：先走原完整数据解析，再对route组件nodePath [0]的实际有限水平线段逐帧检查follower原点，使用与现有几何检查相同的2像素容差。考虑路线的世界坐标、scale及height/2偏移，不将无限延长线当作真实线路。对其他图形/节点返回unsupported-route，不假装覆盖；本检查不证明接触、碰撞、字幕或审美通过，也尚未接入工作台。

对保留v2原稿运行后保存offline-route-preflight.json，确认三组独立偏离：retrieval-step-label从0帧起64px；retrieval-claw从340帧起最大171px；question-sleeve从690帧起最大约207.03px。旧39张截图告警为跨帧重复计数，不能将127条称为127个独立缺陷。静止标签被声明为路线跟随者本身也有语义疑点，不能仅挪线贴住标签来粉饰通过。

原始数据、127条告警及accepted=false保持不变。当前仅解决两个组件的文字区设计缺陷，并完成可复用的路线离线定位；具体搬运/交接坐标仍待修订。未生成新截图或成片，不替换生产路径。

## 2026-10-25 已批准候选截图验收：不通过

用户批准8cf626df61265be3e5d70badebef9c734e5dba5cdad360d7c37e574cf492c4d3后，以env -i清除模型/数据库等环境密钥执行本地stills-only诊断。完成39张截图，未导出MP4，零模型/TTS调用，不替换生产稿。目录output/visual-agent/component-motion-rag-real-v2-stills/。

report.json原始几何status=failed，跨帧累计127条（包含重复问题）：label-overlap 40、label-obstacle 45、path-deviation 42；motionChecks=42、unsupportedFrames=0。未降低检查阈值或改写失败结果。人工查看0、378、937帧：首帧标签重叠；搬运时检索器、片段及提示标签堆叠；末帧答案/提示与生成器遮挡。画面上方留白过大、层级弱、组件细节仍粗，未达到先前认可的视觉基准。

独立结论保存diagnostic-review.json，accepted=false。静态数据链通过不等于视觉链通过。下一步应修组件标签布局、接触/交接位置和真实路线约束，不能删除audit或隐藏文字来宣称达标。尚未检查音画同步和实际字幕叠加；本次检查不能替代连续视频验收。

## 2026-10-25 定向修订首次通过完整静态链

继续获用户指示后，复用冻结设计与v1失败原稿，仅派发1次定向修订请求，无自动重试。结果目录output/visual-agent/component-motion-rag-real-v2/。返回12个对象，通过requestModelJson的JSON/信封Schema、parseComponentMotionData、原动作编译器及完整绘图/路线审计解析，保存validated-assembly.json。此通过不包含几何、视觉或音画同步验收。

随后仅运行宿主源码装配和静态/类型检查，保存artifact.json、Scene.tsx、source-review.json、technical-check.json；未执行Scene。原始源码字节SHA-256为a0727411293d4865370d546361af3150ba5e84f00e3f11765d328d7b770c0f08。项目规范审批哈希绑定brief+source，为8cf626df61265be3e5d70badebef9c734e5dba5cdad360d7c37e574cf492c4d3，两者不可混用；technical-check明确区分raw_source_sha256与approval_sha256。

源码护栏与独立类型检查通过，等待用户审批后才能执行截图/几何诊断。零新TTS、不切换生产、不覆盖旧稿；尚未接工作台，不代表整链已打通或复刻已认可视觉基准。

## 2026-10-25 单次真实生成与离线修正

复用RAG冻结设计，实际调用1次Responses，零重试、零TTS、零Scene执行。证据目录output/visual-agent/component-motion-rag-real-v1/，保留input、dispatch、response.raw、provider、component-data和result。真实返回通过JSON及新信封Schema，包含12个对象。

首次宿主绘图失败于label does not fit。根因是48像素高的步骤标签误用普通插图标题20%高度比例，字号9.6低于12下限。新增回归先红后绿，标签专用字号高度比例改为55%、基线62%，其他组件与最小字号不变。原始模型数据未修改。

复查保存为offline-recheck.json；继续被原动作编译器拒绝release requires a positive attachment interval：retrieval-claw未attach却在414、550帧release，而两个片段各自已包含挂接与释放。这不是JSON问题，也不能自动删除动作当作成功。已补提示说明release属于被挂接的子对象，不代表载体开爪；新增孤立release拒绝回归。新提示尚未真实验证。

39项聚焦测试、类型检查通过。失败记录保持原状，未生成装配源码、未接工作台、未进行几何或视觉验收。小数据协议已通过本次真实结构检验，但自动动作生成尚未打通。

实现：packages/custom-scenes/src/component-motion.ts。此模块未接入工作台或生产生成路径，尚未验证模型输出和视觉质量。

模型数据采用component-motion-data:1，保留designSha256、anchors、objects和audit。每个对象保留id、initialAnchor和actions；以component、label代替artwork。七种宿主组件：document、shelf、gripper、processor、sleeve、label、route。尺寸来自冻结设计，不接收任意SVG属性、路径、源码、URL或表达式。标签最多24字符，按宽度计算字号，低于12像素则拒绝，不静默截断。

hostArtwork负责确定性绘图；buildComponentMotionSchema提供无递归引用的标准输出Schema；buildComponentMotionPrompt提供小数据提示；parseComponentMotionData先严格校验新信封，再编译为object-motion-data:1，继续调用原完整解析器。模型不能自行指定另一份artwork；未知字段、重复ID、设计哈希不符、自依赖及非法路线继续拒绝。

路线组件的主线是nodePath [0]，但仍须满足真实静态可见路线与非空followers等原规则。组件结构不等于几何通过：接触点、路线跟随、障碍物覆盖、连续动作、字幕净空及美观仍需单独验收。组件库是受限图形词汇，不是任意插画生成器，也不声称复刻此前人工视觉基准。

本轮38项聚焦测试及custom:typecheck通过。新模块6项测试覆盖所有组件、无递归Schema、原动作语义、身份/哈希、非法输入、真实路线绑定及移动路线拒绝。首次路线正例因空followers被原Schema拒绝，修正测试数据为独立路线对象与真实follower后通过，未放宽生产校验。

本轮零模型/TTS请求、零Scene执行。未重跑整仓测试、未渲染截图、未连接工作台。下一步是独立真实小数据生成验证，成功后才能审阅装配源码并申请具体哈希渲染；不能据此标记整链已打通。
