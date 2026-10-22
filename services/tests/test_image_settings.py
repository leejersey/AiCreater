"""No provider calls; API tests require disposable TEST_DATABASE_URL."""
from contextlib import ExitStack
import os
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch
import uuid

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE

PUBLIC = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8',443))]

class ImageSettingsTests(unittest.TestCase):
    def test_https_public_urls_only_and_normalized_without_losing_prefix(self):
        from services.accounts.image_settings import validate_base_url
        with patch('socket.getaddrinfo',return_value=PUBLIC):
            self.assertEqual(validate_base_url(' https://API.Example.com:8443/proxy/v1/ '),'https://api.example.com:8443/proxy/v1')
            self.assertEqual(validate_base_url('https://api.openai.com/v1'),'https://api.openai.com/v1')
            for value in ['http://api.example.com/v1','https://localhost/v1','https://127.0.0.1/v1','https://[::1]/v1',
                          'https://169.254.169.254/v1','https://192.168.1.2/v1','https://100.64.0.1',
                          'https://user:pass@api.example.com/v1','https://api.example.com/v1?key=secret',
                          'https://api.example.com/v1#x','https://api.example.com:0/v1','https://api.example.com:99999/v1',
                          'https://api.example.com\\@127.0.0.1','https://api.example.com/\npath', 'https://api.example.com/%0d%0a']:
                with self.subTest(value=value),self.assertRaises(StoreError):validate_base_url(value)

    def test_save_url_normalization_never_resolves_dns_even_with_fake_ip_or_offline(self):
        from services.accounts.image_settings import validate_base_url
        for host in ['jbbt.pages.dev','api.openai.com','offline.example']:
            with self.subTest(host=host),patch('socket.getaddrinfo',side_effect=socket.gaierror('offline')) as dns:
                self.assertEqual(validate_base_url('https://'+host+'/v1/'),'https://'+host+'/v1')
                dns.assert_not_called()

    def test_encryption_key_is_required_and_errors_never_echo_secrets(self):
        from services.accounts.image_settings import cipher
        for env in [{},{'ACCOUNT_CREDENTIALS_KEY':'secret-malformed'}]:
            with patch.dict(os.environ,env,clear=True),self.assertRaises(StoreError) as error:cipher()
            self.assertNotIn('secret-malformed',str(error.exception))
        key=Fernet.generate_key().decode()
        with patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':key}):
            token=cipher().encrypt(b'secret-api-key')
            self.assertNotIn(b'secret-api-key',token)
            self.assertEqual(cipher().decrypt(token),b'secret-api-key')


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class ImageSettingsAPITests(unittest.TestCase):
    def setUp(self):
        from services.api.app import create_app
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        self.key=Fernet.generate_key().decode()
        self.stack.enter_context(patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':self.key}))
        self.stack.enter_context(patch('socket.getaddrinfo',return_value=PUBLIC))
        folder=self.stack.enter_context(tempfile.TemporaryDirectory())
        self.store=Store(os.environ['TEST_DATABASE_URL'],Path(folder),PROFILE)
        self.client=self.stack.enter_context(TestClient(create_app(self.store),base_url='http://127.0.0.1:8000',
            client=('127.0.0.1',50000),headers={'Origin':'http://127.0.0.1:3000'}))
        self.url='/api/auth/image-settings'

    def register(self):
        r=self.client.post('/api/auth/register',json={'username':'img_'+uuid.uuid4().hex[:16],'password':'123456'})
        self.assertEqual(r.status_code,201,r.text)
        return r.json()['id']

    def test_authentication_roundtrip_encrypted_update_delete_and_isolation(self):
        self.assertEqual(self.client.get(self.url).status_code,401)
        first=self.register();session=dict(self.client.cookies)
        self.assertEqual(self.client.get(self.url).json(),{'configured':False,'base_url':'https://api.openai.com/v1'})
        body={'base_url':'https://api.example.com/proxy/v1/','api_key':'sk-test-private'}
        r=self.client.post(self.url,json=body);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json(),{'configured':True,'base_url':'https://api.example.com/proxy/v1'})
        status=self.client.get(self.url)
        self.assertNotIn('sk-test-private',status.text)
        self.assertEqual(status.headers.get('cache-control'),'no-store')
        with self.store.connection() as conn:
            row=conn.execute('SELECT * FROM user_image_settings WHERE user_id=%s',[first]).fetchone()
            self.assertNotIn('sk-test-private',str(row))
            self.assertEqual(Fernet(self.key).decrypt(row['encrypted_api_key'].encode()).decode(),'sk-test-private')
        self.assertEqual(self.client.post(self.url,json={'base_url':body['base_url'],'api_key':''}).status_code,200)
        with patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':Fernet.generate_key().decode()}):
            broken=self.client.post(self.url,json={'base_url':body['base_url'],'api_key':''})
            self.assertEqual(broken.status_code,503)
            self.assertNotIn('sk-test-private',broken.text)
        self.assertTrue(self.client.get(self.url).json()['configured'])
        self.assertEqual(self.client.post(self.url,json={'base_url':'https://other.example.com/v1','api_key':''}).status_code,422)
        self.assertEqual(self.client.get(self.url).json()['base_url'],'https://api.example.com/proxy/v1')
        self.client.cookies.clear();self.register()
        self.assertFalse(self.client.get(self.url).json()['configured'])
        self.assertEqual(self.client.post(self.url+'/clear',json={}).status_code,200)
        self.client.cookies.clear();self.client.cookies.update(session)
        self.assertTrue(self.client.get(self.url).json()['configured'])
        r=self.client.post(self.url,json={**body,'api_key':'sk-replaced'});self.assertEqual(r.status_code,200,r.text)
        self.assertNotIn('sk-replaced',r.text)
        with self.store.connection() as conn:
            row=conn.execute('SELECT encrypted_api_key FROM user_image_settings WHERE user_id=%s',[first]).fetchone()
            self.assertEqual(Fernet(self.key).decrypt(row['encrypted_api_key'].encode()),b'sk-replaced')
        self.assertEqual(self.client.post(self.url+'/clear',json={}).status_code,200)
        self.assertFalse(self.client.get(self.url).json()['configured'])

    def test_invalid_secrets_urls_and_requests_are_rejected_without_mutation(self):
        self.register()
        for body in [{'base_url':'http://localhost','api_key':'never-echo-this'},
                     {'base_url':'https://api.example.com/v1','api_key':'bad\nkey'},
                     {'base_url':'https://api.example.com/v1','api_key':'a'*2049},
                     {'base_url':'https://api.example.com/v1','api_key':''},
                     {'base_url':'https://api.example.com/v1','api_key':123},
                     {'base_url':'https://api.example.com/v1','api_key':'x','user_id':str(uuid.uuid4())}]:
            r=self.client.post(self.url,json=body)
            self.assertEqual(r.status_code,422,r.text)
            self.assertNotIn('never-echo-this',r.text)
        self.assertFalse(self.client.get(self.url).json()['configured'])
        self.assertEqual(self.client.post(self.url,content='{}',headers={'Content-Type':'text/plain'}).status_code,415)
        self.assertEqual(self.client.post(self.url,json={},headers={'Origin':'https://evil.example'}).status_code,403)

    def test_missing_server_key_fails_closed_but_status_and_clear_still_work(self):
        self.register()
        with patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':''}):
            r=self.client.post(self.url,json={'base_url':'https://api.example.com/v1','api_key':'never-echo-this'})
            self.assertEqual(r.status_code,503,r.text);self.assertNotIn('never-echo-this',r.text)
            self.assertEqual(self.client.get(self.url).status_code,200)
            self.assertEqual(self.client.post(self.url+'/clear',json={}).status_code,200)
