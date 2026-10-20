# 分镜复核与表单 Implementation Plan

Goal：实现已批准的会话内复核、时长展示及不丢字段的步骤/代码变量表单。
Architecture：现有JSON字符串仍是步骤唯一数据源，表单通过纯函数定点改写；复核Set以scene ID/revision绑定，不改服务端。复用现有样式，必要时拆一个SceneEditor。
Tech：Next/React、既有TypeScript/node:test；无新依赖。无Git和授权代理，当前会话逐项执行、自检，不提交或委派。

- [x] 在packages/video-schema/tests/review-forms.test.ts写红测试：码点计数、混合ready时长、时间线示意毫秒无关、reviewKey、保留专用字段、拒绝错误类型及非法行号/变量超限。npx tsx --test运行确认失败。
- [x] apps/web/lib/editor.ts加入纯函数并最小实现；不改变scenePatch/服务器契约。测试绿后npm run typecheck。
- [x] apps/web/app/SceneEditor.tsx拆出当前表单，添加步骤说明、行号选择、变量增删及输出；高级JSON同源，无效时禁止切换，保留输入和报错。
- [x] page.tsx增加总览/时长/复核，编辑撤销复核、按钮保留paid确认，重载清空会话复核，原冲突/轮询/未保存保护保留。
- [x] npm test、typecheck、test:workflow、services/tests/run_project_tests.py；实际浏览器表单保存/重开和按钮/错误保护验证。不点击收费操作。
- [x] 更新README、契约、设计及验证记录。未验证项目明确列出；完整长课真实验收另行安排。

## 本轮验证记录

- 红测试因缺少estimateDuration/reviewKey/formSteps/updateStep导出而失败，最小实现后7个新测试通过；全量Node140/140、typecheck通过。初次typecheck发现遗漏SceneRow导入，恢复后通过。
- unittest discover136项，63数据库用例跳过；单独临时PostgreSQL63/63通过，因此73离线+63真实数据库通过。Next生产构建通过，NODE_OPTIONS堆上限1536MB，无新依赖。
- 浏览器确认后voice启用、编辑撤销、重新载入撤销；高级JSON[null]切换被拒且原文本保留、保存禁用。时间线标签保存重开再恢复，原timeline/event、音频、字幕仍ready。
- Python代码场景变量上限3/增删、变量与输出保存重开恢复，高亮复选成功。第一次选到title场景导致变量定位失败，读页面后选择实际第2个code场景继续，未盲重放操作或调用收费接口。
- 截图output/forms-qa/form-preview.png，Tabbit正常finish且保留页面。已有浏览器注入属性hydration警告未隐藏，不声称无警告。
- 截图发现旧示例顺序scene1/2/3/5/4，将自有Python项目恢复1/2/3/4/5，新冻结/导出验证revision7，render_job_id14e52135-990f-40f4-948a-c65a8e3e3102。output/forms-qa/python-correct-order.mp4与SRT下载SHA通过，receipt.json留证，旧档案未改。项目f85938d8-ab21-4015-92d4-46e6e5f9742f。
- 本轮收费调用0、无模型代码执行，无新增服务端审核或Schema/模板/API/数据库变更。完整2–3分钟课程、原生同步听检及20例批量验收仍未完成，需要另行费用授权。
