"""Celery transports bounded wake-ups; PostgreSQL owns workflow state and retries."""
import os
import atexit
from urllib.parse import urlsplit

from celery import Celery, signals
from dotenv import load_dotenv

from services.projects.store import ROOT, Store
from services.projects.manage import profile
from services.projects.jobs import Jobs
from services.workflow.worker import run_once
from services.visual.store import VisualJobs
from services.visual.worker import run_once as visual_run_once

load_dotenv(ROOT / '.env', override=False)
broker = os.getenv('CELERY_BROKER_URL', 'redis://127.0.0.1:16379/0')
try:
    url = urlsplit(broker)
    if url.scheme != 'redis' or url.hostname not in ['127.0.0.1', 'localhost', 'redis'] or url.port is None:
        raise ValueError()
except ValueError:
    raise RuntimeError('Configure a local Redis broker') from None

app = Celery('aicreater', broker=broker)
app.conf.update(
    task_serializer='json', accept_content=['json'], result_serializer='json',
    # Work already runs in bounded child processes; macOS prefork breaks task initialization.
    worker_pool='solo',
    task_ignore_result=True, worker_prefetch_multiplier=1, worker_concurrency=1,
    task_acks_late=True, task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    broker_transport_options={'visibility_timeout': 180},
    task_routes={'aicreater.poll': {'queue': 'workflow'}, 'aicreater.render_poll': {'queue': 'render'}},
    beat_schedule={name: {'task': task, 'schedule': 2.0, 'options': {'expires': 5}}
                   for name, task in [('workflow-poll', 'aicreater.poll'), ('render-poll', 'aicreater.render_poll')]}, 
)

_teaching_health_leases={}


def _health_store():
    dsn=os.getenv('DATABASE_URL')
    if not dsn:raise RuntimeError('Configure the local workflow database')
    return Store(dsn,ROOT/'apps/renderer/public',profile())


def _start_health(role):
    if role in _teaching_health_leases:return
    from services.visual.teaching_health import WorkerHealth
    if role=='teaching-plan':
        from services.visual.teaching_provider import TeachingPlanProvider
        TeachingPlanProvider.from_env()
    lease=WorkerHealth(_health_store()).lease(role,retry_initial=True)
    lease.__enter__()
    _teaching_health_leases[role]=lease


@signals.worker_ready.connect
def _teaching_worker_ready(sender=None,**kwargs):
    queues={q.name for q in getattr(getattr(sender,'task_consumer',None),'queues',[])}
    if 'workflow' in queues and os.getenv('AICREATER_TEACHING_PLAN_WORKER')=='1':_start_health('teaching-plan')
    if 'render' in queues and os.getenv('AICREATER_TEACHING_RENDER_WORKER')=='1':_start_health('teaching-render')


@signals.beat_init.connect
def _teaching_beat_ready(**kwargs):
    if os.getenv('AICREATER_TEACHING_PLAN_WORKER')=='1' or os.getenv('AICREATER_TEACHING_RENDER_WORKER')=='1':_start_health('scheduler')


@signals.worker_shutdown.connect
def _teaching_worker_shutdown(**kwargs):
    while _teaching_health_leases:
        _,lease=_teaching_health_leases.popitem()
        lease.__exit__(None,None,None)


atexit.register(_teaching_worker_shutdown)


def _poll(lane):
    # Fixed, argument-free wake-up. Never transport manuscript, credentials or executable code.
    dsn = os.getenv('DATABASE_URL')
    if not dsn: raise RuntimeError('Configure the local workflow database')
    from services.projects.storage import ObjectStore
    store = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
    result = visual_run_once(VisualJobs(store), lane=lane)
    if result is None:
        result = run_once(Jobs(store, model=os.getenv('DEEPSEEK_MODEL', 'deepseek-flash')), lane=lane)
    if result is None and lane=='workflow' and os.getenv('AICREATER_TEACHING_PLAN_WORKER')=='1':
        from services.visual.teaching_media import TeachingMedia,run_once as media_run_once
        result=media_run_once(TeachingMedia(store))
        if result is None:
            from services.visual.teaching_planning import TeachingPlanning,run_once as planning_run_once
            from services.visual.teaching_provider import TeachingPlanProvider
            provider=TeachingPlanProvider.from_env()
            result=planning_run_once(TeachingPlanning(store),provider)
            if result is None:
                from services.visual.teaching_render_repairs import TeachingRenderRepairs,run_once as render_repair_run_once
                result=render_repair_run_once(TeachingRenderRepairs(store),provider)
    if result is None and lane=='render' and os.getenv('AICREATER_TEACHING_RENDER_WORKER')=='1':
        from services.visual.teaching_renders import TeachingRenders
        from services.visual.teaching_worker import run_once as teaching_run_once
        result=teaching_run_once(TeachingRenders(store))
    return {'job_id': result['id'], 'state': result['state']} if result else None


@app.task(name="aicreater.poll", ignore_result=True)
def poll():
    return _poll("workflow")


@app.task(name="aicreater.render_poll", ignore_result=True)
def render_poll():
    return _poll("render")
