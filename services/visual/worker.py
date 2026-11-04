"""Bounded one-attempt Node execution of Scene Agent and course export jobs. This is not an untrusted-code sandbox."""
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
from services.projects.leases import LEASE_SECONDS

WORK_ROOT=ROOT/'output/visual-workbench'
PUBLIC_FILE=re.compile(r'(?:source\.txt|video\.mp4|video\.srt|stills/frame-\d+\.png)')


def agent_progress(directory):
    """One line for the UI from the Agent transcript: which turn, and what the last automatic check found."""
    transcript=Path(directory)/'workspace'/'transcript.jsonl'
    turns=0;check=None;finished=False
    try:
        with transcript.open(encoding='utf-8') as stream:
            for line in stream:
                if line.startswith('{"type":"turn"'):turns+=1
                elif line.startswith('{"type":"auto_check"'):check=line
                elif line.startswith('{"type":"result"'):finished='"status":"passed"' in line
    except OSError:return '准备中'
    if finished:return '画面已完成，正在渲染视频'
    if not turns:return '阅读分镜与时间轴'
    summary=''
    if check:
        try:text=json.loads(check).get('text','')
        except ValueError:text=''
        found=re.search(r'audit of [^:]*: (\d+) high',text)
        if 'typecheck failed' in text:summary='代码有编译错误，正在修正'
        elif 'no frame rendered' in text:summary='画面渲染失败，正在修正'
        elif found and found.group(1)!='0':summary=f'检查发现 {found.group(1)} 个需修正的问题'
        elif found:summary='已通过检查，正在收尾'
    return f'第 {turns} 轮'+(f' · {summary}' if summary else ' · 正在设计画面')


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
    if not 0<path.stat().st_size<=file_limit(name):raise ValueError('Visual file size exceeds limit')
    return path


def file_limit(name):
    return 512*1024**2 if name.endswith('.mp4') else 16*1024**2 if name.endswith('.png') else 1024**2


def local_file(objects,job,name):
    """A published file of `job`, restored from object storage into its job directory when the local copy is gone."""
    checksum=(job.get('result') or {}).get('_files',{}).get(name)
    if not isinstance(checksum,str) or not PUBLIC_FILE.fullmatch(name):raise ValueError('Invalid visual file')
    directory=job_directory(job['id'])
    if objects and not (directory/name).exists():objects.ensure(directory/name,checksum,file_limit(name))
    return checked_file(directory,name)


def store_files(objects,job_id,result,callback=None):
    """Copies a published job's files to object storage (content-addressed, so repeating it is cheap)."""
    if not objects:return
    directory=job_directory(job_id)
    for name,checksum in result['_files'].items():
        objects.put(checked_file(directory,name),checksum,file_limit(name),callback)


def child_environment(kind):
    keys=['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','SYSTEMROOT','REMOTION_BROWSER_EXECUTABLE']
    if kind=='agent':keys+=['DEEPSEEK_API_KEY']
    return {key:os.environ[key] for key in keys if key in os.environ}


def _json(path,maximum=1024*1024):
    if path.resolve()!=path.absolute() or not path.is_file() or path.stat().st_size>maximum:
        raise ValueError('Invalid visual result')
    return json.loads(path.read_text())


def _hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()


def _agent_chapter(jobs,project_id,snapshot):
    agent=jobs.get_raw(project_id,snapshot['agent_id'])
    result=agent.get('result') or {}
    if agent['kind']!='agent' or agent['state']!='succeeded' or result.get('accepted') is not True or result.get('sha256')!=snapshot['sha256']:
        raise StoreError('conflict','Agent 视频已改变')
    source=local_file(jobs.store.objects,agent,'source.txt')
    if _hash(source)!=result['_files']['source.txt']:raise ValueError('Agent source differs from the published job')
    audio=jobs.store.asset_file(project_id,snapshot['asset']['id'])
    if _hash(audio)!=snapshot['asset']['checksum']:raise StoreError('assets','配音已改变')
    return {'kind':'agent','source_file':str(source),'sha256':snapshot['sha256'],'brief':snapshot['brief'],'cues':snapshot['cues'],
            'scene':snapshot['scene'],'audio_file':str(audio)}


