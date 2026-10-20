"""Private content-addressed media, with verified local caches. No public URLs."""
import hashlib
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit
import urllib3
from minio import Minio
from minio.error import S3Error
from services.projects.store import StoreError


class Progress:
    def __init__(self, callback=None): self.callback, self.last = callback, 0
    def set_meta(self, **kwargs): pass
    def update(self, size=0):
        if self.callback and time.monotonic() - self.last >= 5:
            self.last = time.monotonic(); self.callback()


class ObjectStore:
    def __init__(self, client, bucket): self._client, self._bucket = client, bucket

    @classmethod
    def from_env(cls, values=None):
        values = os.environ if values is None else values
        endpoint = values.get('MINIO_ENDPOINT', '')
        if not endpoint: return None
        try: url = urlsplit(endpoint); url.port
        except ValueError: raise StoreError('storage', 'Invalid private object-storage endpoint') from None
        access, secret = values.get('MINIO_ACCESS_KEY', ''), values.get('MINIO_SECRET_KEY', '')
        bucket = values.get('MINIO_BUCKET', 'aicreater')
        if (url.scheme not in ['http', 'https'] or not url.hostname or url.username or url.password or
                url.path not in ['', '/'] or url.query or url.fragment or any(ord(c) < 33 for c in endpoint) or
                (url.scheme == 'http' and url.hostname not in ['127.0.0.1', 'localhost', 'minio']) or
                not access or not secret or not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bucket)):
            raise StoreError('storage', 'Invalid private object-storage configuration')
        try:
            client = Minio(url.netloc, access_key=access, secret_key=secret, secure=url.scheme == 'https',
                http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=5, read=10), retries=False))
            if not client.bucket_exists(bucket):
                try: client.make_bucket(bucket)
                except S3Error as error:
                    if error.code not in ['BucketAlreadyOwnedByYou', 'BucketAlreadyExists']: raise
            try:
                if client.get_bucket_policy(bucket):
                    raise StoreError('storage', 'Use a private bucket without a bucket policy')
            except S3Error as error:
                if error.code != 'NoSuchBucketPolicy': raise
            return cls(client, bucket)
        except StoreError: raise
        except Exception: raise StoreError('storage', 'Private object storage unavailable; details withheld') from None

    @staticmethod
    def key(path, checksum):
        if not re.fullmatch(r'[a-f0-9]{64}', checksum) or path.suffix not in ['.wav', '.mp3', '.m4a', '.mp4', '.srt']:
            raise StoreError('assets', 'Invalid media checksum or extension')
        return 'sha256/' + checksum + path.suffix

    @staticmethod
    def valid(path, checksum, limit):
        if path.resolve() != path.absolute() or not path.is_file() or not 0 < path.stat().st_size <= limit:
            raise StoreError('assets', 'Invalid media cache')
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            while block := stream.read(65536): digest.update(block)
        if digest.hexdigest() != checksum: raise StoreError('assets', 'Media checksum mismatch')

    # ponytail: keep unreferenced immutable objects; add GC only after a documented retention policy.
    def put(self, path, checksum, limit, callback=None):
        path = Path(path); key = self.key(path, checksum); self.valid(path, checksum, limit)
        progress = Progress(callback)
        try:
            try:
                existing = self._client.stat_object(self._bucket, key)
                if existing.size != path.stat().st_size or existing.metadata.get('x-amz-meta-sha256') != checksum:
                    raise StoreError('assets', 'Existing immutable object metadata mismatch')
                return
            except S3Error as error:
                if error.code != 'NoSuchKey': raise
            # Seal bytes before uploading; a caller changing the cache cannot change the object key's content.
            with tempfile.NamedTemporaryFile(suffix=path.suffix) as sealed:
                size = 0
                with path.open('rb') as source:
                    while block := source.read(65536):
                        size += len(block)
                        if size > limit: raise StoreError('assets', 'Media size exceeds limit')
                        sealed.write(block); progress.update()
                sealed.flush(); self.valid(Path(sealed.name).resolve(), checksum, limit)
                self._client.fput_object(self._bucket, key, sealed.name, metadata={'sha256': checksum},
                    num_parallel_uploads=1, progress=progress)
        except StoreError: raise
        except Exception: raise StoreError('storage', 'Private object upload failed; details withheld') from None

    def ensure(self, path, checksum, limit, callback=None):
        path = Path(path); key = self.key(path, checksum)
        if path.exists() or path.is_symlink(): self.valid(path, checksum, limit); return
        if path.resolve() != path.absolute(): raise StoreError('assets', 'Media cache path cannot contain symlinks')
        progress = Progress(callback)
        response = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            response = self._client.get_object(self._bucket, key)
            with tempfile.NamedTemporaryFile(dir=path.parent, suffix=path.suffix) as restored:
                size = 0
                while block := response.read(65536):
                    size += len(block)
                    if size > limit: raise StoreError('assets', 'Object exceeds media size limit')
                    restored.write(block); progress.update()
                restored.flush(); self.valid(Path(restored.name), checksum, limit)
                try: os.link(restored.name, path)
                except FileExistsError: self.valid(path, checksum, limit)
        except StoreError: raise
        except Exception: raise StoreError('storage', 'Private object download failed; details withheld') from None
        finally:
            if response is not None: response.close(); response.release_conn()
