import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {parseBrief,type SceneBrief} from './contract';
import {parseCues,type Cue} from './design';
import {compileTeachingMotion} from './teaching-motion';
import {sceneTheme} from './theme';
import postcss from 'postcss';
import type {TeachingLayoutVariant} from './teaching-layout';
import {teachingTitleLayout} from './teaching-components';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bytesHash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const fail=(message:string):never=>{throw Error('teaching_artifact: '+message);};
export const teachingRuntimeFiles=['teaching-scene.tsx','teaching-scene-audit.ts','motion-plan.ts','geometry-audit.ts','teaching-components.tsx','teaching-capabilities.ts','teaching-motion.ts','teaching-layout.ts','teaching-schedule.ts','teaching-plan.ts','teaching-artifact.ts','teaching-render.ts','teaching-render-policy.ts','teaching-render-recovery.ts'] as const;
export async function teachingRuntimeSnapshot(){
 const runtime=[];
 for(const name of teachingRuntimeFiles){const bytes=await readFile(new URL(name,import.meta.url));runtime.push({name,bytes,sha256:bytesHash(bytes)});}
 const fontRoot=path.dirname(fileURLToPath(import.meta.resolve('@fontsource/noto-sans-sc/400.css')));
 const names=['400.css',...(await readdir(path.join(fontRoot,'files'))).filter(n=>/^noto-sans-sc-[a-z0-9-]+-400-normal\.woff2?$/.test(n)).sort().map(n=>'files/'+n)];
 if(names.length<3||names.length>500)fail('Invalid installed font manifest');
 const fonts=[];
 for(const name of names){const bytes=await readFile(path.join(fontRoot,name));fonts.push({name,bytes,sha256:bytesHash(bytes)});}
 return {runtime,fonts};
}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export async function freezeTeachingScene(value:unknown,input:SceneBrief,inputCues:Cue[],layoutVariant:TeachingLayoutVariant='default'){
 const brief=parseBrief(input),cues=parseCues(inputCues,brief),compiled=compileTeachingMotion(value,brief,cues,layoutVariant);
 const snapshot=await teachingRuntimeSnapshot();
 const ranges:{from:number;to:number}[]=[];
 postcss.parse(snapshot.fonts.find(f=>f.name==='400.css')!.bytes.toString()).walkAtRules('font-face',rule=>{
  rule.walkDecls('unicode-range',decl=>{for(const item of decl.value.split(',')){
   const match=/^U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(item.trim());
   if(!match)fail('Unsupported bound font unicode range');
   ranges.push({from:parseInt(match![1],16),to:parseInt(match![2]??match![1],16)});
  }});
 });
 const renderedText=brief.title+compiled.objects.map(o=>o.asset.text.lines.join('')).join('');
 for(const glyph of Array.from(renderedText)){
  const point=glyph.codePointAt(0)!;
  if(!/^[\x20-\x7e\u3000-\u303f\u3400-\u9fff\uff01-\uff60]$/u.test(glyph)||!ranges.some(r=>point>=r.from&&point<=r.to))fail('Unbound rendered glyph U+'+point.toString(16).toUpperCase());
 }
 const packages=[];
 for(const name of ['react','remotion','@remotion/renderer','@remotion/bundler','postcss']){
  const data=JSON.parse(await readFile(fileURLToPath(import.meta.resolve(name+'/package.json')),'utf8'));packages.push({name,version:data.version as string});
 }
 const binding={theme:{...sceneTheme},runtime:snapshot.runtime.map(({name,sha256})=>({name,sha256})),fonts:snapshot.fonts.map(({name,sha256})=>({name,sha256})),fontCoverageSha256:digest(ranges),packages};
 const data={schemaVersion:'teaching-scene-artifact:2',layoutVariant,brief,cues,titleLayout:teachingTitleLayout(brief.title),compiled,binding,audio:'none' as const,eligibility:'local-preview-only' as const,accepted:false as const};
 return freeze({...data,artifactSha256:digest(data)});
}
export type TeachingArtifact=Awaited<ReturnType<typeof freezeTeachingScene>>;

/** Rebuild the trusted compilation; never execute or trust serialized artwork from a caller. */
export async function validateTeachingArtifact(value:unknown,expectedSha256:string):Promise<TeachingArtifact>{
 if(!/^[a-f0-9]{64}$/.test(expectedSha256))return fail('Invalid expected binding');
 try{
  const bytes=JSON.stringify(value);if(!bytes||Buffer.byteLength(bytes)>8*1024*1024)return fail('Artifact exceeds bounded JSON data');
  const input=value as TeachingArtifact;
  if(input?.schemaVersion!=='teaching-scene-artifact:2'||!['default','upper','lower'].includes(input.layoutVariant))return fail('Unsupported artifact version or host layout variant');
  if(input?.artifactSha256!==expectedSha256)return fail('Artifact binding mismatch');
  const rebuilt=await freezeTeachingScene(input.compiled.plan,input.brief,input.cues,input.layoutVariant);
  if(rebuilt.artifactSha256!==expectedSha256||!isDeepStrictEqual(rebuilt,value))return fail('Frozen data, runtime or font binding mismatch');
  return rebuilt;
 }catch(error){if(error instanceof Error&&error.message.startsWith('teaching_artifact:'))throw error;return fail('Invalid frozen scene data');}
}
