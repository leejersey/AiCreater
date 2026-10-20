"""Keep fixed codes and sanitized structural diagnostics, never provider values; no network."""
import io,json,unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from services.workflow.providers import ProviderError
from services.workflow.worker import child

class StoryboardDiagnosticsTests(unittest.TestCase):
    def result(self,code,stage='storyboard'):
        output=io.StringIO()
        payload={'kind':'generate','model':'test','source_text':'测试'}
        with patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}), patch('sys.stdin',io.StringIO(json.dumps(payload))), patch('httpx.Client'), patch('services.workflow.providers.deepseek_storyboard',side_effect=ProviderError(stage,code,'secret-provider-content')), redirect_stdout(output):
            child()
        self.assertNotIn('secret',output.getvalue())
        return json.loads(output.getvalue())
    def test_fixed_storyboard_subcodes_survive_child_boundary(self):
        for code in ['schema_error','source_mismatch','incomplete_response','output_limit','response_filtered','invalid_cue','code_layout','step_order']:
            with self.subTest(code=code):
                self.assertEqual(self.result(code),{'error':'storyboard_'+code})
    def test_job_diagnostic_is_server_owned_and_not_paid_retryable(self):
        from services.projects.jobs import Jobs, ERRORS
        for code in ['schema_error','source_mismatch','incomplete_response','output_limit','response_filtered','invalid_cue','code_layout','step_order']:
            name='storyboard_'+code
            self.assertIn(name,ERRORS)
            error=Jobs._error({'stage':'storyboard','scene_id':None,'attempts':1},name)
            self.assertFalse(error['retryable'])
            self.assertNotIn('secret',json.dumps(error))

    def test_cue_error_has_only_safe_location_and_fixed_reason(self):
        from services.tests.test_generation import outline
        from services.workflow.storyboard import validate_storyboard
        for start,end,reason in [(2,2,'empty_or_reversed'),(3,1,'empty_or_reversed'),(0,7,'out_of_bounds'),(5,6,'blank_interval')]:
            draft=outline('规则匹配。\n');draft['scenes'][0]['elements'][0]['cue']={'text_start':start,'text_end':end}
            with self.subTest(reason=reason),self.assertRaises(ProviderError) as raised:validate_storyboard(draft,'规则匹配。\n')
            self.assertEqual(getattr(raised.exception,'cue_error',None),{'path':'/scenes/0/elements/0/cue','reason':reason})

    def test_child_forwards_cue_diagnostics_without_raw_values(self):
        from services.tests.test_generation import outline
        from services.workflow.storyboard import validate_storyboard
        draft=outline();draft['scenes'][0]['elements'][0]['cue']['text_end']=999
        with self.assertRaises(ProviderError) as raised:validate_storyboard(draft,'规则匹配。')
        output=io.StringIO();payload={'kind':'generate','model':'test','source_text':'规则匹配。'}
        with patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),patch('httpx.Client'),patch('services.workflow.providers.deepseek_storyboard',side_effect=raised.exception),redirect_stdout(output):child()
        self.assertEqual(json.loads(output.getvalue()),{'error':'storyboard_invalid_cue','cue_error':{'path':'/scenes/0/elements/0/cue','reason':'out_of_bounds'}})

    def test_cue_metadata_is_restricted_at_provider_and_job_boundaries(self):
        from services.projects.jobs import Jobs
        valid={'path':'/scenes/19/elements/5/cue','reason':'out_of_bounds','text_start':123,'raw':'secret'}
        self.assertEqual(ProviderError('storyboard','invalid_cue','fixed',cue_error=valid).cue_error,{'path':valid['path'],'reason':valid['reason']})
        row={'stage':'storyboard','scene_id':None,'attempts':1}
        error=Jobs._error(row,'storyboard_invalid_cue',cue_error=valid)
        self.assertEqual(error['cue_error'],{'path':valid['path'],'reason':valid['reason']})
        self.assertFalse(error['retryable']);self.assertNotIn('secret',json.dumps(error));self.assertNotIn('text_start',error['cue_error'])
        for value in [None,[],True,'secret',{}, {'path':valid['path'],'reason':['secret']},
                      {'path':'/scenes/20/elements/0/cue','reason':'out_of_bounds'},
                      {'path':'/scenes/0/elements/6/cue','reason':'out_of_bounds'},
                      {'path':'/scenes/0/secret/cue','reason':'out_of_bounds'},
                      {'path':valid['path'],'reason':'secret'},
                      {'path':'/scenes/01/elements/0/cue','reason':'out_of_bounds'}]:
            self.assertNotIn('cue_error',Jobs._error(row,'storyboard_invalid_cue',cue_error=value))
            self.assertIsNone(ProviderError('storyboard','invalid_cue','fixed',cue_error=value).cue_error)
        self.assertNotIn('cue_error',Jobs._error(row,'storyboard_schema_error',cue_error=valid))
        self.assertIsNone(ProviderError('tts','invalid_cue','fixed',cue_error=valid).cue_error)

    def test_schema_error_carries_safe_paths_not_values(self):
        from services.tests.test_generation import outline
        from services.workflow.storyboard import validate_storyboard
        draft=outline();draft['scenes'][0]['type']='secret-provider-content'
        with self.assertRaises(ProviderError) as raised:validate_storyboard(draft,'规则匹配。')
        self.assertEqual(getattr(raised.exception,'schema_errors',None),[{'path':'/scenes/0/type','rule':'enum'}])
        self.assertNotIn('secret',str(raised.exception))

    def test_extra_provider_field_is_reported_without_its_name_or_value(self):
        from services.tests.test_generation import outline
        from services.workflow.storyboard import validate_storyboard
        draft=outline();draft['scenes'][0]['secret-property']='secret-value'
        with self.assertRaises(ProviderError) as raised:validate_storyboard(draft,'规则匹配。')
        self.assertEqual(raised.exception.schema_errors,[{'path':'/scenes/0','rule':'additionalProperties'}])
        self.assertNotIn('secret',json.dumps(raised.exception.schema_errors))

    def test_reference_schema_missing_field_has_safe_diagnostic(self):
        from services.tests.test_source_owned import wire
        from services.workflow.storyboard import restore_storyboard,source_parts
        raw=wire([1]);raw['scenes'][0].pop('source_part_ids')
        with self.assertRaises(ProviderError) as raised:restore_storyboard(raw,'规则匹配。',source_parts('规则匹配。'))
        self.assertEqual(getattr(raised.exception,'schema_errors',None),[{'path':'/scenes/0','rule':'required'}])

    def test_child_forwards_only_sanitized_schema_metadata(self):
        from services.tests.test_generation import outline
        from services.workflow.storyboard import validate_storyboard
        draft=outline();draft['scenes'][0]['elements'][0]['content']=123
        with self.assertRaises(ProviderError) as raised:validate_storyboard(draft,'规则匹配。')
        output=io.StringIO();payload={'kind':'generate','model':'test','source_text':'规则匹配。'}
        with patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),patch('httpx.Client'),patch('services.workflow.providers.deepseek_storyboard',side_effect=raised.exception),redirect_stdout(output):child()
        self.assertEqual(json.loads(output.getvalue()),{'error':'storyboard_schema_error','schema_errors':[{'path':'/scenes/0/elements/0/content','rule':'type'}]})

    def test_task_error_sanitizes_untrusted_details_and_bounds_count(self):
        from services.projects.jobs import Jobs
        values=[{'path':'/scenes/0/secret-provider-content','rule':'type','message':'secret-response'}]*8
        error=Jobs._error({'stage':'storyboard','scene_id':None,'attempts':1},'storyboard_schema_error',values)
        self.assertEqual(error.get('schema_errors'),[{'path':'/scenes/0','rule':'type'}]*3)
        self.assertNotIn('secret',json.dumps(error))
        for value in [None,'secret',{},[{'path':'secret','rule':'secret'}],[{'path':'/'+'a'*1000,'rule':'enum'}]]:
            self.assertNotIn('schema_errors',Jobs._error({'stage':'storyboard','scene_id':None,'attempts':1},'storyboard_schema_error',value))
        self.assertNotIn('schema_errors',Jobs._error({'stage':'storyboard','scene_id':None,'attempts':1},'timeout',values))

    def test_missing_diagnostic_never_hides_validation_failure(self):
        from services.workflow.schema_diagnostics import schema_errors
        self.assertEqual(schema_errors(False,{'secret':'response'}),[{'path':'/','rule':'schema'}])
        self.assertEqual(schema_errors(True,{'secret':'response'}),[])
        schema={'type':'object','additionalProperties':{'type':'integer'}}
        self.assertEqual(schema_errors(schema,{'secret'*100:'response'}),[{'path':'/','rule':'schema'}])

    def test_unknown_code_and_wrong_stage_remain_generic(self):
        self.assertEqual(self.result('secret-key'),{'error':'validation'})
        self.assertEqual(self.result('source_mismatch','tts'),{'error':'validation'})
