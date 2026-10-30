import ts from 'typescript';
import type {VisualDesign} from './design';
import type {SourceMotionFinding} from './source-motion-review';

type Value=number|boolean|string|{[key:string]:Value}|Value[];
type Point={x:number;y:number};
const point=(v:Value|undefined):v is Point=>typeof v==='object'&&v!==null&&!Array.isArray(v)&&typeof v.x==='number'&&typeof v.y==='number';

// Static, bounded arithmetic only. Unknown calls, shadowed names and transforms remain render checks.
export function reviewPoseBoundaries(file:ts.SourceFile,design:VisualDesign):SourceMotionFinding[]{
 const bindings=new Map<string,ts.Expression>();
 const duplicates=new Set<string>();
 const helpers=new Map<string,string>();
 const interpolators=new Set<string>();
 const line=(n:ts.Node)=>file.getLineAndCharacterOfPosition(n.getStart(file)).line+1;
 const walk=(n:ts.Node,fn:(n:ts.Node)=>void)=>{fn(n);ts.forEachChild(n,c=>walk(c,fn));};
 walk(file,n=>{
  if(ts.isParameter(n)&&ts.isIdentifier(n.name)&&n.name.text!=='frame')duplicates.add(n.name.text);
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text==='remotion'){
   const named=n.importClause?.namedBindings;
   if(named&&ts.isNamedImports(named))for(const e of named.elements)if((e.propertyName??e.name).text==='interpolate')interpolators.add(e.name.text);
  }
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){
   const name=n.name.text;
   if(!ts.isVariableDeclarationList(n.parent)||(n.parent.flags&ts.NodeFlags.Const)===0)duplicates.add(name);
   if(bindings.has(name))duplicates.add(name);
   bindings.set(name,n.initializer);
   if(ts.isArrowFunction(n.initializer))helpers.set(name,n.initializer.getText(file).replace(/\s+/g,''));
  }
  if((ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)||((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&(n.operator===ts.SyntaxKind.PlusPlusToken||n.operator===ts.SyntaxKind.MinusMinusToken))){
   let target:ts.Expression=ts.isBinaryExpression(n)?n.left:n.operand;
   while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=target.expression;
   if(ts.isIdentifier(target))duplicates.add(target.text);
  }
 });
 const unwrap=(n:ts.Expression):ts.Expression=>ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isTypeAssertionExpression(n)?unwrap(n.expression):n;
 const evaluate=(node:ts.Expression|undefined,frame:number,depth=0):Value|undefined=>{
  if(!node||depth>40)return undefined;
  const n=unwrap(node),ev=(e:ts.Expression|undefined)=>evaluate(e,frame,depth+1);
  if(ts.isNumericLiteral(n))return Number(n.text);
  if(ts.isStringLiteralLike(n))return n.text;
  if(n.kind===ts.SyntaxKind.TrueKeyword)return true;
  if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(ts.isIdentifier(n)){
   if(duplicates.has(n.text))return undefined;
   if(n.text==='frame'){
    let owner:ts.Node|undefined=n.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent;
    if(bindings.has('frame')||!owner||!ts.isFunctionDeclaration(owner)||owner.name?.text!=='Scene'||!owner.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))return undefined;
    const hasFrame=(pattern:ts.BindingName)=>ts.isObjectBindingPattern(pattern)&&pattern.elements.some(e=>!e.dotDotDotToken&&!e.initializer&&ts.isIdentifier(e.name)&&e.name.text==='frame'&&(!e.propertyName||e.propertyName.getText(file)==='frame'));
    const propsNames=new Set(owner.parameters.flatMap(p=>ts.isIdentifier(p.name)?[p.name.text]:[]));
    const frameParameter=owner.parameters.some(p=>hasFrame(p.name))||owner.body?.statements.some(s=>ts.isVariableStatement(s)&&(s.declarationList.flags&ts.NodeFlags.Const)!==0&&s.declarationList.declarations.some(d=>hasFrame(d.name)&&d.initializer&&ts.isIdentifier(d.initializer)&&propsNames.has(d.initializer.text)));
    return frameParameter?frame:undefined;
   }
   return ev(bindings.get(n.text));
  }
  if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken){const v=ev(n.operand);return typeof v==='number'?-v:undefined;}
  if(ts.isPropertyAccessExpression(n)){const v=ev(n.expression);return typeof v==='object'&&v!==null&&!Array.isArray(v)?v[n.name.text]:undefined;}
  if(ts.isArrayLiteralExpression(n)){const v=n.elements.map(e=>ts.isExpression(e)?ev(e):undefined);return v.every(e=>e!==undefined)?v as Value[]:undefined;}
  if(ts.isObjectLiteralExpression(n)){
   const result:{[key:string]:Value}={};
   for(const p of n.properties){if(!ts.isPropertyAssignment(p)||!ts.isIdentifier(p.name))return undefined;const v=ev(p.initializer);if(v===undefined)return undefined;result[p.name.text]=v;}
   return result;
  }
  if(ts.isConditionalExpression(n)){const c=ev(n.condition);return typeof c==='boolean'?ev(c?n.whenTrue:n.whenFalse):undefined;}
  if(ts.isBinaryExpression(n)){
   const a=ev(n.left),b=ev(n.right);if(typeof a!=='number'||typeof b!=='number')return undefined;
   switch(n.operatorToken.kind){
    case ts.SyntaxKind.PlusToken:return a+b;case ts.SyntaxKind.MinusToken:return a-b;
    case ts.SyntaxKind.AsteriskToken:return a*b;case ts.SyntaxKind.SlashToken:return b===0?undefined:a/b;
    case ts.SyntaxKind.GreaterThanToken:return a>b;case ts.SyntaxKind.LessThanToken:return a<b;
    case ts.SyntaxKind.GreaterThanEqualsToken:return a>=b;case ts.SyntaxKind.LessThanEqualsToken:return a<=b;
   }
  }
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&!duplicates.has(n.expression.text)){
   const name=n.expression.text,args=n.arguments.map(ev);
   if(interpolators.has(name)&&n.arguments.length===4){
    const [v,x,y,o]=args;
    if(typeof v!=='number'||!Array.isArray(x)||!Array.isArray(y)||x.length!==y.length||x.length<2||!x.every(e=>typeof e==='number')||!y.every(e=>typeof e==='number')||!o||typeof o!=='object'||Array.isArray(o))return undefined;
    if(Object.keys(o).some(k=>!['extrapolateLeft','extrapolateRight'].includes(k))||o.extrapolateLeft!=='clamp'||o.extrapolateRight!=='clamp')return undefined;
    const xs=x as number[],ys=y as number[];
    if(xs.some((e,i)=>i>0&&e<=xs[i-1]))return undefined;
    let i=0;while(i<xs.length-2&&v>xs[i+1])i++;
    const u=Math.max(0,Math.min(1,(v-xs[i])/(xs[i+1]-xs[i])));
    return ys[i]+(ys[i+1]-ys[i])*u;
   }
   const helper=bindings.get(name);
   if(helper&&ts.isArrowFunction(helper)&&helper.parameters.map(p=>p.name.getText(file)).join(',')==='a,b,u'){
    const body=helper.body.getText(file).replace(/\s+/g,'');
    if(body==='a+(b-a)*u'&&args.every(a=>typeof a==='number')&&args.length===3)return (args[0] as number)+((args[1] as number)-(args[0] as number))*(args[2] as number);
    if(body==='({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)})'&&helpers.get('lerp')?.endsWith('=>a+(b-a)*u')&&!duplicates.has('lerp')&&point(args[0])&&point(args[1])&&typeof args[2]==='number')return {x:args[0].x+(args[1].x-args[0].x)*args[2],y:args[0].y+(args[1].y-args[0].y)*args[2]};
   }
  }
  return undefined;
 };
 const attr=(n:ts.JsxOpeningElement|ts.JsxSelfClosingElement,key:string):ts.Expression|undefined=>{
  const a=n.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)===key);
  return a&&ts.isJsxAttribute(a)&&a.initializer?(ts.isJsxExpression(a.initializer)?a.initializer.expression:a.initializer):undefined;
 };
 const translated=new Set<string>();
 walk(file,n=>{if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){const t=attr(n,'transform');if(t)for(const m of t.getText(file).matchAll(/\$\{(\w+)\.[xy]\}/g))translated.add(m[1]);}});
 const findings:SourceMotionFinding[]=[];
 for(const [name,raw] of bindings){
  const n=unwrap(raw);if(!translated.has(name)||duplicates.has(name)||!ts.isConditionalExpression(n)||!ts.isBinaryExpression(n.condition))continue;
  const c=n.condition;if(c.operatorToken.kind!==ts.SyntaxKind.GreaterThanToken||!ts.isIdentifier(c.left)||duplicates.has(c.left.text)||evaluate(c.right,0)!==0)continue;
  const progress=bindings.get(c.left.text);
  if(!progress||!ts.isCallExpression(progress)||!ts.isIdentifier(progress.expression)||!interpolators.has(progress.expression.text)||!progress.arguments[0]||!ts.isIdentifier(progress.arguments[0])||progress.arguments[0].text!=='frame')continue;
  const frames=evaluate(progress.arguments[1],0),values=evaluate(progress.arguments[2],0);
  if(!Array.isArray(frames)||!Array.isArray(values)||typeof frames[0]!=='number'||values[0]!==0||typeof values[1]!=='number'||values[1]<=0)continue;
  if(frames[0]<0||frames[0]>=design.brief.durationInFrames-1||evaluate(progress,frames[0])!==0||!(Number(evaluate(progress,frames[0]+0.001))>0))continue;
  const a=evaluate(n.whenTrue,frames[0]),b=evaluate(n.whenFalse,frames[0]);
  if(!point(a)||!point(b))continue;
  const distance=Math.hypot(a.x-b.x,a.y-b.y);
  if(distance>0.5)findings.push({kind:'motion-discontinuity',target:name,lines:[line(n)],detail:`Conditional pose handoff differs by ${Number(distance.toFixed(2))}px at frame ${frames[0]}.`,feedback:`Repair ${name}: both pose branches must share the same handoff endpoint (${Number(distance.toFixed(2))}px discontinuity).`});
 }
 const end=design.brief.durationInFrames-1;
 const clips=new Map<string,{x:number;y:number;width:number;height:number;line:number}>();
 const components=new Map<string,string>();
 walk(file,n=>{
  if(ts.isFunctionDeclaration(n)&&n.name){let id:string|undefined;walk(n,c=>{if(ts.isJsxOpeningElement(c)||ts.isJsxSelfClosingElement(c)){const v=evaluate(attr(c,'data-object'),end);if(typeof v==='string')id=v;}});if(id)components.set(n.name.text,id);}
  if(!ts.isJsxElement(n)||n.openingElement.tagName.getText(file)!=='clipPath')return;
  const open=n.openingElement,id=evaluate(attr(open,'id'),end);
  if(typeof id!=='string'||attr(open,'transform')||attr(open,'clipPathUnits'))return;
  const children=n.children.filter(c=>!ts.isJsxText(c)||c.text.trim());
  if(children.length!==1||!ts.isJsxSelfClosingElement(children[0])||children[0].tagName.getText(file)!=='rect')return;
  const rect=children[0];if(attr(rect,'transform'))return;
  const values=['x','y','width','height'].map(k=>evaluate(attr(rect,k),end));
  if(values.every(v=>typeof v==='number'))clips.set(id,{x:values[0] as number,y:values[1] as number,width:values[2] as number,height:values[3] as number,line:line(rect)});
 });
 const visit=(n:ts.Node,clipId?:string,clipLine=0,pose?:Point)=>{
  if(ts.isJsxExpression(n)&&n.expression&&ts.isBinaryExpression(n.expression)&&n.expression.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken){if(evaluate(n.expression.left,end)===true)visit(n.expression.right,clipId,clipLine,pose);return;}
  if(ts.isJsxExpression(n)&&n.expression&&ts.isConditionalExpression(n.expression)){const v=evaluate(n.expression.condition,end);if(typeof v==='boolean')visit(v?n.expression.whenTrue:n.expression.whenFalse,clipId,clipLine,pose);return;}
  if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){
   const open=ts.isJsxElement(n)?n.openingElement:n;
   const clip=evaluate(attr(open,'clipPath'),end);
   if(attr(open,'clipPath')&&(pose||attr(open,'transform')))return;
   if(typeof clip==='string'){const m=/^url\(#([^()]+)\)$/.exec(clip);clipId=m?.[1];clipLine=line(open);}
   const transform=attr(open,'transform');
   if(transform){
    // Only a single top-left translation is supported; nested offsets and rotations are unresolved.
    if(pose)return;
    if(!ts.isTemplateExpression(transform)||transform.templateSpans.length!==2||transform.head.text!=='translate('||transform.templateSpans[0].literal.text!==' '||transform.templateSpans[1].literal.text!==')')return;
    const x=evaluate(transform.templateSpans[0].expression,end),y=evaluate(transform.templateSpans[1].expression,end);
    if(typeof x!=='number'||typeof y!=='number')return;pose={x,y};
   }
   const explicit=evaluate(attr(open,'data-object'),end);
   const id=typeof explicit==='string'?explicit:components.get(open.tagName.getText(file));
   const object=design.objects.find(o=>o.id===id),crop=clipId?clips.get(clipId):undefined;
   if(object&&crop&&pose&&pose.x===object.x&&pose.y===object.y&&(pose.x>=crop.x+crop.width||pose.x+object.width<=crop.x||pose.y>=crop.y+crop.height||pose.y+object.height<=crop.y))findings.push({kind:'occlusion-incomplete',target:clipId!,lines:[crop.line,clipLine,line(open)],detail:`Declared settled pose of ${id} is wholly outside rectangular clip ${clipId} at frame ${end}; verify artwork origin and remove or expand the clip.`,feedback:`Check ${id}: its declared settled bounds are excluded by ${clipId}. Disable emergence clipping after release or adjust the clip; rendering remains required.`});
   if(ts.isJsxElement(n))for(const child of n.children)visit(child,clipId,clipLine,pose);
   return;
  }
  ts.forEachChild(n,c=>visit(c,clipId,clipLine,pose));
 };
 visit(file);
 return findings;
}
