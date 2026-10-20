import {validProject} from './fixture';

// Synthetic timing for contract tests; not a recorded physics lesson.
export function conceptProject(){
  const p=validProject(),text='开头🙂 e\u0301。惯性是物体保持原有运动状态的性质。物体都有惯性。汽车刹车时乘客身体向前倾。惯性不是一种力。';
  const contents=['惯性是物体保持原有运动状态的性质','物体都有惯性','汽车刹车时乘客身体向前倾','惯性不是一种力'];
  return {...p,scenes:[{...p.scenes[0],type:'concept',narration:{...p.scenes[0].narration,text},
    elements:contents.map((content,i)=>{const start=[...text.slice(0,text.indexOf(content))].length;return {id:`c${i}`,content,concept_role:['definition','feature','example','summary'][i],cue:{text_start:start,text_end:start+[...content].length}};}),
    animations:contents.map((_,i)=>({target:`c${i}`,effect:'fade_slide',start_frame:12+i*12,duration_frames:6})),
    captions:[{text:'概念契约测试（非真实配音）',start_frame:6,end_frame:66}]}]};
}
