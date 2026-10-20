import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validProject} from './fixture';
import {parseProject, validateProject} from '../src/validate';

export function stateProject(kind='array', count=6) {
  const p=validProject();
  return {...p,scenes:[{...p.scenes[0],type:'state_diagram',structure:{kind,name:'教学结构'},
    elements:p.scenes[0].elements.map((e,i)=>({...e,items:Array.from({length:count},(_,j)=>({id:`i${j}`,key:String(j),value:'值'.repeat(16)})),active_item_ids:count?[`i${i}`]:[]}))}]};
}
const variants: [string,any,boolean][]=[];
for(const kind of ['array','object','stack']) for(const count of [0,6,7]) variants.push([`${kind}/${count}`,stateProject(kind,count),count<=6]);
function invalid(name:string,change:(p:any)=>void) {const p=stateProject();change(p);variants.push([name,p,false]);}
invalid('duplicate item',p=>p.scenes[0].elements[0].items[1].id='i0');
invalid('duplicate key',p=>p.scenes[0].elements[0].items[1].key='0');
invalid('index',p=>p.scenes[0].elements[0].items[0].key='9');
invalid('missing highlight',p=>p.scenes[0].elements[0].active_item_ids=['missing']);
invalid('repeated highlight',p=>p.scenes[0].elements[0].active_item_ids=['i0','i0']);
invalid('blank value',p=>p.scenes[0].elements[0].items[0].value=' ');
invalid('control value',p=>p.scenes[0].elements[0].items[0].value='x\t');
invalid('invisible value',p=>p.scenes[0].elements[0].items[0].value='x\u200b');
invalid('blank name',p=>p.scenes[0].structure.name=' ');
invalid('cue order',p=>p.scenes[0].elements.reverse());
invalid('animation order',p=>p.scenes[0].animations[1].start_frame=6);
invalid('old template',p=>p.scenes[0].type='card_sequence');
for(const [name,p,valid] of variants) test(`state Node/Python ${name}`,()=>{
  assert.equal(validateProject(p).length===0,valid);
  const result=spawnSync('python3',['packages/video-schema/validate.py','-'],{input:JSON.stringify(p),encoding:'utf8'});
  assert.equal(result.status,valid?0:1,result.stderr);
});
test('six item fixture parses',()=>assert.equal(parseProject(stateProject()).scenes[0].elements.length,2));
