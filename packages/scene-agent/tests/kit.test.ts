import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkSource} from '../../custom-scenes/src/contract';
import {SourceTypecheckError,typecheckSource} from '../../custom-scenes/src/files';
import {currentKit,usesKit} from '../../custom-scenes/src/kit';
import {createWorkspace,KIT_FILE,WorkspaceError} from '../src/workspace';

const here=path.dirname(fileURLToPath(import.meta.url));
const skill=(name:string)=>readFile(path.join(here,'../skill',name+'.md'),'utf8');
const PROPS='{frame:number;fps:number;width:number;height:number;timing:{durationInFrames:number;cues:{start:number;end:number}[]};theme:{background:string;surface:string;surface2:string;foreground:string;muted:string;faint:string;rule:string;accent:string;accentSoft:string;secondary:string;positive:string;negative:string;fontDisplay:string;fontBody:string;fontMono:string;radius:number;ruleWidth:number;ruleDash:string;dark:boolean}}';
const brief={schemaVersion:'custom-scene-brief:1',id:'demo',title:'演示',narration:'第一句。第二句。',visualGoal:'g',facts:['f'],materials:['m'],width:1920,height:1080,fps:30,durationInFrames:120};

/** The example scene in skill/kit.md, with its props type spelled out. */
async function docExample(){
 const block=(await skill('kit')).split('## Example')[1].match(/```tsx\n([\s\S]*?)```/)![1];
 return block.replace('SceneProps',PROPS);
}

test('a scene may import the kit, and nothing else beside react and remotion',()=>{
 const scene=(from:string)=>`import React from 'react';import {Box} from '${from}';export default function Scene(){return <svg/>;}`;
 checkSource(scene('./kit'));
 for(const from of ['./kit.tsx','../kit','./other','kit'])assert.throws(()=>checkSource(scene(from)),/disallowed import/);
 assert.throws(()=>checkSource(`import './kit';export default function Scene(){return <svg/>;}`),/disallowed import/);
 assert.equal(usesKit(scene('./kit')),true);
 assert.equal(usesKit(`import React from 'react';export default function Scene(){return <svg/>;}`),false);
});

test('the example in the kit guide passes the contract and the type check with the current kit',async()=>{
 const source=await docExample();
 checkSource(source);
 await typecheckSource(source);
});

test('a scene is type-checked against the kit copy it is given',async()=>{
 const source=await docExample();
 // A kit without Box: the scene no longer compiles against it.
 const kit=(await currentKit()).replace('export function Box(','function Box(');
 await assert.rejects(typecheckSource(source,kit),(e:unknown)=>e instanceof SourceTypecheckError&&/Box/.test(e.message));
 await assert.rejects(typecheckSource(source.replace('title="索引"','title={1}'),undefined),SourceTypecheckError);
});

test('every part the kit exports is documented in the kit guide',async()=>{
 const doc=await skill('kit'),kit=await currentKit();
 const exported=[...kit.matchAll(/^export function (\w+)/gm)].map(m=>m[1]);
 assert.ok(exported.length>=14);
 for(const name of exported)assert.match(doc,new RegExp('`'+name+'[`(]'),`${name} is not in skill/kit.md`);
 assert.match(await skill('index'),/`kit`/);
 assert.match(await skill('scene-contract'),/'\.\/kit'/);
});

test('a run freezes the kit in its workspace: readable, not writable, and kept when the repository kit changes',async()=>{
 const dir=path.join(await mkdtemp(path.join(tmpdir(),'scene-kit-')),'run');
 const workspace=await createWorkspace(dir,{brief,skillDir:path.join(here,'../skill'),kit:'export const frozen=1;\n'});
 assert.equal(workspace.kit,'export const frozen=1;\n');
 assert.equal(await readFile(path.join(workspace.root,KIT_FILE),'utf8'),'export const frozen=1;\n');
 assert.equal((await workspace.resolve('kit.tsx','read')).relative,'kit.tsx');
 await assert.rejects(workspace.resolve('kit.tsx','write'),WorkspaceError);
 const fresh=await createWorkspace(path.join(path.dirname(dir),'run2'),{brief,skillDir:path.join(here,'../skill')});
 assert.equal(fresh.kit,await currentKit());
});
