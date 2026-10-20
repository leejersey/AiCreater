import Workbench from '../../Workbench';
export default async function Course({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Workbench key={id} routeProjectId={id}/>;}
