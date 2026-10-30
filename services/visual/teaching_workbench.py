"""Experimental project-owned teaching tasks. No implicit model or render worker."""
from services.projects.store import StoreError
from services.visual.contract import require_budget
from services.visual.teaching_context import chapter_snapshot
from services.visual.teaching_pipeline import TeachingPipeline, host_command, pipeline_binding
from services.visual.teaching_tasks import TeachingTasks
from services.visual.teaching_renders import TeachingRenders
from services.visual.teaching_planning import TeachingPlanning
from services.visual.teaching_render_repairs import TeachingRenderRepairs


class TeachingWorkbench:
    def __init__(self, store, provider=None, readiness=None):
        self.store, self.provider = store, provider
        self.readiness=readiness
        self.tasks = TeachingTasks(store)
        self.renders = TeachingRenders(store)
        self.planning = TeachingPlanning(store)
        self.repairs = TeachingRenderRepairs(store)

    def ready(self):
        if self.provider is None:return False
        try:
            if self.readiness is not None:self.readiness()
            return True
        except StoreError:return False

    def require_ready(self):
        if self.provider is None:raise StoreError('teaching_executor_disabled','实验模型执行器尚未配置，未派发模型请求。')
        if self.readiness is not None:self.readiness()

    def _snapshot(self, project_id, scene_id, timing_mode):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            row = self.store._scene(project, scene_id)
        return chapter_snapshot(project, row, timing_mode)

    def _current(self, project_id, root, snapshot):
        if snapshot.get('generation_mode') != 'teaching-plan' or not isinstance(snapshot.get('media'), dict): return False
        try: return self._snapshot(project_id, root['scene_id'], snapshot['media']['timing_mode']) == snapshot
        except StoreError as error:
            if error.code in ('validation', 'not_ready', 'not_found'): return False
            raise

    def get(self, project_id, root_id):
        self.tasks.reconcile(project_id, root_id)
        checkpoint = self.tasks.checkpoint(project_id, root_id)
        root, snapshot = checkpoint['root'], checkpoint['snapshot']
        current = self._current(project_id, root, snapshot)
        calls = root['calls']; cache = checkpoint['cache']
        stopped = {pipeline_binding(root['snapshot_sha256'], s) for s in ('plan-stopped', 'revision-stopped')}
        repair_key = pipeline_binding(root['snapshot_sha256'], 'plan')
        stage, message = 'prepared', '任务已准备，尚未派发模型请求。'
        if root['state'] == 'cancelled': stage, message = 'cancelled', '任务已取消，已有数据保留。'
        elif not current: stage, message = 'stale', '章节或时间轴已变化，本次任务不会继续派发或采用旧产物。'
        elif any(c['state'] in ('unknown', 'failed', 'cancelled') for c in calls): stage, message = 'blocked', '本次请求未完成，已有数据保留，未自动追加调用。'
        elif any(c['state'] == 'dispatched' for c in calls):
            revising = any(c['stage'] == 'revision' and c['state'] == 'dispatched' for c in calls)
            stage, message = ('revising' if revising else 'planning'), '请求已登记，等待模型结果；不会重复派发。'
        elif any(c['kind'] == 'artifact' for c in cache): stage, message = 'artifact-cached', '画面数据已保存，尚未渲染视频。'
        elif any(c['kind'] == 'diagnostic' and c['binding_sha256'] in stopped for c in cache): stage, message = 'blocked', '本章程序检查未通过，已有响应与诊断保留，未追加调用。'
        elif any(c['kind'] == 'diagnostic' and c['binding_sha256'] == repair_key for c in cache): stage, message = 'revision-pending', '程序已准备定向修订，尚未派发新请求。'
        elif any(c['kind'] == 'diagnostic' for c in cache): stage, message = 'blocked', '程序检查尚未通过，诊断与响应已保存；尚未生成视频。'
        elif calls: stage, message = 'response-cached', '模型响应已保存，等待宿主校验。'
        timing=snapshot.get('media', {}).get('timing_mode', 'unknown') if isinstance(snapshot.get('media', {}), dict) else 'unknown'
        planning=None
        try:planning=self.planning.get(project_id,root_id)
        except StoreError as error:
            if error.code!='not_found':raise
        if planning and stage not in ('cancelled','stale'):
            if planning['state']=='queued':stage,message='plan-queued','计划已排队，等待工作流执行器领取；尚未派发模型请求。'
            elif planning['state']=='running' and not calls:stage,message='planning','执行器正在准备语义规划请求。'
            elif planning['state'] in ('failed','interrupted','cancelled'):stage,message='blocked','规划已停止，数据与诊断保留；不会自动重新派发请求。'
        render=None
        try: render=self.renders.get(project_id,root_id)
        except StoreError as error:
            if error.code!='not_found': raise
        if render and render.get('timing_mode')=='measured':
            timing='measured'
            if render.get('current') and root['state']=='active':
                current=True
                if stage=='stale':stage,message='artifact-cached','配音时间轴已重新绑定，原语义计划保持不变。'
        repair=None
        try:repair=self.repairs.get(project_id,root_id)
        except StoreError as error:
            if error.code!='not_found':raise
        repairing=bool(repair and repair['state'] in ('queued','running') and render and repair['from_render_id']==render['id']
            and not any(c['state'] in ('unknown','failed','cancelled') for c in calls))
        if repairing and stage not in ('cancelled','stale'):
            stage,message=('revision-pending','画面诊断已进入定向修订队列，沿用原任务剩余额度。') if repair['state']=='queued' else ('revising','正在依据完整画面诊断修订语义计划；不生成源码。')
        if render and not repairing and stage not in ('cancelled','stale'):
            state=render['state']
            label='带配音预览' if timing=='measured' else '无声预览'
            if state=='queued': stage,message='render-queued',label+'已排队，等待渲染。'
            elif state=='running': stage,message='rendering','容器正在检查画面并渲染'+label+'。'
            elif render['video_ready']: stage,message='preview-ready',label+'已就绪，尚未验收。'
            else: stage,message='render-blocked','渲染已停止或视频文件不可用；诊断已保留，未自动重新生成。'
        if render and render['state']=='running' and root['state']=='cancelled': message='任务已取消；已启动的渲染仍在收尾，结果不会发布。'
        return {**root, 'generation_mode': 'teaching-plan', 'stage': stage, 'message': message, 'current': current,
                'timing_mode': timing, 'render':render, 'planning':planning,'repair':repair,
                'can_run': planning is None and repair is None and current and stage in ('prepared', 'response-cached', 'revision-pending') and self.ready(),
                'can_render': current and root['state']=='active' and timing=='draft' and (stage=='artifact-cached' or stage=='render-queued'),
                'video_ready': bool(render and render['video_ready']), 'accepted': False, 'execution': render['state'] if render else 'not-run'}

    def list(self, project_id): return [self.get(project_id, root_id) for root_id in self.tasks.list_ids(project_id)]

    def prepare(self, project_id, scene_id, expected_revision, idempotency_key, timing_mode, confirmed, max_requests):
        require_budget(confirmed, max_requests, 2)
        if self.readiness is not None:self.require_ready()
        snapshot = self._snapshot(project_id, scene_id, timing_mode)
        host_command('request', {k: snapshot[k] for k in ('brief', 'cues')})
        root = self.tasks.create(project_id, scene_id, expected_revision, idempotency_key, snapshot, confirmed, max_requests)
        return self.get(project_id, root['id'])

    def run(self, project_id, root_id):
        """Explicit development helper; public HTTP execution uses enqueue()."""
        task = self.get(project_id, root_id)
        if task['stage'] == 'cancelled': return {'task': task, 'result': {'status': 'cancelled', 'accepted': False, 'execution': 'not-run'}}
        if not task['current']: raise StoreError('conflict', 'Chapter changed; no model request dispatched')
        if self.provider is None: raise StoreError('teaching_executor_disabled', '实验模型执行器尚未配置，未派发模型请求。')
        result = TeachingPipeline(self.tasks).run(project_id, root_id, self.provider)
        task = self.get(project_id, root_id)
        if not task['current'] and task['stage'] != 'cancelled': result = {**result, 'status': 'blocked', 'code': 'input-changed'}
        return {'task': task, 'result': result}

    def enqueue(self,project_id,root_id):
        task=self.get(project_id,root_id)
        if task['stage']=='cancelled':return {'task':task,'result':{'status':'cancelled','accepted':False,'execution':'not-run'}}
        if not task['current']:raise StoreError('conflict','Chapter changed; no request dispatched')
        if self.provider is None:raise StoreError('teaching_executor_disabled','实验模型执行器尚未配置，未派发模型请求。')
        if task['planning'] is None:self.require_ready()
        job=self.planning.enqueue(project_id,root_id)
        status={'queued':'queued','running':'running','succeeded':'artifact-ready','failed':'blocked','interrupted':'blocked','cancelled':'cancelled'}[job['state']]
        return {'task':self.get(project_id,root_id),'result':{'status':status,'accepted':False,'execution':'not-run'}}

    def cancel(self, project_id, root_id):
        self.tasks.cancel(project_id, root_id)
        return self.get(project_id, root_id)
