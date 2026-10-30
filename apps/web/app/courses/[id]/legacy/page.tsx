import Workbench from '../../../Workbench';
export default async function LegacyCourse({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <><a href={'/courses/'+encodeURIComponent(id)}>返回定制视觉工作台</a><Workbench key={id} routeProjectId={id}/></>;
}
