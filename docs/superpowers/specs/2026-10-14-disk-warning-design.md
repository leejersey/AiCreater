# 工作台只读磁盘余量预警

## 已确认范围

用户在“复用workbench:status，低于20GiB提示，不自动删除/阻断任务”提案后要求继续。本文件细化设计，用户已于m06723要求实现；现已按[实施计划](../plans/2026-10-14-disk-warning.md)红绿验证并交付，详见[验收](../../../output/workbench/disk-warning-qa/receipt.json)。无需界面设计；未授权委派或首次Git提交，当前HEAD未出生，采用自审并保留本地文档。

## 方案与选择

1. 推荐：用已导入的标准库shutil.disk_usage(ROOT)，给现有status JSON增加disk字段，最小改动。
2. 调df并解析：多一个子进程且输出随平台/locale变化，没有必要。
3. 配额、任务阻断或自动GC：需要用户明确额度/引用策略/删除权限，并涉及提交队列；不在此次范围。

## 行为契约

仅`python3 -m services.workbench status`（即npm run workbench:status）成功走到现有状态输出时，查询仓库根目录ROOT所在文件系统的用户可用空间。不是扫描文件大小或递归du。

保留现有code/services/tasks与既有基础健康、归属和错误返回码，新增：

```json
{"disk":{"state":"ok","available_bytes":53687091200,"threshold_bytes":21474836480}}
```

示例available_bytes只是示例，不冒充当前实测。固定阈值20×1024³=21474836480bytes；available_bytes < threshold_bytes为low，等于或更大为ok。state=low为可见预警，不改变成功状态的退出码0，不调用Supervisor或任意启动/停止/提交入口。不新增配置项、CLI参数、npm命令、API或前端横幅。`run`入口行为完全不改，也不调用磁盘检查。

磁盘查询OSError时返回`state=unavailable,available_bytes=null,threshold_bytes=21474836480`，不假报ok、不给出异常原文/路径，也不掩盖原有基础服务错误。基础检查/监听核验失败仍沿用原有非零退出及错误码，此时不保证提供独立disk结果；不新增脱离工作台的磁盘命令。

## 影响与兼容

代码：services/workbench.py增加小查询函数并在status输出使用；services/tests/test_workbench.py新增边界与入口保护回归；README/运行手册/TODO及验收receipt同步。无新依赖/数据库/DSL/worker变化，package.json及lock不改。已扫描调用点，现有status服务字段和tasks名称不变，disk为新增字段；外部严格全对象比对脚本需要接受新增字段，既有历史receipt不重写。

## 验证

实施后先写RED：低于/等于/高于20GiB、查询异常、status保留字段并只增disk、低磁盘仍exit0无Popen/信号、run不调用查询。用mock注入空间值验证边界，不填满磁盘或动数据。GREEN后跑新增/现有工作台用例与离线Python回归、py_compile；真实只读npm status检查可用bytes和状态一致、原业务/配置/媒体/容器无变更，零新任务/收费。只自审，无独立代理审查；不重复未改变的数据库全套和前端构建。

## 明确限制

这是手动查询时的快照，非后台监控、邮件提醒或容量预留。APFS共享空间及其他应用可随时改变，Docker VM/卷额度可能另有限制；ROOT文件系统空间不能保证下一次渲染成功，也不等同各目录总量或Docker磁盘额度。不能把low当删除授权。生产冷启动/停写、资源配额/GC、异地灾备、人工同步、nums收费试听与商用许可仍未完成。

## 设计核对

- 已核对现有status/run、私有配置/健康/错误边界与测试模式，确认shutil已在模块导入。
- 无复用的产品磁盘查询helper；以前资源审计是一次性盘点，不新增运行依赖。
- 维持JSON/返回码兼容，不将空间不足伪装成基础服务故障；无法读取明确unavailable。
- 文档先确认再实施；5新增例/30focused/164离线通过（87DB跳过），真实status与原状态不变检查完成，不冒称VM额度或监控已实现。
