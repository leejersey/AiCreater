# 内容 skill

选题、文案与审核的方法，按 skill 文件存放，代码只负责调用（`services/workflow/content_skills.py`）。换方法、升级方法、改编开源 skill 时只改这里，不改调用代码。设计见 `docs/superpowers/specs/2026-11-25-content-studio-design.md`。

## 文件格式

每个 skill 一个目录，目录名即 skill 名（小写字母、数字、连字符）：

```
<name>/SKILL.md
```

```markdown
---
name: <name>            # 必须与目录名一致
version: 1              # 改动方法时递增
description: 一句话说明
adapted_from: 仓库@提交号 (许可证)   # 仅改编时填写，并登记到 NOTICE.md
---

提示词正文。
换行只为阅读，读取时会直接拼接（不加空格）；
行尾两个空格表示真正的换行（Markdown 的硬换行）。  
{{占位符}} 由调用代码填入，缺少或多余都会报错。
```

每次调用都能拿到 skill 的名称、版本和文件哈希（`skill(name).stamp()`），用来记录结果是按哪一版方法产生的。

## 现有 skill

| skill | 用途 |
| --- | --- |
| `hotspot-brief` | 爆款拆解：参考资料 → 事实、钩子、痛点、叙事节奏 |
| `platform-pitches` | 抖音 / 小红书 / B站三平台选题方案 |
| `ideation-angles` | 选题发散：结构各不相同的切入方向 |
| `ideation-outline` | 卡片内大纲 |
| `storyboard-document` | 分镜文稿（口播 + 画面素材 + 画面意图） |
| `script-popular` / `script-technical` | 纯文本口播（通俗 / 干货） |
| `opening-hooks` | 开场钩子 3 选 1 |
| `polish-storyboard` / `polish-plain` | 去 AI 味 |
| `rewrite-section` | 局部改写一段 |
| `critique` | AI 审稿 |
| `publish-kit` | 发布套件 |
