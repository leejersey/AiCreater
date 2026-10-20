# 已配音单场景预览设计

目标：POST /api/scenes/{id}/preview，body expected_revision，仅ready且已有有效配音/动画/字幕；其他场景尚未配音不应阻塞。只复用原音频并本地渲染，不调用模型/TTS或自动重试。

方案比较：推荐使用现有kind=render/lane=render，加scene-preview:1协议，冻结选中场景到不可变job.input；新preview表/kind需多处迁移，frameRange整课快照又要求全课ready，均不采用。不把预览快照写成普通project_versions，避免其UNIQUE(project_id,revision)冲突或改动旧版本。

在项目锁下核对场景expected_revision/ready及当前profile，构建仅选定场景和所需audio资产的final DSL，严格校验/资产验证。冻结场景ID/scene_revision、project_revision、profile/DSL/checksum；快照标识由冻结内容确定，input_hash幂等。快照只存job.input，不冒称可经GET /api/versions取到的普通版本。旧版本/项目不修改，运行期间编辑不影响冻结预览。

复用render子进程、路径/媒体验证、存储、取消、deadline与attempt fence。publish_render按协议返回scene_id/scene_revision/snapshot_checksum/checksums（预览不返回假version_id）；全课snapshot-render:1结果不变。GET jobs/renders公开preview_scene_id或scope供前端识别，但不暴露私有input/profile。files仍校验真实MP4/SRT。未知协议拒绝，不回落为付费工作流。

前端加明确本地“预览本场景”按钮，未保存/非ready禁用，复用任务列表/下载及选择场景；不替换现有无需渲染的Remotion Player。预览队列与全课导出共用单并发槽，不增队列，重试文案说明本地render不调用模型/配音。下载时长仅本场景，页面编号为1/1不冒称原课编号。

影响：Jobs.submit_preview/submit_render发布协议分支，Store现有DSL/资产 helper，API路由/public_job、web按钮及Job显示类型/策略测试，worker仅协议校验如必要；无SQL/新表/schema/template迁移。

验证：红绿单场景范围/其他场景needs_voice不阻塞、缺媒体/错误revision/文本不变、幂等、普通版本未新增、冻结后编辑隔离、原render兼容、取消/旧attempt不发布、无密钥/TTS调用、未知协议拒绝、API与UI保护。离线/临时DB/Node/typecheck/build；独立副本浏览器一次本地预览，核验短MP4/SRT/hash/原音频及原件不变，任务只增1render。不发任何模型/配音。

状态：用户确认后完成实现与闲时激活。120离线/81临时DB/156Node/typecheck/build通过。浏览器独立副本一次preview成功（其他场景needs_voice），18.752秒/562帧/8字幕，冻结checksum/下载/全片解码/原音频、项目及普通版本未变通过；attempts44→45仅render，无模型/配音。证据output/workbench/scene-preview-qa/receipt.json及preview.mp4。初次测试留下queued任务和全表版本计数干扰其他用例，修正fixture而非队列；帧截图命令小数需0.5，修正后只读核对，不重提。浏览器Tabbit注入属性造成的开发态hydration警告定位未掩盖。无Git/委派授权，只自审。nums发音/20组收费验收继续暂缓。限制：needs_voice/needs_timing不自动补齐，缓存或资产不可用明确失败；预览同样占用本地渲染资源，不是零CPU操作。
