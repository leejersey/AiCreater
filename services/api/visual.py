"""Project-scoped Scene Agent jobs and course export; generated source is served only as text."""
import hashlib
import re

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from services.projects.store import StoreError

router=APIRouter(prefix='/api/projects/{project_id}/visual')


class Body(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)


class Revision(Body):
    expected_revision:int=Field(ge=1)


class AgentRun(Revision):
    scene_id:str=Field(min_length=1,max_length=80)
    confirmed:bool
    max_turns:int
    revise:str|None=Field(default=None,min_length=1,max_length=80)  # an earlier passed Agent job of this chapter
    feedback:str|None=Field(default=None,min_length=1,max_length=2000)


class Approval(Body):
    confirmed:bool
    sha256:str=Field(pattern='^[a-f0-9]{64}$')


class Export(Revision):
    confirmed:bool


class ChapterText(Revision):
    narration:str=Field(min_length=1,max_length=800)


class ChapterSplit(Revision):
    at:int=Field(ge=1,le=799)


class ChapterDelete(Revision):
    confirmed:bool


class ChapterRestore(Revision):
    at:int=Field(ge=0,le=19)


@router.get('')
def listing(project_id:str,request:Request):
    return JSONResponse({'jobs':request.app.state.visual.list(project_id)},headers={'Cache-Control':'no-store'})


@router.post('/prepare')
def prepare(project_id:str,body:Revision,request:Request):
    return request.app.state.visual.prepare(project_id,body.expected_revision)


@router.patch('/chapters/{scene_id}')
def edit_chapter(project_id:str,scene_id:str,body:ChapterText,request:Request):
    return request.app.state.visual.edit_chapter(project_id,body.expected_revision,scene_id,body.narration)


@router.post('/chapters/{scene_id}/split')
def split_chapter(project_id:str,scene_id:str,body:ChapterSplit,request:Request):
    return request.app.state.visual.split_chapter(project_id,body.expected_revision,scene_id,body.at)


@router.post('/chapters/{scene_id}/merge-next')
def merge_next_chapter(project_id:str,scene_id:str,body:Revision,request:Request):
    return request.app.state.visual.merge_next_chapter(project_id,body.expected_revision,scene_id)


@router.post('/chapters/{scene_id}/restore')
def restore_chapter(project_id:str,scene_id:str,body:ChapterRestore,request:Request):
    return request.app.state.visual.restore_chapter(project_id,body.expected_revision,scene_id,body.at)


@router.post('/chapters/{scene_id}/delete')
def delete_chapter(project_id:str,scene_id:str,body:ChapterDelete,request:Request):
    return request.app.state.visual.delete_chapter(project_id,body.expected_revision,scene_id,body.confirmed)


@router.post('/agent',status_code=202)
def agent(project_id:str,body:AgentRun,request:Request):
    return request.app.state.visual.agent(project_id,body.scene_id,body.expected_revision,body.confirmed,body.max_turns,body.revise,body.feedback)


@router.post('/export',status_code=202)
def export(project_id:str,body:Export,request:Request):
    return request.app.state.visual.export(project_id,body.expected_revision,body.confirmed)


@router.post('/{visual_id}/restyle',status_code=202)
def restyle(project_id:str,visual_id:str,body:Revision,request:Request):
    return request.app.state.visual.restyle(project_id,visual_id,body.expected_revision)


@router.post('/{visual_id}/accept')
def accept(project_id:str,visual_id:str,body:Approval,request:Request):
    return request.app.state.visual.accept(project_id,visual_id,body.confirmed,body.sha256)


@router.post('/{visual_id}/cancel')
def cancel(project_id:str,visual_id:str,body:Body,request:Request):
    return request.app.state.visual.cancel(project_id,visual_id)


@router.get('/{visual_id}/files/{name:path}')
def file(project_id:str,visual_id:str,name:str,request:Request):
    from services.visual.worker import local_file
    if not re.fullmatch(r'(?:source\.txt|video\.mp4|video\.srt|stills/frame-\d+\.png)',name):
        raise StoreError('not_found','Visual file not found')
    job=request.app.state.visual.get_raw(project_id,visual_id)
    if job['kind'] not in ('agent','export','restyle'):raise StoreError('not_found','Visual file not found')
    if job['state']!='succeeded':raise StoreError('not_ready','Visual file is not published')
    checksum=(job.get('result') or {}).get('_files',{}).get(name)
    if not isinstance(checksum,str):raise StoreError('not_found','Visual file not found')
    try:path=local_file(request.app.state.store.objects,job,name)
    except (OSError,ValueError):raise StoreError('assets','Visual file integrity check failed') from None
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    if digest.hexdigest()!=checksum:
        raise StoreError('assets','Visual file integrity check failed')
    media='text/plain; charset=utf-8' if name.endswith(('.txt','.srt')) else 'image/png' if name.endswith('.png') else 'video/mp4'
    # Captions are burned into video.mp4; a same-stem .srt next to it makes players show them twice.
    return FileResponse(path,media_type=media,filename={'video.mp4':'video.mp4','video.srt':'captions.srt'}.get(name),
                        headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})
