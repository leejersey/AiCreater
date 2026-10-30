import ts from 'typescript';

// Syntactic binding audit only: it does not prove the origin of `motion` or sandbox code.
export function checkMotionBindings(source:string,objectIds:readonly string[]):void{
 const file=ts.createSourceFile('Scene.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 const expected=new Set(objectIds),seen=new Set<string>();
 if(expected.size!==objectIds.length)throw Error('motion_binding: duplicate expected id');
 function visit(node:ts.Node,transformedAncestor:boolean){
  if(ts.isJsxElement(node)){
   const transformed=inspect(node.openingElement,transformedAncestor);
   for(const child of node.children)visit(child,transformedAncestor||transformed);
   return;
  }
  if(ts.isJsxSelfClosingElement(node)){inspect(node,transformedAncestor);return;}
  ts.forEachChild(node,child=>visit(child,transformedAncestor));
 }
 function inspect(node:ts.JsxOpeningElement|ts.JsxSelfClosingElement,ancestor:boolean):boolean{
  const attributes=node.attributes.properties;
  const named=(name:string)=>attributes.filter((a):a is ts.JsxAttribute=>ts.isJsxAttribute(a)&&a.name.getText(file)===name);
  const objects=named('data-object');
  const literal=objects[0]?.initializer;
  const id=literal&&ts.isStringLiteral(literal)?literal.text:undefined;
  const transformed=named('transform').length>0||named('style').length>0||named('className').length>0||attributes.some(ts.isJsxSpreadAttribute)||node.tagName.getText(file)==='svg';
  // The root SVG establishes the world coordinate system, not an ancestor offset.
  const ancestorTransform=transformed&&node.tagName.getText(file)!=='svg';
  if(id&&expected.has(id)){
   if(seen.has(id))throw Error('motion_binding: duplicate object '+id);
   seen.add(id);
   if(ancestor)throw Error('motion_binding: transformed ancestor '+id);
   if(node.tagName.getText(file)!=='g'||objects.length!==1||attributes.some(ts.isJsxSpreadAttribute)||named('style').length||named('className').length)throw Error('motion_binding: unsupported group binding '+id);
   for(const property of ['transform','opacity']){
    const attrs=named(property),init=attrs[0]?.initializer;
    const expr=init&&ts.isJsxExpression(init)?init.expression:undefined;
    if(attrs.length!==1||!expr||!ts.isPropertyAccessExpression(expr)||expr.name.text!==property||!ts.isElementAccessExpression(expr.expression))throw Error('motion_binding: missing direct binding '+id);
    const lookup=expr.expression;
    if(!ts.isIdentifier(lookup.expression)||lookup.expression.text!=='motion'||!ts.isStringLiteral(lookup.argumentExpression)||lookup.argumentExpression.text!==id)throw Error('motion_binding: wrong object binding '+id);
   }
  }
  return ancestorTransform;
 }
 visit(file,false);
 for(const id of expected)if(!seen.has(id))throw Error('motion_binding: missing object '+id);
}
