"""Bounded single-attempt executor. --once is local debugging, not a Celery replacement."""
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
    from services.workflow.providers import Settings, ProviderError, deepseek_storyboard
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
        if payload['kind'] == 'render':
            if payload.get('protocol_version') not in ['snapshot-render:1', 'scene-preview:1','snapshot-render:2','scene-preview:2']:
                raise ProviderError('render', 'validation', 'Unknown render protocol')
            directory = Path(payload['render_directory'])
            directory.mkdir(parents=True, mode=0o700, exist_ok=False)
            source = directory / 'snapshot.json'
            source.write_text(json.dumps(payload['version']['dsl'], ensure_ascii=False), encoding='utf-8')
            style=payload['version']['profile'].get('visual_style')
            if payload['protocol_version'].endswith(':2') != (style is not None):
                raise ProviderError('render','validation','Frozen style/protocol mismatch')
            options=[]
            if style is not None:
                style_file=directory/'visual-style.json'
                style_file.write_text(json.dumps(style,ensure_ascii=False),encoding='utf-8')
                options=['--visual-style-file='+str(style_file)]
            env = {**os.environ, 'AICREATER_PUBLIC_DIR': payload['public_root']}
            with (directory / 'renderer.log').open('wb') as log:
                subprocess.run(['node', str(ROOT / 'node_modules/tsx/dist/cli.mjs'), str(ROOT / 'apps/renderer/src/render.ts'),
                    str(source), str(directory / 'video.mp4'),*options], cwd=ROOT, env=env, stdout=log, stderr=log, check=True, timeout=800)
            print(json.dumps({'rendered': True}))
            return
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
        key = os.environ.get('DEEPSEEK_API_KEY', '').strip()
        if not key or any(ord(c) < 32 or ord(c) == 127 for c in key):
            raise ProviderError('config', 'missing_setting', 'Configure provider credentials')
        settings = Settings(key, payload['model'], '', '', '', '', '')
        style = payload.get('teaching_style') or 'popular'
        if style not in ('popular', 'technical'):
            style = 'popular'
        director = payload.get('protocol_version') in ['teaching-outline:4','scene-candidate:4','teaching-outline:5','scene-candidate:5','teaching-outline:6','scene-candidate:6','teaching-outline:7','scene-candidate:7']
        options = {**({'compact_director':True} if payload.get('protocol_version') in ['teaching-outline:5','scene-candidate:5','teaching-outline:6','scene-candidate:6'] else {}), **({'role_director':True} if payload.get('protocol_version') in ['teaching-outline:6','scene-candidate:6'] else {}), **({'semantic_graphics':True} if director else {}), **usage_options, **({'cue_quotes': False} if payload.get('protocol_version') in ['teaching-outline:1', 'scene-candidate:1'] else {}), 'teaching_style': style}
        if payload.get('materials'):
            options['materials'] = payload['materials']
        with httpx.Client(timeout=120) as client:
            if payload['kind'] == 'generate':
                draft = deepseek_storyboard(payload['source_text'], settings, client, **options)
            else:
                original = {k: v for k, v in payload['scene'].items() if k in ['id', 'type', 'narration', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart']}
                if director: original = Jobs._draft_scene(payload['scene'])
                original['narration'] = {'text': original['narration']['text']}
                draft = deepseek_storyboard(original['narration']['text'], settings, client, original, **options)['scenes'][0]
        print(json.dumps({'draft': draft}, ensure_ascii=False))
    except ProviderError as exc:
        code = 'transport_error' if exc.code == 'transport_error' else 'validation'
        detail = 'storyboard_' + exc.code
        if exc.stage == 'storyboard' and detail in ERRORS: code = detail
        if exc.stage == 'timing' and exc.code == 'cache_unavailable': code = 'timing_cache'
        if exc.code in ['missing_setting', 'invalid_auth', 'invalid_setting'] or (exc.code == 'http_error' and str(exc).endswith(('HTTP 401', 'HTTP 403'))):
            code = 'configuration'
        if exc.code == 'http_error' and str(exc).endswith(('HTTP 429', 'HTTP 500', 'HTTP 502', 'HTTP 503', 'HTTP 504')):
            code = 'provider_error'
        result = {'error': code}
        if code == 'storyboard_schema_error' and exc.schema_errors: result['schema_errors'] = exc.schema_errors
        if code == 'storyboard_invalid_cue' and exc.cue_error: result['cue_error'] = exc.cue_error
        print(json.dumps(result))
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
    if job['kind'] == 'render' and job['input'].get('protocol_version') not in ['snapshot-render:1', 'scene-preview:1','snapshot-render:2','scene-preview:2']:
        return jobs.fail(job_id, attempt_id, 'validation')
    if job['kind'] == 'render' and any(job['input']['version']['profile'][k] != jobs.store.profile[k]
                                     for k in ['theme_version', 'template_version', 'font_hash']):
        return jobs.fail(job_id, attempt_id, 'validation')
    if timeout is None: timeout = 840 if job['kind'] == 'render' else 240 if job['kind'] == 'voice' else 120
    stage = 'timing' if job['kind'] == 'timing' else 'render' if job['kind'] == 'render' else 'tts' if job['kind'] == 'voice' else 'storyboard'
    command = command or [sys.executable, '-m', 'services.workflow.worker', '--child']
    def storage_heartbeat():
        current = jobs.heartbeat(job_id, attempt_id, stage=stage, progress=25)
        if current['cancel_requested']: raise StoreError('validation', 'Storage transfer cancelled')
    try:
        if job['kind'] == 'render' and jobs.store.objects:
            jobs.store._assets(job['input']['version']['dsl'], storage_heartbeat)
        with tempfile.TemporaryDirectory(prefix='aicreater-attempt-') as folder:
            path = Path(folder)
            data = {**job['input'], '_usage_file':str(path / 'usage')}
            if job['kind'] in ['voice', 'timing', 'render']: data['public_root'] = str(jobs.store.public)
            if job['kind'] == 'render': data['render_directory'] = str(jobs.render_directory(job))
            payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
            if len(payload) > 128 * 1024: raise StoreError('validation', 'Input snapshot exceeds budget')
            (path / 'input').write_bytes(payload)
            names = ['PATH', 'HOME', 'LANG', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']
            names += ['VOLCENGINE_API_KEY', 'VOLCENGINE_APP_ID', 'VOLCENGINE_ACCESS_KEY'] if job['kind'] == 'voice' else [] if job['kind'] in ['render', 'timing'] else ['DEEPSEEK_API_KEY']
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
                return jobs.fail(job_id, attempt_id, result['error'] if result['error'] in ERRORS else 'validation', result.get('schema_errors'), result.get('cue_error'))
            jobs.heartbeat(job_id, attempt_id, stage='validation', progress=75)
            if job['kind'] == 'render':
                if result.get('rendered') is not True: raise StoreError('validation', 'Renderer did not complete')
                return jobs.publish_render(job_id, attempt_id, storage_heartbeat)
            if job['kind'] in ['voice', 'timing']: return jobs.publish_voice(job_id, attempt_id, result['document'], storage_heartbeat)
            publish = jobs.publish_outline if job['kind'] == 'generate' else jobs.publish_candidate
            return publish(job_id, attempt_id, result['draft'])
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
    parser.add_argument('--scene-id')
    parser.add_argument('--revision', type=int)
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
        if args.scene_id: jobs.submit_regenerate(args.scene_id, args.revision)
        result = run_once(jobs)
        print(json.dumps({'job_id': result['id'], 'state': result['state'], 'result': result.get('result')} if result else {'state': 'idle'}))
        return 0 if result is None or result['state'] == 'succeeded' else 1
    except Exception:
        print(json.dumps({'code': 'worker_failed', 'message': 'Check local configuration and job state'}))
        return 1


if __name__ == '__main__': sys.exit(main())
