# 两个真实教学案例联调

用户在20组范围过大后确认先跑1个编程+1个AI真实案例。范围固定Python循环累加/RAG，真实收费分镜和原生TTS2，不自动重试付费任务，不批量执行20组。

## 结果

- 临时真实PostgreSQL/Redis/RustFS/API/Celery workflow与render消费者/beat。生成5场景/例，逐场景配音后ready，API编辑标签并重新GET验证保存/音频ID保持，再恢复原标签、冻结版本、导出MP4/SRT并校验sha256。
- 首次Python真实分镜成功，第一场景配音在TTS前草稿校验失败；保留output/paid-teaching-pair-20261010-145327/python-sum/draft-project.json与sanitized failure-job.json。根因services/workflow/worker.py构建中间草稿时加入最终DSL的schema_version，而DRAFT_SCHEMA仅允许scenes。
- 红测试：原有child mock缺少真实协议验证，追加validate_storyboard后报schema_error at /；新增实际generate_project+离线TTS sentinel测试，语音调用次数0而非1。共享入口只删schema_version；两测试转绿，无测试网络调用。
- 修复后将保留的真实Python分镜用内部发布接口恢复到自有临时数据库，不再调用模型；因此Python报告generate_job_id=null、real_llm_draft_reused=true，重放状态不得冒称新模型请求。RAG新发起真实模型任务并完整跑通。10个真实配音任务、两个导出任务均attempts=1。实际API计费以供应商账单为准，未采集完整计费usage。
- 成功产物output/paid-teaching-pair-20261010-145916/python-sum/video.mp4（622帧、20.736秒）及rag/video.mp4（959帧、31.979秒）；1080P/30FPS/H.264/AAC、原稿/教学类型/音频资产/快照SRT检查通过，项目/版本/任务报告均留存。
- Python本轮复用分镜后的阶段实测46.841s，不代表含首次模型调用和排障的全流程耗时；RAG真实完整阶段74.301s。不得把片长与处理时间混淆。
- 代表帧code-preview.png与flow-preview.png已读取检查：Python行4高亮、n3/total5正确；RAG文档甲+用户问题汇入提示再到模型，字幕安全区无覆盖。检查代码与变量状态/最终输出5及RAG最终无法确定处理，未执行用户/模型代码。
- 新鲜回归74 Node、59独立Python、61真实PG（194实际执行）及类型检查通过；discover61个明确skip由PG runner真实执行。自有临时容器/进程已清理；交付物与真实配音留存。

## 边界

未做本轮额外浏览器端完整操作、逐帧截图或0.5s同步听检，不声称20例或所有教学事实已验收。临时数据库退出即删除，交付物含最终DSL/不可变版本，若需在用户长期工作台保留项目应走导入接口；音频缓存保留，不自动删付费成果。
