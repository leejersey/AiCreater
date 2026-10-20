"""Celery transports bounded wake-ups; PostgreSQL owns workflow state and retries."""
import os
from urllib.parse import urlsplit

from celery import Celery
from dotenv import load_dotenv

from services.projects.store import ROOT, Store
from services.projects.manage import profile
from services.projects.jobs import Jobs
from services.workflow.worker import run_once

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


def _poll(lane):
    # Fixed, argument-free wake-up. Never transport manuscript, credentials or executable code.
    dsn = os.getenv('DATABASE_URL')
    if not dsn: raise RuntimeError('Configure the local workflow database')
    from services.projects.storage import ObjectStore
    store = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
    result = run_once(Jobs(store, model=os.getenv('DEEPSEEK_MODEL', 'deepseek-flash')), lane=lane)
    return {'job_id': result['id'], 'state': result['state']} if result else None


@app.task(name="aicreater.poll", ignore_result=True)
def poll():
    return _poll("workflow")


@app.task(name="aicreater.render_poll", ignore_result=True)
def render_poll():
    return _poll("render")
