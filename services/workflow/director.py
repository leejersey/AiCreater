"""Strict provider choices; source boundaries, IDs, relations and frames remain program-owned."""
import copy
import re


def sections(text):
    return [m.group() for m in re.finditer(r'.+?(?:\n[ \t]*\n|$)',text,re.S) if m.group()]


def excerpts(text):
    return [{'id':i+1,'text':m.group().strip(),'codepoints':len(m.group().strip()),'text_start':m.start()+len(m.group())-len(m.group().lstrip())} for i,m in enumerate(re.finditer(r'[^，。！？；：\n]+',text)) if m.group().strip()]


def plan_schema(text,*,roles=False):
    properties={}
    for i,section in enumerate(sections(text)):
        candidates=excerpts(section)
        def ids(limit,optional=False):return {'type':'integer','enum':([0] if optional else [])+[e['id'] for e in candidates if e['codepoints']<=limit]}
        variants=[]
        for layout,fields in [('funnel',{'a':ids(12),'b':ids(12),'c':ids(12,True),'note_a':ids(40,True),'note_b':ids(40,True)}),('dialogue',{'a':ids(40),'b':ids(40,True),'c':ids(40,True),'state':ids(16),'update':{'type':'integer','enum':[0,1,2,3]}}),('process',{'a':ids(24),'b':ids(24),'c':ids(24,True),'d':ids(24,True),'note_a':ids(40,True),'note_b':ids(40,True)}),('cards',{'a':ids(40),'b':ids(40,True),'c':ids(40,True),'d':ids(40,True)})]:
            if layout=='dialogue' and roles:
                fields={'context':ids(40,True),'message':ids(40),'initial_state':ids(16),'state_after':ids(16,True)}
                for name,description in [('context','Literal prior conversation, not explanation. 0 if absent.'),('message','Literal CURRENT user utterance, never explanation or judgement.'),('initial_state','Literal initial state/context; do not infer it.'),('state_after','Literal new state excerpt ID, NOT a message-slot ordinal. 0 if absent; never infer success.')]:fields[name]['description']=description
            elif layout=='dialogue':
                fields['state']['description']='Literal initial context/state, not the later inferred or updated result.'
                fields['update']['description']='0: no literal new state. 1/2/3: message slot a/b/c is actually a source-stated new state value, not a user utterance.'
            if any(not f.get('enum') for f in fields.values()):continue
            props={'layout':{'type':'string','enum':[layout]},**fields}
            variants.append({'type':'object','additionalProperties':False,'required':list(props),'properties':props})
        variants.append({'type':'object','additionalProperties':False,'required':['layout'],'properties':{'layout':{'type':'string','enum':['standard']}}})
        properties[f'p{i+1}']={'anyOf':variants}
    return {'type':'object','additionalProperties':False,'required':list(properties),'properties':properties}


SLOTS=frozenset({'a','b','c','d','state','update','note_a','note_b'})


def request_schema(text,layouts=None,*,roles=False):
    from services.workflow.providers import ProviderError
    from services.workflow.schema_diagnostics import schema_errors
    full=plan_schema(text,roles=roles);result=copy.deepcopy(full)
    for field in result['properties'].values():
        variants=field.pop('anyOf')
        field.update(type='object',additionalProperties=False,required=['layout'],properties={'layout':{'type':'string','enum':[v['properties']['layout']['enum'][0] for v in variants]}})
    if layouts is not None:
        errors=schema_errors(result,layouts)
        if errors:raise ProviderError('storyboard','schema_error','Invalid source layout selection',errors)
        for key,choice in layouts.items():
            result['properties'][key]=copy.deepcopy(next(v for v in full['properties'][key]['anyOf'] if v['properties']['layout']['enum']==[choice['layout']]))
    return result


def normalize_slots(raw,schema):
    result=copy.deepcopy(raw)
    if not isinstance(result,dict):return result
    for key,choice in result.items():
        if key not in schema['properties'] or not isinstance(choice,dict):continue
        variant=next((v for v in schema['properties'][key]['anyOf'] if v['properties']['layout']['enum']==[choice.get('layout')]),None)
        if variant is None:continue
        allowed=variant['properties']
        for name in list(choice):
            if name in SLOTS and name not in allowed and type(choice[name]) is int and choice[name]==0:del choice[name]
        for name,field in allowed.items():
            if name not in choice and field.get('type')=='integer' and 0 in field['enum']:choice[name]=0
    return result


