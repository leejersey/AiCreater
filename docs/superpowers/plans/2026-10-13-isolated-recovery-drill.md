# 隔离备份恢复演练计划

用户在运行手册交付后确认“继续”；只执行免费本地运维演练，不新增产品功能、付费任务或独立代理。当前无Git，不创建提交。原服务不停止，基础条件为活动任务0、attempt58和首尾数据指纹相同；这是空闲本机演练，不冒称生产并发一致性/异地灾备。

1. 原PG只读统计全部6张业务表、完整行内容hash与任务状态；私有S3递归manifest；选定项目源码/依赖锁/字体/public媒体与words侧车/output交付物的逐文件hash，拒绝符号链接。忽略node_modules、web.next、日志、缓存、私有.env、此演练的证据目录；不清理原文件。
2. 检查磁盘余量；在仓库外用户私有目录0700创建只一次备份：PG16.13定点镜像内pg_dump custom、文件tar与73个S3对象原bytes+SHA。私有配置通过OpenSSL AES256/PBKDF2加密，随机密钥在独立0600目录，不打印凭据，不把备份放进HTTP静态目录。
3. 创建唯一docker隔离网络、新PG与RustFS容器/临时卷，仅随机127.0.0.1端口；原计划--internal经实测不发布HostPort，最终用已验证的enable_ip_masquerade=false专属bridge（不声称airgap）。使用当前已安装imageID、随机新凭据、资源限制，禁止拉新镜像。不给容器真实供应商凭据，不启动Redis/beat/workflow/render消费者。所有新资源在finally按精确ID清理，原stack不受影响。
4. 只对新库pg_restore(no owner/ACL)，比较6表内容和58attempt/0active；只对新桶put备份bytes、核对全部key/size/SHA。解包仅已校验相对路径和普通文件到独立目录，恢复加密配置只在内存核对、不注入消费者。
5. 用明确注入的恢复Store和新对象存储运行in-processTestClient，只GET项目/冻结版本/已成功媒体元信息/MP4/SRT，无网络API服务/新任务。删除恢复副本的一个MP4缓存，验证仅新S3可重建；原件不得删。核对words侧车与音频、项目/版本/交付哈希、供应商env为空。
6. 原DB/sourcefiles/S3首尾复查相等；确认无付费/新render/新attempt。确认只本轮的容器/网络/临时恢复目录已清理，保留0700备份与独立密钥。输出不含凭据的receipt，更新TODO/手册/后续记录。

失败即停止并保留私有备份，不重试付费任务或启动生产worker；不针对原库执行restore/clean、不变更原对象策略/服务器。只读健康查询会使服务日志变化，日志不参与一致性集合。当前不额外实现自动备份/恢复命令、磁盘GC或守护服务。

验收：真实dump/恢复/哈希相等/S3回填下载/受控API/原件无变更/隔离资源清理；本机同盘不是异地冗余。生产恢复仍须停写窗口、凭据重建、任务闸门和异地验证，已完成演练不等于自动开机/许可/收费验收通过。

执行完成，receipt：output/workbench/recovery-drill/latest.json。6表/73对象（metadata保留）/2865文件/加密私有配置恢复相等；API下载与缺缓存回填通过；attempt58/0active，无新收费，原数据未变，2容器/网络/临时目录清理。只保留仓库外362090292bytes私有备份与独立密钥。遇到并定位4个临时运维脚本契约问题：internal network HostPort=null、beat无后缀活跃日志、ObjectStore实际constructor(client,bucket)、TestClient默认peer非回环403。均未改业务代码/安全限制，metadata/内容类型补全并验证已有对象重复上传。一次诊断exec缺Path namespace已修正；不将这些临时脚本错误宣称为产品故障。最终成功有全链assert；前期失败均cleanup安全停止，无付费重试。日志/恢复证据不进入备份一致集合，源码和固定字体在档；异地/完整生产停写未做。
