"""Durable semantic planning. The API never calls a provider or executes a scene."""
import uuid
from psycopg.types.json import Json
from services.projects.store import StoreError,identifier
from services.visual.teaching_tasks import TeachingTasks
from services.visual.teaching_context import chapter_snapshot
from services.visual.teaching_pipeline import TeachingPipeline
from services.visual.teaching_renders import TeachingRenders
from services.visual.teaching_health import WorkerHealth


class TeachingPlanning:
    def __init__(self,store):self.store=store;self.tasks=TeachingTasks(store)

    def _job(self,conn,root_id):
        row=conn.execute('SELECT * FROM teaching_planning_jobs WHERE root_id=%s FOR UPDATE',[root_id]).fetchone()
        if row is None:raise StoreError('not_found','Teaching planning job not found')
        if row['state']=='queued' and conn.execute("SELECT %s<clock_timestamp()-interval '2 minutes' AS expired",[row['created_at']]).fetchone()['expired'] and not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
            row=conn.execute("UPDATE teaching_planning_jobs SET state='failed',result=%s,ended_at=clock_timestamp() WHERE id=%s RETURNING *",[Json({'status':'blocked','code':'executor-unavailable'}),row['id']]).fetchone()
        if row['state']=='running' and conn.execute('SELECT %s<=clock_timestamp() AS expired',[row['deadline']]).fetchone()['expired']:
            row=conn.execute("UPDATE teaching_planning_jobs SET state='interrupted',ended_at=clock_timestamp() WHERE id=%s RETURNING *",[row['id']]).fetchone()
        return row

    @staticmethod
    def _public(row):return {'id':str(row['id']),'state':row['state'],'result':row['result']}

    def get(self,project_id,root_id):
        with self.store.connection() as conn:
            root=self.tasks._root(conn,project_id,root_id)
            return self._public(self._job(conn,root['id']))

    def _current(self,project,root):
        try:return chapter_snapshot(project,self.store._scene(project,str(root['scene_id'])),root['snapshot']['media']['timing_mode'])==root['snapshot']
        except (KeyError,StoreError):return False

    def enqueue(self,project_id,root_id):
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id)
            old=conn.execute('SELECT * FROM teaching_planning_jobs WHERE root_id=%s FOR UPDATE',[root['id']]).fetchone()
            if old:return self._public(old)
            if root['state']!='active' or not self._current(project,root):raise StoreError('conflict','Task input changed or cancelled')
            if root['snapshot'].get('media',{}).get('timing_mode')!='draft':raise StoreError('not_ready','Measured audio binding is not connected')
            row=conn.execute('INSERT INTO teaching_planning_jobs(id,root_id) VALUES (%s,%s) RETURNING *',[uuid.uuid4(),root['id']]).fetchone()
            return self._public(row)

    def claim(self,project_id,root_id):
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);job=self._job(conn,root['id'])
            if job['state']!='queued':return None
            if root['state']!='active' or not self._current(project,root):
                conn.execute("UPDATE teaching_planning_jobs SET state=%s,ended_at=clock_timestamp() WHERE id=%s",['cancelled' if root['state']=='cancelled' else 'failed',job['id']]);return None
            token=str(uuid.uuid4())
            conn.execute("UPDATE teaching_planning_jobs SET state='running',token=%s,deadline=clock_timestamp()+interval '10 minutes' WHERE id=%s",[token,job['id']])
            return {'id':str(job['id']),'token':token}

    def _owned(self,conn,project_id,root_id,token):
        self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);job=self._job(conn,root['id'])
        if job['state']!='running' or str(job['token'])!=identifier(token):raise StoreError('conflict','Planning ownership expired')
        return root,job

    def guard(self,project_id,root_id,token):
        with self.store.connection() as conn:
            self.guard_in_transaction(conn,project_id,root_id,token)

    def guard_in_transaction(self,conn,project_id,root_id,token):
        root,_=self._owned(conn,project_id,root_id,token)
        if root['state']!='active':raise StoreError('cancelled','Task cancelled')

    def finish(self,project_id,root_id,token,result):
        status=result.get('status')
        if status not in ('artifact-ready','blocked','unsupported','cancelled'):raise StoreError('validation','Invalid planning result')
        safe={'status':status}
        if isinstance(result.get('code'),str) and len(result['code'])<=64:safe['code']=result['code']
        with self.store.connection() as conn:
            root,job=self._owned(conn,project_id,root_id,token)
            state='cancelled' if root['state']=='cancelled' or status=='cancelled' else 'succeeded' if status=='artifact-ready' else 'failed'
            row=conn.execute("""UPDATE teaching_planning_jobs SET state=%s,result=%s,ended_at=clock_timestamp()
                WHERE id=%s AND state='running' AND token=%s AND deadline>clock_timestamp() RETURNING *""",[state,Json(safe),job['id'],identifier(token)]).fetchone()
            if row is None:raise StoreError('conflict','Planning ownership expired before completion')
            return self._public(row)

    def candidate(self):
        with self.store.connection() as conn:
            if conn.execute("SELECT to_regclass('aicreater.teaching_planning_jobs') AS name").fetchone()['name'] is None:return None
            if not WorkerHealth(self.store).ready(('teaching-plan','scheduler')):
                conn.execute("UPDATE teaching_planning_jobs SET state='failed',result=%s,ended_at=clock_timestamp() WHERE state='queued' AND created_at<clock_timestamp()-interval '2 minutes'",[Json({'status':'blocked','code':'executor-unavailable'})])
            conn.execute("UPDATE teaching_planning_jobs SET state='interrupted',ended_at=clock_timestamp() WHERE state='running' AND deadline<=clock_timestamp()")
            row=conn.execute("""SELECT r.project_id,j.root_id,j.state FROM teaching_planning_jobs j JOIN teaching_task_roots r ON r.id=j.root_id
                WHERE j.state='queued' OR (j.state='succeeded' AND r.state='active' AND NOT EXISTS
                    (SELECT 1 FROM teaching_render_jobs v WHERE v.root_id=j.root_id)) ORDER BY j.created_at,j.id LIMIT 1""").fetchone()
            return {key:str(value) for key,value in row.items()} if row else None

    def admission_failed(self,project_id,root_id):
        with self.store.connection() as conn:
            self.store._read(conn,project_id,lock=True);root=self.tasks._root(conn,project_id,root_id);job=self._job(conn,root['id'])
            if job['state']=='succeeded':
                job=conn.execute("UPDATE teaching_planning_jobs SET state='failed',result=%s WHERE id=%s RETURNING *",
                    [Json({'status':'blocked','code':'render-admission-failed'}),job['id']]).fetchone()
            return self._public(job)


def run_once(jobs,provider):
    candidate=jobs.candidate()
    if candidate is None:return None
    pid,rid=candidate['project_id'],candidate['root_id']
    if candidate['state']=='succeeded':
        # Recover a crash between frozen compilation and render admission; no model call.
        try:TeachingRenders(jobs.store).enqueue(pid,rid)
        except StoreError:return jobs.admission_failed(pid,rid)
        return jobs.get(pid,rid)
    claim=jobs.claim(pid,rid)
    if claim is None:return jobs.get(pid,rid)
    try:
        result=TeachingPipeline(jobs.tasks).run(pid,rid,provider,admit=lambda:jobs.guard(pid,rid,claim['token']),
            reservation_guard=lambda conn:jobs.guard_in_transaction(conn,pid,rid,claim['token']))
    except Exception:result={'status':'blocked','code':'planning-failed'}
    try:finished=jobs.finish(pid,rid,claim['token'],result)
    except StoreError as error:
        if error.code!='conflict':raise
        return jobs.get(pid,rid)
    if finished['state']=='succeeded':
        try:TeachingRenders(jobs.store).enqueue(pid,rid)
        except StoreError:return jobs.admission_failed(pid,rid)
    return finished
