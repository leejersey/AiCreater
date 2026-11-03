import type {SceneBrief} from './contract';

export type Cue={id:string;text:string;startFrame:number;endFrame:number};
function obj(value:unknown,keys:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('cues: expected object');
 const row=value as Record<string,unknown>;
 if(keys.some(k=>!(k in row))||Object.keys(row).some(k=>!keys.includes(k)&&!optional.includes(k)))throw Error('cues: unexpected fields');return row;
}
function str(value:unknown,max=2000):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('cues: invalid text');return value;}
function list<T>(value:unknown,parse:(v:unknown)=>T,max=30,field='list'):T[]{if(!Array.isArray(value)||!value.length||value.length>max)throw Error(`cues: invalid ${field}: expected 1..${max} items, received ${Array.isArray(value)?value.length:'non-array'}`);return value.map(parse);}
function integer(value:unknown,min:number,max:number):number{if(!Number.isInteger(value)||Number(value)<min||Number(value)>max)throw Error('cues: invalid frame or bounds');return Number(value);}
function id(value:unknown):string{const result=str(value,64);if(!/^[a-z][a-z0-9-]*$/.test(result))throw Error('cues: invalid id');return result;}
function unique(values:string[]){if(new Set(values).size!==values.length)throw Error('cues: duplicate id');}
export function parseCues(value:unknown,brief:SceneBrief):Cue[]{
 const cues=list(value,v=>{const r=obj(v,['id','text','startFrame','endFrame']);return {id:id(r.id),text:str(r.text,4000),startFrame:integer(r.startFrame,0,brief.durationInFrames-1),endFrame:integer(r.endFrame,1,brief.durationInFrames)};});
 unique(cues.map(c=>c.id));
 if(cues.map(c=>c.text).join('')!==brief.narration)throw Error('cues: cues must exactly cover narration in order');
 for(let i=0;i<cues.length;i++)if(cues[i].endFrame<=cues[i].startFrame||(i>0&&cues[i].startFrame<cues[i-1].endFrame))throw Error('cues: overlapping or empty cues');
 return cues;
}
