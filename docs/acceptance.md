# 20 组教学验收计划

本文档记录面向编程与 AI 教学场景的 20 组教学验收方案、输入用例定义、交付物规范、结构校验命令、通过标准及当前状态。

---

## 1. 测试用例定义与检查要点（cases.json）

固定输入与人工检查要点位于 `examples/acceptance/cases.json`：

- **用例构成**：包含 8 组 Python / JavaScript / TypeScript 教学与 12 组 AI 教学。
- **覆盖场景**：覆盖循环重复行、分支、函数、变量输出、RAG 无依据分支、Agent 授权、Token/emoji、中英数字标点及不同文稿长度。
- **模板名修正**：固定 20 组清单中的 6 处旧 `bullet_cards` 已统一修正为实际运行 Schema 支持的 `card_sequence`，检查器模板名直接取 Schema 枚举，18/20 标准保持不变。
- **离线回归验证**：123 项离线 Python 回归测试已通过；重新检查既有交付物仍为 2/20 通过、18 组缺失，正式状态为 pending，不新增收费或伪计成功。报告见 `output/acceptance-template-fix-20261013-111629/report.json`。

---

## 2. 交付物结构与规范

每组已生成的交付物按 `<results>/<case-id>/project.json`、`video.mp4`、`video.srt` 放置：

```text
<results>/<case-id>/
├── project.json    # 最终 DSL
├── video.mp4       # 1080P/30FPS 视频
└── video.srt       # 快照字幕文件
```

- **project.json 规范**：必须是最终 DSL（可从不可变版本的 `dsl` 字段保存），**不是 draft 或 API 整个版本响应**。
- **音频与资产校验**：音频仍须可在 `renderer/public` 校验，若本地缓存缺失应先通过资产 API 恢复。

---

## 3. 验收检查命令（check:teaching）

运行以下命令对交付物进行离线结构与产物校验：

```bash
npm run check:teaching -- --results output/teaching-results --report output/teaching-check-new.json
```

### 运行特征与检查范围
- 该命令**不生成视频、不调用供应商、不执行代码**。
- **校验内容**：复用生产校验器，检查讲稿原稿不变、教学模板/编程语言合法性、静态资产完整性、1080P/30FPS 视频帧数与时长、以及快照 SRT 字幕。
- **失败判定与报告**：缺失或非法交付物计为失败；校验报告不能覆盖已有旧文件。

---

## 4. 验收标准与 formal_acceptance 说明

- **结构通过门槛**：20 组用例中至少 18 组结构通过（18/20）才退出 0。
- **formal_acceptance 始终 pending 说明**：
  - 检查报告中的 `formal_acceptance` **始终为 pending**。
  - **核心免责说明**：真实供应商来源、端到端 900s、截图/事实核查及 0.5s 同步听检仍需单独验收，**不能靠自报耗时或此报告证明**。

---

## 5. 当前验收状态与边界声明

- **真实复跑结果**：已用既有 RustFS 真实 Python/RAG 交付物复跑：**2 组结构通过、18 组缺失，整体未通过**。对应报告见 `output/teaching-acceptance-check-20261010-143740/report.json`。
- **完成状态与预算声明**：
  - **这不是 20 组视频验收完成**。
  - 后续真实批量生成需另行确认费用预算与调度授权，不能将当前两例代表批量完成。

---

## 相关导航

- [← 返回 README.md](../README.md)
- [后续跟进说明 (docs/mvp-follow-up.md)](mvp-follow-up.md)
- [待办事项清单 (docs/TODO.md)](TODO.md)
