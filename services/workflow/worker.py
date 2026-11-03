"""Bounded single-attempt executor for voice and timing jobs. --once is local debugging, not a Celery replacement."""
import argparse
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from services.projects.store import ROOT, Store, StoreError
from services.projects.jobs import Jobs, ERRORS


def child():
    from services.workflow.providers import Settings, ProviderError
    import httpx
    try:
        payload = json.load(sys.stdin)
        usage_options = {}
        if payload.get('_usage_file'):
            from services.projects.usage import safe_event
            def emit(event):
                event = safe_event(event)
                if event is not None:
                    file = Path(payload['_usage_file']);temp = file.with_suffix('.tmp')
                    temp.write_text(json.dumps(event),encoding='utf-8');temp.replace(file)
            usage_options = {'on_usage':emit}
        if payload['kind'] == 'timing':
            from services.workflow.local_timing import timing_document
            document = timing_document(payload, Path(payload['public_root']))
            print(json.dumps({'document': document}, ensure_ascii=False))
            return
        if payload['kind'] == 'voice':
            from services.workflow.generate import generate_project
            voice = payload['profile']['voice']
            settings = Settings.from_env({**os.environ, 'DEEPSEEK_API_KEY': 'unused-for-voice',
                'VOLCENGINE_RESOURCE_ID': voice['resource_id'], 'VOLCENGINE_SPEAKER': voice['speaker']})
            draft = {'scenes': [payload['scene']]}
            with tempfile.TemporaryDirectory(prefix='aicreater-voice-') as folder, httpx.Client(timeout=120) as client:
                document = generate_project(payload['scene']['narration']['text'], Path(folder) / 'project.json',
                                            Path(payload['public_root']), settings, client, draft=draft, **usage_options)
            print(json.dumps({'document': document}, ensure_ascii=False))
            return
        raise ProviderError('worker', 'validation', 'Unsupported job kind')
    except ProviderError as exc:
        code = 'transport_error' if exc.code == 'transport_error' else 'validation'
        if exc.stage == 'timing' and exc.code == 'cache_unavailable': code = 'timing_cache'
        if exc.code in ['missing_setting', 'invalid_auth', 'invalid_setting'] or (exc.code == 'http_error' and str(exc).endswith(('HTTP 401', 'HTTP 403'))):
            code = 'configuration'
        if exc.code == 'http_error' and str(exc).endswith(('HTTP 429', 'HTTP 500', 'HTTP 502', 'HTTP 503', 'HTTP 504')):
            code = 'provider_error'
        print(json.dumps({'error': code}))
    except Exception:
        print(json.dumps({'error': 'validation'}))


def _stop_process(process):
    try: os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError: pass  # Reap descendants too, even if their group leader already exited.
    process.wait()


