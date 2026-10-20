import copy,json,unittest,os
from services.workflow.storyboard import ROOT,validate_storyboard,restore_storyboard,source_parts,validator
from services.workflow.providers import ProviderError
from services.tts.timing import time_scene,align_words


def chart_draft(kind='bar'):
    text='甲十。乙二十。'
    chart={'kind':kind,'title':'示例对比','unit':'份','source_note':'示例数据非统计','confirmed':True,'data':[{'element_id':'a','label':'甲','values':[10]},{'element_id':'b','label':'乙','values':[20]}]}
    if kind=='matrix':chart['columns']=['X','Y'];chart['data'][0]['values']=[1,2];chart['data'][1]['values']=[3,2]
    return {'id':'chart_scene','type':'data_chart','narration':{'text':text},'elements':[{'id':'a','content':'甲十','cue':{'text_start':0,'text_end':2}},{'id':'b','content':'乙二十','cue':{'text_start':3,'text_end':6}}],'chart':chart}

class DataChartTests(unittest.TestCase):
    def test_four_owned_charts_validate_and_survive_local_timing(self):
        for kind in ['bar','line','proportion','matrix']:
            d=chart_draft(kind);validate_storyboard({'scenes':[d]},d['narration']['text'])
            t=time_scene(d,'audio',1000,align_words(d['narration']['text'],[{'word':d['narration']['text'],'startTime':0,'endTime':1}],1000))
            self.assertEqual(t['chart'],d['chart'])
    def test_bad_data_and_bindings_rejected(self):
        for mutate in [lambda c:c.update(confirmed=False),lambda c:c['data'][0].update(values=[True]),lambda c:c['data'][0].update(values=[float('inf')]),lambda c:c['data'][0].update(values=[-1]),lambda c:c['data'][0].update(element_id='missing'),lambda c:c['data'][0].update(label='\u200b'),lambda c:c['data'].reverse()]:
            d=chart_draft();mutate(d['chart'])
            with self.subTest(d=d),self.assertRaises(ProviderError):validate_storyboard({'scenes':[d]},d['narration']['text'])
        d=chart_draft('proportion')
        for row in d['chart']['data']:row['values']=[0]
        with self.assertRaises(ProviderError):validate_storyboard({'scenes':[d]},d['narration']['text'])
        d=chart_draft('matrix');d['chart']['data'][0]['values']=[1]
        with self.assertRaises(ProviderError):validate_storyboard({'scenes':[d]},d['narration']['text'])
    def test_provider_reply_cannot_create_confirmed_chart(self):
        d=chart_draft()
        with self.assertRaises(ProviderError):restore_storyboard({'scenes':[d]},d['narration']['text'],source_parts(d['narration']['text']))

from services.tests.test_projects import ProjectFixture
@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'),'disposable DB runner')
class ChartStoreTests(ProjectFixture,unittest.TestCase):
    def test_user_configuration_is_atomic_and_audio_owned(self):
        from services.projects.store import StoreError
        from services.projects.jobs import Jobs
        row=self.project['scenes'][0];old=self.store.create_version(self.project['id'],1);d=chart_draft();d['elements']=copy.deepcopy(row['scene']['elements']);d['chart']['data']=[{'element_id':e['id'],'label':'甲','values':[10]} for e in d['elements']]
        p=self.store.set_chart(row['id'],1,d['chart'],d['elements'],True);r=p['scenes'][0]
        self.assertEqual(r['state'],'needs_timing');self.assertEqual(r['scene']['narration'],row['scene']['narration']);self.assertEqual(p['config']['assets'],self.project['config']['assets']);self.assertEqual(self.store.get_version(old['id']),old)
        self.assertEqual(Jobs._draft_scene(r['scene'])['chart'],d['chart'])
        with self.assertRaises(StoreError):self.store.set_chart(row['id'],1,d['chart'],d['elements'],True)
        with self.assertRaises(StoreError):Jobs(self.store).submit_regenerate(row['id'],2)
        with self.store.connection() as c:self.assertEqual(c.execute('SELECT count(*) FROM jobs WHERE project_id=%s',[p['id']]).fetchone()['count'],0)
    def test_value_edit_keeps_ready_and_failed_confirmation_rolls_back(self):
        from services.projects.store import StoreError
        d=copy.deepcopy(self.dsl);d['scenes']=d['scenes'][:1];s=d['scenes'][0];s['type']='data_chart';s['chart']=chart_draft()['chart'];s['chart']['data']=[{'element_id':s['elements'][0]['id'],'label':'甲','values':[0.1]}]
        p=self.store.import_project('已确认图表',d);r=p['scenes'][0];old=self.store.create_version(p['id'],1);chart=copy.deepcopy(s['chart']);chart['data'][0]['values']=[0.2]
        with self.assertRaises(StoreError):self.store.set_chart(r['id'],1,chart,s['elements'],False)
        self.assertEqual(self.store.get_project(p['id']),p)
        edited=self.store.set_chart(r['id'],1,chart,s['elements'],True);new=edited['scenes'][0]
        self.assertEqual(new['state'],'ready');self.assertEqual(new['scene']['animations'],s['animations']);self.assertEqual(new['scene']['captions'],s['captions']);self.assertEqual(new['scene']['narration'],s['narration']);self.assertEqual(self.store.get_version(old['id']),old)
        chart['data'][0]['values']=[-1]
        with self.assertRaises(StoreError):self.store.set_chart(r['id'],2,chart,s['elements'],True)
        self.assertEqual(self.store.get_project(p['id']),edited)
    def test_http_chart_configuration_blocks_model_and_unknown_fields(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        r=self.project['scenes'][0];chart=chart_draft()['chart'];chart['data']=[{'element_id':r['scene']['elements'][0]['id'],'label':'甲','values':[10]}]
        body={'expected_revision':1,'chart':chart,'elements':r['scene']['elements'],'confirmed':True}
        with TestClient(create_app(self.store, authentication=False),base_url='http://127.0.0.1:8000',client=('127.0.0.1',50000)) as client:
            self.assertEqual(client.patch('/api/scenes/'+r['id']+'/chart',json={**body,'confirmed':'true'}).status_code,422)
            self.assertEqual(client.patch('/api/scenes/'+r['id']+'/chart',json={**body,'api_key':'secret'}).status_code,422)
            result=client.patch('/api/scenes/'+r['id']+'/chart',json=body);self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['scenes'][0]['state'],'needs_timing')
            self.assertEqual(client.post('/api/scenes/'+r['id']+'/regenerate',json={'expected_revision':2}).status_code,422)

