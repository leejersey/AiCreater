// Provider-neutral message and tool types. Adapters translate these to each vendor's wire format.

export type JSONSchema={[key:string]:unknown};

export type TextPart={type:'text';text:string};
export type ImagePart={type:'image';mediaType:'image/png'|'image/jpeg';data:string}; // base64, vision models only
export type ContentPart=TextPart|ImagePart;

// `arguments` is the parsed JSON object. When the model sent unparseable or truncated
// arguments, `parseError` is set and `arguments` holds the raw string; the loop returns
// the error to the model instead of failing the run.
export type ToolCall={id:string;name:string;arguments:unknown;parseError?:string};

export type UserMessage={role:'user';content:ContentPart[]};
// `providerState` is opaque, adapter-owned data (thinking blocks, reasoning text) that must be
// echoed back unchanged on the next request. The loop never inspects or edits it.
export type AssistantMessage={role:'assistant';content:ContentPart[];toolCalls:ToolCall[];providerState?:unknown};
export type ToolMessage={role:'tool';toolCallId:string;content:ContentPart[];isError?:boolean};
export type Message=UserMessage|AssistantMessage|ToolMessage;

export type ToolSpec={name:string;description:string;inputSchema:JSONSchema};

export type TurnRequest={
 system:string;
 messages:Message[];
 tools:ToolSpec[];
 maxOutputTokens?:number;
 signal?:AbortSignal;
};

export type StopReason='tool_use'|'end_turn'|'max_tokens'|'refusal'|'other';
export type Usage={inputTokens:number;outputTokens:number;cachedInputTokens:number};
export type TurnResult={message:AssistantMessage;stop:StopReason;usage:Usage;raw:unknown}; // raw is for transcripts only

export type Capabilities={
 vision:boolean;
 parallelToolCalls:boolean;
 contextTokens:number;
 maxOutputTokens:number;
 promptCache:boolean;
 // History must stay append-only (e.g. preserved thinking); the loop may not fold old turns.
 appendOnlyHistory:boolean;
};

export interface Provider{
 readonly name:string;
 readonly capabilities:Capabilities;
 turn(request:TurnRequest):Promise<TurnResult>;
}

// auth: bad/missing key, permission or balance — never retried.
// unavailable: rate limit, 5xx, network or timeout after transport retries.
// request: the provider rejected the request shape (4xx) — a harness bug, not a model failure.
// response: the provider answered with something the adapter cannot read.
// destination: a configured endpoint resolves to a non-public address; nothing was sent.
export type ProviderErrorCode='auth'|'unavailable'|'request'|'response'|'aborted'|'destination';
export class ProviderError extends Error{
 constructor(readonly code:ProviderErrorCode,message:string,readonly status?:number){super(message);this.name='ProviderError';}
}

export function textOf(parts:ContentPart[]):string{return parts.filter((p):p is TextPart=>p.type==='text').map(p=>p.text).join('\n');}
