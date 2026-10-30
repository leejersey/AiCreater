import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {compileTeachingMotion} from '../packages/custom-scenes/src/teaching-motion';
import {TeachingMotionDiagnostic} from '../packages/custom-scenes/src/teaching-motion-diagnostic';
import {teachingStructures} from '../packages/custom-scenes/src/teaching-plan';
import {teachingExample,teachingBrief,teachingCues} from '../packages/custom-scenes/tests/fixtures/teaching-examples';

const output=path.resolve(process.argv[2]??'output/teaching-motion');await mkdir(output,{recursive:true});
const records=[];
for(const kind of teachingStructures){
 const compiled=compileTeachingMotion(teachingExample(kind),teachingBrief,teachingCues);
 const frames=[...new Set([0,30,59,90,119,...compiled.transports.flatMap(t=>[t.startFrame,t.endFrame-1])])].sort((a,b)=>a-b);
 const directory=path.join(output,kind);await mkdir(directory,{recursive:true});
 for(const frame of frames){
  const svg=renderToStaticMarkup(<TeachingMotionDiagnostic compiled={compiled} frame={frame}/>);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(directory,'frame-'+frame+'.png'),png);
  if(frame===119)await writeFile(path.join(directory,'last.svg'),svg);
 }
 await writeFile(path.join(directory,'motion.json'),JSON.stringify(compiled,null,2));
 records.push({kind,frames,motionSha256:compiled.motionSha256,transports:compiled.transports.length,residencies:compiled.residencies.length,accepted:false});
}
await writeFile(path.join(output,'validation.json'),JSON.stringify({renderer:'sharp-static-svg',accepted:false,scope:'Host example motion samples only; no continuous video, audio, container render or visual acceptance.',records},null,2));
process.stdout.write(JSON.stringify({output,structures:records.length,frames:records.reduce((n,r)=>n+r.frames.length,0),accepted:false})+'\n');
