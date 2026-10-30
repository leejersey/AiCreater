"""One semantic render repair, sharing the root's existing revision slot."""
import hashlib
import os
import stat
import uuid
from psycopg.types.json import Json
from services.projects.store import StoreError,identifier
from services.visual.teaching_tasks import TeachingTasks,checksum,frozen_json
from services.visual.teaching_pipeline import host_command,pipeline_binding
from services.visual.teaching_renders import TeachingRenders
from services.visual.teaching_health import WorkerHealth


class TeachingRenderRepairs:
    def __init__(self,store):self.store=store;self.tasks=TeachingTasks(store);self.renders=TeachingRenders(store)

    @staticmethod
    def _public(row):return {'id':str(row['id']),'from_render_id':str(row['from_render_id']),'state':row['state'],'result':row['result']}

    def _row(self,conn,root_id):
        row=conn.execute('SELECT * FROM teaching_render_repairs WHERE root_id=%s FOR UPDATE',[root_id]).fetchone()
        if row is None:raise StoreError('not_found','Render repair not found')
        if row['state']=='queued' and conn.execute("SELECT %s<clock_timestamp()-interval '2 minutes' AS expired",[row['created_at']]).fetchone()['expired'] and not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
            row=conn.execute("UPDATE teaching_render_repairs SET state='failed',result=%s,ended_at=clock_timestamp() WHERE id=%s RETURNING *",[Json({'status':'blocked','code':'executor-unavailable'}),row['id']]).fetchone()
        if row['state']=='running' and conn.execute('SELECT %s<=clock_timestamp() AS expired',[row['deadline']]).fetchone()['expired']:
            row=conn.execute("UPDATE teaching_render_repairs SET state='interrupted',ended_at=clock_timestamp() WHERE id=%s RETURNING *",[row['id']]).fetchone()
        return row

    def get(self,project_id,root_id):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id);return self._public(self._row(conn,root['id']))

    def _evidence(self,job_id):
        path=self.store._asset_path('teaching-renders/'+identifier(job_id)+'/failure-evidence/render/recovery-report.json')
        with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size>8*1024*1024:raise StoreError('validation','Invalid render evidence')
            data=stream.read(8*1024*1024+1)
            if len(data)>8*1024*1024:raise StoreError('validation','Render evidence exceeds limit')
        return data.decode('utf-8'),hashlib.sha256(data).hexdigest()

    def _eligible(self,conn,project_id,root_id,job_id):
        self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id)
        calls=conn.execute('SELECT stage,state FROM teaching_model_calls WHERE root_id=%s',[root['id']]).fetchall()
        if root['state']!='active' or not self.renders._current(conn,root) or len(calls)!=1 or calls[0]['stage']!='plan' or calls[0]['state']!='succeeded':return None
        job=self.renders._job(conn,root['id'])
        if str(job['id'])!=identifier(job_id) or job['state']!='failed' or job['error_code']!='render-failed' or not self.renders._cleanup_verified(job):return None
        return root,job

    def prepare(self,project_id,root_id,job_id):
        with self.store.connection() as conn:
            eligible=self._eligible(conn,project_id,root_id,job_id)
            if eligible is None:return None
            root,job=eligible
            old=conn.execute('SELECT * FROM teaching_render_repairs WHERE root_id=%s',[root['id']]).fetchone()
            if old:return self._public(old)
        try:
            text,digest=self._evidence(job_id)
            artifact=self.tasks.get_cache(project_id,root_id,'artifact',job['artifact_binding'])['payload']
            checked=host_command('render-revision',{'artifact':artifact,'expectedSha256':job['artifact_sha256'],'reportJson':text,'reportSha256':digest})
            if checked.get('status')!='revision-required':return None
            request,_=frozen_json(checked['request']);checksum(request.get('requestSha256'))
            if request.get('reportSha256')!=digest or request.get('sourceArtifactSha256')!=job['artifact_sha256']:return None
        except (OSError,ValueError,StoreError,KeyError):return None
        with self.store.connection() as conn:
            eligible=self._eligible(conn,project_id,root_id,job_id)
            if eligible is None or self._evidence(job_id)[1]!=digest:return None
            root,_=eligible
            old=conn.execute('SELECT * FROM teaching_render_repairs WHERE root_id=%s FOR UPDATE',[root['id']]).fetchone()
            if old:return self._public(old)
            row=conn.execute('INSERT INTO teaching_render_repairs(id,root_id,from_render_id,request,request_sha256) VALUES (%s,%s,%s,%s,%s) RETURNING *',
                [uuid.uuid4(),root['id'],identifier(job_id),Json(request),request['requestSha256']]).fetchone()
            return self._public(row)

    def claim(self,project_id,root_id):
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);row=self._row(conn,root['id'])
            if row['state']!='queued':return None
            if root['state']!='active' or not self.renders._current(conn,root):
                conn.execute("UPDATE teaching_render_repairs SET state=%s,ended_at=clock_timestamp() WHERE id=%s",['cancelled' if root['state']=='cancelled' else 'failed',row['id']]);return None
            token=str(uuid.uuid4())
            conn.execute("UPDATE teaching_render_repairs SET state='running',token=%s,deadline=clock_timestamp()+interval '10 minutes' WHERE id=%s",[token,row['id']])
            return {**dict(row),'token':token,'root':dict(root)}

    def _owned(self,conn,project_id,root_id,token):
        self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);row=self._row(conn,root['id'])
        if row['state']!='running' or str(row['token'])!=identifier(token):raise StoreError('conflict','Render repair ownership ended')
        return root,row

    def guard(self,conn,project_id,root_id,token):
        root,row=self._owned(conn,project_id,root_id,token)
        if root['state']!='active' or not self.renders._current(conn,root) or self._evidence(str(row['from_render_id']))[1]!=row['request']['reportSha256']:
            raise StoreError('conflict','Render repair evidence or input changed')

    def before_invoke(self,project_id,root_id,token):
        with self.store.connection() as conn:self.guard(conn,project_id,root_id,token)

    def finish(self,project_id,root_id,token,result):
        with self.store.connection() as conn:
            root,row=self._owned(conn,project_id,root_id,token)
            state='cancelled' if root['state']=='cancelled' else 'succeeded' if result['status']=='artifact-ready' else 'failed'
            updated=conn.execute("UPDATE teaching_render_repairs SET state=%s,result=%s,ended_at=clock_timestamp() WHERE id=%s AND state='running' AND token=%s AND deadline>clock_timestamp() RETURNING *",
                [state,Json(result),row['id'],identifier(token)]).fetchone()
            if updated is None:raise StoreError('conflict','Render repair lease expired')
            return self._public(updated)

    def candidate(self):
        with self.store.connection() as conn:
            if conn.execute("SELECT to_regclass('aicreater.teaching_render_repairs') AS name").fetchone()['name'] is None:return None
            if not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
                conn.execute("UPDATE teaching_render_repairs SET state='failed',result=%s,ended_at=clock_timestamp() WHERE state='queued' AND created_at<clock_timestamp()-interval '2 minutes'",[Json({'status':'blocked','code':'executor-unavailable'})])
            conn.execute("UPDATE teaching_render_repairs SET state='interrupted',ended_at=clock_timestamp() WHERE state='running' AND deadline<=clock_timestamp()")
            row=conn.execute("""SELECT r.project_id,j.root_id,j.state FROM teaching_render_repairs j JOIN teaching_task_roots r ON r.id=j.root_id
                WHERE j.state='queued' OR (j.state='succeeded' AND r.state='active' AND NOT EXISTS(SELECT 1 FROM teaching_render_jobs v
                    WHERE v.root_id=j.root_id AND v.artifact_sha256=j.result->>'artifact_sha256')) ORDER BY j.created_at,j.id LIMIT 1""").fetchone()
            return {key:str(value) for key,value in row.items()} if row else None

    def admit_render(self,project_id,root_id):
        try:self.renders.enqueue(project_id,root_id)
        except StoreError:
            with self.store.connection() as conn:
                self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);row=self._row(conn,root['id'])
                if row['state']=='succeeded':conn.execute("UPDATE teaching_render_repairs SET state='failed',result=%s WHERE id=%s",[Json({'status':'blocked','code':'render-admission-failed'}),row['id']])
        return self.get(project_id,root_id)


