import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {reviewSourceMotion} from '../src/source-motion-review';

test('offline intent candidate uses one clipped payload and an independent world-space audit path',async()=>{
 const base='output/visual-agent/intent-outlet-offline-v1/';
 const source=await readFile(base+'Scene.tsx','utf8');
 const artifact=JSON.parse(await readFile(base+'artifact.json','utf8'));
 const design=JSON.parse(await readFile(base+'artifact.json.design.json','utf8'));
 assert.equal(artifact.source,source);
 const file=ts.createSourceFile('Scene.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 const attr=(n:ts.JsxOpeningElement|ts.JsxSelfClosingElement,name:string)=>n.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(file)===name)?.getText(file);
 let payloads=0,routes=0,clips=0;
 const visit=(node:ts.Node)=>{
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
   const open=ts.isJsxElement(node)?node.openingElement:node;
   if(attr(open,'data-object')==='data-object="intent-tag"'){
    payloads++;
    let parent=node.parent,clipped=false;
    while(parent){
     if(ts.isJsxElement(parent)&&attr(parent.openingElement,'clipPath')==='clipPath="url(#tag-outlet-clip)"')clipped=true;
     parent=parent.parent;
    }
    assert.ok(clipped,'payload must be inside the fixed outlet clip');
   }
   if(attr(open,'id')==='id="tag-run"'){routes++;assert.match(attr(open,'data-route')??'',/true/);}
   if(attr(open,'id')==='id="tag-outlet-clip"'){clips++;assert.match(attr(open,'clipPathUnits')??'',/userSpaceOnUse/);}
  }
  ts.forEachChild(node,visit);
 };
 visit(file);
 assert.deepEqual({payloads,routes,clips},{payloads:1,routes:1,clips:1});
 assert.doesNotMatch(source,/tagEmergFrac|tagRevealFull/);
 const constant=(name:string)=>{
  const value=new RegExp(`const ${name} = (\\d+);`).exec(source);
  assert.ok(value,`missing ${name}`);return Number(value[1]);
 };
 const clipX=Number(/<rect x=\{(\d+)\} y=\{0\} width=\{742\}/.exec(source)?.[1]);
 assert.ok(Number.isFinite(clipX));
 assert.ok(constant('tagHomeX')+248<clipX,'initial payload is fully hidden behind the outlet');
 assert.ok(constant('tagBranchX')-12>clipX,'the final payload is fully outside the outlet');
 const review=reviewSourceMotion(artifact,design);
 assert.equal(review.findings.length,0);
 assert.equal(review.visual,'pending');
 assert.equal(review.accepted,false);
 assert.equal(review.coverage,'partial','decorative branch audit gaps must remain visible');
});
