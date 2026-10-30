import ts from 'typescript';
import {reviewPoseBoundaries} from './source-pose-diagnostics';
import {parseArtifact,sourceHash,type SceneArtifact} from './contract';
import {parseDesign,designHash,geometryFeedback,type VisualDesign} from './design';

export type SourceMotionFindingKind='motion-discontinuity'|'route-mismatch'|'occlusion-incomplete';
export type SourceMotionFinding={
 kind:SourceMotionFindingKind;
 target:string;
 lines:number[];
 detail:string;
 feedback:string;
};
export type SourceMotionReview={
 schemaVersion:'source-motion-review:1';
 sha256:string;
 designSha256:string;
 status:'revise-required'|'partial-coverage'|'pending-render';
 coverage:'partial'|'declared';
 staticContinuityProven:false;
 accepted:false;
 visual:'pending';
 findings:SourceMotionFinding[];
 coverageGaps:{kind:string;target:string;detail:string}[];
 pendingRenderChecks:string[];
 feedback:string;
};

type PointBinding={name:string;x:number;y:number;line:number};
type ProgressBinding={name:string;startFrame:number;endFrame:number;line:number};
type RouteRecord={
 id:string;
 tagName:string;
 line:number;
 dLine?:number;
 pointNames:string[];
 points:{x:number;y:number}[];
 pointLines:number[];
};
type CurveCallRecord={
 fn:'quad'|'cubic';
 line:number;
 pointNames:(string|null)[];
 points:({x:number;y:number}|null)[];
 pointLines:number[];
 progressArgText:string;
 isConstantEndpoint:boolean;
};

function lineOf(file:ts.SourceFile,node:ts.Node):number{
 return file.getLineAndCharacterOfPosition(node.getStart(file)).line+1;
}
function sortedUniqueLines(lines:Iterable<number>):number[]{
 return [...new Set([...lines].filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b);
}
function numericLiteral(node:ts.Node|undefined,consts?:ReadonlyMap<string,number>):number|undefined{
 if(!node)return undefined;
 if(ts.isNumericLiteral(node)){
  const v=Number(node.text);
  return Number.isFinite(v)?v:undefined;
 }
 if(ts.isIdentifier(node)&&consts?.has(node.text))return consts.get(node.text);
 if(ts.isParenthesizedExpression(node))return numericLiteral(node.expression,consts);
 if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.MinusToken){
  const v=numericLiteral(node.operand,consts);
  return v!==undefined&&Number.isFinite(-v)?-v:undefined;
 }
 if(ts.isBinaryExpression(node)){
  const l=numericLiteral(node.left,consts),r=numericLiteral(node.right,consts);
  if(l===undefined||r===undefined)return undefined;
  const k=node.operatorToken.kind;
  const v=k===ts.SyntaxKind.PlusToken?l+r:k===ts.SyntaxKind.MinusToken?l-r:k===ts.SyntaxKind.AsteriskToken?l*r:k===ts.SyntaxKind.SlashToken&&r!==0?l/r:undefined;
  return v!==undefined&&Number.isFinite(v)?v:undefined;
 }
 return undefined;
}
function objectPointLiteral(node:ts.Expression|undefined,consts?:ReadonlyMap<string,number>):{x:number;y:number}|null{
 if(!node||!ts.isObjectLiteralExpression(node))return null;
 let x:number|undefined,y:number|undefined;
 for(const prop of node.properties){
  if(!ts.isPropertyAssignment(prop)||!ts.isIdentifier(prop.name))continue;
  const v=numericLiteral(prop.initializer,consts);
  if(prop.name.text==='x')x=v;
  else if(prop.name.text==='y')y=v;
 }
 return x!==undefined&&y!==undefined?{x,y}:null;
}
function hasRenderedJsxChildren(children:ts.NodeArray<ts.JsxChild>,file:ts.SourceFile):boolean{
 for(const child of children){
  if(ts.isJsxElement(child)||ts.isJsxSelfClosingElement(child)||ts.isJsxFragment(child))return true;
  if(ts.isJsxText(child)&&child.getText(file).trim().length>0)return true;
  if(ts.isJsxExpression(child)&&child.expression!==undefined)return true;
 }
 return false;
}
function jsxAttributeString(attrs:ts.JsxAttributes,name:string,file:ts.SourceFile):{value?:string;expr?:ts.Expression;line:number}|undefined{
 for(const prop of attrs.properties){
  if(!ts.isJsxAttribute(prop)||prop.name.getText(file)!==name)continue;
  const line=lineOf(file,prop);
  if(!prop.initializer)return {value:'true',line};
  if(ts.isStringLiteral(prop.initializer))return {value:prop.initializer.text,line};
  if(ts.isJsxExpression(prop.initializer)&&prop.initializer.expression){
   if(ts.isStringLiteralLike(prop.initializer.expression))return {value:prop.initializer.expression.text,expr:prop.initializer.expression,line};
   return {expr:prop.initializer.expression,line};
  }
 }
 return undefined;
}

