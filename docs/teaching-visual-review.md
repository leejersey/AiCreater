# 两例教学视频：画面复核

范围：沿用用户确认的Python循环累加/RAG两个案例，不扩到20组，不再调用分镜模型或配音。复核原始交付物output/paid-teaching-pair-20261010-145916/，保留全部原结果。

## 覆盖

原Python5场景生成30张关键帧、RAG5场景生成42张，覆盖scene_start、每元素entry_midpoint/entry_settled和scene_end，索引在各visual-audit/index.json。实际读取检查10个场景的开始/代表入场完成/结束概览及修后重点帧；**不是全部72张逐张人审，也不是每个视频帧已检查**。完整图像均留存供用户复核。

检查范围内代码、状态/输出与字幕安全区无遮挡；RAG文档/问题进入提示再到模型的关系可读。输入、检索、相关/不相关文档、依据/来源、不是重新训练、无依据不编造均有对应画面。

## 发现与调整

1. Python scene3、scene4的第二元素cue错误地包含“取出二/三”，导致字幕还在取数字时就显示累加后的total。旧animation开始47/48，实际累加短语字幕开始73/74，提前26帧约0.87秒。第一取值元素也提前在“第一次/第二次循环”开始。修后各自cue指向取值与累加短语，time_scene复用真实原生words.json重新装配：scene3 [14,47,108]→[47,73,108]，scene4 [13,48,115]→[48,74,115]。断言音频引用、片长、全部字幕和口播完全不变；新累加时间与对应原生时间字幕短语一致。
2. RAG s4_answer回答卡片简化为“七天内可退”，省略示例文档甲的“未拆封”条件。补全后长标签把“退”单字换到下一行，再精简为“未拆封：七天内可退”，保留条件且单行可读。不修改原口播/字幕，不将示例规则说成真实通用退货政策。

这两项是具体交付物修订，没有更改通用生成逻辑，也没有承诺模型语义无误。Schema正确、渲染成功、图像无溢出不能替代教学事实/动作cue人审。

## 最新交付物与证据

- output/teaching-reviewed-20261010/python-sum/video.mp4：622帧/20.736s；project.json、video.srt、review.json、take-before-add.png、add-highlight.png。
- output/teaching-reviewed-20261010/rag-readable/video.mp4：959帧/31.979s；project.json、video.srt、review.json、condition-preserved.png。
- 中间RAG较长标签版本保留在output/teaching-reviewed-20261010/rag/，不作为推荐播放版。

新鲜验证：调用现有time_scene/align_words及validator，SHA验证所有原音频；现有Node renderer进行冻结资产与产物验证，两个推荐视频均H.264/AAC/1920×1080/30FPS；独立check_case通过，SRT逐字节与原导出相同。修后读取实际视频截图：取值时行3/n2，累加时行4/total2，RAG完整条件单行。未改变生产代码，本轮未重跑全套194测试，不以旧测试数冒称新验证。

未完成：人工听检和实际语音对视觉0.5秒误差验收。对齐到供应商时间和字幕只证明内部一致性，不能证明真实听感；需要用户播放以上两个视频后确认。没有新增API计费，所有原始结果保留。
