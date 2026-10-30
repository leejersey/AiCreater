"""Read-only admission checks; never start services, pull images or invoke providers."""
import os
import subprocess
from services.projects.store import StoreError
from services.workbench import basic_ready
from services.visual.teaching_health import WorkerHealth


def require_ready(store):
    try:
        WorkerHealth(store).require_ready(('teaching-plan','teaching-render','scheduler'))
        basic_ready(dict(os.environ))
        result=subprocess.run(['docker','image','inspect','aicreater-teaching-renderer:local','--format','{{.Id}}'],
            capture_output=True,text=True,timeout=5,
            env={key:os.environ[key] for key in ('PATH','HOME') if key in os.environ})
        if result.returncode:raise RuntimeError('image unavailable')
    except Exception:
        raise StoreError('teaching_unavailable','教学执行服务未就绪，未派发模型请求。') from None
