"""Opt-in teaching-plan backend; the legacy visual router is unchanged."""
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix='/api/projects/{project_id}/teaching-tasks')


class Body(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Prepare(Body):
    scene_id: str = Field(min_length=1, max_length=80)
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=80)
    timing_mode: Literal['draft', 'measured'] = 'draft'
    confirmed: bool
    max_requests: int


def workbench(request):
    result = getattr(request.app.state, 'teaching', None)
    if result is None: raise HTTPException(404, 'Teaching-plan experiment is disabled')
    return result


def response(value, status=200): return JSONResponse(value, status_code=status, headers={'Cache-Control': 'no-store'})


@router.get('')
def listing(project_id: str, request: Request):
    return response({'tasks': workbench(request).list(project_id), 'limit': 50})


@router.get('/readiness')
def readiness(project_id:str,request:Request):
    service=workbench(request)
    with service.store.connection() as conn:service.store._read(conn,project_id)
    return response({'generation_mode':'teaching-plan','experimental':True,'ready':service.ready()})


@router.post('', status_code=201)
def prepare(project_id: str, body: Prepare, request: Request):
    return response(workbench(request).prepare(project_id, **body.model_dump()), 201)


@router.get('/{teaching_id}')
def get(project_id: str, teaching_id: str, request: Request):
    return response(workbench(request).get(project_id, teaching_id))


@router.post('/{teaching_id}/run',status_code=202)
def run(project_id: str, teaching_id: str, body: Body, request: Request):
    result=workbench(request).enqueue(project_id, teaching_id)
    return response(result,202 if result['result']['status'] in ('queued','running') else 200)


@router.post('/{teaching_id}/cancel')
def cancel(project_id: str, teaching_id: str, body: Body, request: Request):
    return response(workbench(request).cancel(project_id, teaching_id))


@router.post('/{teaching_id}/audio-binding')
def bind_audio(project_id:str,teaching_id:str,body:Body,request:Request):
    from services.visual.teaching_media import TeachingMedia
    service=workbench(request)
    if service.readiness is not None:service.require_ready()
    result=TeachingMedia(service.store).enqueue(project_id,teaching_id)
    return response(result,202 if result['state'] in ('queued','running') else 200)


@router.get('/{teaching_id}/audio-binding')
def audio_binding(project_id:str,teaching_id:str,request:Request):
    from services.visual.teaching_media import TeachingMedia
    return response(TeachingMedia(workbench(request).store).latest(project_id,teaching_id))


@router.post('/{teaching_id}/render')
def render(project_id: str, teaching_id: str, body: Body, request: Request):
    service=workbench(request)
    if service.readiness is not None and service.get(project_id,teaching_id)['render'] is None:service.require_ready()
    service.renders.enqueue(project_id,teaching_id)
    return response(service.get(project_id,teaching_id))


@router.api_route('/{teaching_id}/video',methods=['GET','HEAD'])
def video(project_id: str, teaching_id: str, request: Request, download: bool=False,render_id:str|None=None):
    file=workbench(request).renders.media_path(project_id,teaching_id,render_id)
    return FileResponse(file,media_type='video/mp4',filename='teaching-preview.mp4',content_disposition_type='attachment' if download else 'inline',
        headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})


@router.api_route('/{teaching_id}/subtitles',methods=['GET','HEAD'])
def subtitles(project_id:str,teaching_id:str,request:Request,render_id:str|None=None):
    file=workbench(request).renders.subtitle_path(project_id,teaching_id,render_id)
    return FileResponse(file,media_type='application/x-subrip',filename='teaching-preview.srt',
        headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
