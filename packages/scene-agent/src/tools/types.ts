import type {Capabilities,ContentPart,ToolSpec} from '../provider/types';
import type {StillRenderer,StillsResult} from '../render/stills';
import type {Workspace} from '../workspace';

export type ToolOutput={content:ContentPart[];isError?:boolean};

export type ToolContext={
 workspace:Workspace;
 renderer:StillRenderer;
 capabilities:Capabilities;
 lastRender?:StillsResult; // updated by render_stills; audit_scene and view_frames read it
 cleanCheckpoint?:{sourceSha256:string;file:string}; // last version with no [high] findings, kept by the harness
};

export type Tool={
 spec:ToolSpec;
 readOnly:boolean; // read-only tools may run in parallel within one turn
 run(input:any,context:ToolContext):Promise<ToolOutput>;
};

export class ToolInputError extends Error{}

export const text=(value:string):ToolOutput=>({content:[{type:'text',text:value}]});
export const failure=(value:string):ToolOutput=>({content:[{type:'text',text:value}],isError:true});
