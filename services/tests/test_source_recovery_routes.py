import unittest
from unittest.mock import Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient


class SourceRecoveryRoutesTests(unittest.TestCase):
    def setUp(self):
        from services.api.visual import router
        app=FastAPI();app.include_router(router);self.jobs=Mock();app.state.visual=self.jobs
        self.client=TestClient(app);self.base='/api/projects/project/visual/parent'

    def test_inspection_is_explicit_and_has_no_paths_or_paid_options(self):
        self.jobs.recover_source.return_value={'id':'inspection'}
        response=self.client.post(self.base+'/recover-source',json={'confirmed':True})
        self.assertEqual(response.status_code,202,response.text)
        self.jobs.recover_source.assert_called_once_with('project','parent',True)
        for body in ({'confirmed':True,'path':'/tmp/x'},{'confirmed':True,'max_requests':1},{'confirmed':1}):
            self.assertEqual(self.client.post(self.base+'/recover-source',json=body).status_code,422)

    def test_repair_freezes_both_approval_hashes_and_one_request_budget(self):
        self.jobs.repair_source.return_value={'id':'repair'}
        body={'confirmed':True,'max_requests':1,'feedback':'Fix route','sha256':'a'*64,'recovery_sha256':'b'*64}
        response=self.client.post(self.base+'/repair-source',json=body)
        self.assertEqual(response.status_code,202,response.text)
        self.jobs.repair_source.assert_called_once_with('project','parent',True,1,'Fix route','a'*64,'b'*64)
        for bad in ({**body,'sha256':'bad'},{**body,'recovery_sha256':None},{**body,'generation_mode':'source'}):
            self.assertEqual(self.client.post(self.base+'/repair-source',json=bad).status_code,422)
