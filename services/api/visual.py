"""Project-scoped bespoke scene workflow; executable source is served only as text."""
import hashlib
import re
import subprocess
from typing import Literal
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from services.projects.store import StoreError

router=APIRouter(prefix='/api/projects/{project_id}/visual')


class Body(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)


class Revision(Body):
    expected_revision:int=Field(ge=1)


class Generate(Revision):
    scene_id:str=Field(min_length=1,max_length=80)
    confirmed:bool
    max_requests:int
    generation_mode:Literal['source','host-motion','host-intent','host-components']='source'
    timing_mode:Literal['draft','measured']='measured'


class Repair(Body):
    confirmed:bool
    max_requests:int
    feedback:str=Field(min_length=1,max_length=8000)


class CreateVideo(Generate):
    auto_repair_requests:int=Field(default=0,ge=0,le=1)

class RenderVideo(Body):
    confirmed:bool
    auto_repair_requests:int=Field(default=0,ge=0,le=1)

def require_isolated_renderer():
    try:
        subprocess.run(['docker','image','inspect','aicreater-renderer:local'],check=True,timeout=5,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    except (OSError,subprocess.SubprocessError):
        raise HTTPException(503,'隔离渲染器尚未就绪，请先构建 aicreater-renderer:local；未调用模型，不会回退到本机执行。') from None

class Approval(Body):
    confirmed:bool
    sha256:str=Field(pattern='^[a-f0-9]{64}$')


class PreviewApproval(Approval):
    auto_repair_requests:int=Field(default=0,ge=0,le=1)


class QualityRepair(Body):
    confirmed:bool
    max_requests:int
    auto_render:bool=False


class RecoveryInspection(Body):
    confirmed:bool


class RecoveryRepair(Repair):
    sha256:str=Field(pattern='^[a-f0-9]{64}$')
    recovery_sha256:str=Field(pattern='^[a-f0-9]{64}$')


class LayoutApproval(Body):
    confirmed:bool
    max_requests:int
    design_sha256:str=Field(pattern='^[a-f0-9]{64}$')
    layout_sha256:str=Field(pattern='^[a-f0-9]{64}$')


class Export(Revision):
    confirmed:bool


class TransferCandidate(Revision):
    scene_id:str=Field(min_length=1,max_length=80)
    confirmed:bool
    design:dict
    roles:dict


class AutomaticTransfer(Revision):
    scene_id:str=Field(min_length=1,max_length=80)
    confirmed:bool
    preset:Literal['rag-augmentation:1']


@router.get('')
def listing(project_id:str,request:Request):
    return JSONResponse({'jobs':request.app.state.visual.list(project_id)},headers={'Cache-Control':'no-store'})


@router.post('/prepare')
def prepare(project_id:str,body:Revision,request:Request):
    return request.app.state.visual.prepare(project_id,body.expected_revision)


@router.post('/generate',status_code=202)
def generate(project_id:str,body:Generate,request:Request):
    return request.app.state.visual.generate(project_id,body.scene_id,body.expected_revision,body.confirmed,body.max_requests,body.generation_mode,timing_mode=body.timing_mode)


@router.post('/{visual_id}/align',status_code=202)
def align_draft(project_id:str,visual_id:str,body:Approval,request:Request):
    return request.app.state.visual.align_draft(project_id,visual_id,body.confirmed,body.sha256)

@router.post('/create-video',status_code=202)
def create_video(project_id:str,body:CreateVideo,request:Request):
    require_isolated_renderer()
    return request.app.state.visual.generate(project_id,body.scene_id,body.expected_revision,body.confirmed,body.max_requests,body.generation_mode,timing_mode=body.timing_mode,auto_render=True,auto_repair_requests=body.auto_repair_requests)

@router.post('/{visual_id}/render-video',status_code=202)
def render_video(project_id:str,visual_id:str,body:RenderVideo,request:Request):
    require_isolated_renderer()
    return request.app.state.visual.render_video(project_id,visual_id,body.confirmed,body.auto_repair_requests)

@router.post('/{visual_id}/repair-design-video',status_code=202)
def repair_design_video(project_id:str,visual_id:str,body:QualityRepair,request:Request):
    require_isolated_renderer()
    return request.app.state.visual.repair_design_video(project_id,visual_id,body.confirmed,body.max_requests)


@router.post('/prepare-transfer',status_code=202)
def prepare_transfer(project_id:str,body:TransferCandidate,request:Request):
    return request.app.state.visual.prepare_transfer(project_id,body.scene_id,body.expected_revision,body.confirmed,body.design,body.roles)


@router.post('/auto-transfer',status_code=202)
def automatic_transfer(project_id:str,body:AutomaticTransfer,request:Request):
    return request.app.state.visual.automatic_transfer(project_id,body.scene_id,body.expected_revision,body.confirmed,body.preset)


@router.post('/export',status_code=202)
def export(project_id:str,body:Export,request:Request):
    return request.app.state.visual.export(project_id,body.expected_revision,body.confirmed)


@router.post('/{visual_id}/repair',status_code=202)
def repair(project_id:str,visual_id:str,body:Repair,request:Request):
    return request.app.state.visual.repair(project_id,visual_id,body.confirmed,body.max_requests,body.feedback)


@router.post('/{visual_id}/recover-source',status_code=202)
def recover_source(project_id:str,visual_id:str,body:RecoveryInspection,request:Request):
    return request.app.state.visual.recover_source(project_id,visual_id,body.confirmed)


@router.post('/{visual_id}/propose-layout',status_code=202)
def propose_layout(project_id:str,visual_id:str,body:RecoveryInspection,request:Request):
    return request.app.state.visual.propose_layout(project_id,visual_id,body.confirmed)


@router.post('/{visual_id}/apply-layout',status_code=202)
def apply_layout(project_id:str,visual_id:str,body:LayoutApproval,request:Request):
    return request.app.state.visual.apply_layout(project_id,visual_id,body.confirmed,body.max_requests,body.design_sha256,body.layout_sha256)


@router.post('/{visual_id}/repair-source',status_code=202)
def repair_source(project_id:str,visual_id:str,body:RecoveryRepair,request:Request):
    return request.app.state.visual.repair_source(project_id,visual_id,body.confirmed,body.max_requests,body.feedback,body.sha256,body.recovery_sha256)


@router.post('/{visual_id}/revise-design',status_code=202)
def revise_design(project_id:str,visual_id:str,body:Repair,request:Request):
    return request.app.state.visual.revise_design(project_id,visual_id,body.confirmed,body.max_requests,body.feedback)


@router.post('/{visual_id}/preview',status_code=202)
def preview(project_id:str,visual_id:str,body:PreviewApproval,request:Request):
    if body.auto_repair_requests:
        return request.app.state.visual.preview(project_id,visual_id,body.confirmed,body.sha256,auto_repair_requests=body.auto_repair_requests)
    return request.app.state.visual.preview(project_id,visual_id,body.confirmed,body.sha256)


@router.post('/{visual_id}/repair-video',status_code=202)
def repair_video(project_id:str,visual_id:str,body:QualityRepair,request:Request):
    if body.auto_render:
        require_isolated_renderer()
        return request.app.state.visual.repair_preview(project_id,visual_id,body.confirmed,body.max_requests,auto_render=True)
    return request.app.state.visual.repair_preview(project_id,visual_id,body.confirmed,body.max_requests)


@router.post('/{visual_id}/preview-transfer',status_code=202)
def preview_transfer(project_id:str,visual_id:str,body:Approval,request:Request):
    return request.app.state.visual.preview_transfer(project_id,visual_id,body.confirmed,body.sha256)


@router.post('/{visual_id}/accept')
def accept(project_id:str,visual_id:str,body:Approval,request:Request):
    return request.app.state.visual.accept(project_id,visual_id,body.confirmed,body.sha256)


@router.post('/{visual_id}/cancel')
def cancel(project_id:str,visual_id:str,body:Body,request:Request):
    return request.app.state.visual.cancel(project_id,visual_id)


@router.get('/{visual_id}/files/{name:path}')
def file(project_id:str,visual_id:str,name:str,request:Request):
    from services.visual.worker import job_directory,checked_file
    if not re.fullmatch(r'(?:source\.txt|design\.json|video\.mp4|video\.srt|stills/frame-\d+\.png)',name):
        raise StoreError('not_found','Visual file not found')
    job=request.app.state.visual.get_raw(project_id,visual_id)
    if job['state']!='succeeded':raise StoreError('not_ready','Visual file is not published')
    checksum=(job.get('result') or {}).get('_files',{}).get(name)
    if not isinstance(checksum,str):raise StoreError('not_found','Visual file not found')
    try:path=checked_file(job_directory(visual_id),name)
    except (OSError,ValueError):raise StoreError('assets','Visual file integrity check failed') from None
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    if digest.hexdigest()!=checksum:
        raise StoreError('assets','Visual file integrity check failed')
    media='text/plain; charset=utf-8' if name.endswith(('.txt','.srt')) else 'application/json' if name.endswith('.json') else 'image/png' if name.endswith('.png') else 'video/mp4'
    return FileResponse(path,media_type=media,filename=Path(name).name if name in ('video.mp4','video.srt') else None,
                        headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})
