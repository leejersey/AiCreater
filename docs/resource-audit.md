# 本地资源盘点（只读，不是清理授权）

依据 [机器可读快照](../output/workbench/resource-audit/report.json)。六表在只读事务中扫描，覆盖当前项目/场景、旧不可变版本、候选、任务冻结input/result和历史attempt。原容器ID/启动时间、表行hash、原媒体与配置首尾不变：attempt58/活动0，无生成、配音、timing或render任务，没有删除/重启/扩容/自动清理。

## 占用

- 主机APFS快照可用56466972672bytes（约52.6GiB），df容量88%。容量口径为used/(used+available)，不同于文件逻辑字节；后续其他应用/渲染可能增长。
- `node_modules`分配1454.19MiB；网页`.next`134.52MiB；交付/QA `output`168.69MiB；renderer公开路径缓存116.77MiB；仓库外私有备份345.48MiB。都是本次du值，不加总当作整个Docker磁盘占用；备份和独立密钥不得删。
- 原PG/Redis/RustFS数据路径du分别65132/22392/99036KiB，仅已确认属于`aicreater-workbench`的3个named volumes。未检查他人卷内容。
- Docker全主机共享：build cache11.46GB（Docker报告可回收10.14GB）、local volumes5.504GB（4.711GB）。**并非本项目拥有或允许删除的资源**；其他项目/停止容器/缓存依赖未知，不执行system/builder/volume prune。Images全部被容器引用、Docker报告可回收0B。
- workbench日志约5.88MiB，含无后缀beat日志。无日志轮转改动，不运行中的文件截断。

## 引用与必须保留

- 36个音频storage_key/checksum对全部本地hash匹配；27个成功render的54个MP4/SRT缓存全部hash匹配。
- 私有S3 73对象、100205380逻辑bytes；六表派生的73个内容地址key均存在，无未匹配key。只做list/存在性盘点，不冒充重新下载/metadata/hash验证（后者已在恢复阶段验证）。
- 30个词侧车在，6个缺失来自旧comparison/state/timeline示例（1/3/2），不是Python/RAG完整课缺失。完整Python C11音频与RAG9音频侧车均在。旧例仍可播放，但缺缓存不能本地重对齐，现有代码会拒绝，绝不为盘点补配音/伪造词时间。
- renderer/public有238普通文件；118个未匹配到直接音频/侧车/发布物引用，其中54个在已知attempt目录。这可能含冻结input、失败取证、旧演示或未入库交付；**未匹配不等于垃圾，不是删除候选**。不可仅从当前项目去重，旧版本/任务、静态例子、输出、备份、固定字体都有其他引用图。

## 后续需确认

当前没有设置磁盘阈值、保留期限、GC或开机启动。资源盘点完成不等于资源管理已实现。要实施，先确认作用目录/保留版本与诊断期限、是否允许移动或删除、最小余量/额度、日志策略；启动方案须明确能否自动消费已排队收费任务。随后再做dry-run、引用/持有锁校验与隔离验证。仍无生产停写/异地灾备或商业许可批准。

没有新增依赖/业务代码或数据库迁移。本轮不重复未改变的前端构建/全套业务测试，依据assert闸门盘点与原状态hash证明；首次文件路径假设找不到已通过实际目录定位解决，不是业务错误。
