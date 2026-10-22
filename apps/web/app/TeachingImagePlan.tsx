import type {TeachingImagePlanEntry} from '../lib/editor';

const purposes={object:'对象展示',metaphor:'概念类比',comparison:'辅助对比',spatial:'空间关系'};

export function TeachingImagePlan({entry}:{entry:TeachingImagePlanEntry|undefined}) {
  if(!entry)return null;
  const plan=entry.plan;
  return <details open><summary>教学图片计划 · {entry.status==='needs_review'?'需重新核对':plan.needed?`${plan.requirements.length} 个素材`:'无需图片'}</summary>
    {entry.status==='needs_review'&&<p role="status">教学内容或锚点已变化，旧计划仅供参考，不能直接用于生图。请重新生成并核对候选分镜。</p>}
    <p>{plan.reason}</p>
    {plan.requirements.map(r=><article key={r.id}>
      <h4>{r.alt} · {purposes[r.purpose]}</h4>
      <p>对应口播：<q>{r.quote}</q></p>
      <p>生成对象：{r.description}</p>
      <p>构图：{r.composition}</p>
      <p className="hint">随教学元素 {r.element_id} 入场与强调；标签、代码和箭头由组件绘制。</p>
    </article>)}
    {plan.needed&&<p className="hint">目前仅规划素材，尚未生成图片，不会自动调用生图或产生图片费用。</p>}
  </details>;
}
