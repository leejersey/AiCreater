# 真实队列教学渲染验证

沿用已批准的本地教学MVP与可靠性验收要求，不增加供应商/模型，不新增生产存储层。范围：真实PostgreSQL、Redis、API、Celery双消费者/beat、Remotion导出及HTTP下载；复用已有Python与RAG最终DSL/音频，不触发收费生成或配音。

## 实施与验证

- 新增services/tests/run_queue_smoke.py，入口npm run test:queue。只创建自有随机临时容器/进程，禁用供应商凭据；检查8000空闲，不接管用户服务，输出目录不得存在。
- services/tests/test_queue_smoke.py先验证脚本不存在时两项失败，再实现并验证通过：help不启动服务，缺失样例不创建输出。
- 真实HTTP导入、冻结、提交；观察排队/运行/完成及attempt=1、progress=100。重复提交只得到相同活动job。
- 渲染运行时编辑第一个标签，确认当前项目改变而不可变版本和实际snapshot.json仍与原DSL完全一致。
- 排队首次生成任务在消费者启动前取消；双消费者启动及渲染完成后仍cancelled/attempts=0，未执行模型任务。
- 下载MP4/SRT核对服务端sha256；ffprobe核对H.264/AAC、1920×1080、真实帧数及片长。保留产物与report，清理自有服务/中间目录。
- Python结果output/queue-smoke-python-v2：512帧，17.067秒；RAG结果output/queue-smoke-rag-v2：879帧，29.312秒。两条真实队列均通过，未调用付费服务；自有容器已清理。
- 新鲜回归：74项Node、45项独立Python、61项真实临时PostgreSQL测试通过，共180项（Python discover中另有61项明确跳过，由专用PG runner真实执行）；类型检查通过。

## 未完成

付费文稿→分镜→配音常驻队列全链路、20组课程/人工听检/0.5秒同步精度、MinIO/S3及硬件吞吐基准仍待验收。系统等宽字体未打包，多机器渲染须先固定字体；父worker硬杀的子进程监管仍沿用现有已记录边界。
