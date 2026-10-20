import assert from 'node:assert/strict';
import {test} from 'node:test';
import {codeStateProject} from './code-state-fixture';
import {parseProject} from '../src/validate';

test('explicit six snapshots preserve loop values and source fields',()=>{const s=parseProject(codeStateProject()).scenes[0];assert.equal(s.code!.array_name,'nums');assert.equal(s.elements.at(-1)!.variables!.find(v=>v.name==='i')!.value,'1');assert.deepEqual(s.elements.at(-1)!.pointers,[]);});
test('array pointer, loop, unicode, field isolation and layout checks agree',()=>{parseProject(codeStateProject());for(const bad of ['pointer','duplicate','index','loop','input','legacy','value']){const p=codeStateProject(),e=p.scenes[0].elements[1];if(bad==='pointer')e.pointers[0].item_id='no';if(bad==='duplicate')e.pointers.push({...e.pointers[0]});if(bad==='index')e.array_items[0].key='1';if(bad==='loop')e.loop.current=3;if(bad==='input')e.input='a\u200bb';if(bad==='legacy')delete p.scenes[0].code.array_name;if(bad==='value')e.array_items[0].value='长'.repeat(9);assert.throws(()=>parseProject(p),bad);}});
