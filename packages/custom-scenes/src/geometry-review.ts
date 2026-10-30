type DiagnosticIssue={kind:string;target:string;detail:string};
export type GeometryReviewRule={
 id:string;fromFrame:number;toFrame:number;issue:DiagnosticIssue;
 relationship:'containment'|'occlusion';reason:string;
};
type DiagnosticReport={sha256:string;durationInFrames:number;geometry:{status:string;frames:Record<string,{issues:DiagnosticIssue[]}>}};
const sameIssue=(a:DiagnosticIssue,b:DiagnosticIssue)=>a.kind===b.kind&&a.target===b.target&&a.detail===b.detail;
const validIssue=(value:DiagnosticIssue)=>value&&['kind','target','detail'].every(key=>typeof value[key as keyof DiagnosticIssue]==='string'&&value[key as keyof DiagnosticIssue].length>0&&value[key as keyof DiagnosticIssue].length<=4000);

/** Exact, hash-bound annotations for review only. Never changes render/export eligibility. */
export function reviewGeometryDiagnostics(report:DiagnosticReport,policy:{sha256:string;rules:GeometryReviewRule[]}){
 if(!/^[a-f0-9]{64}$/.test(policy.sha256)||policy.sha256!==report.sha256)throw Error('geometry_review: source hash mismatch');
 if(!Number.isInteger(report.durationInFrames)||report.durationInFrames<1||report.durationInFrames>3600)throw Error('geometry_review: invalid duration');
 if(!Array.isArray(policy.rules)||policy.rules.length>20)throw Error('geometry_review: invalid rules');
 const ids=new Set<string>();
 for(const rule of policy.rules){
  if(!rule||typeof rule.id!=='string'||!rule.id.trim()||rule.id.length>100||ids.has(rule.id)||
   !Number.isInteger(rule.fromFrame)||!Number.isInteger(rule.toFrame)||rule.fromFrame<0||rule.toFrame<rule.fromFrame||rule.toFrame>=report.durationInFrames||
   !validIssue(rule.issue)||rule.issue.kind!=='label-obstacle'||!['containment','occlusion'].includes(rule.relationship)||
   typeof rule.reason!=='string'||!rule.reason.trim()||rule.reason.length>2000)throw Error('geometry_review: invalid rule');
  ids.add(rule.id);
 }
 for(let i=0;i<policy.rules.length;i++)for(const other of policy.rules.slice(i+1)){
  const rule=policy.rules[i];
  if(sameIssue(rule.issue,other.issue)&&rule.fromFrame<=other.toFrame&&other.fromFrame<=rule.toFrame)throw Error('geometry_review: ambiguous rules');
 }
 if(!report.geometry||typeof report.geometry.status!=='string'||!report.geometry.frames||typeof report.geometry.frames!=='object'||Array.isArray(report.geometry.frames))throw Error('geometry_review: invalid frames');
 const frames=Object.entries(report.geometry.frames);
 if(!frames.length||frames.length>500)throw Error('geometry_review: invalid frame count');
 const issues:{frame:number;issue:DiagnosticIssue;classification:'unclassified'|'expected-containment'|'expected-occlusion';ruleId?:string;reason?:string}[]=[];
 for(const [key,audit] of frames){
  const frame=Number(key);
  if(!Number.isInteger(frame)||String(frame)!==key||frame<0||frame>=report.durationInFrames)throw Error('geometry_review: invalid frame');
  if(!audit||!Array.isArray(audit.issues)||audit.issues.length>201||!audit.issues.every(validIssue))throw Error('geometry_review: invalid issues');
  for(const problem of audit.issues){
   const rule=policy.rules.find(r=>frame>=r.fromFrame&&frame<=r.toFrame&&sameIssue(problem,r.issue));
   issues.push({frame,issue:{...problem},classification:rule?(rule.relationship==='containment'?'expected-containment':'expected-occlusion'):'unclassified',...(rule?{ruleId:rule.id,reason:rule.reason}:{})});
  }
 }
 const unclassified=issues.filter(i=>i.classification==='unclassified').length;
 return {schemaVersion:'geometry-diagnostic-review:1' as const,status:'diagnostic-only' as const,accepted:false as const,
  sha256:report.sha256,originalGeometryStatus:report.geometry.status,sampledFrames:frames.length,
  expectedRelationships:issues.length-unclassified,unclassified,issues,
  scope:'Reviewer-supplied exact relationship annotations, not proof of pixel visibility, motion coverage or visual acceptance.'};
}
