import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {VideoProject} from '../../video-schema/src/types';

// Only synthetic silence: 12s per paragraph is a visual baseline, never speech alignment.
export function intentBaselineSilence(): Buffer {
  const samples=24000*12, data=Buffer.alloc(44+samples*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
  data.writeUInt32LE(24000,24);data.writeUInt32LE(48000,28);data.writeUInt16LE(2,32);
  data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples*2,40);
  return data;
}

export function intentVisualBaseline(): VideoProject {
  const parts=readFileSync(new URL('../../../examples/lessons/intent-visual-benchmark.txt',import.meta.url),'utf8').trim().split(/\n\s*\n/);
  if(parts.length!==3) throw new Error('Expected three benchmark paragraphs');
  const configs=[
    {motif:'funnel',type:'card_sequence',labels:['规则','上下文','模型']},
    {motif:'dialogue_split',type:'card_sequence',labels:['订单A','取消','先澄清']},
    {type:'flow_diagram',labels:['工具名和参数','校验参数与权限','执行工具','真实结果']},
  ] as const;
  return {
    schema_version:'1.0',video_config:{width:1920,height:1080,fps:30,language:'zh-CN'},theme:'light_teaching',
    assets:[{id:'silent',type:'audio',storage_key:'benchmark/silent-twelve.wav',checksum:createHash('sha256').update(intentBaselineSilence()).digest('hex'),duration_ms:12000}],
    scenes:configs.map((config,index)=>{
      const text=parts[index],chars=Array.from(text);
      const elements=config.labels.map((content,i)=>{
        const offset=text.indexOf(content);
        if(offset<0)throw new Error('Benchmark label must be literal source text');
        const start=Array.from(text.slice(0,offset)).length;
        return {id:`e${i}`,content,cue:{text_start:start,text_end:start+Array.from(content).length}};
      });
      return {
        id:`intent${index}`,type:config.type,...('motif' in config?{motif:config.motif}:{}),
        narration:{text,audio_asset_id:'silent',audio_start_frame:6},duration_frames:372,elements,
        animations:elements.map(e=>({target:e.id,effect:'fade_slide',start_frame:6+Math.floor(e.cue.text_start/chars.length*330),duration_frames:12})),
        captions:Array.from({length:Math.ceil(chars.length/22)},(_,i)=>({text:chars.slice(i*22,i*22+22).join(''),start_frame:6+Math.floor(i*22/chars.length*360),end_frame:6+Math.floor(Math.min(chars.length,i*22+22)/chars.length*360)})),
        ...(config.type==='flow_diagram'?{edges:elements.slice(1).map((e,i)=>({from:elements[i].id,to:e.id}))}:{})
      };
    })
  };
}
