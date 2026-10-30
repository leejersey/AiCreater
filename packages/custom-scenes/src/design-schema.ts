import type {SceneBrief,ModelOptions} from './contract';
import type {Cue} from './design';
import Ajv from 'ajv';

export const maxVisualObjects=20;
type Schema=Record<string,unknown>;
const text:Schema={type:'string',minLength:1,maxLength:2000,pattern:'\\S'};
const id:Schema={type:'string',maxLength:64,pattern:'^[a-z][a-z0-9-]*$'};
const integer=(min:number,max:number):Schema=>({type:'integer',minimum:min,maximum:max});
const array=(items:Schema,min:number,max:number):Schema=>({type:'array',items,minItems:min,maxItems:max});
const object=(properties:Record<string,Schema>,required=Object.keys(properties)):Schema=>({type:'object',properties,required,additionalProperties:false});

/** New provider output contract; historical designs still use the compatibility parser. */
export function buildDesignOutputSchema(brief:SceneBrief,cues:Cue[]):NonNullable<ModelOptions['outputSchema']>{
 const state=object({id,appearance:text});
 const visualObject=object({id,meaning:text,appearance:text,x:integer(0,1919),y:integer(0,1079),width:integer(1,1920),height:integer(1,1080),kind:{type:'string',enum:['solid','path','label']},parentId:{anyOf:[id,{type:'null'}]},states:array(state,1,8)},['id','meaning','appearance','x','y','width','height','kind','states']);
 const change=object({objectId:id,from:text,to:text,fromState:id,toState:id});
 const beat=object({cueId:id,focus:id,action:text,changes:array(change,1,20)});
 const overlap=object({a:id,b:id,reason:{...text,maxLength:500}});
 return {name:'visual_design_v1',schema:object({
  schemaVersion:{type:'string',enum:['visual-design:1']},
  brief:{type:'object',enum:[brief]},cues:{type:'array',enum:[cues]},
  thesis:text,metaphor:text,objects:array(visualObject,1,maxVisualObjects),beats:array(beat,cues.length,cues.length),
  composition:text,palette:{type:'string',enum:['blueprint']},avoid:array(text,1,30),acceptance:array(text,1,30),overlaps:array(overlap,0,40),
 })};
}

export function assertRevisionShape(value:unknown,brief:SceneBrief,cues:Cue[]):void{
 const validate=new Ajv({strict:false}).compile(buildDesignOutputSchema(brief,cues).schema);
 if(!validate(value))throw Error('visual_design: revision input schema mismatch; no request dispatched');
}
