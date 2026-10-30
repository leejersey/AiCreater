import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {repositoryRoot} from '../src/files';
import {ragWorkflowMotion} from '../../../examples/custom-scenes/reviewed-rag/motion';

test('RAG docking stays inside the frame and carries one rigid payload',()=>{
 for(let frame=0;frame<938;frame++){
  const m=ragWorkflowMotion(frame);
  assert.ok(m.sleeve.x>=0&&m.sleeve.x+400<=1920);
  assert.ok(m.sleeve.y>=0&&m.sleeve.y+250<=980);
  for(const [object,w,h] of [[m.a,80,110],[m.b,75,95]] as const){
   assert.ok(object.x>=0&&object.x+w<=1920);
   assert.ok(object.y>=0&&object.y+h<=980);
  }
  if(frame>=404){
   assert.ok(Math.abs(m.a.x-m.sleeve.x-46)<1e-9);assert.ok(Math.abs(m.a.y-m.sleeve.y-88)<1e-9);
   assert.ok(Math.abs(m.b.x-m.sleeve.x-150)<1e-9);assert.ok(Math.abs(m.b.y-m.sleeve.y-104)<1e-9);
  }
  assert.equal(m.opacity,1);
 }
 assert.equal(ragWorkflowMotion(712).sleeve.x,1420);
});
test('RAG grip, lift, carry and insert are separate continuous phases',()=>{
 const shelf=ragWorkflowMotion(299),grip=ragWorkflowMotion(320),lift=ragWorkflowMotion(336),carry=ragWorkflowMotion(368),insert=ragWorkflowMotion(398);
 assert.deepEqual(shelf.a,{x:172,y:396});assert.deepEqual(grip.a,shelf.a);
 assert.ok(lift.a.y<grip.a.y);assert.equal(lift.a.x,grip.a.x);
 assert.ok(carry.a.x>lift.a.x);assert.equal(carry.a.y,lift.a.y);
 assert.equal(insert.a.x,carry.a.x);assert.ok(insert.a.y>carry.a.y);
 for(let frame=1;frame<938;frame++){
  const before=ragWorkflowMotion(frame-1),after=ragWorkflowMotion(frame);
  for(const key of ['a','b','sleeve'] as const)assert.ok(Math.hypot(after[key].x-before[key].x,after[key].y-before[key].y)<40,`${key}@${frame}`);
 }
});
test('augmentation holds the complete payload outside the inlet until the generation cue',async()=>{
 const source=await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/Scene.tsx'),'utf8');
 assert.ok(source.includes('L1360 420 V620 L1420 660'),'test boundary must match the actual inlet silhouette');
 for(let frame=0;frame<673;frame++)assert.ok(ragWorkflowMotion(frame).sleeve.x+400<=1340,`payload enters inlet early at ${frame}`);
 assert.equal(ragWorkflowMotion(640).sleeve.x,940);
 assert.equal(ragWorkflowMotion(672).sleeve.x,940);
 assert.equal(ragWorkflowMotion(673).sleeve.x,940);
 assert.ok(ragWorkflowMotion(700).sleeve.x+400>1360);
 assert.equal(ragWorkflowMotion(712).sleeve.x,1420);
});
test('standalone candidate embeds the tested motion function without importing or executing the scene',async()=>{
 const helper=await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/motion.ts'),'utf8');
 const scene=await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/Scene.tsx'),'utf8');
 function definition(source:string){const file=ts.createSourceFile('motion.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);const fn=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ragWorkflowMotion');assert.ok(fn);return fn.getText(file).replace(/^export\s+/,'');}
 assert.equal(definition(scene),definition(helper));
 assert.match(scene,/const motion = ragWorkflowMotion\(f\)/);
 for(const name of ['sleeve','a','b'])assert.ok(scene.includes(`motion.${name}.x`)&&scene.includes(`motion.${name}.y`));
 assert.match(scene,/railL = 540/);
 assert.match(scene,/x:580,txt:'① 检索'/);
 assert.match(scene,/x:1100,txt:'② 增强'/);
 assert.match(scene,/x:1620,txt:'③ 生成'/);
 assert.doesNotMatch(scene,/swallow\*960|sleeveVisible/);
});
test('question marker has reserved horizontal clearance from context fragments before generator entry',async()=>{
 const source=await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/Scene.tsx'),'utf8');
 const file=ts.createSourceFile('Scene.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 let marker:ts.JsxOpeningElement|undefined;
 function visit(node:ts.Node){
  if(ts.isJsxOpeningElement(node)&&node.tagName.getText(file)==='text'&&node.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==='id'&&a.initializer&&ts.isStringLiteral(a.initializer)&&a.initializer.text==='question-mark'))marker=node;
  ts.forEachChild(node,visit);
 }
 visit(file);assert.ok(marker,'question marker must have a stable diagnostic ID');
 const xAttribute=marker.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)==='x');
 assert.ok(xAttribute&&ts.isJsxAttribute(xAttribute)&&xAttribute.initializer&&ts.isJsxExpression(xAttribute.initializer)&&xAttribute.initializer.expression&&ts.isNumericLiteral(xAttribute.initializer.expression));
 const x=Number(xAttribute.initializer.expression.text);
 assert.ok(x>=2&&x+30<=260,'reserve glyph width inside question paper');
 for(let frame=0;frame<673;frame++){
  const m=ragWorkflowMotion(frame),markerLeft=m.sleeve.x+70+x-2;
  assert.ok(markerLeft>m.a.x+80+12,`fragment A covers question at ${frame}`);
  assert.ok(markerLeft>m.b.x+75+12,`fragment B covers question at ${frame}`);
 }
 assert.ok(source.includes('M40 24 H196'),'shorten the question text line before the marker');
});
