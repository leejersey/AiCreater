import copy
from datetime import date
import io,json,tempfile,unittest
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch
import httpx
from services.projects import usage

NOW=date(2026,10,15)
VOICE={'kind':'voice','protocol_version':'native-voice:1','profile':{'voice':{'resource_id':'seed-tts-2.0','speaker':'public'}}}

class UsageTests(unittest.TestCase):
    def test_missing_usage_and_partial_submissions_never_become_free(self):
        for payload in [VOICE,{**VOICE,'protocol_version':'other'}]:
            record=usage.initial_usage(payload,now=NOW)
            event={'state':'submitted','submitted_characters':12}
            measured=usage.apply_event(record,event)
            self.assertEqual(measured['state'],'submitted');self.assertIsNone(measured['reference']['minimum_cny'])
        local=usage.initial_usage({'kind':'timing'},now=NOW)
        self.assertEqual(local['state'],'local');self.assertEqual(local['reference']['maximum_cny'],0)
        self.assertIsNone(usage.initial_usage(VOICE,now=date(2026,12,1))['prices']['rates'])
        for event in [{'state':'submitted','secret':'private'},{'state':'reported','submitted_characters':0},{'state':'reported','input_tokens':1,'output_tokens':1}]:
            self.assertEqual(usage.apply_event(usage.initial_usage(VOICE,now=NOW),event),usage.initial_usage(VOICE,now=NOW))

    def test_tts_counts_submitted_unicode_but_only_complete_is_known_reference(self):
        record=usage.initial_usage(VOICE,now=NOW)
        record=usage.apply_event(record,{'state':'submitted','submitted_characters':3000})
        self.assertIsNone(record['reference']['maximum_cny'])
        record=usage.apply_event(record,{'state':'reported','submitted_characters':3000})
        self.assertEqual(record['reference'],{'minimum_cny':.9,'maximum_cny':.9})
        unknown=usage.apply_event(usage.initial_usage({**VOICE,'protocol_version':'other'},now=NOW),{'state':'reported','submitted_characters':3000})
        self.assertIsNone(unknown['reference']['maximum_cny'])

    def test_tts_success_and_transport_failure_preserve_attempt_observations(self):
        from services.tests.test_generation import settings
        from services.workflow.providers import volcengine_speech,ProviderError
        events=[]
        with patch('services.tts.subtitle.synthesize',return_value=(b'audio',[])),httpx.Client() as client:
            self.assertEqual(volcengine_speech('汉 🙂 ',settings(VOLCENGINE_RESOURCE_ID='seed-tts-2.0'),client,on_usage=events.append),(b'audio',[]))
        self.assertEqual(events,[{'state':'submitted','submitted_characters':4},{'state':'reported','submitted_characters':4}])
        events=[]
        with patch('services.tts.subtitle.synthesize',side_effect=ProviderError('tts','transport_error','private')),httpx.Client() as client:
            with self.assertRaises(ProviderError):volcengine_speech('汉',settings(VOLCENGINE_RESOURCE_ID='seed-tts-2.0'),client,on_usage=events.append)
        self.assertEqual(events,[{'state':'submitted','submitted_characters':1}])
