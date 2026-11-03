import hashlib
import json
import re

from services.projects.store import StoreError


def partition_narration(text):
    if not isinstance(text,str) or not text.strip() or len(text)>16000:
        raise StoreError('validation','整稿须为1–16000个字符，拆分后不超过20章')
    parts=[]
    while len(text)>800:
        matches=list(re.finditer(r'[。！？!?\n]',text[:800]))
        end=next((m.end() for m in reversed(matches) if m.end()>=200),800)
        parts.append(text[:end]);text=text[end:]
    if text:parts.append(text)
    if any(not p.strip() for p in parts) or len(parts)>20:
        raise StoreError('validation','请按教学段落拆分口播')
    return parts


def fingerprint(row,asset):
    scene=row['scene']
    value={'revision':row['revision'],'narration':scene['narration'],
           'duration_frames':scene.get('duration_frames'),'captions':scene.get('captions'),
           'asset':asset}
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def measured_input(project,row):
    scene=row['scene'];text=scene['narration']['text'];duration=scene.get('duration_frames')
    asset=next((a for a in project['config']['assets'] if a['id']==scene['narration'].get('audio_asset_id')),None)
    if row['state']!='ready' or not asset or type(duration) is not int or not 30<=duration<=3600:
        raise StoreError('not_ready','请先完成配音和对齐；每章实际时长须在1–120秒之间')
    captions=scene.get('captions')
    if not isinstance(captions,list) or not captions:
        raise StoreError('not_ready','缺少实测字幕，不能估算音频时间')
    positions=[i for i,c in enumerate(text) if not c.isspace()]
    normalize=lambda s:''.join(c for c in s if not c.isspace())
    if ''.join(normalize(c.get('text','')) for c in captions)!=normalize(text):
        raise StoreError('validation','字幕与口播不一致，请先重新对齐')
    cues=[];cursor=0;left=0;group_start=None;previous_end=0
    for index,caption in enumerate(captions):
        start,end=caption.get('start_frame'),caption.get('end_frame')
        if type(start) is not int or type(end) is not int or not previous_end<=start<end<=duration:
            raise StoreError('validation','实测字幕时间无效')
        caption_text=normalize(caption['text'])
        if group_start is not None and re.match(r'^(?:首先|然后|接着|随后|最后|第[一二三四五六七八九十百\d]+步)',caption_text):
            right=positions[cursor]
            cues.append({'id':f'cue-{len(cues)+1}','text':text[left:right],'startFrame':group_start,'endFrame':previous_end})
            left=right;group_start=None
        previous_end=end
        if group_start is None:group_start=start
        cursor+=len(caption_text)
        right=positions[cursor] if cursor<len(positions) else len(text)
        sentence_end=caption_text.rstrip('”’"\'）)]').endswith(('。','！','？','!','?'))
        if sentence_end or right-left>=60 or index==len(captions)-1:
            cues.append({'id':f'cue-{len(cues)+1}','text':text[left:right],'startFrame':group_start,'endFrame':end})
            left=right;group_start=None
    if len(cues)>30 or any(len(c['text'])>4000 for c in cues):
        raise StoreError('validation','单章节拍过多，请拆分章节')
    sections=project['config'].get('manuscript',{}).get('sections',[])
    matched=next((s for s in sections if normalize(s['narration'])==normalize(text)),None)
    materials=[]
    if matched:
        material=matched.get('materials','')
        materials=[material[i:i+2000] for i in range(0,len(material),2000)][:20]
    title=(matched or {}).get('title') or project['title']
    goal=(matched or {}).get('visual_intent') or '用具体对象的状态变化、路线与遮挡讲清本章机制；不要生成文字卡片切换。'
    brief={'schemaVersion':'custom-scene-brief:1','id':'scene-'+row['id'],
           'title':title[:80],'narration':text,'visualGoal':goal,
           'facts':[text[i:i+2000] for i in range(0,len(text),2000)],'materials':materials,
           'width':1920,'height':1080,'fps':30,'durationInFrames':duration}
    return {'brief':brief,'cues':cues,'scene':scene,'asset':asset,'fingerprint':fingerprint(row,asset)}

