'use client';
import type {CourseStep} from '../lib/visual-workbench';
/** The course's way to an exported video; each step jumps to where it is done. */
export function CourseSteps({steps,onPick}:{steps:CourseStep[];onPick?:(key:CourseStep['key'])=>void}){
 return <ol className="course-steps" aria-label="课程进度">{steps.map((s,i)=><li key={s.key} data-state={s.state} aria-current={s.state==='current'||s.state==='blocked'?'step':undefined}>
  {onPick?<button type="button" onClick={()=>onPick(s.key)} title={s.detail}><span className="course-step-dot">{s.state==='done'?'✓':i+1}</span>{s.label}<small>{s.detail}</small></button>
   :<span title={s.detail}><span className="course-step-dot">{s.state==='done'?'✓':i+1}</span>{s.label}</span>}
 </li>)}</ol>;
}
