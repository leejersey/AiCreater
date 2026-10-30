import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import type {GeometryRecord} from '../src/geometry-audit';

async function api() {
  assert.ok(existsSync(new URL('../src/geometry-audit.ts',import.meta.url)), 'geometry audit is not implemented');
  return import('../src/geometry-audit');
}
const box=(x:number,y:number,width=40,height=20)=>({x,y,width,height});
test('automatic full coverage requires exactly one direct root SVG',async()=>{
 const {hasCompleteSvgCoverage}=await api();
 assert.equal(typeof hasCompleteSvgCoverage,'function');
 const svg={} as Element;
 const root=(svgs:Element[],children:Element[],childNodes:unknown[]=children)=>({querySelectorAll:()=>svgs,children,childNodes,firstElementChild:children[0]??null}) as unknown as HTMLElement;
 assert.equal(hasCompleteSvgCoverage(root([svg],[svg])),true);
 assert.equal(hasCompleteSvgCoverage(root([],[])),false);
 assert.equal(hasCompleteSvgCoverage(root([svg,{} as Element],[svg,{} as Element])),false);
 assert.equal(hasCompleteSvgCoverage(root([svg],[{} as Element])),false);
 assert.equal(hasCompleteSvgCoverage(root([svg],[svg],[svg,{nodeType:3,textContent:'外部说明'}])),false);
 assert.equal(hasCompleteSvgCoverage(root([svg],[svg],[svg,{nodeType:3,textContent:'  \n'},{nodeType:8,textContent:'comment'}])),true);
});
const label=(target:string,x:number,y:number,object?:string):GeometryRecord=>({kind:'label',target,bbox:box(x,y),object});
const route=(target:string,points:{x:number;y:number}[]):GeometryRecord=>({kind:'route',target,id:target,points});
const mover=(target:string,routeId:string,x:number,y:number):GeometryRecord=>({kind:'mover',target,routeId,anchor:{x,y}});

test('counts visible records without inventing issues for a clean layout',async()=>{
  const {analyzeGeometry}=await api();
  assert.deepEqual(analyzeGeometry([
    label('title',20,20),label('caption',200,20),
    {kind:'obstacle',target:'wallet',bbox:box(500,300)},
    route('track',[{x:0,y:200},{x:300,y:200}]),mover('paper','track',120,200),
  ]),{issues:[],labels:2,movers:1,routes:1,obstacles:1});
});

test('text overlap is approximate, but touching edges do not overlap',async()=>{
  const {analyzeGeometry}=await api();
  const result=analyzeGeometry([label('a',10,10),label('b',30,15),label('c',70,15)]);
  assert.equal(result.issues.filter(i=>i.kind==='label-overlap').length,1);
  assert.equal(result.issues[0].target,'a');
  assert.match(result.issues[0].detail,/b/);
  assert.match(result.issues[0].detail,/approximate/i);
});

test('only the same nonempty nearest object exempts embedded obstacle text',async()=>{
  const {analyzeGeometry}=await api();
  const obstacle:GeometryRecord={kind:'obstacle',target:'body',bbox:box(0,0,200,200),object:'wallet'};
  assert.equal(analyzeGeometry([label('inside',20,20,'wallet'),obstacle]).issues.length,0);
  assert.equal(analyzeGeometry([label('outside',20,20,'other'),obstacle]).issues[0].kind,'label-obstacle');
  assert.equal(analyzeGeometry([label('ungrouped',20,20),{...obstacle,object:undefined}]).issues[0].kind,'label-obstacle');
  assert.equal(analyzeGeometry([label('first',20,20,'wallet'),label('second',22,22,'wallet')]).issues[0].kind,'label-overlap');
});

test('safe area is exactly 0..1920 by 0..980',async()=>{
  const {analyzeGeometry}=await api();
  const result=analyzeGeometry([label('edge',1880,960),label('left',-1,200),label('bottom',50,961),label('right',1881,300)]);
  assert.deepEqual(result.issues.filter(i=>i.kind==='label-out-of-bounds').map(i=>i.target),['left','bottom','right']);
});
test('zero-ink labels are ignored but invalid boxes still fail',async()=>{
 const {analyzeGeometry}=await api();
 const result=analyzeGeometry([
  {kind:'label',target:'font-zero',bbox:box(120,1010,0,0)},
  {kind:'label',target:'collapsed',bbox:box(2100,1000,30,0)},
  {kind:'label',target:'invalid',bbox:box(NaN,1010,0,0)},
 ]);
 assert.equal(result.labels,1);
 assert.deepEqual(result.issues.map(i=>i.kind),['invalid-geometry']);
});

