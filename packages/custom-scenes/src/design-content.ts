import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {parseBrief,type SceneBrief} from './contract';
import {parseCues,parseDesign,buildDesignPrompt,buildDesignRevisionPrompt,type Cue,type VisualDesign} from './design';
import {buildDesignOutputSchema} from './design-schema';

export function designInputHash(brief:SceneBrief,cues:Cue[]):string{
 const canonical=parseBrief(brief),measured=parseCues(cues,canonical);
 return createHash('sha256').update(JSON.stringify({brief:canonical,cues:measured})).digest('hex');
}

export function buildDesignContentSchema(brief:SceneBrief,cues:Cue[]){
 const original=buildDesignOutputSchema(brief,cues).schema;
 const {brief:unusedBrief,cues:unusedCues,...visual}=original.properties as Record<string,any>;
 const beat=visual.beats.items;
 const properties={...visual,schemaVersion:{type:'string',enum:['visual-design-content:1']},
  inputSha256:{type:'string',enum:[designInputHash(brief,cues)]},
  beats:{...visual.beats,items:{...beat,properties:{...beat.properties,cueId:{type:'string',enum:cues.map(c=>c.id)}}}},
 };
 return {name:'visual_design_content_v1',schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
}

/** Only the host restores factual and timing input; no missing visual field is inferred. */
function restoreDesignContent(value:unknown,brief:SceneBrief,cues:Cue[]){
 const validate=new Ajv({allErrors:true,strict:false}).compile(buildDesignContentSchema(brief,cues).schema);
 if(!validate(value))throw Error('visual_design_content: schema mismatch; '+(validate.errors??[]).slice(0,8).map(e=>`${e.instancePath||'/'} ${e.message}`).join('; '));
 const {schemaVersion,inputSha256,...visual}=value as Record<string,unknown>;
 return {...visual,schemaVersion:'visual-design:1',brief:parseBrief(brief),cues:parseCues(cues,brief)};
}
export function parseDesignContent(value:unknown,brief:SceneBrief,cues:Cue[]):VisualDesign{
 return parseDesign(restoreDesignContent(value,brief,cues),brief,cues);
}

const hostNotice='HOST_OWNED_DESIGN_INPUT: The two protocol header fields are required at the root: schemaVersion and inputSha256, with the exact values shown in DESIGN_PROTOCOL_HEADER and OUTPUT_JSON_SCHEMA. They are NOT optional visual fields. In addition to this header, return visual fields only, including explicit overlaps and one beat per supplied cue ID. BRIEF and MEASURED_CUES are host-owned reference input, not response fields. Do not echo or alter their text, timing, canvas or facts. Missing header or visual fields are errors, never defaults.';
const protocolHeader=(brief:SceneBrief,cues:Cue[])=>'DESIGN_PROTOCOL_HEADER='+JSON.stringify({schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief,cues)});
export function buildDesignContentPrompt(brief:SceneBrief,cues:Cue[],reference?:string):string{
 return `${protocolHeader(brief,cues)}\n${buildDesignPrompt(brief,cues,reference,buildDesignContentSchema(brief,cues))}\n${hostNotice}`;
}
export function buildDesignContentRevisionPrompt(brief:SceneBrief,cues:Cue[],previous:unknown,feedback:string,diagnostic='',reference?:string):string{
 const full=previous&&typeof previous==='object'&&(previous as {schemaVersion?:unknown}).schemaVersion==='visual-design-content:1'?restoreDesignContent(previous,brief,cues):previous;
 return `${protocolHeader(brief,cues)}\n${buildDesignRevisionPrompt(brief,cues,full,feedback,diagnostic,reference,buildDesignContentSchema(brief,cues))}\n${hostNotice}`;
}
