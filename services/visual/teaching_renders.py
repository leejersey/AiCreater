"""Explicit frozen-artifact render queue. No model calls, retries or worker autostart."""
import hashlib
import json
import os
import subprocess
import uuid

from psycopg.types.json import Json
from services.projects.store import ROOT, StoreError, identifier
from services.visual.teaching_tasks import TeachingTasks, checksum,fingerprint
from services.visual.teaching_pipeline import host_command, pipeline_binding
from services.visual.teaching_context import chapter_snapshot
from services.visual.teaching_health import WorkerHealth
from services.visual.teaching_execution import run_owned,reconcile_orphan,cleanup_verified,execution_marker_present


class RenderInterrupted(RuntimeError):
    """Host ended without proof that descendant rendering processes shut down."""


def render_frozen(artifact, expected_sha256, output):
    """Run the trusted container bridge, never model-generated source or a local fallback."""
    return _render_child({'artifact':artifact,'expectedSha256':expected_sha256,'output':str(output)},expected_sha256,output,'preview-ready','inputSha256')


def render_audiovisual(audiovisual,expected_sha256,audio_file,output):
    return _render_child({'audiovisual':audiovisual,'expectedSha256':expected_sha256,'audioFile':str(audio_file),'output':str(output)},expected_sha256,output,'audiovisual-ready','audiovisualSha256')


def _render_child(payload,expected_sha256,output,status,binding_key):
    env = {k: os.environ[k] for k in ('PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','SYSTEMROOT') if k in os.environ}
    try:
        child = run_owned([str(ROOT/'node_modules/.bin/tsx'), str(ROOT/'scripts/teaching-render-isolated.ts')],
            input=json.dumps(payload,ensure_ascii=False,allow_nan=False),
            text=True,capture_output=True,timeout=1800,cwd=ROOT,env=env,output=output)
    except (OSError,ValueError):raise RenderInterrupted('Host execution could not confirm descendant shutdown') from None
    if child.returncode<0 or child.returncode==2: raise RenderInterrupted('Renderer termination or container cleanup is unconfirmed')
    if execution_marker_present(output) and not cleanup_verified(output):raise RenderInterrupted('Host exited without a valid container cleanup proof')
    if child.returncode or len(child.stdout.encode())>1024*1024: raise StoreError('render_failed','Host renderer did not complete')
    lines = [line[16:] for line in child.stdout.splitlines() if line.startswith('TEACHING_RESULT: ')]
    if len(lines)!=1: raise StoreError('render_failed','Missing render receipt')
    result = json.loads(lines[0])
    if not isinstance(result,dict) or result.get('status')!=status or result.get(binding_key)!=expected_sha256:
        raise StoreError('render_failed','Invalid render receipt')
    return result


