# 教学场景计划：第一阶段验证记录

范围仅为 T1–T3。以下是离线协议、语义和失败重放结果，不是新选题生成成功率，不是视觉验收，也不代表主链路已迁移。

## 执行结果

| 验证 | 结果 |
| --- | --- |
| 新协议与失败基线 | 24 项 Node 测试通过，包含 100 组有界流程数据检查 |
| 相关旧协议、布局、动作编译与新协议回归 | 87 项 Node 测试通过 |
| 预算、路由、worker、诊断及新失败基线离线回归 | 35 项 Python 测试通过 |
| custom:typecheck | 通过 |
| 真实视频模型请求 / TTS 请求 | 0 / 0 |
| 新场景执行 / 容器渲染 / 服务重启 | 均未执行 |
| 工作台默认模式 / 旧数据 | 未修改 |

失败基线共 10 个最小复现：DSML 尾缀、内部图案误分类、未定义坐标、随对象移动的审计路线、偏离路线、空裁切组、交接跳位、无效预算、HTTP 503、整课超时预算。其中预算样本由 Python 重放，其余由 Node 调用已有检查器重放；不依赖 output 目录或本机私有记录。

生产生成器和 API 均有测试确认：此阶段不能通过 generation_mode: teaching-plan 发起调用。六类示例通过仅表明语义契约接受它们，尚未有组件绘制或编译产物。

独立代码审阅发现并修复：筛选分支与选择/丢弃动作未绑定、额外循环载荷绕过流向检查、混入 discard/combine 绕过流程/循环轨迹检查。新增回归先复现失败，再验证修复；最终复核原发现范围内无剩余 P1/P2 问题。筛选 v1 限制为单次二分流，流程/循环 v1 拒绝混合筛选或组合动作，限制已同步到协议和提示词，未以放宽检查解决。

## 复现命令

```sh
node_modules/.bin/tsx --test packages/custom-scenes/tests/teaching-plan.test.ts packages/custom-scenes/tests/teaching-failure-baseline.test.ts packages/custom-scenes/tests/design-content.test.ts packages/custom-scenes/tests/design.test.ts packages/custom-scenes/tests/design-layout.test.ts packages/custom-scenes/tests/contract.test.ts packages/custom-scenes/tests/motion-intent.test.ts packages/custom-scenes/tests/render-timeout.test.ts
.venv/bin/python -m unittest services.tests.test_teaching_failure_baseline services.tests.test_visual_store.VisualStoreOfflineTests services.tests.test_visual_routes services.tests.test_visual_worker services.tests.test_visual_quality -v
npm run custom:typecheck
```

运行时需使用工作区的 Node 24 和 .venv。HTTP 响应均为测试内存桩，不读取模型密钥、不访问真实供应商。源码样本仅进行 TypeScript 或 AST 检查，不导入执行 Scene。

## 未证明的事项

- 未验证真实供应商对新 Schema 的接受率或真实模型输出质量。
- 尚无六类结构的确定性几何、遮挡与运动求解结果。
- 尚无统一根任务账本、生产自动修订或新协议重启恢复验收。
- 未运行实际容器渲染、音画同步或 12 道新题盲测。
- 系统 git 因 Xcode 许可未确认而无法运行；未进行提交、重置或清理其他已有修改。