def request(text,model,original_scene,style,*,layouts=None,roles=False):
    from services.workflow.storyboard import source_parts
    prompt=('Select source excerpts BY INTEGER ID for each fixed paragraph. Call plan_lesson once. '
      'The paragraph boundaries and allowed excerpt IDs are fixed; do not rewrite text, assign scene IDs or design edges/frames. '
      'For ordered handling levels choose funnel; a/b/c are 2–3 levels, not intermediate conditions. '
      'For conversation plus context-dependent state choose dialogue; state is initial context and a/b/c are DIFFERENT message excerpts. '
      'state is the literal initial state/context, never the conclusion inferred after the current message. '
      'update=0 means no state change; 1/2/3 updates the state using a/b/c only if that excerpt literally describes the new state, <=16 codepoints, spoken after state; it is not a user utterance. '
      'Selecting dialogue declares non-update a/b/c excerpts relevant evidence; the compiler adds evidence-to-state connections after both endpoints appear. At least one actual conversation/context excerpt must remain. '
      'A worked example (do not copy its values): for source excerpts 1=对象未确定, 2=上一轮选中商品A, 3=本轮询问库存, 4=对象关联到商品A, choose state=1,a=2,b=3,c=4,update=3. Result 4 is not a spoken user message. If no literal result is given, use update=0; never infer a result from the request. '
      'For processing stages choose process; a/b/c/d are 2–4 stages. '
      'Keep the already selected layout. Return exactly its tool-schema fields, not fields belonging to other layouts. Use 0 for unused OPTIONAL slots only when its enum permits 0. ' 
      'note_a/note_b are optional explanation excerpts. '
      'Funnel needs nonzero a/b (<=12 codepoints); process needs nonzero a/b (<=24); cards needs nonzero a; dialogue needs nonzero a and state (state<=16). '

      'Never reuse an excerpt ID in two slots. IDs are local to each paragraph. '
      'Prefer a fitting typed diagram over cards. For code walkthrough, concept definitions, comparisons, state diagrams or timelines that need specialized templates choose standard; the existing specialized generator is retained. '
      f'Teaching style: {style}. No business tools are executed.')
    if roles:
        start=prompt.index('For conversation plus context-dependent state')
        end=prompt.index('For processing stages')
        prompt=prompt[:start]+('Dialogue fields all use ORIGINAL EXCERPT IDs, never slot ordinals. '
          'context is literal earlier conversation or 0; message is the CURRENT user utterance, never an explanation. '
          'initial_state is literal initial context; state_after is the literal NEW state excerpt ID or 0 when not stated. '
          'No explanation/judgement belongs in message/context; do not infer execution success from a cancellation request. '
          'Noncopyable example: excerpts 1=对象未确定, 2=上轮选中商品A, 3=本轮问库存, 4=对象关联到商品A: context=2,message=3,initial_state=1,state_after=4. '
          'Compiler derives source-bound evidence links and state updates. ')+prompt[end:]
        prompt=prompt.replace('dialogue needs nonzero a and state (state<=16)','dialogue needs nonzero message and initial_state (<=16)')
    if layouts is None:
        prompt=('Choose ONLY a layout for each fixed paragraph; no excerpt slots, new text, IDs, edges or frames. Call plan_lesson once. '
                'Use funnel for ordered levels, dialogue for messages plus context-dependent state, process for processing stages, cards for short key points. '
                'Only choose layouts allowed by the tool schema. Dialogue needs literal context/state as well as message evidence; do not invent a state or an executed result. Prefer a fitting typed diagram, but choose standard for code walkthrough, definitions, comparisons, state diagrams, timelines or unsupported content. '
                f'Teaching style: {style}. Do not execute business tools.')
    schema=request_schema(text,layouts,roles=roles)
    body={'model':model,'messages':[{'role':'system','content':prompt},{'role':'user','content':__import__('json').dumps({f'p{i+1}':{'text':p,'excerpts':[{k:e[k] for k in ['id','text','codepoints']} for e in excerpts(p)]} for i,p in enumerate(sections(text))},ensure_ascii=False)}],
      'tools':[{'type':'function','function':{'name':'plan_lesson','description':'Choose source-bound teaching expressions only; never execute external tools.','strict':True,'parameters':schema}}],
      'tool_choice':{'type':'function','function':{'name':'plan_lesson'}},'max_tokens':8192}
    if model in ['deepseek-flash','deepseek-v4-flash']:body['thinking']={'type':'disabled'}
    return body,source_parts(text)