class TeachingRenders:
    def __init__(self,store): self.store=store; self.tasks=TeachingTasks(store)

    def _job(self,conn,root_id):
        row=conn.execute('SELECT * FROM teaching_render_jobs WHERE root_id=%s ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[root_id]).fetchone()
        if row is None: raise StoreError('not_found','Teaching render not found')
        if row['state']=='queued' and conn.execute("SELECT %s<clock_timestamp()-interval '2 minutes' AS expired",[row['created_at']]).fetchone()['expired'] and not WorkerHealth(self.store).ready(('teaching-render','scheduler')):
            row=conn.execute("UPDATE teaching_render_jobs SET state='failed',error_code='executor-unavailable',ended_at=clock_timestamp() WHERE id=%s RETURNING *",[row['id']]).fetchone()
        return row

    def _receipt_file(self,row):
        receipt=row['receipt']
        if row['state']!='succeeded' or not isinstance(receipt,dict) or row['error_code'] is not None:
            raise StoreError('not_ready','视频尚不可用')
        if receipt.get('artifact_sha256')!=row['artifact_sha256']: raise StoreError('not_ready','视频绑定不符')
        checksum(receipt.get('video_sha256'))
        if not isinstance(receipt.get('key'),str): raise StoreError('not_ready','视频记录无效')
        file=self.store._asset_path(receipt['key'])
        folder=self.store.public/'teaching-renders'/str(row['id'])
        if not file.is_relative_to(folder) or file.suffix!='.mp4' or not file.is_file() or file.stat().st_size<=0:
            raise StoreError('not_ready','视频文件不可用')
        with file.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        if digest!=receipt['video_sha256']:raise StoreError('not_ready','视频内容摘要不符')
        if row.get('media_job_id'):self._subtitle_file(row)
        return file

    def _subtitle_file(self,row):
        receipt=row['receipt']
        if row['state']!='succeeded' or not isinstance(receipt,dict) or not row.get('media_job_id') or row['error_code'] is not None:
            raise StoreError('not_ready','字幕尚不可用')
        if not isinstance(receipt.get('subtitle_key'),str):raise StoreError('not_ready','字幕记录无效')
        file=self.store._asset_path(receipt['subtitle_key']);folder=self.store.public/'teaching-renders'/str(row['id'])
        if not file.is_relative_to(folder) or file.suffix!='.srt' or not file.is_file() or not 0<file.stat().st_size<=128*1024 or hashlib.sha256(file.read_bytes()).hexdigest()!=checksum(receipt.get('subtitle_sha256')):
            raise StoreError('not_ready','字幕摘要不符')
        return file

    def subtitle_path(self,project_id,root_id,render_id=None):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id);_,job=self._playable(conn,root['id'],render_id)
            return self._subtitle_file(job)

    def _playable(self,conn,root_id,render_id=None):
        rows=conn.execute("SELECT * FROM teaching_render_jobs WHERE root_id=%s AND state='succeeded' "+('AND id=%s ' if render_id is not None else '')+'ORDER BY created_at DESC,id DESC',
            [root_id,identifier(render_id)] if render_id is not None else [root_id]).fetchall()
        for row in rows:
            try:return self._receipt_file(row),row
            except (StoreError,OSError):continue
        raise StoreError('not_ready','视频文件校验未通过或尚未就绪，未提供播放')

    def _public(self,row):
        ready=row['state']=='succeeded'; error=row['error_code']
        if ready:
            try: self._receipt_file(row)
            except (StoreError,OSError): ready=False; error='output-unavailable'
        return {'id':str(row['id']),'state':row['state'],'artifact_sha256':row['artifact_sha256'],
            'error_code':error,'video_ready':ready,'accepted':False,'timing_mode':'measured' if row.get('media_job_id') else 'draft'}

    def media_path(self,project_id,root_id,render_id=None):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id)
            return self._playable(conn,root['id'],render_id)[0]

    def _current(self,conn,root,job=None):
        project=self.store._read(conn,str(root['project_id']))
        try:
            if job and job.get('media_job_id'):
                from services.visual.teaching_media import TeachingMedia
                media=TeachingMedia(self.store);bound=media._row(conn,str(root['project_id']),str(job['media_job_id']))
                media._current(conn,project,root,bound)
                return bound['state']=='succeeded' and bound['result_sha256']==job['artifact_binding'] and fingerprint(bound['result'],8*1024*1024)==bound['result_sha256']
            row=self.store._scene(project,str(root['scene_id']))
            return chapter_snapshot(project,row,root['snapshot']['media']['timing_mode'])==root['snapshot']
        except (KeyError,StoreError): return False

    def enqueue_audio(self,project_id,media_job_id):
        from services.visual.teaching_media import TeachingMedia
        from services.visual.teaching_timing import verify_bound_audio
        media=TeachingMedia(self.store);bound=media.binding(project_id,media_job_id);package=bound['package'];timeline=package['timeline']
        verify_bound_audio(self.store,project_id,timeline)
        audio=self.store.asset_file(project_id,timeline['media']['asset']['id'])
        frozen=host_command('audiovisual',{'artifact':package['artifact'],'artifactSha256':package['artifact']['artifactSha256'],
            'timelineSha256':timeline['timeline_sha256'],'packageSha256':package['binding_sha256'],
            'audioSha256':timeline['media']['asset']['checksum'],'audioBytes':audio.stat().st_size,
            'audioDurationMs':timeline['media']['asset']['duration_ms'],'audioStartFrame':timeline['media']['audio_start_frame'],
            'captions':timeline['media']['captions']})
        if frozen.get('status')!='audiovisual-frozen':raise StoreError('not_ready','Audiovisual freeze failed')
        audiovisual=frozen['audiovisual'];checksum(audiovisual.get('audiovisualSha256'))
        with self.store.connection() as conn:
            project,root,job=media._locked(conn,project_id,media_job_id);media._current(conn,project,root,job)
            if job['state']!='succeeded' or fingerprint(bound,8*1024*1024)!=job['result_sha256']:raise StoreError('conflict','Audio binding changed before admission')
            old=conn.execute('SELECT * FROM teaching_render_jobs WHERE root_id=%s AND artifact_binding=%s FOR UPDATE',[root['id'],job['result_sha256']]).fetchone()
            if old:
                if old['artifact_sha256']!=audiovisual['audiovisualSha256']:raise StoreError('conflict','Frozen audiovisual runtime changed')
                return self._public(old)
            busy=conn.execute("SELECT 1 FROM teaching_render_jobs WHERE root_id=%s AND (state IN ('queued','running') OR (state='interrupted' AND error_code IS DISTINCT FROM 'execution-cleaned')) LIMIT 1",[root['id']]).fetchone()
            if busy:raise StoreError('busy','Prior rendering is not safely complete')
            row=conn.execute('''INSERT INTO teaching_render_jobs(id,root_id,artifact_binding,artifact_sha256,media_job_id,audiovisual)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *''',[uuid.uuid4(),root['id'],job['result_sha256'],audiovisual['audiovisualSha256'],job['id'],Json(audiovisual)]).fetchone()
            return self._public(row)

    def enqueue(self,project_id,root_id):
        checkpoint=self.tasks.checkpoint(project_id,root_id); root=checkpoint['root']; snapshot=checkpoint['snapshot']
        if snapshot.get('media',{}).get('timing_mode')!='draft':
            raise StoreError('not_ready','Only silent draft rendering is connected; measured audio binding is not ready')
        stage='revision' if any(c['stage']=='revision' for c in root['calls']) else 'plan'
        binding=pipeline_binding(root['snapshot_sha256'],stage)
        artifact=self.tasks.get_cache(project_id,root_id,'artifact',binding)['payload']
        if artifact.get('brief')!=snapshot['brief'] or artifact.get('cues')!=snapshot['cues']:
            raise StoreError('conflict','Artifact input does not match frozen task')
        checksum(artifact.get('artifactSha256'))
        verified=host_command('artifact',{'artifact':artifact,'expectedSha256':artifact['artifactSha256']})
        if verified.get('status')!='verified': raise StoreError('not_ready','Artifact verification failed')
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True)
            frozen=self.tasks._root(conn,project_id,root_id)
            old=conn.execute('SELECT * FROM teaching_render_jobs WHERE root_id=%s ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[frozen['id']]).fetchone()
            if old and old['artifact_binding']==binding:
                if old['artifact_sha256']!=artifact['artifactSha256']:raise StoreError('conflict','Frozen render binding changed')
                return self._public(old)
            if old and (stage!='revision' or old['state']!='failed' or old['artifact_sha256']==artifact['artifactSha256']):
                raise StoreError('conflict','Only a distinct validated revision may follow a completed failed render')
            if frozen['state']!='active' or not self._current(conn,frozen): raise StoreError('conflict','Task input changed or cancelled')
            row=conn.execute('''INSERT INTO teaching_render_jobs(id,root_id,artifact_binding,artifact_sha256)
                VALUES (%s,%s,%s,%s) RETURNING *''',[uuid.uuid4(),frozen['id'],binding,artifact['artifactSha256']]).fetchone()
            return self._public(row)

    def get(self,project_id,root_id):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id)
            conn.execute("UPDATE teaching_render_jobs SET state='interrupted',error_code='execution-interrupted',ended_at=clock_timestamp() WHERE root_id=%s AND state='running' AND deadline<=clock_timestamp()",[root['id']])
            row=self._job(conn,root['id']);result=self._public(row)
            if row.get('media_job_id'):result['current']=self._current(conn,root,row)
            result['previous_video_ready']=False
            result['playable_render_id']=str(row['id']) if result['video_ready'] else None
            if not result['video_ready']:
                try:
                    _,previous=self._playable(conn,root['id'])
                    result['previous_video_ready']=previous['id']!=row['id']
                    result['playable_render_id']=str(previous['id'])
                except StoreError:pass
            return result

    def next_queued(self):
        with self.store.connection() as conn:
            if conn.execute("SELECT to_regclass('aicreater.teaching_render_jobs') AS name").fetchone()['name'] is None: return None
            if not WorkerHealth(self.store).ready(('teaching-render','scheduler')):
                conn.execute("UPDATE teaching_render_jobs SET state='failed',error_code='executor-unavailable',ended_at=clock_timestamp() WHERE state='queued' AND created_at<clock_timestamp()-interval '2 minutes'")
            conn.execute("""UPDATE teaching_render_jobs SET state='interrupted',error_code='execution-interrupted',ended_at=clock_timestamp()
                WHERE state='running' AND deadline<=clock_timestamp()""")
            row=conn.execute("""SELECT r.project_id,j.root_id FROM teaching_render_jobs j
                JOIN teaching_task_roots r ON r.id=j.root_id WHERE j.state='queued'
                ORDER BY j.created_at,j.id LIMIT 1""").fetchone()
            # Admission remains in claim(), in the existing project/root lock order.
            return {key:str(value) for key,value in row.items()} if row else None

    def _cleanup_verified(self,job):
        try:return cleanup_verified(self.store._asset_path('teaching-renders/'+str(job['id'])))
        except (OSError,StoreError):return False

    def reconcile(self,project_id,root_id):
        # Only the trusted executor's final proof can release an interrupted deletion fence.
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True)
            root=self.tasks._root(conn,project_id,root_id);job=self._job(conn,root['id'])
            if job['state']!='interrupted' or job['error_code']=='execution-cleaned':return None
            original=dict(job)
        # Docker can be slow or unavailable; do not hold project/database locks across it.
        if not self._cleanup_verified(original):
            reconcile_orphan(self.store._asset_path('teaching-renders/'+str(original['id'])))
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True)
            root=self.tasks._root(conn,project_id,root_id);job=self._job(conn,root['id'])
            if job['id']!=original['id'] or job['state']!='interrupted' or job['error_code']=='execution-cleaned' or not self._cleanup_verified(job):return None
            row=conn.execute("UPDATE teaching_render_jobs SET error_code='execution-cleaned' WHERE id=%s RETURNING *",[job['id']]).fetchone()
            return self._public(row)

    def reconcile_one(self):
        with self.store.connection() as conn:
            if conn.execute("SELECT to_regclass('aicreater.teaching_render_jobs') AS name").fetchone()['name'] is None:return None
            rows=conn.execute("""SELECT r.project_id,j.root_id FROM teaching_render_jobs j JOIN teaching_task_roots r ON r.id=j.root_id
                WHERE j.state='interrupted' AND j.error_code IS DISTINCT FROM 'execution-cleaned' ORDER BY j.ended_at,j.id""").fetchall()
        for row in rows:
            try:
                result=self.reconcile(str(row['project_id']),str(row['root_id']))
                if result is not None:return result
            except StoreError as error:
                if error.code!='not_found':raise
        return None

    def claim(self,project_id,root_id):
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True)
            root=self.tasks._root(conn,project_id,root_id); job=self._job(conn,root['id'])
            if job['state']!='queued': return None
            if root['state']!='active' or not self._current(conn,root,job):
                state='cancelled' if root['state']=='cancelled' else 'failed'
                conn.execute('UPDATE teaching_render_jobs SET state=%s,error_code=%s,ended_at=now() WHERE id=%s',
                    [state,'cancelled' if state=='cancelled' else 'input-changed',job['id']]); return None
            token=uuid.uuid4()
            conn.execute("UPDATE teaching_render_jobs SET state='running',token=%s,deadline=clock_timestamp()+interval '35 minutes' WHERE id=%s",[token,job['id']])
            return {'id':str(job['id']),'token':str(token),'artifact_binding':job['artifact_binding'],'artifact_sha256':job['artifact_sha256'],
                'media_job_id':str(job['media_job_id']) if job.get('media_job_id') else None,'audiovisual':job.get('audiovisual')}

    def _owned(self,conn,project_id,root_id,token):
        self.store._read(conn,project_id,lock=True)
        root=self.tasks._root(conn,project_id,root_id); job=self._job(conn,root['id'])
        if job['state']!='running' or str(job['token'])!=identifier(token) or conn.execute('SELECT %s>clock_timestamp() AS valid',[job['deadline']]).fetchone()['valid'] is not True:
            raise StoreError('conflict','Render execution is no longer owned')
        return root,job

    def fail(self,project_id,root_id,token,code):
        if code not in ('render-failed','artifact-invalid','input-changed'): raise StoreError('validation','Invalid render error code')
        with self.store.connection() as conn:
            root,job=self._owned(conn,project_id,root_id,token)
            state='cancelled' if root['state']=='cancelled' else 'failed'
            conn.execute('UPDATE teaching_render_jobs SET state=%s,error_code=%s,ended_at=now() WHERE id=%s',[state,code,job['id']])

    def _publish(self,project_id,root_id,claim,result):
        # Never accept an external URL or a file outside this exact render run.
        folder=self.store._asset_path('teaching-renders/'+claim['id'])
        file=(folder/result['previewFile']).resolve()
        if not file.is_relative_to(folder.resolve()) or file.is_symlink() or not file.is_file() or file.suffix!='.mp4':
            raise StoreError('render_failed','Invalid preview file')
        with file.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
        av=bool(claim.get('media_job_id'))
        if result.get('audiovisualSha256' if av else 'inputSha256')!=claim['artifact_sha256'] or checksum(result.get('videoSha256'))!=digest or result.get('status')!=('audiovisual-ready' if av else 'preview-ready'):
            raise StoreError('render_failed','Preview checksum mismatch')
        receipt={'key':file.relative_to(self.store.public).as_posix(),'video_sha256':digest,
            'artifact_sha256':claim['artifact_sha256'],'rendered_artifact_sha256':checksum(result.get('artifactSha256'))}
        if av:
            subtitle=file.parent/'captions.srt'
            if result.get('accepted') is not False or result.get('artifactSha256')!=claim['audiovisual']['artifactSha256'] or not subtitle.is_file() or subtitle.is_symlink() or not 0<subtitle.stat().st_size<=128*1024 or hashlib.sha256(subtitle.read_bytes()).hexdigest()!=checksum(result.get('captionsSha256')):
                raise StoreError('render_failed','Bound subtitle receipt mismatch')
            receipt.update(subtitle_key=subtitle.relative_to(self.store.public).as_posix(),subtitle_sha256=result['captionsSha256'])
        with self.store.connection() as conn:
            root,job=self._owned(conn,project_id,root_id,claim['token'])
            if root['state']!='active' or not self._current(conn,root,job):
                conn.execute("UPDATE teaching_render_jobs SET state=%s,error_code='input-changed',ended_at=now() WHERE id=%s",['cancelled' if root['state']=='cancelled' else 'failed',job['id']]); return
            updated=conn.execute("""UPDATE teaching_render_jobs SET state='succeeded',receipt=%s,ended_at=clock_timestamp()
                WHERE id=%s AND state='running' AND token=%s AND deadline>clock_timestamp() RETURNING id""",[Json(receipt),job['id'],identifier(claim['token'])]).fetchone()
            if updated is None: raise StoreError('conflict','Render ownership expired before publication')

    def run(self,project_id,root_id):
        claim=self.claim(project_id,root_id)
        if claim is None: return self.get(project_id,root_id)
        try:
            output=self.store._asset_path('teaching-renders/'+claim['id']); output.parent.mkdir(parents=True,exist_ok=True)
            if claim.get('media_job_id'):
                from services.visual.teaching_media import TeachingMedia
                from services.visual.teaching_timing import verify_bound_audio
                bound=TeachingMedia(self.store).binding(project_id,claim['media_job_id']);timeline=bound['package']['timeline']
                verify_bound_audio(self.store,project_id,timeline)
                audio=self.store.asset_file(project_id,timeline['media']['asset']['id'])
                result=render_audiovisual(claim['audiovisual'],claim['artifact_sha256'],audio,output)
            else:
                artifact=self.tasks.get_cache(project_id,root_id,'artifact',claim['artifact_binding'])['payload']
                verified=host_command('artifact',{'artifact':artifact,'expectedSha256':claim['artifact_sha256']})
                if verified.get('status')!='verified': raise StoreError('not_ready','Artifact verification failed')
                result=render_frozen(artifact,claim['artifact_sha256'],output)
            self._publish(project_id,root_id,claim,result)
        except (subprocess.TimeoutExpired,RenderInterrupted):
            # Descendant browser shutdown is not proven. Keep deletion fenced.
            with self.store.connection() as conn:
                root=self.tasks._root(conn,project_id,root_id)
                conn.execute("""UPDATE teaching_render_jobs SET state='interrupted',error_code='execution-interrupted',ended_at=clock_timestamp()
                    WHERE root_id=%s AND state='running' AND token=%s""",[root['id'],identifier(claim['token'])])
        except Exception:
            # Full diagnostics stay on disk; public status must not expose child logs or credentials.
            try: self.fail(project_id,root_id,claim['token'],'render-failed')
            except StoreError as error:
                if error.code!='conflict': raise
        return self.get(project_id,root_id)
