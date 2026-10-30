import TeachingWorkbench from '../../../TeachingWorkbench';
export default async function Teaching({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <TeachingWorkbench key={id} projectId={id}/>;
}