/** Static AST inspection for provable motion/route/clip defects. Never evaluates Scene code or claims general continuity proof. */
export function reviewSourceMotion(artifactInput:unknown,designInput:unknown):SourceMotionReview{
 const design=parseDesign(designInput);
 const artifact=parseArtifact(artifactInput,design.brief);
 const file=ts.createSourceFile('Scene.tsx',artifact.source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);

 const numConsts=new Map<string,number>();
 const points=new Map<string,PointBinding>();
 const progressVars=new Map<string,ProgressBinding>();
 const frameAliases=new Set<string>(['frame','f']);
 const twoArgMotionHelpers=new Set<string>(['motion']);
 const threeArgProgressHelpers=new Set<string>(['prog','tween','clampM']);
 const stringAssignments=new Map<string,Set<string>>();
 const routes:RouteRecord[]=[];
 const followPathValues=new Set<string>();
 let hasFollowPathAttr=false;
 const curveCalls:CurveCallRecord[]=[];
 const clipDefs=new Map<string,number>();
 let hasDynamicClipDefinition=false;
 const clipUsages=new Map<string,{line:number;nonEmpty:boolean;contextLine:number}[]>();
 const objectLines=new Map<string,number[]>();
 const uncommentedGroups:{line:number;commentLine?:number;hasTranslate:boolean}[]=[];
 const curveResultVars=new Set<string>();
 const anchorOffsetLines:{line:number;target:string;detail:string}[]=[];
 const unclippedTransforms=new Map<string,number>();
 const clippedTransforms=new Map<string,{clipId:string;line:number;clipLine:number}>();
 const nestedRouteFindings:SourceMotionFinding[]=[];

 // Pass 1: collect top-level and local helper/point/progress declarations.
 function collectDeclarations(node:ts.Node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){
   const name=node.name.text,init=node.initializer,line=lineOf(file,node);
   const num=numericLiteral(init,numConsts);
   if(num!==undefined)numConsts.set(name,num);
   const pt=objectPointLiteral(init,numConsts);
   if(pt)points.set(name,{name,x:pt.x,y:pt.y,line});
   if(ts.isCallExpression(init)){
    const fnName=ts.isIdentifier(init.expression)?init.expression.text:'';
    if(fnName==='quad'||fnName==='cubic')curveResultVars.add(name);
    if(threeArgProgressHelpers.has(fnName)&&init.arguments.length>=3){
     const start=numericLiteral(init.arguments[1],numConsts),end=numericLiteral(init.arguments[2],numConsts);
     if(start!==undefined&&end!==undefined&&start<end)progressVars.set(name,{name,startFrame:start,endFrame:end,line});
    }else if(twoArgMotionHelpers.has(fnName)&&init.arguments.length>=2){
     const start=numericLiteral(init.arguments[0],numConsts),end=numericLiteral(init.arguments[1],numConsts);
     if(start!==undefined&&end!==undefined&&start<end)progressVars.set(name,{name,startFrame:start,endFrame:end,line});
    }else if(fnName==='interpolate'&&init.arguments.length>=2&&ts.isArrayLiteralExpression(init.arguments[1])&&init.arguments[1].elements.length===2){
     const start=numericLiteral(init.arguments[1].elements[0],numConsts),end=numericLiteral(init.arguments[1].elements[1],numConsts);
     if(start!==undefined&&end!==undefined&&start<end)progressVars.set(name,{name,startFrame:start,endFrame:end,line});
    }
   }
   if(ts.isStringLiteralLike(init)){
    if(!stringAssignments.has(name))stringAssignments.set(name,new Set());
    stringAssignments.get(name)!.add(init.text);
   }
  }
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(node.left)){
   const target=node.left.text;
   const collectStrings=(expr:ts.Expression)=>{
    if(ts.isStringLiteralLike(expr)){
     if(!stringAssignments.has(target))stringAssignments.set(target,new Set());
     stringAssignments.get(target)!.add(expr.text);
    }else if(ts.isConditionalExpression(expr)){
     collectStrings(expr.whenTrue);collectStrings(expr.whenFalse);
    }
   };
   collectStrings(node.right);
   if(ts.isBinaryExpression(node.right)&&(node.right.operatorToken.kind===ts.SyntaxKind.PlusToken||node.right.operatorToken.kind===ts.SyntaxKind.MinusToken)){
    const lhsExpr=node.right.left;
    const offsetVal=numericLiteral(node.right.right,numConsts);
    if(ts.isPropertyAccessExpression(lhsExpr)&&ts.isIdentifier(lhsExpr.expression)&&curveResultVars.has(lhsExpr.expression.text)&&(lhsExpr.name.text==='x'||lhsExpr.name.text==='y')&&(offsetVal===undefined||offsetVal!==0)){
     anchorOffsetLines.push({
      line:lineOf(file,node),
      target,
      detail:` Coordinate "${target}" adds/subtracts a non-zero offset (${node.right.getText(file)}) to curve point "${lhsExpr.getText(file)}", which shifts the outer [data-follow-path] local (0,0) anchor off the route.`,
     });
    }
   }
  }
  ts.forEachChild(node,collectDeclarations);
 }
 collectDeclarations(file);

 function resolvePoint(expr:ts.Expression|undefined):{name:string|null;point:{x:number;y:number}|null;line?:number}{
  if(!expr)return {name:null,point:null};
  if(ts.isIdentifier(expr)){
   const b=points.get(expr.text);
   return {name:expr.text,point:b?{x:b.x,y:b.y}:null,line:b?.line};
  }
  const literal=objectPointLiteral(expr,numConsts);
  return {name:null,point:literal,line:literal?lineOf(file,expr):undefined};
 }

 // Pass 2: collect JSX routes, follow-path bindings, clipPaths, data-object elements, and curve calls.
 function collectSceneElements(node:ts.Node,conditionalLine?:number,activeClip?:{id:string;line:number}){
  if(ts.isConditionalExpression(node)){
   const cLine=lineOf(file,node.condition);
   collectSceneElements(node.condition,conditionalLine,activeClip);
   collectSceneElements(node.whenTrue,cLine,activeClip);
   collectSceneElements(node.whenFalse,cLine,activeClip);
   return;
  }
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&(node.expression.text==='quad'||node.expression.text==='cubic')){
   const fn=node.expression.text;
   const expectedPts=fn==='quad'?3:4;
   if(node.arguments.length>=expectedPts+1){
    const ptArgs=node.arguments.slice(0,expectedPts).map(a=>resolvePoint(a));
    const uArg=node.arguments[expectedPts];
    const uNum=numericLiteral(uArg);
    curveCalls.push({
     fn,
     line:lineOf(file,node),
     pointNames:ptArgs.map(p=>p.name),
     points:ptArgs.map(p=>p.point),
     pointLines:ptArgs.flatMap(p=>p.line?[p.line]:[]),
     progressArgText:uArg.getText(file),
     isConstantEndpoint:uNum===0||uNum===1,
    });
   }
  }
  let childClip=activeClip;
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
   const opening=ts.isJsxElement(node)?node.openingElement:node;
   const tag=opening.tagName.getText(file);
   const attrs=opening.attributes;
   const line=lineOf(file,opening);

   if(tag==='clipPath'||tag==='mask'){
    const idAttr=jsxAttributeString(attrs,'id',file);
    if(idAttr?.value)clipDefs.set(idAttr.value,line);
    else if(idAttr?.expr)hasDynamicClipDefinition=true;
   }
   const clipAttr=jsxAttributeString(attrs,'clipPath',file)??jsxAttributeString(attrs,'clip-path',file)??jsxAttributeString(attrs,'mask',file);
   if(clipAttr?.value){
    const match=/^url\(\s*#([A-Za-z_][\w.-]*)\s*\)$/.exec(clipAttr.value);
    if(match){
     const id=match[1];
     const nonEmpty=ts.isJsxElement(node)?hasRenderedJsxChildren(node.children,file):tag!=='g'&&tag!=='svg';
     if(!clipUsages.has(id))clipUsages.set(id,[]);
     clipUsages.get(id)!.push({line,nonEmpty,contextLine:conditionalLine??line});
     childClip={id,line};
    }
   }
   if(tag==='g'){
    const tr=jsxAttributeString(attrs,'transform',file);
    const trText=tr?.expr?tr.expr.getText(file):tr?.value;
    if(trText&&trText.includes('translate')){
     if(activeClip)clippedTransforms.set(trText,{clipId:activeClip.id,line,clipLine:activeClip.line});
     else unclippedTransforms.set(trText,line);
    }
   }
   const dataObj=jsxAttributeString(attrs,'data-object',file);
   if(dataObj?.value){
    if(!objectLines.has(dataObj.value))objectLines.set(dataObj.value,[]);
    objectLines.get(dataObj.value)!.push(line);
   }else if(tag==='g'){
    const tr=jsxAttributeString(attrs,'transform',file);
    if(tr)uncommentedGroups.push({line,hasTranslate:true});
   }
   const followAttr=jsxAttributeString(attrs,'data-follow-path',file);
   if(followAttr){
    hasFollowPathAttr=true;
    // An audit route must not inherit the transform of the mover it measures.
    if(followAttr.value&&ts.isJsxElement(node)&&jsxAttributeString(attrs,'transform',file)){
     const routeId=followAttr.value;
     const inspect=(child:ts.Node)=>{
      if(ts.isJsxElement(child)||ts.isJsxSelfClosingElement(child)){
       const open=ts.isJsxElement(child)?child.openingElement:child;
       if(jsxAttributeString(open.attributes,'id',file)?.value===routeId){
        const lines=sortedUniqueLines([line,lineOf(file,open)]);
        nestedRouteFindings.push({kind:'route-mismatch',target:routeId,lines,
         detail:`Audit route #${routeId} is nested under its own transformed mover; the route inherits the moving coordinate system instead of independently measuring that motion.`,
         feedback:`Move route #${routeId} outside its data-follow-path mover into the same stable coordinate system as the mover's parent. Derive route points and motion from shared coordinates; retain the route and mover annotations. Do not apply the mover translation to world-space path points twice.`});
       }
      }
      ts.forEachChild(child,inspect);
     };
     for(const child of node.children)inspect(child);
    }
    const collectFollowExpr=(expr:ts.Expression|undefined)=>{
     if(!expr)return;
     if(ts.isStringLiteralLike(expr))followPathValues.add(expr.text);
     else if(ts.isIdentifier(expr)){
      for(const v of stringAssignments.get(expr.text)??[])followPathValues.add(v);
     }else if(ts.isConditionalExpression(expr)){
      collectFollowExpr(expr.whenTrue);collectFollowExpr(expr.whenFalse);
     }else if(ts.isParenthesizedExpression(expr)){
      collectFollowExpr(expr.expression);
     }
    };
    if(followAttr.value)followPathValues.add(followAttr.value);
    else collectFollowExpr(followAttr.expr);
   }
   const routeAttr=jsxAttributeString(attrs,'data-route',file);
   if(routeAttr){
    const idAttr=jsxAttributeString(attrs,'id',file);
    const dAttr=jsxAttributeString(attrs,'d',file);
    const pointNames:string[]=[];
    const routePoints:{x:number;y:number}[]=[];
    const pointLines:number[]=[];
    if(dAttr?.expr&&ts.isTemplateExpression(dAttr.expr)){
     const seenNames:string[]=[];
     for(const span of dAttr.expr.templateSpans){
      if(ts.isPropertyAccessExpression(span.expression)&&ts.isIdentifier(span.expression.expression)&&(span.expression.name.text==='x'||span.expression.name.text==='y')){
       const ident=span.expression.expression.text;
       if(seenNames.at(-1)!==ident)seenNames.push(ident);
      }
     }
     for(const name of seenNames){
      pointNames.push(name);
      const b=points.get(name);
      if(b){routePoints.push({x:b.x,y:b.y});pointLines.push(b.line);}
     }
    }else if(dAttr?.value){
     const nums=(dAttr.value.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
     if(nums.length>=6&&nums.length%2===0){
      for(let i=0;i<nums.length;i+=2){
       routePoints.push({x:nums[i],y:nums[i+1]});
       if(dAttr.line)pointLines.push(dAttr.line);
      }
     }
    }
    routes.push({
     id:idAttr?.value??'',
     tagName:tag,
     line,
     dLine:dAttr?.line,
     pointNames,
     points:routePoints,
     pointLines,
    });
   }
  }
  ts.forEachChild(node,child=>collectSceneElements(child,conditionalLine,childClip));
 }
 collectSceneElements(file);

 const findings:SourceMotionFinding[]=reviewPoseBoundaries(file,design);
 findings.push(...nestedRouteFindings);

 // Check 1: Premature branch cutoff / jump to endpoint (motion-discontinuity)
 function inspectBranches(node:ts.Node){
  if(ts.isIfStatement(node)&&node.elseStatement){
   const cond=node.expression;
   let cutoff:number|undefined;
   if(ts.isBinaryExpression(cond)){
    const leftId=ts.isIdentifier(cond.left)&&frameAliases.has(cond.left.text);
    const rightId=ts.isIdentifier(cond.right)&&frameAliases.has(cond.right.text);
    const rightNum=numericLiteral(cond.right);
    const leftNum=numericLiteral(cond.left);
    if(leftId&&rightNum!==undefined){
     if(cond.operatorToken.kind===ts.SyntaxKind.LessThanToken)cutoff=rightNum;
     else if(cond.operatorToken.kind===ts.SyntaxKind.LessThanEqualsToken)cutoff=rightNum+1;
    }else if(rightId&&leftNum!==undefined){
     if(cond.operatorToken.kind===ts.SyntaxKind.GreaterThanToken)cutoff=leftNum;
     else if(cond.operatorToken.kind===ts.SyntaxKind.GreaterThanEqualsToken)cutoff=leftNum+1;
    }
   }
   if(cutoff!==undefined){
    const collectUsedProgress=(branch:ts.Node):ProgressBinding[]=>{
     const used=new Map<string,ProgressBinding>();
     const localAliases=new Map<string,ProgressBinding>();
     const visit=(n:ts.Node)=>{
      if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.arguments.length===1&&ts.isIdentifier(n.initializer.arguments[0])){
       const target=progressVars.get(n.initializer.arguments[0].text);
       if(target)localAliases.set(n.name.text,target);
      }
      if(ts.isIdentifier(n)){
       const direct=progressVars.get(n.text)??localAliases.get(n.text);
       if(direct)used.set(direct.name,direct);
      }
      ts.forEachChild(n,visit);
     };
     visit(branch);
     return [...used.values()];
    };
    const thenProgress=collectUsedProgress(node.thenStatement);
    const elseProgress=new Set(collectUsedProgress(node.elseStatement).map(p=>p.name));
    for(const p of thenProgress){
     if(p.startFrame<cutoff&&cutoff<p.endFrame&&!elseProgress.has(p.name)){
      const elseLines:number[]=[];
      const elseNextProgress=collectUsedProgress(node.elseStatement);
      for(const nextP of elseNextProgress){
       if(nextP.startFrame<=cutoff)elseLines.push(nextP.line);
      }
      const findElseJumps=(n:ts.Node)=>{
       if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isCallExpression(n.initializer)){
        const fn=ts.isIdentifier(n.initializer.expression)?n.initializer.expression.text:'';
        if(n.initializer.arguments.length===1&&ts.isIdentifier(n.initializer.arguments[0])&&progressVars.has(n.initializer.arguments[0].text)){
         elseLines.push(lineOf(file,n));
        }
        if((fn==='quad'||fn==='cubic')&&numericLiteral(n.initializer.arguments.at(-1))===1){
         elseLines.push(lineOf(file,n));
        }
       }
       ts.forEachChild(n,findElseJumps);
      };
      findElseJumps(node.elseStatement);
      const lines=sortedUniqueLines([p.line,lineOf(file,node),...elseLines]);
      findings.push({
       kind:'motion-discontinuity',
       target:p.name,
       lines,
       detail:`Progress "${p.name}" is defined on frames ${p.startFrame}..${p.endFrame} (line ${p.line}), but at frame ${cutoff} (line ${lineOf(file,node)}) the branch exits early and evaluates the next pose${elseLines.length?` (lines ${elseLines.join(', ')})`:''} before "${p.name}" reaches u=1. This introduces a premature jump.`,
       feedback:`Fix motion-discontinuity on "${p.name}" (lines ${lines.join(', ')}): keep the branch boundary aligned with frames ${p.startFrame}..${p.endFrame} or start the next phase from the actual pose at frame ${cutoff} instead of jumping to u=1 at frame ${cutoff}.`,
      });
     }
    }
   }
  }
  ts.forEachChild(node,inspectBranches);
 }
 inspectBranches(file);

 // Check 2: Visible route vs. motion curve mismatch & missing data-follow-path annotations (route-mismatch)
 const activeCurveCalls=curveCalls.filter(c=>!c.isConstantEndpoint);
 const quadRoutes=routes.filter(r=>r.points.length===3);
 const mismatchedCalls:CurveCallRecord[]=[];
 const matchedRouteLines=new Set<number>();
 for(const call of activeCurveCalls){
  if(call.fn==='quad'&&quadRoutes.length>0&&call.points.every(p=>p!==null)){
   const [s,c,e]=call.points as {x:number;y:number}[];
   const exactMatch=quadRoutes.some(r=>{
    const [rs,rc,re]=r.points;
    return Math.hypot(s.x-rs.x,s.y-rs.y)<=1&&Math.hypot(c.x-rc.x,c.y-rc.y)<=1&&Math.hypot(e.x-re.x,e.y-re.y)<=1;
   });
   if(!exactMatch){
    mismatchedCalls.push(call);
    for(const r of quadRoutes){
     matchedRouteLines.add(r.line);
     if(r.dLine)matchedRouteLines.add(r.dLine);
     if(r.pointLines.length){
      matchedRouteLines.add(r.pointLines[0]);
      matchedRouteLines.add(r.pointLines[r.pointLines.length-1]);
     }
    }
   }
  }
 }
 const unboundRoutes=routes.filter(r=>r.id&&!followPathValues.has(r.id));
 const activeAnchorOffsets=hasFollowPathAttr?anchorOffsetLines:[];
 if(mismatchedCalls.length>0||activeAnchorOffsets.length>0||(routes.length>0&&activeCurveCalls.length>0&&!hasFollowPathAttr)){
  const lines=sortedUniqueLines([
   ...matchedRouteLines,
   ...mismatchedCalls.flatMap(c=>[c.line,...c.pointLines]),
   ...activeAnchorOffsets.map(a=>a.line),
   ...unboundRoutes.flatMap(r=>[r.line,...(r.dLine?[r.dLine]:[])]),
  ]);
  const missingFollowNote=!hasFollowPathAttr
   ?' Neither mover carries data-follow-path annotations.'
   :unboundRoutes.length
    ?` Unbound [data-route] IDs without data-follow-path: ${unboundRoutes.map(r=>r.id).join(', ')}.`
    :'';
  const offsetNote=activeAnchorOffsets.map(a=>a.detail).join('');
  findings.push({
   kind:'route-mismatch',
   target:routes.map(r=>r.id||r.tagName).join(',')||'routes',
   lines,
   detail:`Visible [data-route] geometry does not match the curve endpoints or local (0,0) anchor evaluated for moving objects.${missingFollowNote}${offsetNote}`,
   feedback:`Fix route-mismatch (lines ${lines.join(', ')}): derive both the visible [data-route] path and the mover's curve interpolation from the exact same start/control/end coordinates, keep the outer [data-follow-path] group at exact (pt.x, pt.y) with any centering offset on an inner child <g>, and set data-follow-path="<route-id>" on the moving group while its local (0,0) anchor follows that route.`,
  });
 }

 // Check 3: Empty clipPath/mask groups, unreferenced clipPaths, or duplicate unclipped+clipped groups (occlusion-incomplete)
 const emptyClipLines:number[]=[];
 const badClipIds:string[]=[];
 const duplicateClipNotes:string[]=[];
 for(const [id,usages] of clipUsages.entries()){
  if(!clipDefs.has(id)&&!hasDynamicClipDefinition){
   findings.push({kind:'occlusion-incomplete',target:id,lines:sortedUniqueLines(usages.map(u=>u.line)),
    detail:`Local clip/mask #${id} has no definition in this self-contained source. The declared reveal or containment cannot be verified.`,
    feedback:`Define the referenced clipPath/mask #${id} with the intended bounds, or replace the reference with an explicit valid occlusion mechanism. Check initial concealment, travel and settled visibility; do not remove clipping merely to hide this diagnostic.`});
  }
  const emptyUses=usages.filter(u=>!u.nonEmpty);
  if(emptyUses.length>0){
   badClipIds.push(id);
   const defLine=clipDefs.get(id);
   if(defLine)emptyClipLines.push(defLine);
   for(const u of emptyUses){
    emptyClipLines.push(u.contextLine,u.line);
   }
  }
 }
 for(const [trText,clipped] of clippedTransforms.entries()){
  const unclippedLine=unclippedTransforms.get(trText);
  if(unclippedLine!==undefined){
   if(!badClipIds.includes(clipped.clipId))badClipIds.push(clipped.clipId);
   const defLine=clipDefs.get(clipped.clipId);
   if(defLine)emptyClipLines.push(defLine);
   emptyClipLines.push(unclippedLine,clipped.clipLine,clipped.line);
   duplicateClipNotes.push(`Group with transform ${trText} is rendered both unclipped (line ${unclippedLine}) and inside #${clipped.clipId} (line ${clipped.line}), so the unclipped copy covers the clipped occlusion.`);
  }
 }
 if(badClipIds.length>0){
  const contextLines:number[]=[];
  for(const [id,lines] of objectLines.entries()){
   if(design.overlaps?.some(o=>o.a===id||o.b===id))contextLines.push(...lines);
  }
  const lines=sortedUniqueLines([...emptyClipLines,...contextLines]);
  findings.push({
   kind:'occlusion-incomplete',
   target:badClipIds.join(','),
   lines,
   detail:duplicateClipNotes.length>0
    ?duplicateClipNotes.join(' ')
    :`Clip path(s) ${badClipIds.map(id=>`#${id}`).join(', ')} are referenced on an empty group with no drawable children, leaving declared occlusion/containment relationships unimplemented.`,
   feedback:`Fix occlusion-incomplete on ${badClipIds.map(id=>`#${id}`).join(', ')} (lines ${lines.join(', ')}): render the moving payload ONLY ONCE inside the clipped group (do not render a second unclipped copy outside it) and never leave a <g clipPath="url(#...)"> empty.`,
  });
 }

 const coverageGaps:{kind:string;target:string;detail:string}[]=[];
 const designHasPaths=design.objects.some(o=>o.kind==='path');
 if((routes.length>0||designHasPaths||activeCurveCalls.length>0)&&(!hasFollowPathAttr||unboundRoutes.length>0)){
  coverageGaps.push({
   kind:'missing-motion-coverage',
   target:'data-follow-path',
   detail:!hasFollowPathAttr
    ?'Scene declares routes or curve motion without any [data-follow-path] binding; runtime geometry audit will have zero measured movers (partial coverage).'
    :`Route(s) ${unboundRoutes.map(r=>r.id).join(', ')} are never referenced by [data-follow-path]; runtime motion coverage is partial.`,
  });
 }

 const coverage:'partial'|'declared'=coverageGaps.length>0||!hasFollowPathAttr?'partial':'declared';
 const status:SourceMotionReview['status']=findings.length>0?'revise-required':coverage==='partial'?'partial-coverage':'pending-render';
 const pendingRenderChecks=[
  'arbitrary-frame-pose-continuity',
  'rendered-route-and-label-clearance',
  'rendered-occlusion-and-clipping',
 ];
 const feedbackParts=[
  ...findings.map(f=>f.feedback),
  ...coverageGaps.map(g=>`Add [data-follow-path] coverage (${g.target}): ${g.detail}`),
  'Static AST review does not prove arbitrary frame-to-frame continuity or pixel occlusion; re-render stills and verify geometry after revising source.',
 ];
 const feedback=feedbackParts.join('\n').slice(0,4000);

 return {
  schemaVersion:'source-motion-review:1',
  sha256:sourceHash(artifact),
  designSha256:designHash(design),
  status,
  coverage,
  staticContinuityProven:false,
  accepted:false,
  visual:'pending',
  findings,
  coverageGaps,
  pendingRenderChecks,
  feedback,
 };
}

