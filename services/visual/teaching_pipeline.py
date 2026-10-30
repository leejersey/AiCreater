"""Explicit teaching-plan host pipeline; provider callback is admitted by the root ledger."""
import copy
import json
import os
import subprocess

from services.projects.store import ROOT, StoreError
from services.visual.teaching_tasks import fingerprint, checksum


def host_command(operation, payload):
    env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT') if k in os.environ}
    raw = json.dumps(payload, ensure_ascii=False, allow_nan=False)
    if len(raw.encode()) > 16 * 1024 * 1024: raise StoreError('teaching_host', 'Host input exceeds limit')
    try:
        child = subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'scripts/teaching-plan-host.ts'), operation],
                               input=raw, text=True, capture_output=True, timeout=60, cwd=ROOT, env=env)
        if child.returncode or len(child.stdout.encode()) > 16 * 1024 * 1024: raise ValueError()
        result = json.loads(child.stdout)
        if not isinstance(result, dict): raise ValueError()
        return result
    except (OSError, subprocess.SubprocessError, ValueError):
        raise StoreError('teaching_host', 'Offline host command failed; no fallback request dispatched') from None


def pipeline_binding(snapshot_sha256, stage):
    return fingerprint({'pipeline': 'teaching-plan-host:1', 'snapshot': snapshot_sha256, 'stage': stage})


class TeachingPipeline:
    def __init__(self, tasks): self.tasks = tasks

    def _result(self, project_id, root_id, status, **fields):
        root = self.tasks.get(project_id, root_id)
        return {'status': 'cancelled' if root['state'] == 'cancelled' else status,
                'requests_used': root['requests_used'], 'accepted': False, 'execution': 'not-run', **fields}

    def run(self, project_id, root_id, invoke, *, admit=None, reservation_guard=None):
        checkpoint = self.tasks.checkpoint(project_id, root_id)
        root, snapshot = checkpoint['root'], checkpoint['snapshot']
        if root['state'] == 'cancelled': return self._result(project_id, root_id, 'cancelled')
        if set(snapshot) not in ({'generation_mode', 'brief', 'cues'}, {'generation_mode', 'brief', 'cues', 'media'}) or snapshot['generation_mode'] != 'teaching-plan':
            raise StoreError('validation', 'Expected a teaching-plan brief/cue snapshot')
        context = {k: snapshot[k] for k in ('brief', 'cues')}
        def binding(stage): return pipeline_binding(root['snapshot_sha256'], stage)
        selected = 'revision' if any(c['stage'] == 'revision' for c in root['calls']) else 'plan'
        artifact_key = binding(selected)
        if any(c['kind'] == 'artifact' and c['binding_sha256'] == artifact_key for c in checkpoint['cache']):
            artifact = self.tasks.get_cache(project_id, root_id, 'artifact', artifact_key)['payload']
            if artifact.get('brief') != context['brief'] or artifact.get('cues') != context['cues']:
                return self._result(project_id, root_id, 'blocked', code='artifact-input-mismatch')
            try: verified = host_command('artifact', {'artifact': artifact, 'expectedSha256': artifact['artifactSha256']})
            except (StoreError, KeyError): return self._result(project_id, root_id, 'blocked', code='stale-artifact')
            if verified.get('status') != 'verified': return self._result(project_id, root_id, 'blocked', code='stale-artifact')
            return self._result(project_id, root_id, 'artifact-ready', artifact_sha256=artifact['artifactSha256'], cache_binding=artifact_key)

        def response(request):
            if admit is not None:admit()
            checksum(request.get('requestSha256'))
            stage = request['stage']
            admitted = self.tasks.dispatch_once(project_id, root_id, stage, request['requestSha256'], lambda: invoke(copy.deepcopy(request)),guard=reservation_guard,before_invoke=admit)
            if admitted['state'] != 'succeeded': return None
            return self.tasks.get_cache(project_id, root_id, 'response-' + stage, request['requestSha256'])['payload']

        try:
            request = host_command('request', context)
            plan = response(request)
            if plan is None: return self._result(project_id, root_id, 'blocked', code='request-incomplete')
            if self.tasks.get(project_id, root_id)['state'] == 'cancelled': return self._result(project_id, root_id, 'cancelled')
            checked = host_command('check', {**context, 'plan': plan})
            stage = 'plan'
            if checked.get('status') == 'revision-required':
                self.tasks.save_cache(project_id, root_id, 'diagnostic', binding('plan'), checked)
                diagnostic = self.tasks.get_cache(project_id, root_id, 'diagnostic', binding('plan'))['payload']
                repair = {'request': diagnostic['request'], 'expectedSha256': diagnostic['request']['requestSha256']}
                request = host_command('revision', {**context, **repair})
                plan = response(request)
                if plan is None: return self._result(project_id, root_id, 'blocked', code='revision-incomplete')
                if self.tasks.get(project_id, root_id)['state'] == 'cancelled': return self._result(project_id, root_id, 'cancelled')
                checked = host_command('check', {**context, 'plan': plan, 'revision': repair})
                stage = 'revision'
            if checked.get('status') != 'compiled':
                self.tasks.save_cache(project_id, root_id, 'diagnostic', binding(stage + '-stopped'), checked)
                return self._result(project_id, root_id, 'unsupported' if checked.get('status') == 'unsupported' else 'blocked', code='plan-not-compiled')
            artifact = checked['artifact']
            self.tasks.save_cache(project_id, root_id, 'plan', binding(stage), artifact['compiled']['plan'])
            self.tasks.save_cache(project_id, root_id, 'artifact', binding(stage), artifact)
            return self._result(project_id, root_id, 'artifact-ready', artifact_sha256=artifact['artifactSha256'], cache_binding=binding(stage))
        except StoreError as error:
            return self._result(project_id, root_id, 'blocked', code=error.code)
