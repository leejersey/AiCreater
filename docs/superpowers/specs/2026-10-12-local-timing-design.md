# 本地时间轴重算设计

## 已批准目标与边界

为已有配音的场景补上不调用模型/配音服务的重算入口。复用保存的WAV与原词时间戳，重新生成动画和字幕，恢复ready。原稿、教学内容、代码、音频身份和声音不变；未配音或原稿改变的needs_voice场景不允许重算。nums发音仍延期；不扩自由拖拽、全局开场规则或批量收费验收。

## 方案比较

1. **推荐：独立timing任务，复用现有持久队列。** 有取消、超时、attempt归属、修订号保护，且不会混淆收费配音。
2. 在voice里自动查缓存：代码可能少一点，但缺失缓存易转为收费、旧任务语义混乱，不采用。
3. 同步API现场计算：不需要新kind，但失去既有取消/重启恢复/硬期限，不采用。

## 数据流

- POST /api/scenes/{scene_id}/timing，body仅expected_revision。ready/needs_timing可用；needs_voice、缺失资产/词缓存或修订号过期明确失败。
- 服务端定位当前narration.audio_asset_id对应音频，派生同目录同stem的*-words.json；不接受用户提供路径/JSON/程序。仅复用当前本地已保存文件，不隐式下载或调用TTS。
- 冻结教学草稿、音频asset id/key/checksum/duration、词缓存SHA256、profile及base_revision；协议local-timing:1，重用input_hash幂等。
- 文件读取限制、路径包含/符号链接检查、音频checksum和实际duration核验；词缓存必须在提交与执行时保持同一SHA256。缓存须严格覆盖冻结原稿，保留align_words现有校验，不从识别结果猜词时间。
- timing子进程不带任何模型/配音密钥，不实例化HTTP客户端，不进入generate_project/volcengine_speech分支。复用align_words/time_scene；最后字幕沿用已测试的音频边界策略。
- 发布共用已有单场景媒体验证与attempt fence，额外核验音频asset与冻结资产完全一致、教学草稿不变。仅在场景revision/profile匹配时附着；过期任务保留结果但attached=false，不覆盖新内容。取消/丢失租约不发布。
- attached后state=ready、项目revision递增，按现有媒体发布规则不增加场景编辑revision。旧project_versions保持不可变。

## 任务与兼容

新kind=timing/stage=timing走workflow lane，不新增Celery队列。扩展PostgreSQL约束为v5；旧v3/v4迁移分支要认识v5，避免再次initialize时重加旧约束。新增固定缓存错误，不暴露文件路径/响应/密钥，缓存校验失败不可自动重试或转收费。旧voice/generate/regenerate/render协议和执行分支不变；任何显式重试仍由用户发起。

现有词缓存是本机生成目录里的侧车文件，不在资产清单/对象存储中。导入其他音频或丢失侧车时，此入口会明确失败；这轮不补造时间戳、不引入ASR或对象存储词缓存备份。

## 前端

把“配音 / 恢复对齐”改成明确的收费配音按钮，另加“重算时间轴（不重新配音）”，仅已保存且有音频的ready/needs_timing场景可用。沿用当前教学核对与未保存保护。确认文案说明将替换动画和字幕时间，保留声音；失败不会自动弹出收费配音或提交voice。timing任务重试文案明确本地、不计费，不套用通用收费提醒。

## 影响范围

services/projects/jobs.sql、jobs.py；services/workflow/worker.py及小型本地重算实现；services/api/app.py；apps/web/app/page.tsx及现有UI策略测试；数据库/API/worker/缓存单元测试与README/契约。复用已有媒体验证、音频路径、队列和timing，不新增依赖，不修改DSL schema或Remotion模板。不重新生成/配音两个已交付课程。

## 验证

红绿测试覆盖：同音频成功/needs_timing→ready、幂等、无密钥且禁止HTTP/TTS调用、缓存缺失/篡改/超限/路径越界/文本不符、音频身份替换被拒、修订号过期结果不附着、取消和attempt fence、SQL重复初始化、API请求限制和前端按钮/收费提醒。运行离线、临时PostgreSQL/API/jobs、Node tests与web类型/构建检查；只在用户测试副本做免费真实本地重算，不改验收原件、不发模型/配音请求。

## 评审与执行状态

用户批准开始后已按docs/superpowers/plans/2026-10-12-local-timing.md完成。112离线/76临时PostgreSQL/141Node/typecheck/web build通过，已空闲重启加载v5与新入口。独立副本浏览器一次timing succeeded/attached/needs_timing→ready，9音频checksum与已验收原项目/冻结版本不变，attempts41→42且无新模型/配音/渲染调用，output/workbench/local-timing-qa/receipt.json与workbench.png留证。旧音频round/ceil最多1ms差保留frozen duration，align_words严格性未放宽。当前目录无Git元数据，不能提交设计或建worktree；未获委派授权，仅自审，不冒充独立审查。
