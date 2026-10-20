import copy
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from services.projects.store import Store
from services.tests.test_projects import PROFILE

class ProjectVoiceTests(unittest.TestCase):
    def test_effective_profile_is_isolated_and_legacy_default_is_preserved(self):
        store=Store('', '.', PROFILE)
        voice={'resource_id':'seed-tts-2.0','speaker':'project_voice'}
        selected=store.profile_for({'voice':voice})
        self.assertEqual(selected['voice'],voice)
        selected['voice']['speaker']='mutated'
        self.assertEqual(voice['speaker'],'project_voice')
        self.assertEqual(store.profile,PROFILE)
        self.assertEqual(store.profile_for({}),PROFILE)
        self.assertEqual(store.profile_for({'voice':None}),PROFILE)

    def test_voice_route_is_strict_local_free_and_does_not_dispatch(self):
        from services.api.app import create_app
        store=MagicMock();app=create_app(authentication=False);app.state.store=store;app.state.jobs=MagicMock()
        store.set_voice.return_value={'revision':2,'voice':{'resource_id':'seed-tts-2.0','speaker':'valid_voice'}}
        client=TestClient(app,base_url='http://127.0.0.1:8000',client=('127.0.0.1',50000))
        body={'expected_revision':1,'speaker':'valid_voice'}
        response=client.patch('/api/projects/project/voice',json=body)
        self.assertEqual(response.status_code,200)
        store.set_voice.assert_called_once_with('project',1,'valid_voice')
        for bad in [{**body,'expected_revision':True},{**body,'speaker':23},{**body,'resource_id':'private'},{}]:
            self.assertEqual(client.patch('/api/projects/project/voice',json=bad).status_code,422)
        self.assertEqual(client.patch('/api/projects/project/voice',json=body,headers={'Origin':'https://evil.invalid'}).status_code,403)
        app.state.jobs.submit_voice.assert_not_called();app.state.jobs.submit_batch_voice.assert_not_called();app.state.jobs.recover.assert_not_called()

    def test_speaker_validation_precedes_database_access(self):
        from services.projects.store import StoreError
        store=Store('', '.', PROFILE)
        with patch.object(store,'connection',side_effect=AssertionError('No database')):
            for speaker in ['', ' ', 'a'*201, 'id\n', '../voice','x?api_key=private','中文',True,None]:
                with self.subTest(speaker=speaker),self.assertRaises(StoreError):store.set_voice('project',1,speaker)
