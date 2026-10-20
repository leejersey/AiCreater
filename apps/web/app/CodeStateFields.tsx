'use client';
import {useState} from 'react';
import type {Element} from '../../../packages/video-schema/src/types';
import {codeStateFields} from '../lib/editor';
type Fields=Pick<Element,'array_items'|'pointers'|'loop'|'input'>;
export function CodeStateFields({step,index,disabled,text,onText,change,onInvalid,onDirty}:{step:Element;index:number;disabled:boolean;text?:string;onText:(text:string)=>void;change:(v:Fields)=>boolean;onInvalid:(v:boolean)=>void;onDirty:()=>void}){
  const [error,setError]=useState('');
  return <><label>步骤 {index+1} 数组 / 指针 / 轮次 / 输入快照 JSON<textarea className="code" disabled={disabled} rows={12} spellCheck={false} value={text??JSON.stringify({array_items:step.array_items,pointers:step.pointers,loop:step.loop,input:step.input},null,2)} onChange={e=>{
    onText(e.target.value);onDirty();
    try {const v=codeStateFields(e.target.value);if(!change(v))throw new Error('Invalid state fields');setError('');onInvalid(false);}
    catch {setError('快照JSON或字段类型不正确；原输入保留，请修正后保存。');onInvalid(true);}
  }}/></label>{error&&<p role="alert" className="error-text">{error}</p>}<p className="hint">array_items: [&#123;id,key（0起连续索引）,value&#125;]；pointers: [&#123;name,item_id&#125;]；loop: null 或 &#123;current,total&#125;；input: 字符串。值是明确填写的教学快照，不会执行代码。空数组、无指针用 []；不得引用已不存在的项。</p></>;
}