def compile_plan(raw,text,original_id=None,*,roles=False):
    from services.workflow.providers import ProviderError
    from services.workflow.schema_diagnostics import schema_errors
    from services.workflow.storyboard import validate_storyboard
    schema=plan_schema(text,roles=roles);raw=normalize_slots(raw,schema)
    errors=schema_errors(schema,raw)
    if errors:raise ProviderError('storyboard','schema_error','Invalid compact source plan',errors)
    if any(s['layout']=='standard' for s in raw.values()):return None
    if original_id is not None and len(raw)!=1:raise ProviderError('storyboard','invalid_response','Regeneration must retain one scene')
    scenes=[]
    for i,part in enumerate(sections(text)):
        choice=raw[f'p{i+1}'];lookup={e['id']:e for e in excerpts(part)};assigned={};kind=choice['layout']
        chosen=[v for k,v in choice.items() if k!='layout' and (roles or k!='update') and v]
        if len(chosen)!=len(set(chosen)):raise ProviderError('storyboard','diagram_binding','Source excerpts must not be reused')
        scene={'id':original_id or f'scene_{i+1}','narration':{'text':part},'type':'card_sequence','elements':[]}
        def add(indices):
            result=[]
            for index in indices:
                if not index:continue
                quote=lookup[index]['text'];start=lookup[index]['text_start']
                id_=f'e{len(scene["elements"])}';result.append(id_);assigned[index]=id_
                scene['elements'].append({'id':id_,'content':quote,'cue':{'text_start':start,'text_end':start+len(quote)}})
            return sorted(result,key=lambda id_:next(e['cue']['text_start'] for e in scene['elements'] if e['id']==id_))
        main=add([choice.get(k,0) for k in (['context','message','state_after'] if roles and kind=='dialogue' else ['a','b','c','d'])]);notes=add([choice.get('note_a',0),choice.get('note_b',0)])
        if kind=='funnel':
            scene['motif']='funnel'
            if notes:scene['funnel']={'layers':main,'notes':[{'element_id':id_} for id_ in notes]}
        elif kind=='dialogue':
            scene.update(motif='dialogue_split',dialogue={'messages':main,'state':add([choice['initial_state' if roles else 'state']])[0]})
            if roles:scene['dialogue']['context_messages']=[assigned[choice['context']]] if choice['context'] else []
        elif kind=='process':scene.update(type='flow_diagram',process={'stages':main,'details':notes},edges=[{'from':a,'to':b} for a,b in zip(main,main[1:])])
        elements={e['id']:e for e in scene['elements']};actions=[]
        def action(kind,target,**extra):
            reference=extra.get('source',target)
            if kind=='connect':reference=max((target,extra['to']),key=lambda id_:elements[id_]['cue']['text_start'])
            actions.append({'kind':kind,'target':target,'cue':copy.deepcopy(elements[reference]['cue']),**extra})
        if kind in ('funnel','process'):
            for a,b in zip(main,main[1:]):action('connect',a,to=b)
        if kind=='dialogue':
            result=None
            selected=choice.get('state_after',0) if roles else choice.get(['a','b','c'][choice['update']-1],0) if choice['update'] else 0
            if selected:
                result=assigned.get(selected)
                if not result:raise ProviderError('storyboard','diagram_binding','State update message is missing')
                action('update',scene['dialogue']['state'],source=result)
            evidence=[id_ for id_ in main if id_!=result]
            if not evidence:raise ProviderError('storyboard','diagram_binding','Conversation evidence is missing')
            for id_ in evidence:action('connect',id_,to=scene['dialogue']['state'])
        scene['visual_actions']=sorted(actions,key=lambda a:a['cue']['text_start']);scenes.append(scene)
    draft={'scenes':scenes};validate_storyboard(draft,text);return draft
