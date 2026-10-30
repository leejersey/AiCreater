import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parseBrief} from './contract';
import {parseCues} from './design';
import {designInputHash} from './design-content';
import {freezeTeachingScene,validateTeachingArtifact} from './teaching-artifact';

/** Recompile existing semantics against a measured track; never stretch serialized motion. */
export async function retimeTeachingScene(value:unknown,expectedSha256:string,targetBrief:unknown,targetCues:unknown){
 const source=await validateTeachingArtifact(value,expectedSha256),brief=parseBrief(targetBrief),cues=parseCues(targetCues,brief);
 const {durationInFrames:oldDuration,...before}=source.brief,{durationInFrames:newDuration,...after}=brief;
 if(!isDeepStrictEqual(before,after)||!isDeepStrictEqual(source.cues.map(({id,text})=>({id,text})),cues.map(({id,text})=>({id,text}))))throw Error('teaching_retime: content or cue identity changed');
 const plan={...source.compiled.plan,inputSha256:designInputHash(brief,cues)};
 const artifact=await freezeTeachingScene(plan,brief,cues,source.layoutVariant);
 const {inputSha256,...semantics}=source.compiled.plan;
 return {schemaVersion:'teaching-retime:1' as const,sourceArtifactSha256:source.artifactSha256,
  semanticSha256:createHash('sha256').update(JSON.stringify(semantics)).digest('hex'),artifact,
  modelCalls:0 as const,accepted:false as const,execution:'not-run' as const};
}
