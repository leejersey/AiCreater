"""Per-attempt observations and frozen public reference rates, never a supplier bill."""
import copy
from datetime import date
from decimal import Decimal
import math

from services.projects.estimates import PRICES_CHECKED_ON, LLM_SOURCE, TTS_SOURCE, LLM_RATES, TTS_RATES, _amount

QUANTITY = ('input_tokens','output_tokens','cache_hit_tokens','cache_miss_tokens','submitted_characters')


def initial_usage(payload, *, now=None):
    kind = payload.get('kind')
    rates, sources, model = None, [], 'unknown'
    valid = 0 <= ((now or date.today()) - PRICES_CHECKED_ON).days <= 30
    if kind in ['generate','regenerate'] and payload.get('model') == 'deepseek-flash' and payload.get('protocol_version') in ['teaching-outline:1','teaching-outline:2','teaching-outline:3','teaching-outline:4','teaching-outline:5','teaching-outline:6','scene-candidate:1','scene-candidate:2','scene-candidate:3','scene-candidate:4','scene-candidate:5','scene-candidate:6','scene-candidate:7','teaching-outline:7','scene-candidate:8','teaching-outline:8','scene-candidate:9','teaching-outline:9']:
        model, sources = 'deepseek-flash', [LLM_SOURCE]
        if valid: rates = LLM_RATES
    if kind == 'voice' and payload.get('protocol_version') == 'native-voice:1' and payload.get('profile',{}).get('voice',{}).get('resource_id') == 'seed-tts-2.0':
        model, sources = 'seed-tts-2.0', [TTS_SOURCE]
        if valid: rates = TTS_RATES
    local = kind in ['timing','render']
    return {'version':1, 'kind':kind, 'state':'local' if local else 'pending',
            'quantity':{key:None for key in QUANTITY},
            'prices':{'checked_on':PRICES_CHECKED_ON.isoformat(),'currency':'CNY','model':model,'rates':copy.deepcopy(rates),'sources':sources},
            'reference':{'minimum_cny':0 if local else None,'maximum_cny':0 if local else None}}


def _count(value):
    return type(value) is int and 0 <= value <= 10000000


def model_event(value):
    if not isinstance(value,dict): return None
    incoming, outgoing = value.get('prompt_tokens'), value.get('completion_tokens')
    if not _count(incoming) or incoming == 0 or not _count(outgoing): return None
    if 'total_tokens' in value and (not _count(value['total_tokens']) or value['total_tokens'] != incoming+outgoing): return None
    event = {'state':'reported','input_tokens':incoming,'output_tokens':outgoing}
    if 'prompt_cache_hit_tokens' in value or 'prompt_cache_miss_tokens' in value:
        hit, miss = value.get('prompt_cache_hit_tokens'), value.get('prompt_cache_miss_tokens')
        if not _count(hit) or not _count(miss) or hit+miss != incoming: return None
        event.update(cache_hit_tokens=hit,cache_miss_tokens=miss)
    return event


def safe_event(event):
    if not isinstance(event,dict): return None
    keys = set(event)
    if event.get('state') == 'submitted':
        if keys == {'state'}: return {'state':'submitted'}
        if keys == {'state','submitted_characters'} and type(event['submitted_characters']) is int and 1 <= event['submitted_characters'] <= 4000: return dict(event)
    if event.get('state') == 'reported':
        if keys == {'state','submitted_characters'} and type(event['submitted_characters']) is int and 1 <= event['submitted_characters'] <= 4000: return dict(event)
        if keys in [{'state','input_tokens','output_tokens'},{'state','input_tokens','output_tokens','cache_hit_tokens','cache_miss_tokens'}]:
            raw = {'prompt_tokens':event['input_tokens'],'completion_tokens':event['output_tokens']}
            if 'cache_hit_tokens' in event: raw.update(prompt_cache_hit_tokens=event['cache_hit_tokens'],prompt_cache_miss_tokens=event['cache_miss_tokens'])
            return model_event(raw)
    return None


def apply_event(record, event):
    event = safe_event(event)
    if not record or not event or record['state'] in ['reported','local']: return record
    voice = record['kind'] == 'voice'
    if ('submitted_characters' in event) != voice: return record
    result = copy.deepcopy(record)
    result['state'] = event['state']
    result['quantity'].update({key:event[key] for key in QUANTITY if key in event})
    if event['state'] != 'reported' or not result['prices']['rates']: return result
    rates, quantity = result['prices']['rates'], result['quantity']
    if voice:
        low = high = Decimal(quantity['submitted_characters'])*Decimal(rates['per_10000'])/10000
    else:
        hit, miss = quantity['cache_hit_tokens'], quantity['cache_miss_tokens']
        low_input = Decimal(quantity['input_tokens'])*Decimal(rates['cached_min']) if hit is None else Decimal(hit)*Decimal(rates['cached_min'])+Decimal(miss)*Decimal(rates['uncached_min'])
        high_input = Decimal(quantity['input_tokens'])*Decimal(rates['uncached_max']) if hit is None else Decimal(hit)*Decimal(rates['cached_max'])+Decimal(miss)*Decimal(rates['uncached_max'])
        low = (low_input+Decimal(quantity['output_tokens'])*Decimal(rates['output_min']))/1000000
        high = (high_input+Decimal(quantity['output_tokens'])*Decimal(rates['output_max']))/1000000
    result['reference'] = {'minimum_cny':_amount(low),'maximum_cny':_amount(high)}
    return result


def summarize(rows):
    known, historical, low, high = 0, 0, Decimal(0), Decimal(0)
    for row in rows:
        record = row['usage']
        if record is None: historical += 1
        if not isinstance(record,dict): continue
        ref = record.get('reference',{})
        minimum, maximum = ref.get('minimum_cny'), ref.get('maximum_cny')
        if type(minimum) not in [int,float] or type(maximum) not in [int,float] or not math.isfinite(minimum) or not math.isfinite(maximum) or not 0 <= minimum <= maximum: continue
        known += 1;low += Decimal(str(minimum));high += Decimal(str(maximum))
    return {'summary':{'attempts':len(rows),'known':known,'unknown':len(rows)-known,'historical_unknown':historical,
                       'minimum_cny':_amount(low),'maximum_cny':_amount(high)},'items':rows}