export function motionQualityFeedback(artifactInput:unknown,designInput:unknown,renderReport?:unknown){
 const design=parseDesign(designInput);
 const artifact=parseArtifact(artifactInput,design.brief);
 const staticReview=reviewSourceMotion(artifact,design);
 const geometry=renderReport!==undefined?geometryFeedback(renderReport,artifact,design):undefined;
 const originalGeometryStatus=geometry?geometry.originalGeometryStatus:'not_run' as const;
 const sections:string[]=[];
 if(staticReview.findings.length>0){
  sections.push('STATIC_MOTION_AND_OCCLUSION_FINDINGS:\n'+JSON.stringify(staticReview.findings));
 }
 if(staticReview.coverageGaps.length>0){
  sections.push('MOTION_AUDIT_COVERAGE_GAPS:\n'+JSON.stringify(staticReview.coverageGaps));
 }
 if(geometry){
  sections.push('RENDERED_GEOMETRY_FINDINGS:\n'+JSON.stringify(geometry));
 }
 sections.push('PENDING_RENDER_CHECKS:\n'+JSON.stringify(staticReview.pendingRenderChecks));
 sections.push(staticReview.feedback);
 const feedback=sections.join('\n\n').slice(0,8000);
 return {
  schemaVersion:'motion-quality-feedback:1' as const,
  sha256:staticReview.sha256,
  designSha256:staticReview.designSha256,
  accepted:false as const,
  visual:'pending' as const,
  originalGeometryStatus,
  staticReview,
  ...(geometry?{geometry}:{}),
  feedback,
 };
}