test('route intersections use line segments rather than the entire route bounding box',async()=>{
  const {analyzeGeometry}=await api();
  const diagonal=route('diagonal',[{x:0,y:0},{x:200,y:200}]);
  assert.equal(analyzeGeometry([label('clear',10,100),diagonal]).issues.length,0);
  const hit=analyzeGeometry([label('crossed',90,90),diagonal]);
  assert.equal(hit.issues[0].kind,'label-route');
  assert.match(hit.issues[0].detail,/approximate/i);
});

test('mover distance is measured to segments, accepts 2px, and reports missing routes',async()=>{
  const {analyzeGeometry}=await api();
  const result=analyzeGeometry([
    route('track',[{x:0,y:100},{x:100,y:100}]),
    mover('on','track',50,100),mover('tolerance','track',50,102),mover('off','track',50,102.01),
    mover('missing','unknown',0,0),
  ]);
  assert.deepEqual(result.issues.map(i=>[i.kind,i.target]),[['path-deviation','off'],['missing-route','missing']]);
  assert.match(result.issues[0].detail,/2\.01/);
});

test('degenerate routes and invalid geometry remain finite and explicit',async()=>{
  const {analyzeGeometry}=await api();
  const result=analyzeGeometry([route('dot',[{x:10,y:10}]),mover('near','dot',11,10),
    {kind:'label',target:'bad',bbox:box(NaN,0)},route('invalid',[])]);
  assert.equal(result.issues.filter(i=>i.kind==='invalid-geometry').length,2);
  assert.doesNotMatch(JSON.stringify(result),/NaN|Infinity/);
});

test('record and path sampling limits are bounded and reported, not silently treated as clean',async()=>{
  const {analyzeGeometry}=await api();
  const huge=Array.from({length:5000},(_,i)=>mover(`m${i}`,'missing',0,0));
  const result=analyzeGeometry(huge);
  assert.ok(result.movers<=256);
  assert.ok(result.issues.length<=201);
  assert.ok(result.issues.some(i=>i.kind==='audit-limit'));
  const points=Array.from({length:4000},(_,i)=>({x:i,y:500}));
  const sampled=analyzeGeometry([route('long',points),mover('end','long',3999,500)]);
  assert.ok(sampled.issues.some(i=>i.kind==='audit-limit'));
  assert.ok(!sampled.issues.some(i=>i.kind==='path-deviation'));
});

// Minimal DOM doubles keep collection tests independent of a browser package.
class Matrix {
  constructor(public a=1,public b=0,public c=0,public d=1,public e=0,public f=0){}
  inverse(){const det=this.a*this.d-this.b*this.c;return new Matrix(this.d/det,-this.b/det,-this.c/det,this.a/det,(this.c*this.f-this.d*this.e)/det,(this.b*this.e-this.a*this.f)/det);}
  multiply(m:Matrix){return new Matrix(this.a*m.a+this.c*m.b,this.b*m.a+this.d*m.b,this.a*m.c+this.c*m.d,this.b*m.c+this.d*m.d,this.a*m.e+this.c*m.f+this.e,this.b*m.e+this.d*m.f+this.f);}
}
class ElementDouble {
  parentElement:ElementDouble|null=null;
  attrs:Record<string,string>={};
  style={opacity:'1',display:'inline',visibility:'visible'};
  textContent='label';
  bounds=box(0,0);
  matrix=new Matrix();
  points=[{x:0,y:0},{x:100,y:0}];
  samples=0;
  constructor(public tagName:string,public id=''){}
  getAttribute(name:string){return name==='id'?this.id:this.attrs[name]??null;}
  hasAttribute(name:string){return Object.hasOwn(this.attrs,name);}
  closest(selector:string):ElementDouble|null{assert.equal(selector,'[data-object]');return this.hasAttribute('data-object')?this:this.parentElement?.closest(selector)??null;}
  getBBox(){return this.bounds;}
  getScreenCTM(){return this.matrix;}
  getTotalLength(){return 100;}
  getPointAtLength(n:number){this.samples++;return {x:this.points[0].x+(this.points[1].x-this.points[0].x)*n/100,y:this.points[0].y+(this.points[1].y-this.points[0].y)*n/100};}
}
function dom(elements:ElementDouble[],rootMatrix=new Matrix()) {
  const root=new ElementDouble('svg','root');
  root.matrix=rootMatrix;
  for(const el of elements)if(!el.parentElement)el.parentElement=root;
  return Object.assign(root,{
    ownerDocument:{defaultView:{getComputedStyle:(el:ElementDouble)=>el.style}},
    querySelectorAll:()=>elements,
  }) as unknown as SVGSVGElement;
}

