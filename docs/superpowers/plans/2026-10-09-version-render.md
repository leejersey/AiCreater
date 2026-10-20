# 不可变版本渲染任务

按现有契约接POST /api/projects/{id}/render(version_id)，读取已存在不可变快照；不读取可变草稿、不调用付费供应商。复用已有Node/Remotion渲染器和视频校验；每个attempt独立目录，取消/过期不发布成功状态。

API、Jobs、SQL迁移、子进程、下载一起贯通。下载只允许成功任务、服务器推导的固定目录与校验和一致的MP4/SRT；不接受用户路径。渲染/字体模板profile变更时旧版本不得被静默用新profile渲染。

## 实施结果

- [x] SQL v4迁移、render去重任务、明确version_id提交及HTTP下载已贯通；重复初始化迁移通过。
- [x] 工作流和渲染独立单槽，两个Celery队列/worker；渲染不阻塞分镜或配音，Redis仍只承载空参数wake-up。
- [x] 子进程复用Node/Remotion，按attempt生成独立目录，不接收供应商凭据。模板/字体profile在提交与执行时都检查；不兼容则失败，不静默替换。
- [x] 发布前复用verifyVideo验证1080P、30FPS、H.264/AAC、精确帧数/时长，并逐字核对SRT与冻结快照；只在有效attempt且未取消时发布。
- [x] 下载状态/扩展名/固定目录/文件大小/路径和SHA256校验，拒绝任意用户路径、未完成任务及产物篡改。
- [x] 真实Remotion→父进程校验→PG成功状态→HTTP字幕下载通过，MP4全片FFmpeg解码通过；测试文件在临时目录中清理，没有声称另留一个用户视频产物。
- [x] 最终验证：60项真实PG、43项实际运行Python非DB、71项TS，共174项；typecheck和compileall通过。discover的103项中跳过的60项已在独立PG命令实际运行，不重复计数。未调用付费供应商。

仍待完成：常驻Redis/Celery完整浏览器端到端验收、Web编辑器、编程/AI整课内容和同步指标验收。失败/取消的渲染目录不自动清理，需要后续保留策略；强制SIGKILL父worker可能留下已启动的子进程，attempt fencing阻止它们发布，但不保证供应商未计费或没有后台CPU消耗。普通取消和超时会结束进程组。
