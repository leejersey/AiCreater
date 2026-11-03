import ts from 'typescript';

export type SceneBrief = {
  schemaVersion:'custom-scene-brief:1';id:string;title:string;narration:string;
  visualGoal:string;facts:string[];materials:string[];
  width:1920;height:1080;fps:30;durationInFrames:number;
};
export {sceneTheme} from './theme';

function record(value:unknown,keys:string[],label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`custom_scene: invalid ${label}`);
  const row=value as Record<string,unknown>;
  if(Object.keys(row).some(k=>!keys.includes(k))||keys.some(k=>!(k in row)))throw Error(`custom_scene: invalid ${label} fields`);
  return row;
}
function text(value:unknown,max:number,label:string):string{
  if(typeof value!=='string'||!value.trim()||[...value].length>max)throw Error(`custom_scene: invalid ${label}`);
  return value;
}
function texts(value:unknown,label:string):string[]{
  if(!Array.isArray(value)||value.length>20)throw Error(`custom_scene: invalid ${label}`);
  return value.map(v=>text(v,2000,label));
}
export function parseBrief(value:unknown):SceneBrief{
  const row=record(value,['schemaVersion','id','title','narration','visualGoal','facts','materials','width','height','fps','durationInFrames'],'brief');
  if(row.schemaVersion!=='custom-scene-brief:1'||row.width!==1920||row.height!==1080||row.fps!==30||!Number.isInteger(row.durationInFrames)||Number(row.durationInFrames)<30||Number(row.durationInFrames)>3600)throw Error('custom_scene: invalid timing or version');
  const id=text(row.id,64,'id');if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('custom_scene: invalid id');
  return {schemaVersion:'custom-scene-brief:1',id,title:text(row.title,80,'title'),narration:text(row.narration,4000,'narration'),visualGoal:text(row.visualGoal,4000,'visualGoal'),facts:texts(row.facts,'facts'),materials:texts(row.materials,'materials'),width:1920,height:1080,fps:30,durationInFrames:Number(row.durationInFrames)};
}

// Guardrails for reviewed local source, not a security sandbox for hostile code.
export function checkSource(source:string):void{
  const file=ts.createSourceFile('Scene.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const diagnostics=ts.transpileModule(source,{fileName:'Scene.tsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).diagnostics??[];
  if(diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('custom_scene_source: invalid TSX');
  let hasDefault=false;
  const banned=new Set(['fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker','eval','Function','require','process','globalThis','window','document','navigator','localStorage','sessionStorage','setTimeout','setInterval','requestAnimationFrame','Date','random','constructor','__proto__','prototype','useEffect','useLayoutEffect','dangerouslySetInnerHTML','Audio','Video','Img','OffthreadVideo','IFrame','staticFile','getInputProps']);
  const imports=new Set(['react','remotion']);
  function visit(node:ts.Node){
    if(ts.isImportDeclaration(node)){
      if(!ts.isStringLiteral(node.moduleSpecifier)||!imports.has(node.moduleSpecifier.text)||!node.importClause)throw Error('custom_scene_source: disallowed import');
    }
    if(ts.isExportDeclaration(node)||ts.isImportEqualsDeclaration(node)||ts.isNewExpression(node))throw Error('custom_scene_source: unsupported executable construct');
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)throw Error('custom_scene_source: dynamic import');
    if(ts.isIdentifier(node)&&banned.has(node.text))throw Error(`custom_scene_source: disallowed ${node.text}`);
    if(ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)&&banned.has(node.argumentExpression.text))throw Error('custom_scene_source: disallowed property');
    if(ts.isStringLiteralLike(node)){
      const attribute=node.parent,element=attribute?.parent?.parent;
      const svgNamespace=node.text==='http://www.w3.org/2000/svg'&&ts.isJsxAttribute(attribute)&&attribute.initializer===node&&attribute.name.getText(file)==='xmlns'&&element&&(ts.isJsxOpeningElement(element)||ts.isJsxSelfClosingElement(element))&&element.tagName.getText(file)==='svg';
      if(!svgNamespace&&/url\s*\(|https?:|data:|javascript:/i.test(node.text.replace(/url\(\s*#[A-Za-z_][\w.-]*\s*\)/g,'')))throw Error('custom_scene_source: external resource');
    }
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      if(['script','iframe','img','image','audio','video','object','embed','link','style','foreignObject'].includes(node.tagName.getText(file)))throw Error('custom_scene_source: disallowed media or embedding');
      if(node.attributes.properties.some(a=>ts.isJsxAttribute(a)&&/^on[A-Z]/.test(a.name.getText(file))))throw Error('custom_scene_source: event handler');
    }
    if(ts.isFunctionDeclaration(node)&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)&&node.modifiers.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))hasDefault=true;
    ts.forEachChild(node,visit);
  }
  visit(file);
  if(!hasDefault)throw Error('custom_scene_source: export default function Scene is required');
}
