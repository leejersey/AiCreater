"""Per-attempt observations and frozen public reference rates, never a supplier bill."""
import copy
from datetime import date
from decimal import Decimal

from services.projects.estimates import PRICES_CHECKED_ON, TTS_SOURCE, TTS_RATES, _amount

QUANTITY = ('submitted_characters',)


def initial_usage(payload, *, now=None):
    kind = payload.get('kind')
    rates, sources, model = None, [], 'unknown'
    valid = 0 <= ((now or date.today()) - PRICES_CHECKED_ON).days <= 30
    if kind == 'voice' and payload.get('protocol_version') == 'native-voice:1' and payload.get('profile',{}).get('voice',{}).get('resource_id') == 'seed-tts-2.0':
        model, sources = 'seed-tts-2.0', [TTS_SOURCE]
        if valid: rates = TTS_RATES
    local = kind == 'timing'
    return {'version':1, 'kind':kind, 'state':'local' if local else 'pending',
            'quantity':{key:None for key in QUANTITY},
            'prices':{'checked_on':PRICES_CHECKED_ON.isoformat(),'currency':'CNY','model':model,'rates':copy.deepcopy(rates),'sources':sources},
            'reference':{'minimum_cny':0 if local else None,'maximum_cny':0 if local else None}}


def safe_event(event):
    if not isinstance(event,dict) or event.get('state') not in ('submitted','reported'): return None
    keys = set(event)
    if event['state'] == 'submitted' and keys == {'state'}: return {'state':'submitted'}
    if keys == {'state','submitted_characters'} and type(event['submitted_characters']) is int and 1 <= event['submitted_characters'] <= 4000: return dict(event)
    return None


def apply_event(record, event):
    event = safe_event(event)
    if not record or not event or record['state'] in ['reported','local'] or record['kind'] != 'voice': return record
    result = copy.deepcopy(record)
    result['state'] = event['state']
    result['quantity'].update({key:event[key] for key in QUANTITY if key in event})
    if event['state'] != 'reported' or not result['prices']['rates'] or result['quantity']['submitted_characters'] is None: return result
    cost = Decimal(result['quantity']['submitted_characters'])*Decimal(result['prices']['rates']['per_10000'])/10000
    result['reference'] = {'minimum_cny':_amount(cost),'maximum_cny':_amount(cost)}
    return result
