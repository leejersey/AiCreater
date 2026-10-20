import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validProject} from './fixture';
import {validateProject} from '../src/validate';
export function timelineProject() {
 const p=validProject();
 return {...p,scenes:[{...p.scenes[0],type:'execution_timeline',timeline:{duration_ms:200,lanes:[{id:'a',label:'任务甲'},{id:'b',label:'任务乙'}]},elements:p.scenes[0].elements.map((e,i)=>({...e,event:{lane_id:i?'b':'a',start_ms:0,end_ms:100,phase:i?'wait':'execute'}}))}]};
}
const cases:[string,any,boolean][]=[['cross lane overlap',timelineProject(),true]];
const adjacent=timelineProject();adjacent.scenes[0].timeline.lanes.pop();adjacent.scenes[0].elements[1].event={lane_id:'a',start_ms:100,end_ms:200,phase:'execute'};cases.push(['adjacent',adjacent,true]);
function bad(name:string,f:(p:any)=>void){const p=timelineProject();f(p);cases.push([name,p,false]);}
bad('same lane overlap',p=>{p.scenes[0].timeline.lanes.pop();p.scenes[0].elements[1].event.lane_id='a';});
bad('unknown lane',p=>p.scenes[0].elements[0].event.lane_id='x');
bad('duplicate lane',p=>p.scenes[0].timeline.lanes[1].id='a');
bad('empty lane',p=>p.scenes[0].timeline.lanes.push({id:'c',label:'未使用'}));
bad('four lanes',p=>p.scenes[0].timeline.lanes.push({id:'c',label:'c'},{id:'d',label:'d'}));
bad('no lanes',p=>p.scenes[0].timeline.lanes=[]);
bad('blank label',p=>p.scenes[0].timeline.lanes[0].label=' ');
bad('invisible label',p=>p.scenes[0].timeline.lanes[0].label='x\u200b');
bad('negative',p=>p.scenes[0].elements[0].event.start_ms=-1);
bad('zero duration',p=>p.scenes[0].elements[0].event.end_ms=0);
bad('outside axis',p=>p.scenes[0].elements[0].event.end_ms=201);
bad('fraction',p=>p.scenes[0].elements[0].event.end_ms=1.5);
bad('boolean',p=>p.scenes[0].elements[0].event.end_ms=true);
bad('phase',p=>p.scenes[0].elements[0].event.phase='parallel');
bad('axis limit',p=>p.scenes[0].timeline.duration_ms=3600001);
bad('cue order',p=>p.scenes[0].elements.reverse());
bad('frame order',p=>p.scenes[0].animations[1].start_frame=6);
bad('old template',p=>p.scenes[0].type='card_sequence');
bad('mixed state',p=>p.scenes[0].structure={kind:'array',name:'x'});
for(const [name,p,valid] of cases) test(`timeline Node/Python ${name}`,()=>{
 assert.equal(validateProject(p).length===0,valid);
 const r=spawnSync('python3',['packages/video-schema/validate.py','-'],{input:JSON.stringify(p),encoding:'utf8'});
 assert.equal(r.status,valid?0:1,r.stderr);
});