def command_input(jobs,job):
    data=job['input']
    if job['kind']=='agent':
        audio=jobs.store.asset_file(job['project_id'],data['asset']['id'])
        if _hash(audio)!=data['asset']['checksum']:raise StoreError('assets','配音已改变')
        command={'brief':data['brief'],'cues':data['cues'],'scene':data['scene'],'audio_file':str(audio),
                 'model':data['model'],'max_turns':data['max_turns'],**({'theme':data['theme']} if data.get('theme') else {})}
        if data.get('revision'):
            base=jobs.get_raw(job['project_id'],data['revision']['job_id'])
            source=local_file(jobs.store.objects,base,'source.txt')
            if _hash(source)!=(base.get('result') or {}).get('_files',{}).get('source.txt'):raise ValueError('The version to revise changed on disk')
            command['revision']={'feedback':data['revision']['feedback'],'source_file':str(source),'sha256':data['revision']['sha256']}
        return command
    if job['kind']=='restyle':
        # One chapter from its Agent version's own source; the version need not be confirmed yet.
        agent=jobs.get_raw(job['project_id'],data['agent_id'])
        if agent['kind']!='agent' or (agent.get('result') or {}).get('sha256')!=data['sha256']:raise StoreError('conflict','Agent 版本已改变')
        source=local_file(jobs.store.objects,agent,'source.txt')
        if _hash(source)!=agent['result']['_files']['source.txt']:raise ValueError('Agent source differs from the published job')
        audio=jobs.store.asset_file(job['project_id'],data['asset']['id'])
        if _hash(audio)!=data['asset']['checksum']:raise StoreError('assets','配音已改变')
        return {'chapters':[{'kind':'agent','source_file':str(source),'sha256':data['sha256'],'brief':data['brief'],'cues':data['cues'],
                             'scene':data['scene'],'audio_file':str(audio)}],'theme':data['theme']}
    if any('agent_id' not in chapter for chapter in data['chapters']):raise StoreError('conflict','导出章节必须都是已确认的 Agent 视频')
    return {'chapters':[_agent_chapter(jobs,job['project_id'],chapter) for chapter in data['chapters']],**({'theme':data['theme']} if data.get('theme') else {})}


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
    if job['kind']=='agent':
        if result.get('status')!='passed':raise AgentStopped(result.get('reason'))
        frames=result.get('frames')
        if not isinstance(frames,list) or not frames or len(frames)>50:raise ValueError('Missing review frames')
        files=['source.txt','video.mp4','video.srt',*frames]
    else:
        if result.get('video')!='video.mp4' or result.get('srt')!='video.srt':raise ValueError('Export produced no video')
        files=['video.mp4','video.srt']
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
        script='scene-agent-job.ts' if job['kind']=='agent' else 'scene-agent-course-job.ts'
        command=[str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts'/script),str(input_path),str(directory)]
        # Logs remain private; generated output and provider diagnostics never cross the API.
        log_path=WORK_ROOT/(job['id']+'.log')
        with log_path.open('xb') as log:
            os.chmod(log_path,0o600)
            process=(launcher or subprocess.Popen)(command,cwd=ROOT,env=child_environment(job['kind']),stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
            started=time.monotonic();beat=0
            # Stop the child 60 s before its lease runs out, so the job is finished here rather than expired by recovery.
            limit=timeout or LEASE_SECONDS[job['kind']]-60
            while process.poll() is None:
                now=time.monotonic()
                if now-started>limit or log.tell()>2*1024**2:raise RuntimeError('Execution limit')
                if now-beat>=heartbeat_interval:
                    stage=agent_progress(directory) if job['kind']=='agent' else None
                    if not jobs.heartbeat(job['id'],token,stage):raise RuntimeError('Job cancelled or lease lost')
                    beat=now
                time.sleep(.2)
            if process.returncode:raise RuntimeError('Visual command failed')
        result=publishable_result(job,directory)
        try:store_files(jobs.store.objects,job['id'],result,lambda:jobs.heartbeat(job['id'],token))
        except StoreError:
            # The paid result is kept and published from the local copy; `python -m services.projects.sync_storage` uploads it later.
            print(f'visual {job["id"]}: object storage upload failed; run services.projects.sync_storage',file=sys.stderr,flush=True)
        return finish(result)
    except (Exception,KeyboardInterrupt):
        if process:_stop(process)
        count=None;failure_code=None
        if job['kind']=='agent':
            # Paid turns are reported whether the run passed, stopped or crashed after some turns.
            count=_answered_turns(directory/'workspace'/'transcript.jsonl',job['input']['max_turns'])
            stopped=sys.exc_info()[1]
            if isinstance(stopped,AgentStopped):
                # Failed runs carry detail after the code ("provider_request: HTTP 400 …"); only the code is public.
                code=stopped.reason.split(':',1)[0] if isinstance(stopped.reason,str) else ''
                failure_code='agent_'+(code if re.fullmatch(r'[a-z_]{1,40}',code) else 'stopped')
        return finish({'requests_dispatched':count},error=failure_code or 'execution_failed')
    finally:
        if process:_stop(process)
