import {parseBrief} from './contract';
import {parseCues,parseDesign} from './design';
import {bindTransferComponents,transferAsset} from './transfer-component-rig';

/** A bounded host recipe, not a general model designer or a claim of visual acceptance. */
export function buildRagTransferDesign(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='brief,cues,preset')throw Error('rag_transfer: invalid preset input');
 const input=value as {brief:unknown;cues:unknown;preset:unknown};
 if(input.preset!=='rag-augmentation:1')throw Error('rag_transfer: unsupported preset');
 const brief=parseBrief(input.brief),cues=parseCues(input.cues,brief);
 if(!/\bRAG\b/i.test(brief.narration))throw Error('rag_transfer: unsupported RAG phase text');
 const phase=(pattern:RegExp)=>{
  const matches=cues.filter(c=>pattern.test(c.text.replace(/\s/g,'')));
  if(matches.length!==1)throw Error('rag_transfer: missing or ambiguous phase');return matches[0];
 };
 const retrieval=phase(/^首先[，,].*检索器.*文档.*片段/),augment=phase(/^然后[，,].*片段.*增强.*提示.*上下文/),generate=phase(/^最后[，,].*生成器.*提示.*答案/);
 if(!(retrieval.endFrame<=augment.startFrame&&augment.endFrame<=generate.startFrame))throw Error('rag_transfer: unordered phases');
 const span=augment.endFrame-augment.startFrame;
 if(span<64||generate.endFrame-generate.startFrame<12)throw Error('rag_transfer: insufficient augmentation window');
 const names=['rag-pick-a','rag-drop-a','rag-pick-b','rag-drop-b'];
 const slots=[0,1,3,4],boundary=(i:number)=>augment.startFrame+Math.floor(span*i/6);
 const motionCues=names.map((id,i)=>({id,sourceCueId:augment.id,startFrame:boundary(slots[i]),endFrame:boundary(slots[i]+1)}));
 const asset=transferAsset('head',120,100,'夹爪'),bagAsset=transferAsset('sleeve',300,280,'增强提示');
 const contact=asset.contact!,headX=500+84/2-contact.x;
 const headY=Math.min(470-contact.y,500+bagAsset.deposit!.y-contact.y,Math.min(400,500+bagAsset.bounds.y)-12-Math.max(asset.bounds.height,contact.y+80));
 const objects=[
  {id:'rag-beam',meaning:'检索器',appearance:'独立固定横梁',x:100,y:50,width:1600,height:40},
  {id:'rag-head',meaning:'夹爪',appearance:'独立移动夹爪',x:headX,y:headY,width:120,height:100},
  {id:'rag-fragment-a',meaning:'片段甲',appearance:'已检索的文档片段',x:500,y:470,width:84,height:80},
  {id:'rag-fragment-b',meaning:'片段乙',appearance:'已检索的另一文档片段',x:616,y:470,width:84,height:80},
  {id:'rag-prompt',meaning:'增强提示',appearance:'收集片段的提示袋',x:900,y:500,width:300,height:280},
  {id:'rag-generator',meaning:'生成器',appearance:'有实际开放进料通道的生成器',x:1550,y:400,width:350,height:500},
 ];
 const design=parseDesign({schemaVersion:'visual-design:1',brief,cues,objects,
  thesis:'将已检索片段逐份加入提示，再把增强提示送入生成器',metaphor:'文档片段与提示袋的独立搬运机构',
  beats:cues.map(c=>({cueId:c.id,focus:c.id===augment.id?'rag-head':c.id===generate.id?'rag-prompt':'rag-fragment-a',
   action:c.id===augment.id?'逐份拾取并装入提示袋':c.id===generate.id?'将增强提示送入生成器':'静态展示已检索的片段与机构',
   changes:[{objectId:c.id===augment.id?'rag-head':c.id===generate.id?'rag-prompt':'rag-fragment-a',from:c.id===augment.id?'片段已暂存':c.id===generate.id?'提示已装袋':'保持位置',to:c.id===augment.id?'片段已装袋':c.id===generate.id?'提示已进料':'保持位置'}]})),
  composition:'固定横梁、移动夹爪、两份片段、提示袋与开放进料通道；字幕区留空',palette:'blueprint',avoid:['不改口播和字幕时间','不宣称静态检索或答案生成已动画化'],acceptance:['分别搬运且保持材料身份','几何与音画同步须另行审阅']});
 const roles={beamId:'rag-beam',carrierId:'rag-head',sleeveId:'rag-prompt',receiverId:'rag-generator',payloadIds:['rag-fragment-a','rag-fragment-b'],motionCues,
  stages:{transfers:[{payloadId:'rag-fragment-a',pickup:names[0],handoff:names[1],retreatEndFrame:boundary(3)},{payloadId:'rag-fragment-b',pickup:names[2],handoff:names[3],retreatEndFrame:augment.endFrame}],feed:generate.id}};
 bindTransferComponents(design,roles);
 return {design,roles,origin:{schemaVersion:'transfer-recipe-origin:1',preset:'rag-augmentation:1',input:{preset:'rag-augmentation:1',brief,cues},
  phases:{retrieval:retrieval.id,augmentation:augment.id,generation:generate.id},limitations:['retrieval-static','answer-not-animated','visual-unreviewed']}};
}
