"""Account boundary tests; use only a disposable TEST_DATABASE_URL."""
from contextlib import ExitStack
import os
from pathlib import Path
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from services.projects.store import Store
from services.tests.test_projects import PROFILE


class PasswordPolicyTests(unittest.TestCase):
    def test_six_character_boundary_is_shared_by_hashing_and_password_change(self):
        from services.accounts.auth import valid_password, password_hash, password_matches
        from services.api.accounts import PasswordChange
        from services.projects.store import StoreError
        for value in ['123456', 'a'*128]:valid_password(value)
        for value in ['', '12345', 'a'*129, 'abc\x00de']:
            with self.subTest(value=value), self.assertRaises(StoreError):valid_password(value)
        self.assertTrue(password_matches('123456',password_hash('123456')))
        self.assertEqual(PasswordChange(current_password='123456',new_password='abcdef').new_password,'abcdef')


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class AccountTests(unittest.TestCase):
    password = 'a-good-test-password-2026'

    def setUp(self):
        from services.api.app import create_app
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        folder = self.stack.enter_context(tempfile.TemporaryDirectory())
        self.store = Store(os.environ['TEST_DATABASE_URL'], Path(folder), PROFILE)
        self.client = self.stack.enter_context(TestClient(create_app(self.store), base_url='http://127.0.0.1:8000',
            client=('127.0.0.1', 50000), headers={'Origin':'http://127.0.0.1:3000'}))
        self.username = 'user_' + uuid.uuid4().hex[:16]

    def register(self, username=None):
        response = self.client.post('/api/auth/register', json={'username':username or self.username,'password':self.password})
        self.assertEqual(response.status_code,201,response.text)
        return response.json()

    def create(self):
        response=self.client.post('/api/projects',json={'title':'我的课程','source_text':'蒸发发生在液体表面。'})
        self.assertEqual(response.status_code,201,response.text)
        return response.json()

    def test_six_character_register_change_login_and_local_reset(self):
        self.password='123456';user=self.register()
        self.assertEqual(self.client.post('/api/auth/password',json={'current_password':self.password,'new_password':'abcde'}).status_code,422)
        changed=self.client.post('/api/auth/password',json={'current_password':self.password,'new_password':'abcdef'})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual(self.client.post('/api/auth/logout',json={}).status_code,200)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'abcdef'}).status_code,200)
        from services.accounts.auth import Accounts
        Accounts(self.store).reset_password(self.username,'reset6')
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'reset6'}).status_code,200)
        with self.store.connection() as conn:
            self.assertNotEqual(conn.execute('SELECT password_hash FROM users WHERE id=%s',[user['id']]).fetchone()['password_hash'],'reset6')

    def test_registration_session_flags_normalization_and_no_legacy_claim(self):
        legacy=self.store.create_project('原有课程','保留原数据。')
        self.assertEqual(self.client.get('/api/projects').status_code,401)
        user=self.register(self.username.upper());self.assertEqual(user['username'],self.username)
        self.assertNotIn('password',str(user));self.assertNotIn('token',str(user))
        self.assertEqual(self.client.get('/api/auth/me').json(),user)
        self.assertEqual(self.client.get('/api/projects').json(),[])
        self.assertEqual(self.client.get('/api/projects/'+legacy['id']).status_code,404)
        project=self.create();self.assertEqual([p['id'] for p in self.client.get('/api/projects').json()],[project['id']])
        self.assertEqual(self.client.post('/api/auth/register',json={'username':self.username,'password':self.password}).status_code,409)
        with self.store.connection() as conn:
            row=conn.execute('SELECT * FROM users WHERE id=%s',[user['id']]).fetchone()
            self.assertNotIn(self.password,str(row));self.assertTrue(row['password_hash'].startswith('scrypt$'))
            self.assertEqual(conn.execute('SELECT owner_id FROM projects WHERE id=%s',[legacy['id']]).fetchone()['owner_id'],None)
            sessions=conn.execute('SELECT * FROM user_sessions WHERE user_id=%s',[user['id']]).fetchall()
            self.assertEqual(len(sessions),1)
            for token in self.client.cookies.values():self.assertNotIn(token,str(sessions))
            self.assertEqual(conn.execute('SELECT count(*) n FROM jobs WHERE project_id=%s',[project['id']]).fetchone()['n'],0)

    def test_cookie_logout_expiry_and_password_change_revoke_other_sessions(self):
        response=self.client.post('/api/auth/register',json={'username':self.username,'password':self.password})
        self.assertEqual(response.status_code,201,response.text)
        cookie=response.headers['set-cookie'].lower()
        self.assertIn('httponly',cookie);self.assertIn('samesite=strict',cookie);self.assertIn('path=/',cookie)
        user=response.json();old=dict(self.client.cookies)
        changed=self.client.post('/api/auth/password',json={'current_password':self.password,'new_password':'replacement-password-2026'})
        self.assertEqual(changed.status_code,200,changed.text)
        with TestClient(self.client.app,base_url='http://127.0.0.1:8000',client=('127.0.0.1',50001)) as other:
            other.cookies.update(old);self.assertEqual(other.get('/api/auth/me').status_code,401)
        self.assertEqual(self.client.get('/api/auth/me').status_code,200)
        self.assertEqual(self.client.post('/api/auth/logout',json={}).status_code,200)
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':self.password}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'replacement-password-2026'}).status_code,200)
        with self.store.connection() as conn:conn.execute("UPDATE user_sessions SET expires_at=now()-interval '1 second' WHERE user_id=%s",[user['id']])
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)

    def test_cross_account_all_resource_families_are_denied_before_side_effects(self):
        first=self.register();project=self.create();pid=project['id']
        project=self.store.add_scene(pid,1,'蒸发发生在液体表面。','蒸发发生在液体表面。');sid=project['scenes'][0]['id']
        version=str(uuid.uuid4());candidate=str(uuid.uuid4())
        with self.store.connection() as conn:
            conn.execute('INSERT INTO project_versions(id,project_id,revision,dsl,profile) VALUES(%s,%s,1,%s,%s)',[version,pid,Jsonb({}),Jsonb({})])
            conn.execute('INSERT INTO scene_candidates(id,scene_id,base_revision,draft) VALUES(%s,%s,1,%s)',[candidate,sid,Jsonb({})])
        job=self.client.app.state.jobs.submit_regenerate(sid,1)
        self.addCleanup(self.client.app.state.jobs.cancel,job['id'])
        self.client.cookies.clear();self.register('other_'+uuid.uuid4().hex[:16])
        self.assertEqual(self.client.get('/api/projects').json(),[])
        for path in [f'/api/projects/{pid}',f'/api/projects/{pid}/jobs',f'/api/projects/{pid}/usage',f'/api/projects/{pid}/versions',
                     f'/api/projects/{pid}/assets/audio',f'/api/scenes/{sid}/candidates',f'/api/versions/{version}',
                     f'/api/jobs/{job["id"]}',f'/api/jobs/{job["id"]}/estimate',f'/api/jobs/{job["id"]}/files/mp4',f'/api/renders/{job["id"]}']:
            with self.subTest(path=path):self.assertEqual(self.client.get(path).status_code,404,path)
        for path,body in [(f'/api/projects/{pid}/generate',{'expected_revision':project['revision']}),
                          (f'/api/jobs/{job["id"]}/cancel',{}),(f'/api/jobs/{job["id"]}/retry',{}),
                          (f'/api/scenes/{sid}/voice',{'expected_revision':1}),
                          (f'/api/scenes/{sid}/candidates/{candidate}/accept',{'expected_revision':1})]:
            self.assertEqual(self.client.post(path,json=body).status_code,404,path)
        self.assertEqual(self.client.patch(f'/api/scenes/{sid}',json={'expected_revision':1,'changes':{'narration_text':'不允许。'}}).status_code,404)
        self.assertEqual(self.store.get_project(pid),project)
        self.assertEqual(self.client.app.state.jobs.get(job['id'])['state'],'queued')

    def test_untrusted_origin_invalid_input_tampering_and_auth_limit(self):
        for fields in [{'username':'x','password':self.password},{'username':self.username,'password':'short'},
                       {'username':self.username,'password':self.password,'owner_id':'fake'}]:
            self.assertEqual(self.client.post('/api/auth/register',json=fields).status_code,422)
        self.assertEqual(self.client.post('/api/auth/register',json={'username':self.username,'password':self.password},headers={'Origin':'https://evil.invalid'}).status_code,403)
        self.register();self.client.cookies.clear();self.client.cookies.set('aicreater_session','fake')
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)
        for _ in range(10):self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'wrong-password'}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':self.password}).status_code,429)

    def test_course_summary_reports_free_draft_scene_state_and_modification_time(self):
        self.register()
        project=self.client.post('/api/projects',json={'title':'概念课','source_text':'蒸发是液体表面汽化。','mode':'script'}).json()
        row=next(p for p in self.client.get('/api/projects').json() if p['id']==project['id'])
        self.assertEqual(row['scene_count'],0);self.assertFalse(row['active_jobs']);self.assertIsNotNone(row['updated_at']);created_at=row['updated_at']
        project=self.client.post('/api/projects/'+project['id']+'/scenes',json={'expected_revision':project['revision'],'narration_text':'蒸发是液体表面汽化。','content':'蒸发'}).json()
        row=next(p for p in self.client.get('/api/projects').json() if p['id']==project['id'])
        self.assertEqual(row['scene_count'],1);self.assertEqual(row['needs_voice'],1);self.assertGreater(row['updated_at'],created_at)

    def test_every_registered_resource_route_requires_authentication(self):
        from fastapi.routing import APIRoute
        for route in self.client.app.routes:
            if not isinstance(route,APIRoute) or not route.path.startswith('/api/') or route.path in ('/api/auth/register','/api/auth/login'):continue
            path=route.path
            for param in route.param_convertors:path=path.replace('{'+param+'}',str(uuid.uuid4()) if param!='extension' else 'mp4')
            for method in route.methods:
                with self.subTest(path=path,method=method):
                    response=self.client.request(method,path,**({'json':{}} if method not in ('GET','HEAD') else {}))
                    self.assertEqual(response.status_code,401,response.text)
        self.assertEqual(self.client.get('/health').status_code,200)
        self.assertTrue(self.client.app.state.authentication)

    def test_json_csrf_boundary_rate_headers_and_local_reset_revoke_sessions(self):
        user=self.register()
        self.assertEqual(self.client.post('/api/auth/logout',content='{}',headers={'Content-Type':'text/plain'}).status_code,415)
        self.assertEqual(self.client.post('/api/auth/logout',json={},headers={'Origin':'null'}).status_code,403)
        self.assertEqual(self.client.get('/api/auth/me').headers['cache-control'],'no-store')
        from services.accounts.auth import Accounts
        Accounts(self.store).reset_password(self.username,'locally-reset-password-2026')
        self.assertEqual(self.client.get('/api/auth/me').status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'locally-reset-password-2026'}).status_code,200)
        for _ in range(9):self.assertEqual(self.client.post('/api/auth/login',json={'username':self.username,'password':'wrong-password'}).status_code,401)
        limited=self.client.post('/api/auth/login',json={'username':self.username,'password':'wrong-password'})
        self.assertEqual(limited.status_code,429)
        self.assertEqual(limited.headers.get('retry-after'),'900')

    def test_claim_is_explicit_atomic_and_never_reassigns_owned_projects(self):
        from services.accounts.auth import Accounts
        first=self.register();owned=self.create();legacy=self.store.create_project('旧课','只显式认领。')
        accounts=Accounts(self.store)
        self.assertEqual(accounts.claim(self.username,[legacy['id']]),1)
        self.assertEqual(accounts.claim(self.username,[legacy['id']]),0)
        second='other_'+uuid.uuid4().hex[:16];self.client.cookies.clear();self.register(second)
        unowned=self.store.create_project('其他旧课','事务测试。')
        with self.assertRaisesRegex(ValueError,'owned'):accounts.claim(second,[unowned['id'],owned['id']])
        with self.store.connection() as conn:self.assertIsNone(conn.execute('SELECT owner_id FROM projects WHERE id=%s',[unowned['id']]).fetchone()['owner_id'])
        self.assertEqual(self.client.get('/api/projects/'+legacy['id']).status_code,404)
