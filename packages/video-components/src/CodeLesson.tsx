import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {wrapText} from './layout';
import {usePalette,useVisualStyle} from './theme';
import {dedicatedPanel,dedicatedReveal} from './dedicated-style';
import {CodeStateLesson} from './CodeStateLesson';

export const codeFont = 'monospace, "Noto Sans SC"';
export {activeStepAtFrame} from './motion';
import {activeStepAtFrame} from './motion';

export function CodeLesson({scene, frame}: {scene: Scene; frame: number}) {
  const step = activeStepAtFrame(scene, frame), p=usePalette(),style=useVisualStyle();
  if(scene.code!.array_name!==undefined)return <CodeStateLesson scene={scene} frame={frame}/>;
  const panel=dedicatedPanel(style,p),reveal=dedicatedReveal(scene,frame,style);
  return <>
    <div style={{...panel, left: 80, top: 150, width: 1100, height: 720}}>
      <div style={{fontSize: 26, color: p.muted, marginBottom: 24}}>{scene.code!.language.toUpperCase()} / 代码讲解</div>
      {scene.code!.source.split('\n').map((line, i) => <div key={i} data-code-line={i + 1} style={{display: 'flex', height: 36, alignItems: 'center', borderRadius: 6, background: step?.code_lines?.includes(i + 1) ? p.accent+'25' : 'transparent', borderLeft: `4px solid ${step?.code_lines?.includes(i + 1) ? p.accent : 'transparent'}`, fontFamily: codeFont, fontSize: 32, lineHeight: '32px', whiteSpace: 'pre'}}>
        <span style={{width: 48, flexShrink: 0, textAlign: 'right', marginRight: 20, color: p.muted}}>{i + 1}</span><span>{line || ' '}</span>
      </div>)}
    </div>
    <div style={{...panel, left: 1220, top: 150, width: 620, height: 180,...reveal}}>
      <div style={{color: p.accent, fontSize: 24, marginBottom: 12}}>当前步骤 {step ? scene.elements.indexOf(step) + 1 : '—'} / {scene.elements.length}</div>
      <div style={{fontSize: 32, lineHeight: 1.25, whiteSpace: 'pre'}}>{wrapText(step?.content ?? '等待讲解开始', 16).join('\n')}</div>
    </div>
    <div style={{...panel, left: 1220, top: 350, width: 620, height: 280,...reveal}}>
      <div style={{color: p.muted, fontSize: 24, marginBottom: 12}}>变量状态（教学快照）</div>
      {step?.variables?.map(v => <div key={v.name} style={{height: 62, fontSize: 24}}><div style={{fontSize: 24, color: p.muted}}>{v.name}</div><div>{v.value}</div></div>)}
    </div>
    <div style={{...panel, left: 1220, top: 650, width: 620, height: 220,...reveal}}>
      <div style={{color: p.muted, fontSize: 24, marginBottom: 20}}>输出 / 结果</div>
      <div style={{fontSize: 24, lineHeight: 1.4, whiteSpace: 'pre'}}>{wrapText(step?.output || '（尚无输出）', 22).join('\n')}</div>
    </div>
  </>;
}
