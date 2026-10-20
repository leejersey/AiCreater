import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from minio.error import S3Error
from services.projects.store import StoreError
from services.projects.storage import ObjectStore

class FakeClient:
    def __init__(self): self.data = {}; self.fail = False
    def stat_object(self, bucket, key):
        if self.fail: raise RuntimeError('secret credential transport detail')
        if key not in self.data: raise S3Error(None, 'NoSuchKey', 'missing', None, None, None)
        data = self.data[key]
        return SimpleNamespace(size=len(data), metadata={'x-amz-meta-sha256': hashlib.sha256(data).hexdigest()})
    def fput_object(self, bucket, key, path, **kwargs): self.data[key] = Path(path).read_bytes()
    def get_object(self, bucket, key):
        response = io.BytesIO(self.data[key]); response.release_conn = lambda: None
        return response

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.file = Path(self.temp.name).resolve() / 'audio.wav'; self.file.write_bytes(b'teaching-audio')
        self.checksum = hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.client = FakeClient(); self.storage = ObjectStore(self.client, 'private-test')
    def test_upload_missing_cache_restore_and_existing_corruption_rejected(self):
        self.storage.put(self.file, self.checksum, 100)
        self.file.unlink(); self.storage.ensure(self.file, self.checksum, 100)
        self.assertEqual(self.file.read_bytes(), b'teaching-audio')
        self.file.write_bytes(b'corrupt')
        with self.assertRaises(StoreError): self.storage.ensure(self.file, self.checksum, 100)
        self.assertEqual(self.file.read_bytes(), b'corrupt')
    def test_bad_remote_data_never_publishes_a_file(self):
        self.storage.put(self.file, self.checksum, 100)
        self.file.unlink(); self.client.data[next(iter(self.client.data))] = b'wrong'
        with self.assertRaises(StoreError): self.storage.ensure(self.file, self.checksum, 100)
        self.assertFalse(self.file.exists())
    def test_transport_details_sanitized(self):
        self.client.fail = True
        with self.assertRaises(StoreError) as error: self.storage.put(self.file, self.checksum, 100)
        self.assertEqual(error.exception.code, 'storage')
        self.assertNotIn('secret', str(error.exception))
    def test_symlinks_and_size_limits_rejected(self):
        link = self.file.with_name('link.wav'); link.symlink_to(self.file)
        for path, limit in [(link, 100), (self.file, 1)]:
            with self.assertRaises(StoreError): self.storage.put(path, self.checksum, limit)
    def test_storage_credentials_not_passed_to_node_verifier(self):
        from services.projects.store import Store
        store = object.__new__(Store); store.objects = None; store.public = self.file.parent
        with patch.dict('os.environ', {'RUSTFS_SECRET_KEY': 'hidden-secret', 'RUSTFS_ACCESS_KEY': 'hidden-access'}), \
                patch('services.projects.store.subprocess.run') as run:
            store._assets({'assets': []})
        self.assertFalse('RUSTFS_SECRET_KEY' in run.call_args.kwargs['env'], 'Storage secret reached Node')
        self.assertFalse('RUSTFS_ACCESS_KEY' in run.call_args.kwargs['env'], 'Storage access key reached Node')

    def test_configuration_disabled_or_invalid_without_network(self):
        self.assertIsNone(ObjectStore.from_env({}))
        for endpoint in ['http://remote.example', 'http://u:p@127.0.0.1', 'http://127.0.0.1/path']:
            with self.assertRaises(StoreError): ObjectStore.from_env({'MINIO_ENDPOINT': endpoint})
