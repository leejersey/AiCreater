# 整课删除（我的视频）

用户已确认：在「我的视频」可删除整课；实现取方案 **C**（删库表记录，本轮不强制清对象存储）；有排队/运行中任务时 **拒绝删除**（选项 1）。

## 目标与边界

- `/courses` 列表每张卡片可删除本课；删除后从 `GET /api/projects` 消失。
- 删除为**不可恢复**的库表清理（对用户而言）；不提供回收站/撤销。
- 有 `queued` / `running` 任务时拒绝，须先取消或等结束（对齐章节删除的活动任务守卫）。
- 本轮不做：软删除恢复、物理清理对象存储/本地音频、批量删除、无确认删除、改计费。

## API

新增免费接口（建议与章节删除一致用 POST + `confirmed`）：

`POST /api/projects/{id}/delete`

Body（`extra=forbid`）：

```json
{"expected_revision": 3, "confirmed": true}
```

- `confirmed` 必须为严格布尔 `true`。
- `expected_revision` 与当前项目 revision 不一致 → `409 conflict`。
- 非所有者 / 不存在 → `404`（与现有项目路由一致，不泄露他人课）。
- 存在活动任务 → `409 not_ready`（或现有等价 code），消息提示先取消任务。
- 成功 → `200`，body 可为 `{ok: true}` 或空对象；客户端以列表刷新为准。

鉴权：与其它项目写操作相同（登录 + 归属）。

## 服务端删除顺序

FK 无 `ON DELETE CASCADE`。`scene_candidates` 可引用 `job_attempts`，`jobs.scene_id` 引用 `scenes`，故**不得**先删 attempts/jobs 再删 candidates。在单事务、锁住项目行后：

1. 拒绝若存在该 `project_id` 且 `state IN ('queued','running')` 的 jobs
2. 删除该项目下全部 `scene_candidates`（经 `scenes.project_id`）
3. 删除该项目 jobs 的 `job_attempts`，再删 `jobs`
4. 删除 `scenes`（含已 `deleted_at` 归档行）
5. 删除 `project_versions`
6. 删除 `projects` 行

单测须覆盖「存在 candidate + job_attempt 关联」的项目仍可删除。

不调用对象存储删除；不扫 `apps/renderer/public` 音频文件。

## 前端

- `/courses`（我的视频）卡片增加「删除」控件（按钮或图标），不误触「继续制作」。
- 使用现有确认对话框：说明删除后列表不可见且不可恢复；有进行中任务时需先取消。
- 调用上述 API；成功后从本地列表移除或 `load()` 刷新；失败展示服务端消息。
- 可选：清掉该 `projectId` 下本机 `LocalDraft`（append/voice/scene 等），避免孤儿草稿入口；新建课草稿（无 projectId）不动。
- 若用户正在 `/courses/{id}` 编辑被删课：下次请求会 404；删除成功若当前路由即该 id，可 `router.replace('/courses')`（若删除入口仅在列表页，本项可省略或仅文档说明）。

## 测试与验收

1. 离线/DB：无活动任务时删除后 `get_project` / list 不再包含该课；`scene_candidates` / `job_attempts` / `jobs` / `scenes` / `project_versions` 行清空。
2. 有 queued/running job 时删除失败且项目仍在。
3. `confirmed` 非 true、revision 冲突 → 422/409。
4. 前端：确认取消不发请求；确认后列表少一张卡。

## 实现落点（摘要）

- `services/projects/store.py`：`delete_project`
- `services/api/app.py`：路由 + body
- `services/tests/…`：store/API 用例
- `apps/web/app/courses/page.tsx`：删除 UI + 确认
- `docs/api-reference.md` / README 一句

本仓库不为流程强行打包无关未跟踪文件；设计文档写入后待用户审阅，再进入实现计划。
