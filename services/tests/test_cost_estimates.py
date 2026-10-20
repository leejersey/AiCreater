import copy
import json
import unittest
from datetime import date
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from services.projects.estimates import estimate_payload, combine_estimates, estimate_project
from services.projects.store import StoreError
from services.workflow.providers import storyboard_request


def voice(text='中A😀 \n。', resource='seed-tts-2.0'):
    return {'kind':'voice','scene':{'narration':{'text':text}},'profile':{'voice':{'resource_id':resource}},'protocol_version':'native-voice:1'}
def outline(model='deepseek-flash'):
    return {'kind':'generate','source_text':'解释循环。','model':model,'protocol_version':'teaching-outline:2'}
NOW=date(2026,10,15)

class CostEstimateTests(unittest.TestCase):
    def test_voice_counts_all_unicode_and_uses_reference_price_not_discount(self):
        result=estimate_payload(voice(),now=NOW)
        self.assertEqual(result['status'],'estimated')
        self.assertEqual(result['quantity']['characters'],6)
        self.assertEqual(result['minimum_cny'],.0018)
        self.assertEqual(result['maximum_cny'],.0018)
        self.assertEqual(result['quantity']['calls'],1)
        self.assertEqual(estimate_payload(voice('a'*3000),now=NOW)['maximum_cny'],.9)
        self.assertIn('https://docs.volcengine.com/docs/DoubaoVoice/Billinginstructions-21?lang=zh',result['sources'])

    def test_model_quantity_includes_entire_prompt_schema_and_output_setting(self):
        body,parts=storyboard_request('解释循环。','deepseek-flash')
        result=estimate_payload(outline(),now=NOW)
        self.assertGreater(result['quantity']['input_tokens_max'],sum(len(m['content'].encode()) for m in body['messages']))
        self.assertGreater(result['quantity']['input_tokens_min'],len('解释循环。'))
        self.assertEqual(result['quantity']['output_tokens_max'],body['max_tokens'])
        self.assertEqual(body['max_tokens'],8192)
        self.assertEqual(body['thinking'],{'type':'disabled'})
        self.assertTrue(parts)
        self.assertGreater(result['minimum_cny'],0)
        self.assertGreater(result['maximum_cny'],result['minimum_cny'])
        self.assertIn('经验',str(result['notes']))

    def test_v3_concept_planner_uses_full_quoted_request_for_reference_price(self):
        for kind,prefix in [('generate','teaching-outline'),('regenerate','scene-candidate')]:
            payload={**outline(),'kind':kind,'protocol_version':prefix+':3','scene':{'id':'s','type':'card_sequence','narration':{'text':'解释循环。'},'elements':[]}}
            with patch('services.projects.estimates.storyboard_request',wraps=storyboard_request) as builder:
                result=estimate_payload(payload,now=NOW)
            self.assertEqual(result['status'],'estimated');self.assertEqual(result['quantity']['calls'],1)
            self.assertTrue(builder.call_args.kwargs['cue_quotes']);self.assertGreater(result['maximum_cny'],0)

    def test_unverified_model_resource_protocol_or_expired_price_never_becomes_zero(self):
        for payload in [outline('unverified-private-model'),voice(resource='unverified-private-resource'),{**outline(),'protocol_version':'unknown'}]:
            result=estimate_payload(payload,now=NOW)
            self.assertEqual(result['status'],'unknown')
            self.assertIsNone(result['maximum_cny'])
            self.assertNotIn('unverified-private',json.dumps(result))
        for day in [date(2026,10,14),date(2026,11,15)]:
            self.assertEqual(estimate_payload(outline(),now=day)['status'],'unknown')

    def test_reuse_and_local_operations_do_not_require_current_provider_price(self):
        for payload,reused in [(voice(),True),({'kind':'timing'},False),({'kind':'render'},False)]:
            result=estimate_payload(payload,now=date(2100,1,1),reused=reused)
            self.assertEqual(result['status'],'no_new_call')
            self.assertEqual(result['maximum_cny'],0)
            self.assertEqual(result['quantity']['calls'],0)
        self.assertEqual(estimate_payload(voice(),now=NOW)['quantity']['calls'],1)  # Existing audio is not a revoice discount.

    def test_batch_adds_only_fresh_calls_and_unknown_never_disappears_in_total(self):
        a=estimate_payload(voice('中文'),now=NOW)
        reused=estimate_payload(voice(),now=NOW,reused=True)
        total=combine_estimates([a,a,reused])
        self.assertEqual(total['maximum_cny'],.0012)
        self.assertEqual(total['quantity']['characters'],4)
        self.assertEqual(total['quantity']['calls'],2)
        self.assertEqual(total['quantity']['reused_jobs'],1)
        self.assertEqual(combine_estimates([a,estimate_payload(voice(resource='?'),now=NOW)])['status'],'unknown')

    def test_frozen_retry_payload_uses_legacy_protocol_and_never_calls_suppliers(self):
        scene={'id':'s','type':'card_sequence','narration':{'text':'解释循环。','audio_asset_id':'private'},'duration_frames':99,'elements':[]}
        payload={'kind':'regenerate','model':'deepseek-flash','scene':scene,'protocol_version':'scene-candidate:1'}
        with patch('httpx.Client') as http,patch('services.tts.subtitle.connect') as connect:
            result=estimate_payload(payload,now=NOW)
            self.assertEqual(result['status'],'estimated');http.assert_not_called();connect.assert_not_called()
        self.assertEqual(payload['scene'],scene)
        with patch('services.projects.estimates.storyboard_request',wraps=storyboard_request) as builder:
            estimate_payload(payload,now=NOW)
            self.assertFalse(builder.call_args.kwargs['cue_quotes'])
            self.assertNotIn('audio_asset_id',builder.call_args.args[2]['narration'])
            self.assertNotIn('duration_frames',builder.call_args.args[2])

    def test_project_estimate_reads_one_snapshot_and_validates_selection(self):
        store=MagicMock();conn=store.connection.return_value.__enter__.return_value
        row={'id':'22222222-2222-4222-8222-222222222222','revision':2,'state':'needs_voice','scene':voice()['scene']}
        project={'id':'11111111-1111-4111-8111-111111111111','revision':3,'source_text':'解释。','scenes':[row]}
        store._read.return_value=project;store.profile=voice()['profile'];store.profile_for.return_value=store.profile;conn.execute.return_value.fetchone.return_value=None
        selected=[{'scene_id':row['id'],'expected_revision':2}]
        result=estimate_project(store,'deepseek-flash',project['id'],3,'voice',selected)
        self.assertEqual(result['quantity']['calls'],1)
        self.assertIn('READ ONLY',conn.execute.call_args_list[0].args[0])
        self.assertNotIn('FOR UPDATE',str(conn.execute.call_args_list))
        self.assertNotIn('INSERT',str(conn.execute.call_args_list))
        for revision,items in [(2,selected),(3,selected*2),(3,[{**selected[0],'expected_revision':1}]),(3,[{**selected[0],'scene_id':'33333333-3333-4333-8333-333333333333'}])]:
            with self.assertRaises(StoreError):estimate_project(store,'deepseek-flash',project['id'],revision,'voice',items)

    def test_strict_local_nocache_quote_route_does_not_submit_jobs(self):
        from services.api.app import create_app
        app=create_app(authentication=False);app.state.store=MagicMock();app.state.jobs=MagicMock(model='deepseek-flash')
        client=TestClient(app,base_url='http://127.0.0.1:8000',client=('127.0.0.1',50000))
        body={'operation':'generate','expected_revision':1,'scenes':[]}
        result=estimate_payload(outline(),now=NOW)
        with patch('services.api.app.estimate_project',return_value=result):
            response=client.post('/api/projects/x/estimate',json=body)
            self.assertEqual(response.status_code,200);self.assertEqual(response.headers['cache-control'],'no-store')
            for bad in [{**body,'expected_revision':True},{**body,'extra':'private'},{**body,'scenes':[{}]*21},{**body,'operation':'paid-submit'}]:
                self.assertEqual(client.post('/api/projects/x/estimate',json=bad).status_code,422)
            self.assertEqual(client.post('/api/projects/x/estimate',json=body,headers={'Origin':'https://evil.example'}).status_code,403)
        app.state.jobs.submit_generate.assert_not_called();app.state.jobs.recover.assert_not_called()
