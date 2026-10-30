import VisualWorkbench from '../../VisualWorkbench';
export default async function Course({params}:{params:Promise<{id:string}>}){const {id}=await params;return <VisualWorkbench key={id} routeProjectId={id}/>;}
