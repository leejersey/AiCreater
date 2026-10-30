import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {parseBrief} from '../src/contract';
import {parseDesign} from '../src/design';
import {designLayoutFindings} from '../src/design-layout';
import {buildDesignContentSchema,designInputHash,parseDesignContent,buildDesignContentPrompt,buildDesignContentRevisionPrompt} from '../src/design-content';

const brief=parseBrief({schemaVersion:'custom-scene-brief:1',id:'compact',title:'Flow',narration:'Move.',visualGoal:'Move a file',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60});
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const content=()=>({schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief,cues),thesis:'Move',metaphor:'File',objects:[{id:'file',meaning:'input',appearance:'folded paper',x:100,y:100,width:100,height:100,kind:'solid',states:[{id:'shown',appearance:'visible'}]}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right',fromState:'shown',toState:'shown'}]}],composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['same file'],overlaps:[]});

test('compact schema excludes host fields and assembles without mutating inputs',()=>{
 const schema=buildDesignContentSchema(brief,cues),validate=new Ajv({strict:false}).compile(schema.schema);
 assert.equal(schema.name,'visual_design_content_v1');assert.equal(validate(content()),true);
 const raw=content(),before=JSON.stringify({brief,cues,raw});
 const result=parseDesignContent(raw,brief,cues);
 const {inputSha256,schemaVersion,...visual}=raw;
 assert.deepEqual(result,parseDesign({...visual,schemaVersion:'visual-design:1',brief,cues},brief,cues));
 assert.equal(JSON.stringify({brief,cues,raw}),before);
 const prompt=buildDesignContentPrompt(brief,cues,'REFERENCE');
 assert.match(prompt,/HOST_OWNED_DESIGN_INPUT/);assert.match(prompt,/REFERENCE/);
 assert.ok(prompt.includes('OUTPUT_JSON_SCHEMA='+JSON.stringify(schema.schema)));
 assert.equal((schema.schema.properties as any).brief,undefined);assert.equal((schema.schema.properties as any).cues,undefined);
});

test('compact parser rejects host echoes, missing overlaps, changed bindings and unknown cue IDs',()=>{
 for(const mutate of [
  (v:any)=>v.brief=brief,(v:any)=>v.cues=cues,(v:any)=>delete v.overlaps,
  (v:any)=>v.inputSha256='0'.repeat(64),(v:any)=>v.schemaVersion='visual-design:1',
  (v:any)=>delete v.inputSha256,
  (v:any)=>v.beats[0].cueId='unknown',(v:any)=>v.objects[0].dataRoute=true,
 ]){const v=content();mutate(v);assert.throws(()=>parseDesignContent(v,brief,cues));}
 assert.throws(()=>parseDesignContent(content(),{...brief,title:'changed'},cues));
 assert.throws(()=>parseDesignContent(content(),brief,[{...cues[0],endFrame:53}]));
});

test('generation and revision lead with the exact required protocol header',()=>{
 const header='DESIGN_PROTOCOL_HEADER='+JSON.stringify({schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief,cues)});
 for(const prompt of [buildDesignContentPrompt(brief,cues),buildDesignContentRevisionPrompt(brief,cues,content(),'Keep the design')]){
  assert.equal(prompt.split('\n')[0],header);
  assert.match(prompt,/two protocol header fields are required/);
 }
});

test('compact assembly retains semantic and layout rejection rather than inventing fixes',()=>{
 const bad=content();bad.beats[0].changes[0].fromState='missing';assert.throws(()=>parseDesignContent(bad,brief,cues),/state/);
 const collision=content();collision.objects.push({...structuredClone(collision.objects[0]),id:'other'});
 assert.equal(designLayoutFindings(parseDesignContent(collision,brief,cues)).length,1);
 const duplicate=content();duplicate.beats.push(structuredClone(duplicate.beats[0]));assert.throws(()=>parseDesignContent(duplicate,brief,cues));
});

test('revision accepts a schema-shaped compact failure without silently repairing its state error',()=>{
 const previous=content();previous.beats[0].changes[0].fromState='missing';const before=JSON.stringify(previous);
 const prompt=buildDesignContentRevisionPrompt(brief,cues,previous,'Fix the state','unknown state','REFERENCE');
 assert.match(prompt,/RETAINED_DESIGN_REVISION/);assert.match(prompt,/"fromState":"missing"/);assert.match(prompt,/HOST_OWNED_DESIGN_INPUT/);
 assert.equal(JSON.stringify(previous),before);
 previous.inputSha256='0'.repeat(64);assert.throws(()=>buildDesignContentRevisionPrompt(brief,cues,previous,'Fix state'),/visual_design_content/);
});

test('multiple measured cues require ordered unique beats and continuous object states',()=>{
 const input={...brief,narration:'Move.Move.'},measured=[...cues,{id:'next',text:'Move.',startFrame:54,endFrame:60}];
 const v=content();v.inputSha256=designInputHash(input,measured);v.beats.push({...structuredClone(v.beats[0]),cueId:'next'});
 assert.doesNotThrow(()=>parseDesignContent(v,input,measured));
 v.beats[1].cueId='cue';assert.throws(()=>parseDesignContent(v,input,measured),/ordered beat/);v.beats[1].cueId='next';
 v.objects[0].states.push({id:'filled',appearance:'filled'});v.beats[0].changes[0].toState='filled';
 assert.throws(()=>parseDesignContent(v,input,measured),/state continuity/);
});