def run_once(jobs, command=None, timeout=None, heartbeat_interval=10, lane=None):
    """Test commands are internal argv arrays; user requests never supply executable code."""
    job = jobs.claim(lane=lane)
    if job is None: return None
    job_id, attempt_id = job['id'], job['attempt_id']
    if job['kind'] not in ('voice', 'timing'): return jobs.fail(job_id, attempt_id, 'validation')
    if timeout is None: timeout = 240 if job['kind'] == 'voice' else 120
    stage = 'timing' if job['kind'] == 'timing' else 'tts'
    command = command or [sys.executable, '-m', 'services.workflow.worker', '--child']
    def storage_heartbeat():
        current = jobs.heartbeat(job_id, attempt_id, stage=stage, progress=25)
        if current['cancel_requested']: raise StoreError('validation', 'Storage transfer cancelled')
    try:
        with tempfile.TemporaryDirectory(prefix='aicreater-attempt-') as folder:
            path = Path(folder)
            data = {**job['input'], '_usage_file':str(path / 'usage')}
            data['public_root'] = str(jobs.store.public)
            payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
            if len(payload) > 128 * 1024: raise StoreError('validation', 'Input snapshot exceeds budget')
            (path / 'input').write_bytes(payload)
            names = ['PATH', 'HOME', 'LANG', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']
            names += ['VOLCENGINE_API_KEY', 'VOLCENGINE_APP_ID', 'VOLCENGINE_ACCESS_KEY'] if job['kind'] == 'voice' else []
            env = {k: os.environ[k] for k in names if k in os.environ}
            # ponytail: parent SIGKILL bypasses cleanup; add supervisor-owned process groups for unattended deployment.
            with (path / 'input').open('rb') as stdin, (path / 'output').open('wb') as stdout, (path / 'errors').open('wb') as stderr:
                process = subprocess.Popen(command, stdin=stdin, stdout=stdout, stderr=stderr, cwd=ROOT, env=env, start_new_session=True)
                started, heartbeat = time.monotonic(), 0.0
                try:
                    while process.poll() is None:
                        now = time.monotonic()
                        if now - started >= timeout:
                            raise TimeoutError()
                        if (path / 'output').stat().st_size > 128 * 1024 or (path / 'errors').stat().st_size > 16 * 1024:
                            raise StoreError('validation', 'Child output exceeds budget')
                        if now - heartbeat >= heartbeat_interval:
                            current = jobs.heartbeat(job_id, attempt_id, stage=stage, progress=25)
                            heartbeat = now
                            if current['cancel_requested']:
                                _stop_process(process)
                                return jobs.fail(job_id, attempt_id, 'validation')
                        time.sleep(0.05)
                finally:
                    _stop_process(process)
                    usage_file = path / 'usage'
                    if not usage_file.is_symlink() and usage_file.is_file() and usage_file.stat().st_size <= 4096:
                        try: event = json.loads(usage_file.read_text(encoding='utf-8'))
                        except (ValueError,UnicodeError,OSError): event = None
                        if event is not None: jobs.record_usage(job_id,attempt_id,event)
            if process.returncode != 0 or (path / 'output').stat().st_size > 128 * 1024 or (path / 'errors').stat().st_size > 16 * 1024:
                raise StoreError('validation', 'Child returned invalid output')
            result = json.loads((path / 'output').read_text())
            if result.get('error'):
                return jobs.fail(job_id, attempt_id, result['error'] if result['error'] in ERRORS else 'validation')
            jobs.heartbeat(job_id, attempt_id, stage='validation', progress=75)
            return jobs.publish_voice(job_id, attempt_id, result['document'], storage_heartbeat)
    except TimeoutError:
        return jobs.fail(job_id, attempt_id, 'timeout')
    except StoreError as exc:
        if exc.code == 'conflict': return jobs.get(job_id)
        return jobs.fail(job_id, attempt_id, 'storage_error' if exc.code == 'storage' else 'validation')
    except Exception:
        return jobs.fail(job_id, attempt_id, 'validation')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--child', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--once', action='store_true', required=False)
    args = parser.parse_args()
    if args.child: return child()
    if not args.once: parser.error('Use --once for debugging, or run the Celery worker/beat')
    from dotenv import load_dotenv
    from services.projects.manage import profile
    load_dotenv(ROOT / '.env', override=False)
    try:
        from services.projects.storage import ObjectStore
        store = Store(os.environ.get('DATABASE_URL', ''), ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
        store.initialize()
        jobs = Jobs(store, model=os.environ.get('DEEPSEEK_MODEL', 'deepseek-flash'))
        result = run_once(jobs)
        print(json.dumps({'job_id': result['id'], 'state': result['state'], 'result': result.get('result')} if result else {'state': 'idle'}))
        return 0 if result is None or result['state'] == 'succeeded' else 1
    except Exception:
        print(json.dumps({'code': 'worker_failed', 'message': 'Check local configuration and job state'}))
        return 1


if __name__ == '__main__': sys.exit(main())
