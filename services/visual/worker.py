"""Bounded one-attempt Node execution. This is not an untrusted-code sandbox."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sys
import subprocess
import time

from services.projects.store import ROOT, StoreError, identifier
from services.visual.store import LEASE_SECONDS, DEFAULT_LEASE_SECONDS

WORK_ROOT=ROOT/'output/visual-workbench'
PUBLIC_FILE=re.compile(r'(?:source\.txt|design\.json|video\.mp4|video\.srt|stills/frame-\d+\.png)')


def _answered_turns(transcript,maximum):
    """Model turns that got a response, i.e. paid ones; a request that failed or was rejected is not logged as a turn."""
    try:
        with open(transcript,encoding='utf-8') as stream:
            count=sum(1 for line in stream if line.startswith('{"type":"turn"'))
    except OSError:return 0
    return min(count,maximum)


class AgentStopped(Exception):
    """The scene-agent run ended without a gated scene; a normal outcome, reported as a failed job."""
    def __init__(self, reason=None):
        super().__init__(reason)
        self.reason = reason


def job_directory(job_id):
    value=identifier(job_id)
    root=WORK_ROOT.absolute();path=root/value
    if root.exists() and root.resolve()!=root:raise ValueError('Visual root cannot be a symlink')
    if path.exists() and path.resolve()!=path:raise ValueError('Visual directory cannot be a symlink')
    return path


def checked_file(directory,name):
    if not isinstance(name,str) or not PUBLIC_FILE.fullmatch(name):raise ValueError('Invalid visual file')
    root=Path(directory).absolute();path=root/name
    if path.resolve()!=path or not path.is_file() or not path.resolve().is_relative_to(root):
        raise ValueError('Invalid visual file')
    limit=512*1024**2 if name.endswith('.mp4') else 16*1024**2 if name.endswith('.png') else 1024**2
    if not 0<path.stat().st_size<=limit:raise ValueError('Visual file size exceeds limit')
    return path


def child_environment(kind):
    keys=['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','SYSTEMROOT','REMOTION_BROWSER_EXECUTABLE']
    if kind in ('generate','repair'):keys+=['DEEPSEEK_API_KEY','DEEPSEEK_MODEL']
    if kind=='agent':keys+=['DEEPSEEK_API_KEY']
    return {key:os.environ[key] for key in keys if key in os.environ}


def _json(path,maximum=1024*1024):
    if path.resolve()!=path.absolute() or not path.is_file() or path.stat().st_size>maximum:
        raise ValueError('Invalid visual result')
    return json.loads(path.read_text())


def _reject_json_constant(value):
    raise ValueError('Non-JSON numeric constant')


def _hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()


def _valid_hash(value):
    return isinstance(value,str) and re.fullmatch('[a-f0-9]{64}',value) is not None


def _check_frozen_mode(directory,expected):
    marker=directory/'generation-mode.json'
    if marker.exists() or marker.is_symlink():
        record=_json(marker,4096)
        if not isinstance(record,dict):raise ValueError('Invalid frozen mode record')
        actual=record.get('generation_mode')
    else:
        actual='source'
        if any((directory/name).exists() or (directory/name).is_symlink() for name in ('frozen-intent.json','frozen-assembly.json')):
            raise ValueError('Frozen generation mode is missing')
    if actual!=expected:raise ValueError('Frozen repair mode mismatch')


def _chapter(jobs,project_id,snapshot):
    parent=jobs.get_raw(project_id,snapshot['generation_id'])
    if parent['kind'] not in ('generate','repair') or parent['state']!='succeeded':
        raise StoreError('not_ready','视觉源码未就绪')
    if (parent.get('result') or {}).get('sha256')!=snapshot['sha256']:
        raise StoreError('conflict','视觉源码已改变')
    frozen=_json(job_directory(parent['id'])/'result.json')
    if any(frozen.get(key)!=(parent.get('result') or {}).get(key) for key in ('sha256','design_sha256')):
        raise ValueError('Frozen source or design differs from the published generation')
    mode=parent.get('input',{}).get('generation_mode','source')
    if mode not in ('source','host-motion','host-intent','host-components'):raise ValueError('Invalid frozen generation mode')
    if mode!='source':
        hashes=['assembly_sha256']+(['intent_sha256'] if mode in ('host-intent','host-components') else [])
        published=parent.get('result') or {}
        if (frozen.get('generation_mode')!=mode or published.get('generation_mode')!=mode or
            any(not _valid_hash(published.get(key)) or frozen.get(key)!=published.get(key) for key in hashes)):
            raise ValueError('Frozen motion assembly differs from the published generation')
    # Object-store verification happens in the trusted parent, before source execution.
    if snapshot.get('timing_mode')=='draft':
        if parent['input'].get('timing_mode')!='draft' or snapshot['asset'] is not None:raise ValueError('Invalid draft preview binding')
        return {'generation_directory':str(job_directory(parent['id'])),'sha256':snapshot['sha256'],'scene':snapshot['scene'],'audio_file':'','timing_mode':'draft'}
    audio=jobs.store.asset_file(project_id,snapshot['asset']['id'])
    if _hash(audio)!=snapshot['asset']['checksum']:
        raise StoreError('assets','配音已改变')
    return {'generation_directory':str(job_directory(parent['id'])),'sha256':snapshot['sha256'],
            'scene':snapshot['scene'],'audio_file':str(audio),**({'isolated_render':True} if snapshot.get('isolated_render') is True else {})}


def _transfer_chapter(jobs,project_id,snapshot):
    parent=jobs.get_raw(project_id,snapshot['generation_id'])
    if snapshot.get('transfer_candidate') is not True or parent['kind']!='prepare-transfer' or parent['state']!='succeeded':
        raise StoreError('not_ready','Expected a prepared transfer candidate')
    published=parent.get('result') or {};directory=job_directory(parent['id'])
    verified=publishable_result(parent,directory)
    hashes=('sha256','design_sha256','assembly_sha256','binding_sha256')+(('preset','origin_sha256') if 'preset' in published else ())
    if any((k!='preset' and not _valid_hash(snapshot.get(k))) or snapshot.get(k)!=published.get(k) or published.get(k)!=verified.get(k) for k in hashes) or published.get('_files')!=verified.get('_files'):
        raise ValueError('Transfer snapshot or files changed')
    audio=jobs.store.asset_file(project_id,snapshot['asset']['id'])
    if _hash(audio)!=snapshot['asset']['checksum']:raise StoreError('assets','配音已改变')
    return {'generation_directory':str(directory),'sha256':snapshot['sha256'],'scene':snapshot['scene'],'audio_file':str(audio),
            **{k:snapshot[k] for k in ('design_sha256','assembly_sha256','binding_sha256')},'audio_sha256':snapshot['asset']['checksum'],
            **({k:snapshot[k] for k in ('preset','origin_sha256')} if 'preset' in snapshot else {})}


def _agent_chapter(jobs,project_id,snapshot):
    agent=jobs.get_raw(project_id,snapshot['agent_id'])
    result=agent.get('result') or {}
    if agent['kind']!='agent' or agent['state']!='succeeded' or result.get('accepted') is not True or result.get('sha256')!=snapshot['sha256']:
        raise StoreError('conflict','Agent 视频已改变')
    source=checked_file(job_directory(agent['id']),'source.txt')
    if _hash(source)!=result['_files']['source.txt']:raise ValueError('Agent source differs from the published job')
    audio=jobs.store.asset_file(project_id,snapshot['asset']['id'])
    if _hash(audio)!=snapshot['asset']['checksum']:raise StoreError('assets','配音已改变')
    return {'kind':'agent','source_file':str(source),'sha256':snapshot['sha256'],'brief':snapshot['brief'],'cues':snapshot['cues'],
            'scene':snapshot['scene'],'audio_file':str(audio)}


def check_request_audio(jobs,project_id,data):
    if data.get('timing_mode')=='draft':
        if data['asset'] is not None:raise ValueError('Draft cannot claim measured audio')
        return
    audio=jobs.store.asset_file(project_id,data['asset']['id'])
    if _hash(audio)!=data['asset']['checksum']:raise StoreError('assets','配音已改变，未派发修订请求')


def command_input(jobs,job):
    data=job['input'];kind=job['kind']
    if kind=='prepare-transfer':
        if 'preset' in data:
            if data['preset']!='rag-augmentation:1':raise ValueError('Unsupported transfer preset')
            return {k:data[k] for k in ('brief','cues','preset')}
        if data['design'].get('brief')!=data['brief'] or data['design'].get('cues')!=data['cues']:raise ValueError('Transfer chapter binding changed')
        return {'design':data['design'],'roles':data['roles']}
    if kind=='preview-transfer':return _transfer_chapter(jobs,job['project_id'],data)
    mode=data.get('generation_mode','source')
    if mode not in ('source','host-motion','host-intent','host-components'):raise ValueError('Invalid visual generation mode')
    if kind=='propose-layout':
        parent=jobs.get_raw(job['project_id'],data['generation_id'])
        if (parent['kind']!='generate' or parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or (parent.get('result') or {}).get('requests_dispatched')!=1 or
            any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):raise ValueError('Invalid layout proposal parent')
        return {'generation_directory':str(job_directory(parent['id'])),'brief':data['brief'],'cues':data['cues']}
    if kind=='recover-source':
        parent=jobs.get_raw(job['project_id'],data['generation_id'])
        maximum=2 if parent['kind']=='generate' else 1
        if (parent['kind'] not in ('generate','repair') or parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or
            (parent.get('result') or {}).get('requests_dispatched')!=maximum or
            any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):raise ValueError('Invalid source recovery parent')
        return {'generation_directory':str(job_directory(parent['id'])),'brief':data['brief'],'cues':data['cues']}
    if kind=='generate':
        result={'brief':data['brief'],'cues':data['cues']}
        if 'generation_mode' in data:result['generation_mode']=mode
        if 'design_revision_of' in data:
            parent=jobs.get_raw(job['project_id'],data['design_revision_of'])
            if (parent['kind']!='generate' or parent['state']!='failed' or
                (parent.get('result') or {}).get('requests_dispatched')!=1 or
                any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):
                raise ValueError('Invalid design revision parent')
            if parent['input'].get('generation_mode','source')!=mode:raise ValueError('Design revision mode mismatch')
            directory=job_directory(parent['id'])
            response=_json(directory/'provider-1.json')
            if response.get('finishReason')!='stop' or response.get('truncated') or not isinstance(response.get('content'),str) or not response['content'].strip() or len(response['content'].encode())>128*1024:
                raise ValueError('No complete retained design response')
            failure=_json(directory/'provider-1.failure.json',32768)
            error=failure.get('error')
            if not isinstance(error,str):raise ValueError('Missing design failure feedback')
            try:previous=json.loads(response['content'],parse_constant=_reject_json_constant)
            except ValueError:
                if mode!='source':raise ValueError('Malformed design revision requires source mode') from None
                previous={'schemaVersion':'invalid-design-json:1','content':response['content'],
                          'sha256':hashlib.sha256(response['content'].encode()).hexdigest()}
            result.update(previous_design=previous,feedback=data['feedback'],diagnostic=error[:4000])
        return result
    if kind=='repair':
        if data.get('operation')=='retime':
            parent=jobs.get_raw(job['project_id'],data['draft_generation_id'])
            if parent['state']!='succeeded' or parent['input'].get('timing_mode')!='draft' or parent['result'].get('sha256')!=data['draft_sha256']:raise ValueError('Draft binding changed')
            return {'operation':'retime','generation_directory':str(job_directory(parent['id'])),'sha256':data['draft_sha256'],'design_sha256':parent['result']['design_sha256'],'scene':data['scene']}
        if 'layout_id' in data:
            parent=jobs.get_raw(job['project_id'],data['layout_id']);result=parent.get('result') or {}
            if (mode!='source' or parent['kind']!='propose-layout' or parent['state']!='succeeded' or result.get('design_sha256')!=data['design_sha256'] or result.get('layout_sha256')!=data['layout_sha256'] or
                result.get('layout_preflight')!='passed' or not result.get('moves') or result.get('unresolved') or
                any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):raise ValueError('Invalid layout approval')
            directory=job_directory(parent['id'])
            if (result.get('_files') or {}).get('design.json')!=_hash(checked_file(directory,'design.json')):raise ValueError('Layout design changed')
            origin=jobs.get_raw(job['project_id'],parent['input']['generation_id'])
            if origin['kind']!='generate' or origin['state']!='failed' or (origin.get('result') or {}).get('requests_dispatched')!=1 or any(origin['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint')):raise ValueError('Layout original changed')
            check_request_audio(jobs,job['project_id'],data)
            return {'layout_directory':str(directory),'layout':{'generation_directory':str(job_directory(origin['id'])),'design_sha256':data['design_sha256'],'layout_sha256':data['layout_sha256']}}
        if 'recovery_id' in data:
            parent=jobs.get_raw(job['project_id'],data['recovery_id']);result=parent.get('result') or {}
            if (mode!='source' or parent['kind']!='recover-source' or parent['state']!='succeeded' or
                result.get('sha256')!=data['sha256'] or result.get('recovery_sha256')!=data['recovery_sha256'] or
                any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):raise ValueError('Invalid recovery repair approval')
            directory=job_directory(parent['id'])
            for name in ('source.txt','design.json'):
                if (result.get('_files') or {}).get(name)!=_hash(checked_file(directory,name)):raise ValueError('Recovery files changed')
            design=_json(directory/'design.json')
            if design.get('brief')!=data['brief'] or design.get('cues')!=data['cues']:raise ValueError('Recovery design binding changed')
            origin=jobs.get_raw(job['project_id'],parent['input']['generation_id'])
            if origin['state']!='failed' or origin['kind'] not in ('generate','repair') or any(origin['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint')):raise ValueError('Recovery original changed')
            check_request_audio(jobs,job['project_id'],data)
            return {'previous_directory':str(directory),'feedback':data['feedback'],'recovery':{
                'generation_directory':str(job_directory(origin['id'])),'sha256':data['sha256'],'recovery_sha256':data['recovery_sha256']}}
        parent=jobs.get_raw(job['project_id'],data['generation_id'])
        if parent['input'].get('generation_mode','source')!=mode:raise ValueError('Repair mode mismatch')
        directory=job_directory(parent['id']);_check_frozen_mode(directory,mode)
        return {'previous_directory':str(directory),'feedback':data['feedback']}
    if kind=='agent':
        audio=jobs.store.asset_file(job['project_id'],data['asset']['id'])
        if _hash(audio)!=data['asset']['checksum']:raise StoreError('assets','配音已改变')
        return {'brief':data['brief'],'cues':data['cues'],'scene':data['scene'],'audio_file':str(audio),
                'model':data['model'],'max_turns':data['max_turns']}
    if kind=='preview':
        chapter=_chapter(jobs,job['project_id'],data)
        if data.get('isolated_render') is True:chapter['isolated_render']=True
        return chapter
    if any('agent_id' in chapter for chapter in data['chapters']):
        # The Agent course renderer runs locally; it must not silently drop a chapter's isolated-render requirement.
        if any(chapter.get('isolated_render') is True for chapter in data['chapters'] if 'agent_id' not in chapter):
            raise StoreError('validation','含隔离渲染章节的课程暂不能与 Agent 视频混合导出')
        return {'chapters':[_agent_chapter(jobs,job['project_id'],chapter) if 'agent_id' in chapter else {'kind':'workbench',**_chapter(jobs,job['project_id'],chapter)}
                            for chapter in data['chapters']]}
    return {'chapters':[_chapter(jobs,job['project_id'],chapter) for chapter in data['chapters']]}


def _stop(process):
    # macOS answers EPERM, not ESRCH, for a group whose leader already exited; either way there is nothing to signal.
    try:os.killpg(process.pid,signal.SIGTERM)
    except (ProcessLookupError,PermissionError):
        process.wait();return
    try:process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:os.killpg(process.pid,signal.SIGKILL)
        except (ProcessLookupError,PermissionError):pass
        process.wait(timeout=5)


def publishable_result(job,directory):
    result=_json(directory/'result.json')
    if not isinstance(result,dict):raise ValueError('Invalid result')
    files=[]
    if job['kind']=='propose-layout':
        from services.visual.store import VisualJobs
        verified=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/verify-layout-proposal.ts'),str(directory),str(job_directory(job['input']['generation_id'])),str(result.get('design_sha256','')),str(result.get('layout_sha256',''))],
            cwd=ROOT,env=child_environment('propose-layout'),stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if verified.returncode or len(verified.stdout)>4096:raise ValueError('Layout canonical verification failed')
        checks=json.loads(verified.stdout);design=_json(directory/'design.json')
        if (any(result.get(k)!=checks.get(k) for k in ('design_sha256','layout_sha256','original_design_sha256')) or result.get('design')!=design or
            design.get('brief')!=job['input']['brief'] or design.get('cues')!=job['input']['cues']):raise ValueError('Layout snapshot mismatch')
        result['_files']={'design.json':_hash(checked_file(directory,'design.json'))}
        if not VisualJobs._valid_result(job,result):raise ValueError('Invalid layout proposal result')
        return result
    if job['kind']=='recover-source':
        from services.visual.store import VisualJobs
        verified=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/verify-source-recovery.ts'),str(directory),
            str(job_directory(job['input']['generation_id'])),str(result.get('sha256','')),str(result.get('recovery_sha256',''))],
            cwd=ROOT,env=child_environment('recover-source'),stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if verified.returncode or len(verified.stdout)>4096:raise ValueError('Recovery origin verification failed')
        checks=json.loads(verified.stdout)
        if any(result.get(k)!=checks.get(k) for k in ('sha256','design_sha256','recovery_sha256')):raise ValueError('Recovery verified hashes changed')
        proposal=_json(directory/'source-recovery.json');design=_json(directory/'design.json');source=checked_file(directory,'source.txt').read_text()
        canonical=lambda value:hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        if (proposal.get('schemaVersion')!='source-recovery-proposal:1' or proposal.get('status')!='review-required' or
            proposal.get('accepted') is not False or proposal.get('originalResponseAccepted') is not False or proposal.get('execution')!='not_run' or
            proposal.get('candidate',{}).get('source')!=source or proposal.get('candidate',{}).get('brief')!=job['input']['brief'] or
            design.get('brief')!=job['input']['brief'] or design.get('cues')!=job['input']['cues'] or
            result.get('source')!=source or result.get('design')!=design or
            result.get('sha256')!=canonical({'brief':proposal['candidate']['brief'],'source':source}) or
            result.get('sha256')!=proposal.get('candidateSha256') or result.get('design_sha256')!=canonical(design) or
            result.get('design_sha256')!=proposal.get('designSha256') or result.get('recovery_sha256')!=canonical(proposal)):
            raise ValueError('Recovery canonical verification failed')
        origin=job_directory(job['input']['generation_id']);count=_json(origin/'request-count.json',4096).get('requests_dispatched')
        if type(count) is not int or count not in (1,2) or proposal.get('responseFileSha256')!=_hash(origin/f'provider-{count}.json'):raise ValueError('Recovery original response changed')
        result['_files']={name:_hash(checked_file(directory,name)) for name in ('source.txt','design.json')}
        if not VisualJobs._valid_result(job,result):raise ValueError('Invalid recovery inspection result')
        return result
    if job['kind']=='prepare-transfer':
        from services.visual.store import VisualJobs
        verified=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/verify-transfer-candidate.ts'),str(directory)],cwd=ROOT,
            env=child_environment('prepare-transfer'),stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=30)
        if verified.returncode or len(verified.stdout)>4096:raise ValueError('Transfer canonical verification failed')
        checks=json.loads(verified.stdout)
        if any(result.get(k)!=checks.get(k) for k in ('source_sha256','design_sha256','assembly_sha256','binding_sha256')):
            raise ValueError('Transfer verified hashes changed')
        candidate=_json(directory/'candidate.json');design=_json(directory/'design.json');source=checked_file(directory,'source.txt').read_text()
        expected=job['input']
        if (candidate.get('schemaVersion')!='custom-scene:1' or candidate.get('brief')!=expected['brief'] or candidate.get('source')!=source or
            (design!=expected['design'] if 'design' in expected else design.get('brief')!=expected['brief'] or design.get('cues')!=expected['cues'])):
            raise ValueError('Transfer candidate binding changed')
        if 'preset' in expected and (result.get('preset')!=expected['preset'] or result.get('preset')!=checks.get('preset') or result.get('origin_sha256')!=checks.get('origin_sha256')):raise ValueError('Transfer recipe origin changed')
        source_hash=hashlib.sha256(json.dumps({'brief':candidate['brief'],'source':source},ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        result={**result,'sha256':result.get('source_sha256'),'source':source,'design':design}
        result.pop('source_sha256',None)
        result['_files']={name:_hash(checked_file(directory,name)) for name in ('source.txt','design.json')}
        if result['sha256']!=source_hash or not VisualJobs._valid_result(job,result):raise ValueError('Invalid offline transfer result')
        return result
    if job['kind']=='agent':
        if result.get('status')!='passed':raise AgentStopped(result.get('reason'))
        frames=result.get('frames')
        if not isinstance(frames,list) or not frames or len(frames)>50:raise ValueError('Missing review frames')
        files=['source.txt','video.mp4','video.srt',*frames]
        result['_files']={name:_hash(checked_file(directory,name)) for name in files}
        return result
    if job['kind'] in ('generate','repair'):
        mode=job['input'].get('generation_mode','source')
        if mode not in ('source','host-motion','host-intent','host-components') or result.get('generation_mode','source')!=mode:
            raise ValueError('Generation mode mismatch')
        if any(key in result and not _valid_hash(result[key]) for key in ('sha256','design_sha256','assembly_sha256','intent_sha256')):
            raise ValueError('Invalid hash metadata')
        if mode!='source' and not _valid_hash(result.get('assembly_sha256')):
            raise ValueError('Missing assembly hash')
        if mode in ('host-intent','host-components') and not _valid_hash(result.get('intent_sha256')):raise ValueError('Missing intent hash')
        if not _valid_hash(result.get('sha256')) or not _valid_hash(result.get('design_sha256')):
            raise ValueError('Missing source hash')
        if not isinstance(result.get('source'),str) or not isinstance(result.get('design'),dict):raise ValueError('Missing reviewed source')
        maximum=2 if job['kind']=='generate' else 1
        minimum=0 if job['kind']=='repair' and job['input'].get('operation')=='retime' else 1
        if minimum==0:maximum=0
        if type(result.get('requests_dispatched')) is not int or not minimum<=result['requests_dispatched']<=maximum:
            raise ValueError('Invalid request accounting')
        files=['source.txt','design.json']
    else:
        if result.get('video') is not None:
            if result['video']!='video.mp4' or result.get('srt')!='video.srt':raise ValueError('Invalid media paths')
            files+=['video.mp4','video.srt']
        if job['kind']=='export' and result.get('video')!='video.mp4':raise ValueError('Export produced no video')
        if job['kind'] in ('preview','preview-transfer'):
            if result.get('sha256')!=job['input']['sha256'] or not isinstance(result.get('geometry'),dict):raise ValueError('Preview hash mismatch')
            frames=result.get('frames')
            if not isinstance(frames,list) or not frames or len(frames)>500:raise ValueError('Missing review frames')
            if result['geometry'].get('status')=='passed' and result.get('video')!='video.mp4':raise ValueError('Passing preview produced no video')
            files+=frames
        if job['kind']=='preview-transfer':
            if (result.get('diagnostic') is not True or result.get('production_adopted') is not False or
                type(result.get('requests_dispatched')) is not int or result['requests_dispatched']!=0 or
                any(result.get(k)!=job['input'].get(k) for k in ('design_sha256','assembly_sha256','binding_sha256','preset','origin_sha256'))):raise ValueError('Transfer diagnostic metadata mismatch')
    result['_files']={name:_hash(checked_file(directory,name)) for name in files}
    return result


def run_once(jobs,lane='workflow',*,timeout=None,heartbeat_interval=5,launcher=None):
    job=jobs.claim(lane)
    if not job:return None
    token=job['attempt_id'];directory=job_directory(job['id']);process=None
    def finish(result,error=None):
        try:return jobs.finish(job['id'],token,result,error=error)
        except StoreError as failure:
            if failure.code!='conflict':raise
            # A cancelled/expired attempt is terminal, never resubmitted by this executor.
            jobs.heartbeat(job['id'],token)
            return jobs.get(job['project_id'],job['id'])
    try:
        if not jobs.get(job['project_id'],job['id']).get('current'):
            raise RuntimeError('Frozen input is stale')
        data=command_input(jobs,job)
        if not jobs.heartbeat(job['id'],token):raise RuntimeError('Job cancelled or lease lost')
        WORK_ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
        input_path=WORK_ROOT/(job['id']+'.input.json')
        with input_path.open('x',encoding='utf-8') as stream:
            os.chmod(input_path,0o600);json.dump(data,stream,ensure_ascii=False)
        mixed=job['kind']=='export' and any(c.get('kind')=='agent' for c in data['chapters'])
        command=([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/scene-agent-job.ts'),str(input_path),str(directory)] if job['kind']=='agent' else
                 [str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/scene-agent-course-job.ts'),str(input_path),str(directory)] if mixed else
                 [str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/visual-workbench.ts'),job['kind'],str(input_path),str(directory)])
        # Logs remain private; generated output and provider diagnostics never cross the API.
        log_path=WORK_ROOT/(job['id']+'.log')
        with log_path.open('xb') as log:
            os.chmod(log_path,0o600)
            process=(launcher or subprocess.Popen)(command,cwd=ROOT,env=child_environment('recover-source' if job['input'].get('operation')=='retime' else job['kind']),stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
            started=time.monotonic();beat=0
            # Stop the child before its lease runs out, so the job is finished here rather than expired by recovery.
            # Kinds with a long lease stop their child 60 s early, so the job is finished here rather than expired by
            # recovery; the short-lease kinds keep their original limits.
            limit=timeout or ({'generate':240,'repair':240,'prepare-transfer':240,'recover-source':60,'propose-layout':60}.get(job['kind'])
                               or LEASE_SECONDS.get(job['kind'],DEFAULT_LEASE_SECONDS)-60)
            while process.poll() is None:
                now=time.monotonic()
                if now-started>limit or log.tell()>2*1024**2:raise RuntimeError('Execution limit')
                if now-beat>=heartbeat_interval:
                    if not jobs.heartbeat(job['id'],token):raise RuntimeError('Job cancelled or lease lost')
                    beat=now
                time.sleep(.2)
            if process.returncode:raise RuntimeError('Visual command failed')
        return finish(publishable_result(job,directory))
    except (Exception,KeyboardInterrupt):
        if process:_stop(process)
        count=0 if job['kind'] in ('prepare-transfer','preview-transfer','recover-source','propose-layout') else None;failure_code=None
        if job['kind']=='agent':
            # Paid turns are reported whether the run passed, stopped or crashed after some turns.
            count=_answered_turns(directory/'workspace'/'transcript.jsonl',job['input']['max_turns'])
            stopped=sys.exc_info()[1]
            if isinstance(stopped,AgentStopped):
                # Failed runs carry detail after the code ("provider_request: HTTP 400 …"); only the code is public.
                code=stopped.reason.split(':',1)[0] if isinstance(stopped.reason,str) else ''
                failure_code='agent_'+(code if re.fullmatch(r'[a-z_]{1,40}',code) else 'stopped')
        try:
            if job['kind'] in ('generate','repair'):
                record=_json(directory/'request-count.json',4096);value=record.get('requests_dispatched')
                if type(value) is int and 0<=value<=2:count=value
        except (ValueError,OSError):pass
        try:
            code=_json(directory/'failure.json',32768).get('code')
            if code in ('layout_preflight','source_typecheck'):failure_code=code
        except (ValueError,OSError):pass
        return finish({'requests_dispatched':count},error=failure_code or 'execution_failed')
    finally:
        if process:_stop(process)
