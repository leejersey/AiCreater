"""Real PostgreSQL/Redis/Celery/API render check. No paid model or TTS calls."""
import argparse
import copy
import hashlib
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='Existing final DSL; audio must exist in renderer public root')
    parser.add_argument('--output', required=True, help='New directory; never overwrite an existing output')
    storage = parser.add_mutually_exclusive_group()
    storage.add_argument('--rustfs', action='store_true', help='Use pinned official RustFS and verify private objects / lost-cache recovery')
    storage.add_argument('--minio', action='store_true', help='Legacy trusted private MinIO image only')
    parser.add_argument('--minio-image', help='Explicit trusted/pinned private image; legacy public community images are unavailable')
    args = parser.parse_args()
    if args.minio and not args.minio_image: parser.error('--minio requires an explicit trusted --minio-image')
    storage_enabled = args.rustfs or args.minio
    source, destination = Path(args.project), Path(args.output)
    if not source.is_file():
        print(json.dumps({'code': 'sample_missing'})); return 1
    if destination.exists() or destination.is_symlink():
        print(json.dumps({'code': 'output_exists'})); return 1
    names, processes, rendered, jobs, render_id = [], [], None, None, None
    owned_audio = None
    step = 'preflight'
    try:
        from services.projects.store import Store, final_valid
        from services.projects.manage import profile
        from services.projects.jobs import Jobs
        assert source.stat().st_size <= 512 * 1024
        document = json.loads(source.read_text(encoding='utf-8-sig'))
        final_valid(document)
        with socket.socket() as sock: sock.bind(('127.0.0.1', 8000))
        password = secrets.token_hex(24)
        env = {**os.environ, 'POSTGRES_PASSWORD': password, 'DEEPSEEK_MODEL': 'queue-smoke-no-provider',
               'DEEPSEEK_API_KEY': '', 'VOLCENGINE_API_KEY': '', 'VOLCENGINE_APP_ID': '', 'VOLCENGINE_ACCESS_KEY': '',
               'VOLCENGINE_RESOURCE_ID': 'queue-smoke-no-provider', 'VOLCENGINE_SPEAKER': 'queue-smoke',
               'MINIO_ENDPOINT': '', 'MINIO_ACCESS_KEY': '', 'MINIO_SECRET_KEY': ''}

        def container(image, port, arguments, command=()):
            name = 'aicreater-queue-smoke-' + uuid.uuid4().hex[:12]
            names.append(name)
            subprocess.run(['docker', 'run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::' + str(port),
                            *arguments, image, *command], env=env, check=True, capture_output=True, timeout=120)
            binding = subprocess.check_output(['docker', 'port', name, str(port) + '/tcp'], text=True, timeout=10).strip().rsplit(':', 1)[1]
            assert binding.isdigit()
            return binding

        step = 'containers'
        pg_port = container('postgres:16.13@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51', 5432, ['-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=queue_smoke'])
        redis_port = container('redis:7.4.8-alpine@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065', 6379, [])
        env['DATABASE_URL'] = f'postgresql://postgres:{password}@127.0.0.1:{pg_port}/queue_smoke'
        env['CELERY_BROKER_URL'] = f'redis://127.0.0.1:{redis_port}/0'
        for _ in range(50):
            try:
                with psycopg.connect(env['DATABASE_URL'], connect_timeout=1): break
            except psycopg.Error: time.sleep(.3)
        else: raise RuntimeError('database timeout')
        objects = None
        if storage_enabled:
            from services.projects.storage import ObjectStore
            access, secret = 'smokeuser', secrets.token_hex(24)
            if args.rustfs:
                env.update(RUSTFS_ACCESS_KEY=access, RUSTFS_SECRET_KEY=secret, RUSTFS_CONSOLE_ENABLE='false')
                minio_port = container('rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c', 9000,
                    ['-e', 'RUSTFS_ACCESS_KEY', '-e', 'RUSTFS_SECRET_KEY', '-e', 'RUSTFS_CONSOLE_ENABLE'], ['/data'])
            else:
                env.update(MINIO_ROOT_USER=access, MINIO_ROOT_PASSWORD=secret)
                minio_port = container(args.minio_image, 9000,
                    ['-e', 'MINIO_ROOT_USER', '-e', 'MINIO_ROOT_PASSWORD'], ['server', '/data'])
            env.update(MINIO_ENDPOINT='http://127.0.0.1:' + minio_port, MINIO_ACCESS_KEY=access,
                       MINIO_SECRET_KEY=secret, MINIO_BUCKET='queue-smoke')
            for _ in range(50):
                try: objects = ObjectStore.from_env(env); break
                except Exception: time.sleep(.3)
            if objects is None: raise RuntimeError('private MinIO timeout')
            owned_audio = ROOT / 'apps/renderer/public' / ('queue_smoke_audio_' + uuid.uuid4().hex)
            owned_audio.mkdir()
            for i, asset in enumerate(document['assets']):
                original = ROOT / 'apps/renderer/public' / asset['storage_key']
                target = owned_audio / (str(i) + original.suffix)
                shutil.copyfile(original, target)
                asset['storage_key'] = owned_audio.name + '/' + target.name
        config = profile(); config['voice'] = {'resource_id': env['VOLCENGINE_RESOURCE_ID'], 'speaker': env['VOLCENGINE_SPEAKER']}
        store = Store(env['DATABASE_URL'], ROOT / 'apps/renderer/public', config, objects=objects)
        jobs = Jobs(store, model=env['DEEPSEEK_MODEL'])
        destination.mkdir(parents=True, mode=0o700, exist_ok=False)
        with tempfile.TemporaryDirectory(prefix='aicreater-queue-logs-') as logs, httpx.Client(base_url='http://127.0.0.1:8000', timeout=30, trust_env=False) as client:
            def start(name, command):
                with (Path(logs) / (name + '.log')).open('wb') as log:
                    process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log, start_new_session=True)
                processes.append(process)
                return process

            def request(method, path, body=None, status=200):
                response = client.request(method, path, json=body) if body is not None else client.request(method, path)
                assert response.status_code == status, 'unexpected API status at ' + path
                return response.json()

            step = 'api_start'
            start('api', [sys.executable, '-m', 'uvicorn', 'services.api.app:app', '--host', '127.0.0.1', '--port', '8000', '--log-level', 'warning'])
            for _ in range(100):
                try:
                    if client.get('/health').status_code == 200: break
                except httpx.TransportError: pass
                time.sleep(.2)
            else: raise RuntimeError('API timeout')
            project = request('POST', '/api/projects/import', {'title': '真实队列教学渲染验收', 'dsl': document}, 201)
            if storage_enabled:
                key = objects.key(store.public / document['assets'][0]['storage_key'], document['assets'][0]['checksum'])
                with httpx.Client(trust_env=False, timeout=10) as anonymous:
                    assert anonymous.get(env['MINIO_ENDPOINT'] + '/queue-smoke/' + key).status_code == 403, 'object allowed anonymous read'
                for file in owned_audio.iterdir(): file.unlink()
            version = request('POST', '/api/projects/' + project['id'] + '/versions', {'expected_revision': project['revision']}, 201)
            job = request('POST', '/api/projects/' + project['id'] + '/render', {'version_id': version['id']}, 202)
            render_id = job['job_id']
            duplicate = request('POST', '/api/projects/' + project['id'] + '/render', {'version_id': version['id']}, 202)
            assert duplicate['job_id'] == render_id, 'duplicate active render'

            # A queued paid-capable job is cancelled before any workflow consumer starts.
            draft = request('POST', '/api/projects', {'title': '取消验证', 'source_text': 'Python循环累加。', 'mode': 'script'}, 201)
            cancelled = request('POST', '/api/projects/' + draft['id'] + '/generate', {'expected_revision': draft['revision']}, 202)
            cancelled = request('POST', '/api/jobs/' + cancelled['job_id'] + '/cancel', {})
            assert cancelled['state'] == 'cancelled' and cancelled['attempts'] == 0

            if storage_enabled:
                assert all((store.public / a['storage_key']).is_file() for a in document['assets']), 'audio not restored for snapshot'
                for file in owned_audio.iterdir(): file.unlink()
            step = 'celery_start'
            start('render-worker', [sys.executable, '-m', 'celery', '-A', 'services.workflow.queue:app', 'worker', '-Q', 'render', '--hostname=queue-smoke-render@%h', '--pool=solo', '--concurrency=1', '--loglevel=warning', '--without-gossip', '--without-mingle'])
            start('workflow-worker', [sys.executable, '-m', 'celery', '-A', 'services.workflow.queue:app', 'worker', '-Q', 'workflow', '--hostname=queue-smoke-workflow@%h', '--pool=solo', '--concurrency=1', '--loglevel=warning', '--without-gossip', '--without-mingle'])
            start('beat', [sys.executable, '-m', 'celery', '-A', 'services.workflow.queue:app', 'beat', '--loglevel=warning', '--schedule', str(Path(logs) / 'beat')])
            saw_running, edited = False, False
            start_time = time.monotonic()
            while time.monotonic() - start_time < 900:
                step = 'queue_render'
                job = request('GET', '/api/jobs/' + render_id)
                if job['state'] == 'running':
                    saw_running = True
                    if not edited:
                        row = project['scenes'][0]
                        elements = copy.deepcopy(row['scene']['elements'])
                        elements[0]['content'] = '快照冻结后编辑'
                        request('PATCH', '/api/scenes/' + row['id'], {'expected_revision': row['revision'], 'changes': {'elements': elements}})
                        edited = True
                if job['state'] in ['succeeded', 'failed', 'cancelled']: break
                assert all(p.poll() is None for p in processes), 'service exited'
                time.sleep(.5)
            assert job['state'] == 'succeeded' and job['progress'] == 100 and job['attempts'] == 1, 'render did not succeed'
            assert saw_running and edited, 'did not observe real queued-to-running transition'
            frozen = request('GET', '/api/versions/' + version['id'])
            assert frozen['dsl'] == document, 'frozen DSL changed'
            current = request('GET', '/api/projects/' + project['id'])
            assert current['scenes'][0]['scene']['elements'][0]['content'] == '快照冻结后编辑'
            assert job['result']['version_id'] == version['id']
            cancelled = request('GET', '/api/jobs/' + cancelled['job_id'])
            assert cancelled['state'] == 'cancelled' and cancelled['attempts'] == 0, 'cancelled job was consumed'
            rendered = store.public / 'renders' / render_id
            assert json.loads((jobs.render_directory(jobs.get(render_id)) / 'snapshot.json').read_text()) == document
            if storage_enabled:
                assert all((store.public / a['storage_key']).is_file() for a in document['assets']), 'audio not restored for renderer'
                shutil.rmtree(jobs.render_directory(jobs.get(render_id)))
            step = 'download'
            for extension in ['mp4', 'srt']:
                response = client.get('/api/jobs/' + render_id + '/files/' + extension)
                assert response.status_code == 200
                assert hashlib.sha256(response.content).hexdigest() == job['result']['checksums'][extension]
                (destination / ('teaching.' + extension)).write_bytes(response.content)
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(destination / 'teaching.mp4')], timeout=30))
            video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
            frames = sum(s['duration_frames'] for s in document['scenes'])
            assert (video['codec_name'], video['width'], video['height'], int(video['nb_frames'])) == ('h264', 1920, 1080, frames)
            assert audio['codec_name'] == 'aac'
            assert abs(float(probe['format']['duration']) - frames / 30) <= .1
            report = {'status': 'passed', 'paid_calls': 0, 'sample': source.name, 'frames': frames,
                      'duration_seconds': float(probe['format']['duration']), 'attempts': 1, 'immutable_snapshot': True,
                      'duplicate_deduplicated': True, 'queued_cancelled_without_attempt': True, 'queues': ['workflow', 'render'],
                      'checksums': job['result']['checksums'], 'private_object_storage': storage_enabled, 'lost_cache_restored': storage_enabled,
                      'storage_provider': 'rustfs' if args.rustfs else 'minio' if args.minio else 'local', 'anonymous_read_denied': storage_enabled}
            (destination / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report))
            return 0
    except Exception:
        print(json.dumps({'status': 'failed', 'stage': step, 'message': 'Queue smoke failed; no passing result claimed'}))
        return 1
    finally:
        if jobs is not None and render_id:
            try:
                job = jobs.get(render_id)
                rendered = jobs.store.public / 'renders' / render_id
                if job['state'] in ['queued', 'running']: jobs.cancel(render_id)
            except Exception: pass
        for process in reversed(processes):
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=15)
            except ProcessLookupError: pass
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=5)
        if rendered is not None:
            if rendered.is_symlink(): rendered.unlink()
            elif rendered.is_dir(): shutil.rmtree(rendered)
        if owned_audio is not None and owned_audio.is_dir(): shutil.rmtree(owned_audio)
        for name in names:
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=15)


if __name__ == '__main__': sys.exit(main())
