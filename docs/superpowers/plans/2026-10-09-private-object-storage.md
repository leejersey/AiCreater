# 私有MinIO持久存储

[历史阻塞已解决：经用户同意改用RustFS，后续结果见2026-10-10-rustfs-storage.md。下面保留当时记录，不作为当前未决状态。]

状态：适配层已实现，185项实际执行回归与类型检查通过（74 Node + 50独立Python + 61真实PostgreSQL；discover另61项明确跳过，由PG runner执行）。5项新存储测试覆盖封存上传、缺失恢复、损坏拒绝、限额/软链接与错误脱敏。真实MinIO验收未完成：Docker Hub旧镜像pull access denied，Quay旧镜像unauthorized；官方GitHub API返回archived=true、pushed_at=2026-04-24T17:54:39Z。临时容器已清理，没有调用付费服务或选择商业AIStor。需用户确认仍维护的S3兼容方案或提供受信可用镜像。

按已批准架构补齐私有对象存储，不改DSL/浏览器接口。对象key由sha256与已允许扩展名组成；音频与MP4/SRT提交成功前先持久保存，PostgreSQL仍是项目/快照/任务权威。本地仅为渲染缓存；缺失时从对象存储恢复并校验，已有损坏文件拒绝而非自动覆盖。上传先封存临时文件，下载限额/校验后原子落地。配置为空保留现有本地模式；配置后不可静默退回本地。凭据只在后端，不传Node/供应商子进程。

先单元测试，再真实临时MinIO+双队列渲染：缓存删除后音频/导出恢复，快照和校验和不变。保持revision/attempt fencing；对象上传可能产生未引用对象，暂不GC，后续按明确保留策略清理。SDK固定minio7.2.20，回环HTTP/外部HTTPS；私有bucket拒绝已有公开策略。外部S3/IAM和付费端到端不作已验收声明。
