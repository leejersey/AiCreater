# 源码诊断候选的工作台闭环

## 边界

source代码阶段失败的generate（2次已派发）或repair（1次已派发），可明确提交免费离线诊断。新任务kind为recover-source，运行在workflow队列，无供应商密钥；只读取属于当前项目的原失败记录，不接受外部路径或上传源码。只适用于已观察的精确DSML尾巴，不是通用JSON修复或模型可靠性承诺。

原任务保留failed；诊断任务succeeded只代表静态诊断结束。候选固定requests_dispatched=0、execution=not_run、technical=passed、visual=pending、diagnostic=true、production_adopted=false。不创建可直接预览的artifact，不提供预览/验收/整课导出资格。

## 入口

- POST /api/projects/{project}/visual/{failed}/recover-source：{confirmed:true}，不接受付费预算或路径。
- POST /api/projects/{project}/visual/{inspection}/repair-source：{confirmed:true,max_requests:1,feedback,sha256,recovery_sha256}。两个哈希必须与诊断结果相同；采纳仅作为一次源码修订起点，不是执行授权或视觉验收。

网页显示源码与设计供文本审阅。确认弹窗绑定当前两个哈希，取消不提交。旧generate/repair和设计修订接口保持原契约；诊断候选不能通过旧preview入口跳过修订。

## 可追溯性

诊断保存source-recovery.json、result.json、design.json及source.txt，原失败目录不改。发布前Node验证器重新从原失败响应构造提案，比较响应/设计/源码哈希，随后Python核对当前任务快照及文件摘要。修订派发前再次核对数据库父任务、原响应、候选文件和两个确认哈希；输入带recovery_id和原始关联，Node保存recovery-input.json。新源码仍经原护栏和类型检查，另行批准具体源码哈希后才能执行。

visual_jobs迁移增加v4 kind约束，保留已有记录和队列租约；诊断按零模型工作流任务调度。迁移已在独立临时数据库测试从v3升级及重复执行，不对原项目数据库做测试。

## 仍未完成

已保留的CLI样本不自动导入数据库，也不伪造成正式任务生成证据。本轮不调用模型/TTS、不执行新Scene，未验证真实自动成片质量。后续批次已补齐已有标签纵向布局建议的网页审阅采纳入口，见layout-workbench.md；动作质量、连续预览和跨题材验收仍按统一任务清单推进。

## 本批验证与运行

88项Node/UI、69项离线Python及35项临时数据库测试通过，局部类型检查和独立复核通过。付费修订派发前额外核对音频文件实际checksum；recover-source已加入本地任务状态白名单，默认诊断超时60秒。只在独立临时数据库做测试，运行时v4升级仅增加任务kind，不删除原记录或修改原项目配置。

当前改造版服务已加载新入口，API/web ready，两个消费者在线且无活动任务；未提交真实付费修订。Next.js仍提示既有安全升级问题，未升级依赖；本机磁盘低于20GiB提醒阈值。没有浏览器截图或交互验收，网页验证限于SSR/动作测试及HTTP可用性。
