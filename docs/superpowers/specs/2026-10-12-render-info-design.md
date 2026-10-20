# 导出结果查询设计

目标：补齐合同GET /api/renders/{id}，id复用现有render job_id，不新增render表、队列或任务。

方案：推荐对现有public_job结果增加downloads字段；独立DTO会重复状态字段，另建产物索引则增加迁移，均不采用。保留现有GET jobs与files接口兼容，前端无需换用重复查询。

GET只读取Jobs.get，不提交/重试/恢复任务、不读取媒体文件、不调用对象存储。非render或不存在404，非法ID沿用现有400。保留job_id/project/state/progress/error等公开字段；queued/running/failed/cancelled的downloads为空。succeeded仅根据已发布result.checksums提供固定mp4/srt下载路径与SHA256，检查checksum格式，不接受任意URL/path或返回私有input/配置/绝对路径。发布元数据不完整422，不冒称下载可用。

下载仍走已有GET /api/jobs/{id}/files/{extension}，在那里执行对象恢复、大小/路径/checksum验证。查询信息不保证文件当前在磁盘，下载校验才是最终边界。

范围：services/api/app.py、小型API回归与README/契约/followup；无需Jobs核心/SQL/schema/UI修改。先红绿覆盖5种状态、非render/未知ID、坏checksum、不泄露输入、查询不调用submit/retry/recover/render_file/对象存储。临时PostgreSQL/API回归、离线测试。空闲时只重启API，以已有导出任务只读查询验证，任务数不变，无新增render/model/voice。

状态：用户批准实现后已完成，5项接口红绿、120离线Python+77临时PostgreSQL/API/jobs回归通过。只API空闲重启，已有成功导出返回2项信息，jobs/attempts44→44无新增任务。output/workbench/render-info-qa/receipt.json与info.json留证。无前端/worker/schema/SQL变化，不重复跑未变Node/build；无Git元数据，未授权委派，只自审，不冒充独立审核。不启动20组收费或处理延期nums发音。
