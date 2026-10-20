# RustFS私有S3存储替代

状态：完成本地联调。Python/RAG真实RustFS+PostgreSQL+Redis+API+Celery双队列渲染通过，私有对象匿名403、删除音频/导出缓存后校验恢复、快照隔离/重复去重/排队取消均通过；输出output/queue-rustfs-python与output/queue-rustfs-rag，512帧/17.067s及879帧/29.312s。独立compose经自有随机project验证非root named volume、容器删除重建与6MiB multipart恢复。187项实际执行回归通过（74 Node + 52独立Python + 61真实PG），类型检查通过。临时容器/卷已清理，无付费调用。

TDD：--rustfs缺失样例的CLI测试先失败2!=1后通过；发现Node资产验证环境继承RUSTFS凭据，增加边界红测试并在共享Store._assets中统一过滤MINIO_/RUSTFS_，随后通过。所有业务接口与兼容MINIO_*配置名保持不变。minio-py官方仓库亦确认未归档，继续复用SDK无需再加依赖。

用户同意改用仍维护的S3兼容服务（2026-10-10）。选择RustFS：官方GitHub API确认未归档、最新1.0.1、Apache-2.0；镜像已实拉取。Garage不支持BucketPolicy API，会削弱现有私有桶检查，因此不选。

不改教学DSL、数据库或浏览器接口，复用现有S3适配和MINIO_*兼容配置名称（这些名称只代表S3客户端配置，不部署旧MinIO服务）。固定RustFS1.0.1镜像摘要，独立compose文件持久卷、非root、仅回环API端口，控制台关闭。

扩展现有真实队列检查的--rustfs，复用缓存丢失恢复断言；先CLI红测试，再实际RustFS/PostgreSQL/Redis/双消费者/beat验证Python和RAG。增加匿名对象读取被拒绝断言。回归单元/真实PG/类型检查，更新README与MVP契约。不引入商业许可、收费调用、外部S3账户或集群HA；备份/IAM/生产容量仍需另行验收。
