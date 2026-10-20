import type {Scene} from '../../../packages/video-schema/src/types';
export function chartPayload(text:string,confirmed:boolean){
  if(confirmed!==true)throw new Error('请先确认数字、来源和触发位置；不允许模型补数。');
  const body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['chart','elements'].includes(k))||!body.chart||typeof body.chart!=='object'||Array.isArray(body.chart)||!Array.isArray(body.elements))throw new Error('请提供chart和elements两个字段。');
  return {chart:{...body.chart,confirmed:true},elements:body.elements,confirmed:true};
}
export function chartStarter(scene:Pick<Scene,'elements'|'chart'>):string{
  const elements=scene.elements.map(e=>({id:e.id,content:e.content,cue:e.cue}));
  const chart=scene.chart?{...scene.chart,confirmed:false}:{kind:'bar',title:'请填写标题',unit:'请填写单位',source_note:'请填写真实来源',confirmed:false,data:elements.map(e=>({element_id:e.id,label:'请填写类别',values:[null]}))};
  return JSON.stringify({chart,elements},null,2);
}
