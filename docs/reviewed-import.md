# 已执行稿登记

受限的本地维护入口，把已经通过模型原响应核对、采样几何检查和人工带配音预览审阅的稿件，登记到现有工作台。它不调用模型、TTS或渲染器，不改写任何旧失败任务，不创建新的任务种类或放宽验收/导出门禁。

```sh
.venv/bin/python -m services.visual.reviewed_import \
  --project PROJECT_UUID --scene SCENE_UUID \
  --source-directory output/visual-agent/REVIEWED_SOURCE \
  --preview-directory output/visual-agent/REVIEWED_SOURCE/voiced-diagnostic-v1 \
  --sha256 APPROVED_SOURCE_HASH --video-sha256 APPROVED_VIDEO_HASH \
  --confirm --accept
```

省略`--accept`只登记，仍需在工作台明确验收。默认只支持一章、一个合法完整供应商源码响应、一次历史代码请求，以及现有单章WorkbenchVideo冻结结构。当前场景、配音checksum、字幕、设计/源码、完整采样帧、音视频流和SRT都必须吻合。默认不支持手改源码、协议污染恢复稿或未通过几何检查的诊断片。

明确使用`--offline-revision`时，可以登记经用户另行批准源码执行、预览播放及采用的离线修订。来源目录必须额外包含`offline-revision.json`：`schemaVersion`为`reviewed-offline-revision:1`、`parentSha256`绑定合法原供应商响应中的父稿、`sha256`绑定获批修订稿、`designSha256`绑定设计、`reason`记录修订说明。仍保留父稿的真实`provider-response.json`、`dispatch.json`与`request.json`，父稿brief不得改变；父稿原类型检查失败可以作为历史证据保留，但最终修订稿必须通过类型及全部原预览门禁。不会执行父稿，也不把它原来的失败记录改成成功。协议污染的原响应仍不支持此模式。

离线修订记录的来源明确为`local-reviewed-offline-revision`，阶段显示“离线修订稿登记”，历史请求1次指父稿的那一次实际代码请求，本次新增请求0次；不是宣称模型自动产出了修订稿。原默认来源为`local-reviewed-model-execution`，不开启新参数时不会接受离线修订清单。两种方式均保持普通工作台repair/preview类型，使用同一现有验收及导出门禁。

人工修订同时改变画面设计时，清单还须声明`parentDesignSha256`，并提供原始`parent-design.json`。历史dispatch绑定该父设计；最终修订稿、已渲染composition和几何报告仍绑定最终设计。父设计brief及实测cues必须与最终稿相同，不能更换口播或时间。父设计文件随来源证据冻结并纳入登记key，重复登记会再次校验；缺少快照、错误哈希或时间改变均拒绝。未声明父设计的旧清单继续要求dispatch直接绑定最终设计。

登记创建两个终态记录：`repair`保存实际历史模型请求1次和原响应，`preview`保存已有截图、MP4/SRT。本次新增付费请求为0，阶段文字明确标为“已执行稿登记”。这不是声称原队列完成了该请求；完整来源和登记key保留在各自私有`import-receipt.json`及数据库输入中。原批次其余历史请求仍以原账本为准，不把单次稿件请求数当成整批消耗。

文件冻结到新UUID目录后重新验证，两个任务在项目锁保护下原子登记；相同来源和快照重复登记复用原记录。旧图、视频或源文件哈希变化会拒绝复用，课程/场景/音频编辑沿用现有失效规则。不会绕过整课“每章都有当前有效且已验收预览”的要求。

本入口不是不可信代码沙箱。用户必须已经明确批准对应源码执行、预览及人工审阅；维护命令仅在可信本地环境运行，不开放任意路径的HTTP上传接口。发布前失败可能留下无数据库引用的冻结审计目录，不会自动重试或自动删除历史证据。
