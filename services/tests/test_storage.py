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
    def test_static_image_extensions_restore_immutable_objects(self):
        for extension in ['png', 'jpg', 'jpeg']:
            file = self.file.with_suffix('.' + extension); file.write_bytes(b'validated-image-bytes')
            checksum = hashlib.sha256(file.read_bytes()).hexdigest()
            self.storage.put(file, checksum, 100)
            file.unlink(); self.storage.ensure(file, checksum, 100)
            self.assertEqual(file.read_bytes(), b'validated-image-bytes')

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
        with patch.dict('os.environ', {'TOS_SECRET_KEY': 'hidden-secret', 'TOS_ACCESS_KEY': 'hidden-access', 'OPENAI_API_KEY': 'hidden-image-key', 'ACCOUNT_CREDENTIALS_KEY': 'hidden-encryption-key'}, clear=True), \
                patch('services.projects.store.subprocess.run') as run:
            store._assets({'assets': []})
        self.assertNotIn('OPENAI_API_KEY', run.call_args.kwargs['env'])
        self.assertFalse('ACCOUNT_CREDENTIALS_KEY' in run.call_args.kwargs['env'], 'Encryption key reached Node')
        self.assertFalse('TOS_SECRET_KEY' in run.call_args.kwargs['env'], 'Storage secret reached Node')
        self.assertFalse('TOS_ACCESS_KEY' in run.call_args.kwargs['env'], 'Storage access key reached Node')

    def test_configuration_disabled_or_invalid_without_network(self):
        self.assertIsNone(ObjectStore.from_env({}))
        self.assertIsNone(ObjectStore.from_env({'MINIO_ENDPOINT': 'http://127.0.0.1:19000', 'MINIO_ACCESS_KEY': 'a', 'MINIO_SECRET_KEY': 's'}))

    def test_tos_must_be_https_in_a_named_region_and_virtual_hosted(self):
        tos = {'TOS_BUCKET': 'aicreater-media', 'TOS_REGION': 'cn-beijing', 'TOS_ACCESS_KEY': 'ak', 'TOS_SECRET_KEY': 'sk'}
        for change in [{'TOS_REGION': ''}, {'TOS_SECRET_KEY': ''}, {'TOS_ENDPOINT': 'http://tos-s3-cn-beijing.volces.com'},
                       {'TOS_ENDPOINT': 'https://tos-s3-cn-beijing.volces.com/path'}, {'TOS_BUCKET': 'Bad_Bucket'}]:
            with self.subTest(change=change), patch('services.projects.storage.Minio') as minio:
                with self.assertRaises(StoreError): ObjectStore.from_env({**tos, **change})
                minio.assert_not_called()
        with patch('services.projects.storage.Minio') as minio:
            client = minio.return_value; client.bucket_exists.return_value = True
            client.get_bucket_policy.side_effect = S3Error(None, 'NoSuchBucketPolicy', 'none', None, None, None)
            store = ObjectStore.from_env(tos)
        self.assertEqual(minio.call_args.args[0], 'tos-s3-cn-beijing.volces.com')
        self.assertEqual(minio.call_args.kwargs['region'], 'cn-beijing')
        client.enable_virtual_style_endpoint.assert_called_once()
        self.assertEqual(store._bucket, 'aicreater-media')

    def test_a_missing_tos_bucket_is_an_error_not_created(self):
        with patch('services.projects.storage.Minio') as minio:
            minio.return_value.bucket_exists.return_value = False
            with self.assertRaises(StoreError):
                ObjectStore.from_env({'TOS_BUCKET': 'aicreater-media', 'TOS_REGION': 'cn-beijing', 'TOS_ACCESS_KEY': 'ak', 'TOS_SECRET_KEY': 'sk'})
            minio.return_value.make_bucket.assert_not_called()
