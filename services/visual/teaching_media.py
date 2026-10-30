"""Durable, model-free audio binding and admission to the isolated render queue."""
import uuid

from psycopg.types.json import Json
from services.projects.store import StoreError,identifier
from services.visual.teaching_health import WorkerHealth
from services.visual.teaching_pipeline import pipeline_binding
from services.visual.teaching_tasks import TeachingTasks,fingerprint,frozen_json
from services.visual.teaching_timing import measured_timeline,bind_teaching_audio,verify_bound_audio


class TeachingMedia:
    def __init__(self,store):
        self.store=store
        self.tasks=TeachingTasks(store)

    @staticmethod
    def _public(row):
        if row['state']=='succeeded' and fingerprint(row['result'],8*1024*1024)!=row['result_sha256']:
            raise StoreError('conflict','Stored audio binding changed')
        return {'id':str(row['id']),'root_id':str(row['root_id']),'state':row['state'],
            'stage':'audio-bound' if row['state']=='succeeded' else 'binding-'+row['state'],
            'error_code':row['error_code'],'binding_sha256':row['result_sha256'],
            'video_ready':False,'accepted':False,'model_calls':0,
            'render_admission':row['render_admission'],'render_error':row['render_error']}

    def _row(self,conn,project_id,job_id):
        row=conn.execute('''SELECT j.* FROM teaching_media_jobs j JOIN teaching_task_roots r ON r.id=j.root_id
            WHERE r.project_id=%s AND j.id=%s FOR UPDATE OF j''',[identifier(project_id),identifier(job_id)]).fetchone()
        if row is None:raise StoreError('not_found','Teaching media binding not found')
        if row['state']=='queued' and conn.execute("SELECT %s<clock_timestamp()-interval '2 minutes' AS expired",[row['created_at']]).fetchone()['expired'] and not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
            row=conn.execute("UPDATE teaching_media_jobs SET state='failed',error_code='executor-unavailable',ended_at=clock_timestamp() WHERE id=%s RETURNING *",[row['id']]).fetchone()
        if row['state']=='running' and conn.execute('SELECT %s<=clock_timestamp() AS expired',[row['deadline']]).fetchone()['expired']:
            row=conn.execute("UPDATE teaching_media_jobs SET state='interrupted',error_code='binding-interrupted',ended_at=clock_timestamp() WHERE id=%s RETURNING *",[row['id']]).fetchone()
        return row

    def _source(self,conn,root):
        if fingerprint(root['snapshot'])!=root['snapshot_sha256']:raise StoreError('conflict','Frozen teaching input changed')
        if root['state']!='active':raise StoreError('conflict','Teaching root is cancelled')
        calls=conn.execute('SELECT stage,state FROM teaching_model_calls WHERE root_id=%s',[root['id']]).fetchall()
        if not calls or any(c['state']!='succeeded' for c in calls):raise StoreError('not_ready','Teaching plan outcome is not complete')
        stage='revision' if any(c['stage']=='revision' for c in calls) else 'plan'
        binding=pipeline_binding(root['snapshot_sha256'],stage)
        cached=conn.execute("SELECT payload,payload_sha256 FROM teaching_task_cache WHERE root_id=%s AND kind='artifact' AND binding_sha256=%s",[root['id'],binding]).fetchone()
        if cached is None or fingerprint(cached['payload'],8*1024*1024)!=cached['payload_sha256']:
            raise StoreError('not_ready','Frozen teaching artifact is missing or changed')
        artifact=cached['payload']
        if artifact.get('brief')!=root['snapshot']['brief'] or artifact.get('cues')!=root['snapshot']['cues']:
            raise StoreError('conflict','Frozen artifact does not match original teaching input')
        return binding,artifact

    def enqueue(self,project_id,root_id):
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            root=self.tasks._root(conn,project_id,root_id)
            binding,artifact=self._source(conn,root)
            timeline=measured_timeline(root['snapshot'],project,self.store._scene(project,str(root['scene_id'])))
            old=conn.execute('''SELECT * FROM teaching_media_jobs WHERE root_id=%s AND source_artifact_sha256=%s
                AND timeline_sha256=%s FOR UPDATE''',[root['id'],artifact['artifactSha256'],timeline['timeline_sha256']]).fetchone()
            if old:return self._public(self._row(conn,project_id,str(old['id'])))
            row=conn.execute('''INSERT INTO teaching_media_jobs(id,root_id,source_binding,source_artifact_sha256,timeline,timeline_sha256)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *''',[uuid.uuid4(),root['id'],binding,artifact['artifactSha256'],Json(timeline),timeline['timeline_sha256']]).fetchone()
            return self._public(row)

    def _locked(self,conn,project_id,job_id):
        project=self.store._read(conn,project_id,lock=True)
        reference=conn.execute('''SELECT root_id FROM teaching_media_jobs j JOIN teaching_task_roots r ON r.id=j.root_id
            WHERE r.project_id=%s AND j.id=%s''',[identifier(project_id),identifier(job_id)]).fetchone()
        if reference is None:raise StoreError('not_found','Teaching media binding not found')
        root=self.tasks._root(conn,project_id,str(reference['root_id']))
        return project,root,self._row(conn,project_id,job_id)

    def _current(self,conn,project,root,job):
        binding,artifact=self._source(conn,root)
        timeline=measured_timeline(root['snapshot'],project,self.store._scene(project,str(root['scene_id'])))
        if binding!=job['source_binding'] or artifact['artifactSha256']!=job['source_artifact_sha256'] or timeline!=job['timeline'] or timeline['timeline_sha256']!=job['timeline_sha256']:
            raise StoreError('conflict','Teaching media binding input changed')
        return artifact

    def get(self,project_id,job_id):
        with self.store.connection() as conn:
            _,_,row=self._locked(conn,project_id,job_id)
            return self._public(row)

    def latest(self,project_id,root_id):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id)
            row=conn.execute('SELECT id FROM teaching_media_jobs WHERE root_id=%s ORDER BY created_at DESC,id DESC LIMIT 1',[root['id']]).fetchone()
            if row is None:raise StoreError('not_found','Teaching audio binding not found')
            return self._public(self._row(conn,project_id,str(row['id'])))

    def claim(self,project_id,job_id):
        with self.store.connection() as conn:
            project,root,row=self._locked(conn,project_id,job_id)
            if row['state']!='queued':return None
            try:artifact=self._current(conn,project,root,row)
            except StoreError:
                conn.execute("UPDATE teaching_media_jobs SET state=%s,error_code='input-changed',ended_at=clock_timestamp() WHERE id=%s",['cancelled' if root['state']=='cancelled' else 'failed',row['id']])
                return None
            token=str(uuid.uuid4())
            conn.execute("UPDATE teaching_media_jobs SET state='running',token=%s,deadline=clock_timestamp()+interval '10 minutes' WHERE id=%s",[token,row['id']])
            return {'token':token,'artifact':artifact,'source':root['snapshot'],'project':project,
                'scene':self.store._scene(project,str(root['scene_id'])),'job':dict(row)}

    def finish(self,project_id,job_id,token,result):
        result,digest=frozen_json(result,8*1024*1024)
        with self.store.connection() as conn:
            project,root,row=self._locked(conn,project_id,job_id)
            if row['state']!='running' or str(row['token'])!=identifier(token):raise StoreError('conflict','Media binding ownership ended')
            self._current(conn,project,root,row)
            package=result.get('package',{});verification=result.get('verification',{})
            if set(result)!={'package','verification'} or not isinstance(package,dict) or not isinstance(verification,dict):
                raise StoreError('validation','Invalid media binding result envelope')
            if package.get('accepted') is not False or package.get('execution')!='not-run' or type(package.get('model_calls')) is not int or package['model_calls']!=0 or package.get('media_verification')!='metadata-only' or verification.get('schemaVersion')!='teaching-audio-verification:1' or verification.get('accepted') is not False or type(verification.get('model_calls')) is not int or verification['model_calls']!=0:
                raise StoreError('validation','Media binding cannot claim rendering or acceptance')
            if package.get('schemaVersion')!='teaching-audio-binding:1' or package.get('source_artifact_sha256')!=row['source_artifact_sha256'] or package.get('timeline')!=row['timeline'] or verification.get('timeline_sha256')!=row['timeline_sha256'] or verification.get('audio_sha256')!=row['timeline']['media']['asset']['checksum']:
                raise StoreError('validation','Invalid media binding output')
            if fingerprint({k:v for k,v in package.items() if k!='binding_sha256'},8*1024*1024)!=package.get('binding_sha256'):
                raise StoreError('validation','Media binding output changed')
            updated=conn.execute("""UPDATE teaching_media_jobs SET state='succeeded',result=%s,result_sha256=%s,ended_at=clock_timestamp()
                WHERE id=%s AND state='running' AND token=%s AND deadline>clock_timestamp() RETURNING *""",[Json(result),digest,row['id'],identifier(token)]).fetchone()
            if updated is None:raise StoreError('conflict','Media binding lease expired')
            return self._public(updated)

    def fail(self,project_id,job_id,token):
        with self.store.connection() as conn:
            _,root,row=self._locked(conn,project_id,job_id)
            if row['state']=='running' and str(row['token'])==identifier(token):
                conn.execute("UPDATE teaching_media_jobs SET state=%s,error_code='binding-failed',ended_at=clock_timestamp() WHERE id=%s",['cancelled' if root['state']=='cancelled' else 'failed',row['id']])
        return self.get(project_id,job_id)

    def binding(self,project_id,job_id):
        with self.store.connection() as conn:
            _,_,row=self._locked(conn,project_id,job_id)
            if row['state']!='succeeded':raise StoreError('not_ready','Audio binding is not complete')
            if fingerprint(row['result'],8*1024*1024)!=row['result_sha256']:raise StoreError('conflict','Stored audio binding changed')
            return row['result']

    def candidate(self):
        with self.store.connection() as conn:
            if conn.execute("SELECT to_regclass('aicreater.teaching_media_jobs') AS name").fetchone()['name'] is None:return None
            conn.execute("UPDATE teaching_media_jobs SET state='interrupted',error_code='binding-interrupted',ended_at=clock_timestamp() WHERE state='running' AND deadline<=clock_timestamp()")
            if not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
                conn.execute("UPDATE teaching_media_jobs SET state='failed',error_code='executor-unavailable',ended_at=clock_timestamp() WHERE state='queued' AND created_at<clock_timestamp()-interval '2 minutes'")
            row=conn.execute("""SELECT r.project_id,m.id,m.state FROM teaching_media_jobs m JOIN teaching_task_roots r ON r.id=m.root_id
                WHERE m.state='queued' OR (m.state='succeeded' AND m.render_admission='pending' AND r.state='active' AND NOT EXISTS
                    (SELECT 1 FROM teaching_render_jobs v WHERE v.root_id=m.root_id AND v.media_job_id IS DISTINCT FROM m.id AND
                    (v.state IN ('queued','running') OR (v.state='interrupted' AND v.error_code IS DISTINCT FROM 'execution-cleaned'))))
                ORDER BY m.created_at,m.id LIMIT 1""").fetchone()
            return {k:str(v) for k,v in row.items()} if row else None

    def admit_render(self,project_id,job_id):
        from services.visual.teaching_renders import TeachingRenders
        state,error='admitted',None
        try:TeachingRenders(self.store).enqueue_audio(project_id,job_id)
        except (StoreError,OSError,ValueError,KeyError) as exc:
            if isinstance(exc,StoreError) and exc.code=='busy':return self.get(project_id,job_id)
            state,error='failed','audio-render-admission-failed'
        with self.store.connection() as conn:
            _,_,row=self._locked(conn,project_id,job_id)
            if row['state']=='succeeded' and row['render_admission']=='pending':
                conn.execute('UPDATE teaching_media_jobs SET render_admission=%s,render_error=%s WHERE id=%s',[state,error,row['id']])
        return self.get(project_id,job_id)


def run_once(jobs):
    candidate=jobs.candidate()
    if candidate is None:return None
    pid,jid=candidate['project_id'],candidate['id']
    if candidate['state']=='succeeded':return jobs.admit_render(pid,jid)
    claim=jobs.claim(pid,jid)
    if claim is None:return jobs.get(pid,jid)
    try:
        package=bind_teaching_audio(claim['source'],claim['artifact'],claim['job']['source_artifact_sha256'],claim['project'],claim['scene'])
        verification=verify_bound_audio(jobs.store,pid,package['timeline'])
        jobs.finish(pid,jid,claim['token'],{'package':package,'verification':verification})
        return jobs.admit_render(pid,jid)
    except (StoreError,OSError,ValueError,KeyError):
        return jobs.fail(pid,jid,claim['token'])