def run_once(jobs,provider):
    candidate=jobs.candidate()
    if candidate is None:return None
    pid,rid=candidate['project_id'],candidate['root_id']
    if candidate['state']=='succeeded':return jobs.admit_render(pid,rid)
    claim=jobs.claim(pid,rid)
    if claim is None:return jobs.get(pid,rid)
    token=claim['token'];root=claim['root'];context={key:root['snapshot'][key] for key in ('brief','cues')}
    repair={'request':claim['request'],'expectedSha256':claim['request_sha256']}
    try:
        request=host_command('revision',{**context,**repair})
        call=jobs.tasks.dispatch_once(pid,rid,'revision',request['requestSha256'],lambda:provider(request),
            guard=lambda conn:jobs.guard(conn,pid,rid,token),before_invoke=lambda:jobs.before_invoke(pid,rid,token))
        result={'status':'blocked','code':'revision-incomplete'}
        if call['state']=='succeeded':
            plan=jobs.tasks.get_cache(pid,rid,'response-revision',request['requestSha256'])['payload']
            checked=host_command('check',{**context,'plan':plan,'revision':repair})
            if checked.get('status')=='compiled' and checked['artifact']['artifactSha256']!=claim['request']['sourceArtifactSha256']:
                artifact=checked['artifact'];binding=pipeline_binding(root['snapshot_sha256'],'revision')
                jobs.tasks.save_cache(pid,rid,'plan',binding,artifact['compiled']['plan'])
                jobs.tasks.save_cache(pid,rid,'artifact',binding,artifact)
                result={'status':'artifact-ready','artifact_sha256':artifact['artifactSha256']}
            else:
                jobs.tasks.save_cache(pid,rid,'diagnostic',pipeline_binding(root['snapshot_sha256'],'render-revision-stopped'),checked)
                result={'status':'blocked','code':'revision-not-compiled-or-unchanged'}
    except (StoreError,OSError,ValueError,KeyError):result={'status':'blocked','code':'render-revision-failed'}
    try:finished=jobs.finish(pid,rid,token,result)
    except StoreError as error:
        if error.code!='conflict':raise
        return jobs.get(pid,rid)
    return jobs.admit_render(pid,rid) if finished['state']=='succeeded' else finished
