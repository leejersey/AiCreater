import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {validateProject} from '../src/validate';
import {imageProject} from './images-fixture';
function accepts(p: unknown) {
  const result=spawnSync('python3',['packages/video-schema/validate.py','-'],{input:JSON.stringify(p),encoding:'utf8'});
  assert.ok(result.status===0||result.status===1,result.stderr);
  return result.status===0;
}
test('TS/Python accept image assets bound to narrated elements, including JPEG',()=>{
  for(const extension of ['png','jpg','jpeg']) {
    const p=imageProject();p.assets[1].storage_key=`images/toolbox.${extension}`;
    assert.deepEqual(validateProject(p),[]);assert.equal(accepts(p),true);
  }
});
const invalid: [string,(p:ReturnType<typeof imageProject>)=>void][]=[
  ['missing asset',p=>{p.scenes[0].images[0].asset_id='missing';}],
  ['audio used as image',p=>{p.scenes[0].images[0].asset_id=p.assets[0].id;}],
  ['image used as audio',p=>{p.scenes[0].narration.audio_asset_id='toolbox';}],
  ['missing target',p=>{p.scenes[0].images[0].element_id='missing';}],
  ['duplicate target',p=>{p.scenes[0].images.push({...p.scenes[0].images[0]});}],
  ['more than two images',p=>{p.scenes[0].images.push({...p.scenes[0].images[0]},{...p.scenes[0].images[0]});}],
  ['too many elements for image composition',p=>{for(let i=0;i<3;i++){p.scenes[0].elements.push({...p.scenes[0].elements[0],id:'extra'+i});p.scenes[0].animations.push({...p.scenes[0].animations[0],target:'extra'+i});}}],
  ['unsupported scene',p=>{p.scenes[0].type='flow_diagram';Object.assign(p.scenes[0],{edges:[]});}],
  ['unsupported motif',p=>{Object.assign(p.scenes[0],{motif:'means_row'});}],
  ['blank alt',p=>{p.scenes[0].images[0].alt='  ';}],
  ['invisible alt',p=>{p.scenes[0].images[0].alt='图\u200b';}],
  ['audio path for image',p=>{p.assets[1].storage_key='images/fake.wav';}],
  ['remote image path',p=>{p.assets[1].storage_key='https://example.com/fake.png';}],
  ['image has audio duration',p=>{Object.assign(p.assets[1],{duration_ms:100});}],
  ['image pixel budget',p=>{Object.assign(p.assets[1],{width:4096,height:4096});}],
  ['image dimension limit',p=>{Object.assign(p.assets[1],{width:8192});}],
];
for(const [name,mutate] of invalid)test(`TS/Python reject image: ${name}`,()=>{
  const p=imageProject();mutate(p);assert.ok(validateProject(p).length,name);assert.equal(accepts(p),false,name);
});
