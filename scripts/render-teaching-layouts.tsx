import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {buildTeachingLayout,compileTeachingBodyRoute} from '../packages/custom-scenes/src/teaching-layout';
import {teachingStructures} from '../packages/custom-scenes/src/teaching-plan';
import {TeachingComponent} from '../packages/custom-scenes/src/teaching-components';
import {sceneTheme as theme} from '../packages/custom-scenes/src/theme';
import {teachingExample,teachingBrief,teachingCues} from '../packages/custom-scenes/tests/fixtures/teaching-examples';
import {evaluateMotion} from '../packages/custom-scenes/src/motion-plan';

const output=path.resolve(process.argv[2]??'output/teaching-layouts');
await mkdir(output,{recursive:true});
const records=[];
for(const structure of teachingStructures){
 const plan=teachingExample(structure),layout=buildTeachingLayout(plan,teachingBrief,teachingCues);
 const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={1920} height={1080}>
  <rect width={1920} height={1080} fill={theme.background}/>
  <text x={80} y={80} fontFamily="sans-serif" fontSize={32} fill={theme.foreground}>{structure+' / static layout diagnostic'}</text>
  <rect {...layout.stage} fill="none" stroke={theme.muted} strokeWidth={1} strokeDasharray="8 12"/>
  {layout.objects.map(o=>{
   const source=plan.objects.find(p=>p.id===o.id)!;
   return <g key={o.id} transform={`translate(${o.bounds.x} ${o.bounds.y})`}>
    <TeachingComponent id={o.id} kind={o.component} state={source.initialState} label={source.label}/>
   </g>;
  })}
  <text x={80} y={1030} fontFamily="sans-serif" fontSize={20} fill={theme.secondary}>Not a video / docking and scene motion pending</text>
 </svg>);
 const png=await sharp(Buffer.from(svg)).png().toBuffer();
 const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(const o of layout.objects){
  let visible=0;
  for(let y=Math.ceil(o.bounds.y);y<Math.floor(o.bounds.y+o.bounds.height);y++)for(let x=Math.ceil(o.bounds.x);x<Math.floor(o.bounds.x+o.bounds.width);x++){
   const i=(y*info.width+x)*info.channels;if(data[i]>90||data[i+1]>90||data[i+2]>110)visible++;
  }
  if(visible<100)throw Error('Blank layout object: '+structure+'/'+o.id);
 }
 await writeFile(path.join(output,structure+'.svg'),svg);
 await writeFile(path.join(output,structure+'.png'),png);
 await writeFile(path.join(output,structure+'.json'),JSON.stringify(layout,null,2));
 records.push({structure,objects:layout.objects.length,layoutSha256:layout.layoutSha256,renderable:false});
}
const request={stage:{x:0,y:0,width:700,height:500},body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[{x:260,y:100,width:130,height:250}],clearance:12};
const compiled=compileTeachingBodyRoute(request,{objectId:'cargo',startFrame:10,endFrame:100,durationInFrames:120});
for(const frame of [0,40,70,119]){
 const p=evaluateMotion(compiled.motion,frame).cargo;
 const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={700} height={500}>
  <rect width={700} height={500} fill={theme.background}/>
  {request.obstacles.map((b,i)=><rect key={i} {...b} fill={theme.muted} fillOpacity={0.3} stroke={theme.secondary}/>)}
  <path d={compiled.route.d} fill="none" stroke={theme.accent} strokeWidth={2}/>
  <rect x={p.x} y={p.y} {...request.body} fill={theme.background} stroke={theme.foreground} strokeWidth={2}/>
  <text x={24} y={470} fill={theme.foreground} fontFamily="sans-serif" fontSize={18}>{'AABB cargo / frame '+frame+' / diagnostic only'}</text>
 </svg>);
 await writeFile(path.join(output,'route-'+frame+'.png'),await sharp(Buffer.from(svg)).png().toBuffer());
}
await writeFile(path.join(output,'route-motion.json'),JSON.stringify(compiled,null,2));
await writeFile(path.join(output,'validation.json'),JSON.stringify({accepted:false,renderer:'sharp-static-svg',records,motionSha256:compiled.motionSha256,scope:'Static layouts plus one synthetic AABB external route; no docking, scene animation or container render.'},null,2));
process.stdout.write(JSON.stringify({output,layouts:records.length,routeFrames:4,accepted:false})+'\n');
