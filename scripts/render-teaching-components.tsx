import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {TeachingComponent,teachingAsset,teachingConnector,teachingComponentVersion} from '../packages/custom-scenes/src/teaching-components';
import {sceneTheme as theme} from '../packages/custom-scenes/src/theme';

const output=path.resolve(process.argv[2]??'output/teaching-components');
const samples=[
 {kind:'document',label:'\u76f8\u5173\u4ee3\u7801',states:['waiting','selected']},
 {kind:'wallet',label:'\u4e0a\u4e0b\u6587\u9884\u7b97',states:['empty','full']},
 {kind:'classifier',label:'\u610f\u56fe\u8bc6\u522b',states:['idle','processing']},
 {kind:'loop-node',label:'\u89c2\u5bdf\u7ed3\u679c',states:['idle','complete']},
 {kind:'container',label:'\u8bc1\u636e\u7247\u6bb5',states:['empty','full']},
 {kind:'indicator',label:'\u6267\u884c\u72b6\u6001',states:['idle','active']},
] as const;
await mkdir(output,{recursive:true});
const checks=[];
for(const phase of [0,1]){
 const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={1920} height={1080} viewBox="0 0 1920 1080">
  <rect width={1920} height={1080} fill={theme.background}/>
  <text x={60} y={58} fill={theme.foreground} fontSize={28} fontFamily="sans-serif">{teachingComponentVersion+' / '+(phase?'receiving states':'initial states')}</text>
  {samples.map((sample,i)=>{
   const state=sample.states[phase],asset=teachingAsset(sample.kind,state,sample.label),x=60+(i%3)*620,y=130+Math.floor(i/3)*450;
   return <g key={i} transform={`translate(${x} ${y})`}>
    <text y={0} fill={theme.muted} fontSize={18} fontFamily="monospace">{sample.kind+' / '+state}</text>
    <g transform="translate(35 35)">
     <TeachingComponent id={'sample-'+i} kind={sample.kind} state={state} label={sample.label}>
      {phase&&asset.receiving?<g transform={`translate(${asset.receiving.x+24} ${asset.receiving.y+12}) scale(0.7)`}><TeachingComponent id={'payload-'+i} kind="document" state="selected" label={'\u6709\u6548\u4fe1\u606f'}/></g>:undefined}
     </TeachingComponent>
     {Object.entries(asset.ports).map(([name,p])=><g key={name}><circle cx={p.x} cy={p.y} r={3} fill={theme.secondary}/><text x={p.x+6} y={p.y-8} fontFamily="monospace" fontSize={12} fill={theme.secondary}>{name}</text></g>)}
    </g>
   </g>;
  })}
  <path d={teachingConnector([{x:60,y:1030},{x:800,y:1030},{x:800,y:1005},{x:1840,y:1005}]).d} stroke={theme.accent} fill="none" strokeWidth={2}/>
 </svg>);
 const name=phase?'receiving':'initial';
 const png=await sharp(Buffer.from(svg)).png().toBuffer();
 const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<samples.length;i++){
  const x0=60+(i%3)*620,y0=130+Math.floor(i/3)*450;let colored=0;
  for(let y=y0+30;y<y0+360;y++)for(let x=x0+25;x<x0+480;x++){
   const offset=(y*info.width+x)*info.channels;
   if(data[offset]>90||data[offset+1]>90||data[offset+2]>110)colored++;
  }
  if(colored<400)throw Error('Blank component raster: '+samples[i].kind);
  checks.push({phase:name,component:samples[i].kind,nonBackgroundPixels:colored});
 }
 await writeFile(path.join(output,name+'.svg'),svg);
 await writeFile(path.join(output,name+'.png'),png);
}
await writeFile(path.join(output,'validation.json'),JSON.stringify({version:teachingComponentVersion,renderer:'sharp-static-svg',accepted:false,scope:'Component artwork only; no container, video or scene compiler acceptance.',checks},null,2));
process.stdout.write(JSON.stringify({output,checks:checks.length,accepted:false})+'\n');
