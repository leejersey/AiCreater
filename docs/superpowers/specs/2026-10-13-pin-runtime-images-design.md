# 固定当前运行镜像摘要

用户已确认修改（核查/方案确认后“修改”）。范围仅Compose和两套隔离测试脚本的PG/Redis镜像引用，不升级、不迁移、不重启或重建现有服务。无Git元数据/独立代理授权，内联实施与自审。

采用当前已安装RepoDigest，而非可漂移版本标签：postgres:16.13@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51；redis:7.4.8-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065。docker image inspect已确认分别映射当前运行的configID a4d9e579…/49898aa0…（linux/arm64），不是把imageID误用为仓库digest。RustFS已有digest不改。多架构/其他新机安装不在本次实证内。

方案对比：版本tag仍可更新；升级/迁移引入额外风险和许可变化；镜像digest锁定当前验收字节最小。保持当前端口/卷/密码/健康检查/worker行为，不增配置模块或镜像选择开关。暂不加--pull=never，避免首次部署必须预装缓存；本机测试所有digest已缓存，不拉新镜像。

新增3个静态回归校验Compose/两个真实docker调用脚本必须引用已验证digest，先RED后GREEN。跑真实临时PG项目/API/jobs87项、队列CLI及真实PG/Redis/Celery/RustFS本地render：原IPv4API8000占用，队列验收用一次性临时脚本仅把测试API绑定改::1:8000（Host/peer已允许），不改产品/提交新端口参数、不停原服务。所有测试供应商凭据为空，生成测试任务先取消且attempt0，只有隔离本地render；原工作台attempt58不变。

文档同步TODO/运行手册/许可历史说明，保留商用许可、同步听检、nums修正与异地备份待办；镜像固定不决定许可免费、不提供自动安全升级。验收缓存image与liveID吻合、compose预览只检查无凭据输出、PG/队列实测、原容器ID/StartedAt/数据不变及测试资源清理。
