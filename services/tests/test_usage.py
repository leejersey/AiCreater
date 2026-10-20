import copy
from datetime import date
import io,json,tempfile,unittest
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch
import httpx
from services.projects import usage

NOW=date(2026,10,15)
MODEL={'kind':'generate','model':'deepseek-flash','protocol_version':'teaching-outline:2'}
VOICE={'kind':'voice','protocol_version':'native-voice:1','profile':{'voice':{'resource_id':'seed-tts-2.0','speaker':'public'}}}

class UsageTests(unittest.TestCase):
    def test_freezes_rates_and_returned_tokens_even_after_price_expiry(self):
        record=usage.initial_usage(MODEL,now=NOW);before=copy.deepcopy(record)
        measured=usage.apply_event(record,usage.model_event({'prompt_tokens':1000,'completion_tokens':500,'prompt_cache_hit_tokens':500,'prompt_cache_miss_tokens':500,'total_tokens':1500,'secret':'do not store'}))
        self.assertEqual(record,before);self.assertEqual(measured['state'],'reported')
        self.assertEqual(measured['reference'],{'minimum_cny':.00251,'maximum_cny':.00502})
        self.assertNotIn('secret',json.dumps(measured));self.assertEqual(measured['prices']['checked_on'],'2026-10-15')
        self.assertIsNone(usage.initial_usage(MODEL,now=date(2026,12,1))['prices']['rates'])
        self.assertEqual(usage.apply_event(measured,{'state':'submitted'}),measured)
        self.assertEqual(usage.apply_event(measured,{'state':'reported','input_tokens':1,'output_tokens':1}),measured)

    def test_v3_concept_jobs_freeze_model_reference_rates_without_bill_claim(self):
        for kind,prefix in [('generate','teaching-outline'),('regenerate','scene-candidate')]:
            record=usage.initial_usage({**MODEL,'kind':kind,'protocol_version':prefix+':3'},now=NOW)
            self.assertEqual(record['prices']['model'],'deepseek-flash');self.assertIsNotNone(record['prices']['rates'])
            self.assertIsNone(record['reference']['maximum_cny'])
            measured=usage.apply_event(record,usage.model_event({'prompt_tokens':10,'completion_tokens':2}))
            self.assertGreater(measured['reference']['maximum_cny'],0)

    def test_missing_usage_and_partial_submissions_never_become_free(self):
        for payload in [MODEL,{**MODEL,'model':'unknown'},VOICE]:
            record=usage.initial_usage(payload,now=NOW)
            event={'state':'submitted','submitted_characters':12} if payload['kind']=='voice' else {'state':'submitted'}
            measured=usage.apply_event(record,event)
            self.assertEqual(measured['state'],'submitted');self.assertIsNone(measured['reference']['minimum_cny'])
        local=usage.initial_usage({'kind':'timing'},now=NOW)
        self.assertEqual(local['state'],'local');self.assertEqual(local['reference']['maximum_cny'],0)

    def test_strict_provider_counters_and_safe_events(self):
        for value in [None,{},[],{'prompt_tokens':True,'completion_tokens':2},{'prompt_tokens':-1,'completion_tokens':2},
                      {'prompt_tokens':1.1,'completion_tokens':2},{'prompt_tokens':1,'completion_tokens':2,'total_tokens':8},
                      {'prompt_tokens':2,'completion_tokens':2,'prompt_cache_hit_tokens':2,'prompt_cache_miss_tokens':2}]:
            self.assertIsNone(usage.model_event(value))
        self.assertEqual(usage.model_event({'prompt_tokens':2,'completion_tokens':3}),{'state':'reported','input_tokens':2,'output_tokens':3})
        record=usage.initial_usage(MODEL,now=NOW)
        for event in [{'state':'reported','input_tokens':True,'output_tokens':2},{'state':'submitted','secret':'private'}, {'state':'reported','submitted_characters':10}]:
            self.assertEqual(usage.apply_event(record,event),record)

    def test_tts_counts_submitted_unicode_but_only_complete_is_known_reference(self):
        record=usage.initial_usage(VOICE,now=NOW)
        record=usage.apply_event(record,{'state':'submitted','submitted_characters':3000})
        self.assertIsNone(record['reference']['maximum_cny'])
        record=usage.apply_event(record,{'state':'reported','submitted_characters':3000})
        self.assertEqual(record['reference'],{'minimum_cny':.9,'maximum_cny':.9})
        unknown=usage.apply_event(usage.initial_usage({**VOICE,'protocol_version':'other'},now=NOW),{'state':'reported','submitted_characters':3000})
        self.assertIsNone(unknown['reference']['maximum_cny'])

    def test_summary_separates_known_failed_attempt_from_unknown_history(self):
        measured=usage.apply_event(usage.initial_usage(VOICE,now=NOW),{'state':'reported','submitted_characters':3000})
        rows=[{'job_id':'j','attempt_id':'a','number':1,'kind':'voice','state':'failed','usage':measured},
              {'job_id':'j','attempt_id':'b','number':2,'kind':'voice','state':'running','usage':usage.initial_usage(VOICE,now=NOW)},
              {'job_id':'old','attempt_id':'c','number':1,'kind':'voice','state':'succeeded','usage':None}]
        summary=usage.summarize(rows)
        self.assertEqual(summary['summary'],{'attempts':3,'known':1,'unknown':2,'historical_unknown':1,'minimum_cny':.9,'maximum_cny':.9})
        self.assertEqual(len(summary['items']),3)
        self.assertEqual(usage.summarize([])['summary']['unknown'],0)

    def test_model_reports_usage_before_teaching_validation_failure(self):
        from services.tests.test_generation import settings
        from services.workflow.providers import deepseek_storyboard,ProviderError
        events=[]
        with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'usage':{'prompt_tokens':12,'completion_tokens':3},'choices':[{'finish_reason':'length','message':{'content':'private'}}]}))) as client:
            with self.assertRaises(ProviderError):deepseek_storyboard('规则。',settings(),client,on_usage=events.append)
        self.assertEqual(events,[{'state':'submitted'},{'state':'reported','input_tokens':12,'output_tokens':3}])

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

    def test_child_keeps_safe_usage_on_provider_error_without_raw_response(self):
        from services.workflow.worker import child
        from services.workflow.providers import ProviderError
        def fail(*args,**kwargs):
            kwargs['on_usage']({'state':'reported','input_tokens':12,'output_tokens':3})
            raise ProviderError('storyboard','output_limit','private text')
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/'usage';payload={**MODEL,'source_text':'规则。','_usage_file':str(file)};output=io.StringIO()
            with patch('sys.stdin',io.StringIO(json.dumps(payload))),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}),patch('services.workflow.providers.deepseek_storyboard',side_effect=fail),redirect_stdout(output):child()
            self.assertEqual(json.loads(file.read_text()),{'state':'reported','input_tokens':12,'output_tokens':3})
            self.assertNotIn('private',output.getvalue())
