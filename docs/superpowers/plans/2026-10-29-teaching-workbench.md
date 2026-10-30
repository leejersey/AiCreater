# T8 工作台接入：实验入口

保持旧课程和默认模式不变，T9门槛前不切默认。本阶段不接真实供应商；实验接口使用provider替身，固定fixture的容器渲染另行显式验证，不自动执行当前课程。

- [x] A 严格的项目范围实验路由：准备、列表、查询、执行、取消；快照从服务端章节及实测/估时cue生成，不接受客户端源码或坐标。
- [x] B 后端真实状态反馈：未派发不显示生成中；缓存产物不显示视频完成；不泄漏提示词、响应、令牌或内部文件路径。
- [x] C 输入当前性与鉴权：旧章节变化阻止派发/采用，重复提交复用根任务，登录/跨项目/预算边界测试。
- [x] D1 独立实验前端 `/courses/[id]/teaching`：一次额度确认、准备/继续/取消、只读轮询恢复、请求记录与真实停止状态；不替换原工作台。
- [ ] D2 渲染队列、素材/音轨绑定及真实供应商适配；本阶段不标T8整体完成。
  - 离线子项已实现：冻结artifact渲染账本、幂等领取/执行凭证、截止时间发布围栏、取消与删除保护、隔离容器与宿主复验出口；见`docs/teaching-render-queue.md`。4秒固定fixture已实际通过容器渲染，后续API与播放记录见下一条。
  - 实验API与播放已接：API只入队，独立worker复用Celery render lane（显式开关默认关闭），GET/HEAD鉴权媒体、Range/下载、真实阶段与历史视频保留；临时API→独立Python→真实容器验证通过，queued跨重启领取且终态不重跑。容器身份已登记，仍缺安全重启收尾/配音，不能勾选D2或T8。详细验证见`docs/teaching-workbench-backend.md`末节。
  - 收尾子项：不可变容器ID、执行nonce及最终cleanup凭据已接，worker可核销有凭据的中断记录，不重跑、不改成功状态；无凭据的强杀/失联孤儿容器仍保守围栏，不能记安全收尾整体完成。

在途删除守卫已补齐dispatched/unknown保护并验证，真实worker取消/收尾策略仍待D。新入口是同步、显式实验后端，不把它称作已部署的生产队列。

## 验证记录

- 9项新API测试，真实TestClient+临时PG+Node+fake provider；相关Python回归54项通过，含原项目删除和章节归档兼容。日志`/tmp/aicreater-teaching-workbench-final-tests.log`。
- unknown被误当结束后可删除账本的问题先实测失败再修复；late success能落响应缓存，随后旧删除流程可正常执行。
- 当前服务器/默认模式/课程数据库均未修改，无模型/TTS或渲染调用。完整接口与限制见`docs/teaching-workbench-backend.md`。

## 实验前端验证（2026-10-29）

- 新增6项回归：严格响应/范围/预算校验、重复记录拒绝、估时/实测幂等键、登录返回路径、按服务端current恢复根任务、缓存数据不显示成视频完成。
- 只读审阅发现并修正项目revision/章节revision混用，以及同步run期间无法取消的问题。
- 浏览器使用独立Playwright context及API拦截，不接真实模型或课程数据：项目r8/章节r1发送expected_revision=8；创建一次、执行一次，在途可取消；取消后刷新无POST；功能关闭时按钮禁用、0 POST；unknown结果停止且不提供继续执行。
- 1440px桌面、390px移动端截图已检查；共享账号导航换行修正后document宽度390=viewport宽度，无横向溢出。截图`/tmp/teaching-workbench-desktop.png`、`/tmp/teaching-workbench-mobile.png`。
- UI目前没有渲染器或MP4产物，不显示虚构百分比，也不把artifact-cached叫做视频完成。当前后端默认flag仍关闭。这里是前端交互验证，不是供应商/容器/盲测验收。
- Web回归295项通过；`tsc --noEmit -p apps/web/tsconfig.json`通过。根目录`npm run typecheck`仍有4处不在本次文件内的错误（isolated-render的NODE_ENV类型、两处测试的同类类型、beat-focus的旧Scene断言）；未修改这些文件或将全仓类型检查标为通过。