test('DOM measures rotated corner bounds relative to root and transforms mover local origin',async()=>{
  const {measureScene}=await api();
  const root=new Matrix(2,0,0,2,100,50);
  const text=new ElementDouble('text','rotated');
  text.bounds=box(0,0,40,20);
  text.matrix=root.multiply(new Matrix(0,1,-1,0,10,20));
  const path=new ElementDouble('path','track');path.attrs['data-route']='';
  path.matrix=root.multiply(new Matrix(1,0,0,1,200,200));
  const paper=new ElementDouble('g','paper');paper.attrs['data-follow-path']='track';
  paper.matrix=root.multiply(new Matrix(1,0,0,1,250,200));
  const result=measureScene(dom([text,path,paper],root));
  assert.equal(result.labels,1);assert.equal(result.routes,1);assert.equal(result.movers,1);
  assert.equal(result.issues.length,1);assert.equal(result.issues[0].kind,'label-out-of-bounds');
  assert.ok(path.samples>=1000&&path.samples<=2000);
});

test('DOM ignores hidden ancestors and cumulative opacity, including hidden routes',async()=>{
  const {measureScene}=await api();
  const hidden=new ElementDouble('g');hidden.style.opacity='0.05';
  const faded=new ElementDouble('g');faded.style.opacity='0.2';
  const a=new ElementDouble('text','a');a.parentElement=hidden;
  const b=new ElementDouble('text','b');b.parentElement=faded;b.style.opacity='0.2';
  const c=new ElementDouble('text','c');c.style.display='none';
  const d=new ElementDouble('text','d');d.style.visibility='hidden';
  const path=new ElementDouble('path','track');path.attrs['data-route']='';path.parentElement=hidden;
  const paper=new ElementDouble('g','paper');paper.attrs['data-follow-path']='track';
  const result=measureScene(dom([a,b,c,d,path,paper]));
  assert.deepEqual([result.labels,result.routes,result.movers],[0,0,1]);
  assert.equal(result.issues[0].kind,'missing-route');
});

test('DOM object identity uses the nearest container rather than repeated attribute values',async()=>{
  const {measureScene}=await api();
  const group=new ElementDouble('g');group.attrs['data-object']='wallet';
  const another=new ElementDouble('g');another.attrs['data-object']='wallet';
  const text=new ElementDouble('text','embedded');text.parentElement=group;
  const body=new ElementDouble('rect','body');body.attrs['data-obstacle']='';body.parentElement=group;
  const foreign=new ElementDouble('rect','foreign');foreign.attrs['data-obstacle']='';foreign.parentElement=another;
  const result=measureScene(dom([text,body,foreign]));
  assert.deepEqual(result.issues.map(i=>[i.kind,i.target]),[['label-obstacle','embedded']]);
  assert.match(result.issues[0].detail,/foreign/);
});

test('DOM collection is bounded and unmeasurable transforms are reported',async()=>{
  const {measureScene}=await api();
  const labels=Array.from({length:5000},(_,i)=>{const t=new ElementDouble('text',`t${i}`);t.style.opacity='0';return t;});
  const result=measureScene(dom(labels));
  assert.ok(result.issues.some(i=>i.kind==='audit-limit'));
  const broken=dom([]);(broken as unknown as ElementDouble).matrix=new Matrix(0,0,0,0,0,0);
  assert.equal(measureScene(broken).issues[0].kind,'measurement-failed');
});
