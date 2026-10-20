import type {VideoProject} from '../../../packages/video-schema/src/types';
import {formSteps,type DraftScene,type Project} from './editor';

type FieldValue = {label:'口播'|'代码'|'连线';before:string|null;after:string|null};
export type ChangeSummary = {themeChanged:boolean; scenes:{id:string; type:string; kind:'added'|'removed'|'changed'; beforePosition?:number; afterPosition?:number; changes:string[]; values?:FieldValue[]}[]};

function ordered(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)]));
  return value;
}
function fields(scene:DraftScene):Record<string,unknown> {
  return {'类型':scene.type,'口播':scene.narration.text,'代码':scene.code??null,'步骤':scene.elements,
    '连线':(scene.edges??[]).map(e=>JSON.stringify([e.from,e.to])).sort(),
    '数据结构':scene.structure??null,'执行时间线':scene.timeline??null,'图表':scene.chart??null};
}

function fieldText(scene:DraftScene,label:FieldValue['label']):string|null {
  if(label==='口播')return scene.narration.text;
  if(label==='连线')return JSON.stringify((scene.edges??[]).map(({from,to})=>({from,to})),null,2);
  if(!scene.code)return null;
  const {language,source,array_name}=scene.code;
  return JSON.stringify({language,source,array_name},null,2);
}

export function sceneTeachingChanges(before:DraftScene,after:DraftScene):Pick<ChangeSummary['scenes'][number],'changes'|'values'> {
  const a=fields(before),b=fields(after),changes:string[]=[],values:FieldValue[]=[];
  for(const label of Object.keys(a))if(JSON.stringify(ordered(a[label]))!==JSON.stringify(ordered(b[label])))changes.push(label);
  for(const label of changes)if(label==='口播'||label==='代码'||label==='连线')values.push({label,before:fieldText(before,label),after:fieldText(after,label)});
  return {changes,...(values.length?{values}:{})};
}

export function compareSavedVersion(old:VideoProject,value:unknown,projectId:string):{revision:number;summary:ChangeSummary} {
  const invalid=()=>new Error('已保存稿格式错误，原比较结果与输入保留，请手动重试。');
  const current=value as Project;
  try{
    if(!current||typeof current!=='object'||Array.isArray(current)||current.id!==projectId||!Number.isSafeInteger(current.revision)||current.revision<1||
      !current.config||typeof current.config!=='object'||Array.isArray(current.config)||(current.config.theme!==undefined&&typeof current.config.theme!=='string')||!Array.isArray(current.scenes))throw invalid();
    for(const row of current.scenes){
      const scene=row?.scene;
      if(!scene||typeof scene!=='object'||Array.isArray(scene)||typeof scene.id!=='string'||!scene.id.trim()||typeof scene.type!=='string'||!scene.type.trim()||typeof scene.narration?.text!=='string'||
        (scene.code!=null&&(typeof scene.code!=='object'||Array.isArray(scene.code)||typeof scene.code.language!=='string'||typeof scene.code.source!=='string'||(scene.code.array_name!==undefined&&typeof scene.code.array_name!=='string')))||
        (scene.edges!==undefined&&(!Array.isArray(scene.edges)||scene.edges.some(e=>!e||typeof e.from!=='string'||typeof e.to!=='string'))))throw invalid();
      formSteps(JSON.stringify(scene.elements));
    }
    return {revision:current.revision,summary:summarizeVersionChanges(old,current)};
  }catch{throw invalid();}
}

export function summarizeVersionChanges(old:VideoProject,current:Project):ChangeSummary {
  const before=old.scenes,after=current.scenes.map(row=>row.scene);
  const oldMap=new Map(before.map((s,i)=>[s.id,{scene:s,position:i+1}]));
  const newMap=new Map(after.map((s,i)=>[s.id,{scene:s,position:i+1}]));
  if(oldMap.size!==before.length||newMap.size!==after.length)throw new Error('场景编号重复，无法可靠比较。');
  const oldCommon=before.filter(s=>newMap.has(s.id)).map(s=>s.id);
  const newCommon=after.filter(s=>oldMap.has(s.id)).map(s=>s.id);
  const scenes:ChangeSummary['scenes']=[];
  for(const scene of after){
    const prior=oldMap.get(scene.id),position=newMap.get(scene.id)!.position;
    if(!prior){scenes.push({id:scene.id,type:scene.type,kind:'added',afterPosition:position,changes:[]});continue;}
    const changes:string[]=[];
    if(oldCommon.indexOf(scene.id)!==newCommon.indexOf(scene.id))changes.push('顺序');
    const summary=sceneTeachingChanges(prior.scene,scene);
    changes.push(...summary.changes);
    if(changes.length)scenes.push({...summary,id:scene.id,type:scene.type,kind:'changed',beforePosition:prior.position,afterPosition:position,changes});
  }
  for(const scene of before)if(!newMap.has(scene.id))scenes.push({id:scene.id,type:scene.type,kind:'removed',beforePosition:oldMap.get(scene.id)!.position,changes:[]});
  return {themeChanged:(old.theme??'tech_explainer')!==(current.config.theme??'tech_explainer'),scenes};
}
