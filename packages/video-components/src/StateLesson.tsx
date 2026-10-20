import React from 'react';
import type {Scene, Element} from '../../video-schema/src/types';
import {activeStepAtFrame} from './motion';
import {wrapText} from './layout';
import {usePalette,useVisualStyle} from './theme';
import {dedicatedPanel,dedicatedReveal} from './dedicated-style';

type Kind = NonNullable<Scene['structure']>['kind'];
export function stateBoxes(kind: Kind, items: NonNullable<Element['items']>) {
  return items.map((item,i)=>({...item,
    x: kind==='stack'?80:80+(i%2)*562,
    y: kind==='stack'?224+(5-i)*104:184+Math.floor(i/2)*232,
    width: kind==='stack'?1100:538, keyWidth: kind==='stack'?320:486, height: kind==='stack'?96:220,
    top: kind==='stack'&&i===items.length-1,
    valueLines: kind==='stack'?[item.value]:wrapText(item.value,14),
  }));
}

export function StateLesson({scene,frame}:{scene:Scene;frame:number}) {
  const step=activeStepAtFrame(scene,frame), structure=scene.structure!,p=usePalette(),style=useVisualStyle();
  const names={array:'数组',object:'对象',stack:'栈'};
  const boxes=stateBoxes(structure.kind,step?.items??[]);
  const panel=dedicatedPanel(style,p),reveal=dedicatedReveal(scene,frame,style);
  return <>
    <div style={{position:'absolute',left:80,top:136,fontSize:32}}>{names[structure.kind]} / {structure.name}</div>
    {boxes.map(box=>{
      const selected=step!.active_item_ids!.includes(box.id);
      return <div key={box.id} data-state-item={box.id} style={{...panel,left:box.x,top:box.y,width:box.width,height:box.height,borderColor:selected?p.accent:p.accent+'55',background:style.card.outline?p.background:selected?p.selected:p.card,display:structure.kind==='stack'?'flex':'block',alignItems:'center',gap:32,...reveal}}>
        <div style={{fontSize:26,lineHeight:1.3,color:p.muted,marginBottom:structure.kind==='stack'?0:8,width:structure.kind==='stack'?box.keyWidth:undefined,flexShrink:0}}>{structure.kind==='object'?box.key:`[${box.key}]`}{box.top?' · 栈顶 TOP':''}{selected?' · 当前':''}</div>
        <div style={{fontSize:32,lineHeight:1.3,whiteSpace:'pre'}}>{box.valueLines.join('\n')}</div>
      </div>;
    })}
    {!boxes.length&&<div style={{...panel,left:80,top:224,width:1100,height:180,fontSize:32}}>{step?`空${names[structure.kind]}`:'等待讲解开始'}</div>}
    <div style={{...panel,left:1220,top:184,width:620,height:280,...reveal}}>
      <div style={{fontSize:24,color:p.accent,marginBottom:16}}>当前步骤 {step?scene.elements.indexOf(step)+1:'—'} / {scene.elements.length}</div>
      <div style={{fontSize:32,lineHeight:1.3,whiteSpace:'pre'}}>{wrapText(step?.content??'等待讲解开始',16).join('\n')}</div>
    </div>
    <div style={{...panel,left:1220,top:500,width:620,height:220,fontSize:26,lineHeight:1.5}}>教学快照，不执行代码<br/>“当前”标记正在讲解的项{structure.kind==='stack'&&<><br/>TOP 是栈顶，最后进入最先取出</>}</div>
  </>;
}
