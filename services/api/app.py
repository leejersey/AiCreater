"""Local teaching API with PostgreSQL-owned, Celery-dispatched regeneration jobs."""
from contextlib import asynccontextmanager
import os
import re
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Query, Response, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, ConfigDict, Field

from services.api.local import LocalRequestsMiddleware, ORIGINS
from services.api.accounts import access, router as account_routes
from services.accounts.auth import Accounts
from services.projects.manage import profile
from services.projects.jobs import Jobs
from services.projects.estimates import estimate_project, estimate_retry
from services.projects.store import Store, StoreError
from services.projects.storage import ObjectStore
from services.workflow.manuscript import generate_manuscript
from services.workflow.providers import ProviderError, Settings
from services.workflow.storyboard import ROOT
from services.workflow.readiness import inspect_consumers


class Body(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class GenerateManuscript(Body):
    title: str = Field(min_length=1, max_length=80)
    audience: str = Field(default='', max_length=80)
    duration_hint: str = Field(default='', max_length=40)
    outline: str = Field(default='', max_length=1000)
    teaching_style: Literal['popular', 'technical'] = 'popular'


class CreateProject(Body):
    title: str = Field(min_length=1, max_length=80)
    source_text: str = Field(min_length=1, max_length=4000)
    mode: Literal['script'] = 'script'
    teaching_style: Literal['popular', 'technical'] = 'popular'


class ImportProject(Body):
    title: str = Field(min_length=1, max_length=80)
    dsl: dict[str, Any]


class Render(Body):
    version_id: str


class Revision(Body):
    expected_revision: int = Field(ge=1)


class NewScene(Revision):
    narration_text: str = Field(min_length=1, max_length=4000)
    content: str = Field(min_length=1, max_length=40)


class NewConceptScene(Revision):
    narration_text: str = Field(min_length=1, max_length=4000)
    elements: list[dict[str, Any]] = Field(min_length=1, max_length=6)


class SceneRevision(Revision):
    expected_scene_revision: int = Field(ge=1)


class DeleteScene(SceneRevision):
    confirmed: bool


class VoiceScene(Revision):
    scene_id: str


class BatchVoice(Revision):
    confirmed: bool
    scenes: list[VoiceScene] = Field(min_length=1, max_length=20)


class CostEstimate(Revision):
    operation: Literal['generate', 'regenerate', 'voice', 'batch_voice']
    scenes: list[VoiceScene] = Field(default_factory=list, max_length=20)


class ProjectVoice(Revision):
    speaker: str = Field(min_length=1, max_length=200)


class VisualStyle(Revision):
    visual_style: str = Field(min_length=1,max_length=80)


class TeachingStyle(Revision):
    teaching_style: Literal['popular', 'technical']


class DeleteProject(Revision):
    confirmed: bool


class Theme(Revision):
    theme: Literal['tech_explainer', 'tech_multicolor', 'light_teaching', 'color_infographic']


class ChartConfiguration(Revision):
    confirmed: bool
    chart: dict[str, Any]
    elements: list[dict[str, Any]]


class EditScene(Revision):
    changes: dict[str, Any]


class Reorder(Revision):
    scene_ids: list[str]


def _provider_error_status(code):
    if code in ('output_limit', 'input_limit'):
        return 422
    if code in ('missing_setting', 'invalid_auth', 'invalid_setting'):
        return 503
    return 502


def create_app(store=None, *, authentication=True):
    @asynccontextmanager
    async def lifespan(app):
        configured = store
        if configured is None:
            load_dotenv(ROOT / '.env', override=False)
            dsn = os.getenv('DATABASE_URL')
            if not dsn: raise RuntimeError('Configure DATABASE_URL locally before starting the API')
            configured = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
        configured.initialize()
        app.state.store = configured
        app.state.authentication = authentication
        app.state.accounts = Accounts(configured)
        app.state.jobs = Jobs(configured, model=os.getenv('DEEPSEEK_MODEL', 'deepseek-flash'))
        yield

    app = FastAPI(title='Teaching Projects', lifespan=lifespan, docs_url=None, redoc_url=None,
                  dependencies=[Depends(access)])
    app.state.authentication = authentication
    app.include_router(account_routes)
    app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS),
                       allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Content-Type'])
    app.add_middleware(LocalRequestsMiddleware)

    @app.exception_handler(StoreError)
    async def store_error(request, error):
        status = {'not_found': 404, 'conflict': 409, 'not_ready': 409, 'validation': 422,
                  'assets': 422, 'timing_cache': 422, 'database': 503, 'storage': 503, 'invalid_profile': 503,
                  'unauthorized': 401, 'rate_limit': 429, 'content_type': 415}.get(error.code, 400)
        response = {'code': error.code, 'message': str(error)}
        if error.code == 'validation':
            response['validation_errors'] = [
                {'path': e['path'], 'code': e['code'], 'message': 'Invalid project field'}
                for e in error.validation_errors[:20]] or [
                    {'path': '/', 'code': 'invalid_draft', 'message': 'Invalid teaching draft'}]
        return JSONResponse(response, status_code=status,
                            headers={'Retry-After':'900'} if error.code=='rate_limit' else None)

    @app.exception_handler(RequestValidationError)
    async def request_error(request, error):
        return JSONResponse({'code': 'validation', 'message': 'Invalid request', 'validation_errors': [
            {'path': '/' + '/'.join(map(str, e['loc'][:-1] if e['type'] == 'extra_forbidden' else e['loc'])),
             'code': e['type'], 'message': 'Invalid request field'}
            for e in error.errors()[:20]]}, status_code=422)

    @app.get('/health')
    def health(request: Request):
        with request.app.state.store.connection() as conn: conn.execute('SELECT 1')
        return {'status': 'ready'}

    @app.get('/api/consumers')
    def consumers():
        return JSONResponse(inspect_consumers(), headers={'Cache-Control': 'no-store'})

    @app.post('/api/manuscripts/generate')
    def manuscript_generate(body: GenerateManuscript, request: Request):
        try:
            settings = Settings.from_env()
            with httpx.Client(timeout=120) as client:
                text = generate_manuscript(body.title, settings, client, audience=body.audience,
                    duration_hint=body.duration_hint, outline=body.outline,
                    user_id=getattr(request.state, 'user', {}).get('id'),
                    teaching_style=body.teaching_style)
        except ProviderError as exc:
            return JSONResponse({'code': exc.code, 'message': str(exc)},
                                status_code=_provider_error_status(exc.code))
        return {'text': text}

    @app.post('/api/projects', status_code=201)
    def create(body: CreateProject, request: Request):
        return request.app.state.store.create_project(body.title, body.source_text,
            getattr(request.state, 'user', {}).get('id'), teaching_style=body.teaching_style)

    @app.post('/api/projects/import', status_code=201)
    def import_ready(body: ImportProject, request: Request):
        return request.app.state.store.import_project(body.title, body.dsl, getattr(request.state,'user',{}).get('id'))

    @app.get('/api/projects/{project_id}')
    def get_project(project_id: str, request: Request):
        return request.app.state.store.get_project(project_id)

    @app.get('/api/projects')
    def projects(request: Request):
        return request.app.state.store.list_projects(getattr(request.state,'user',{}).get('id'))

    @app.get('/api/projects/{project_id}/assets/{asset_id}')
    def audio(project_id: str, asset_id: str, request: Request):
        return FileResponse(request.app.state.store.asset_file(project_id, asset_id), media_type='audio/wav')

    @app.get('/api/projects/{project_id}/usage')
    def project_usage(project_id: str, request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return request.app.state.jobs.project_usage(project_id)

    @app.get('/api/projects/{project_id}/jobs')
    def project_jobs(project_id: str, request: Request):
        request.app.state.jobs.recover()
        return [public_job(row) for row in request.app.state.jobs.list_project(project_id)]

    @app.patch('/api/scenes/{scene_id}')
    def edit_scene(scene_id: str, body: EditScene, request: Request):
        return request.app.state.store.edit_scene(scene_id, body.expected_revision, body.changes)

    @app.patch('/api/scenes/{scene_id}/chart')
    def chart(scene_id: str, body: ChartConfiguration, request: Request):
        return request.app.state.store.set_chart(scene_id, body.expected_revision, body.chart, body.elements, body.confirmed)

    @app.patch('/api/projects/{project_id}/visual-style')
    def project_visual_style(project_id:str,body:VisualStyle,request:Request):
        return request.app.state.store.set_visual_style(project_id,body.expected_revision,body.visual_style)

    @app.patch('/api/projects/{project_id}/teaching-style')
    def project_teaching_style(project_id: str, body: TeachingStyle, request: Request):
        return request.app.state.store.set_teaching_style(project_id, body.expected_revision, body.teaching_style)

    @app.patch('/api/projects/{project_id}/voice')
    def project_voice(project_id: str, body: ProjectVoice, request: Request):
        return request.app.state.store.set_voice(project_id, body.expected_revision, body.speaker)

    @app.patch('/api/projects/{project_id}/theme')
    def theme(project_id: str, body: Theme, request: Request):
        return request.app.state.store.set_theme(project_id, body.expected_revision, body.theme)

    @app.post('/api/projects/{project_id}/delete')
    def delete_project(project_id: str, body: DeleteProject, request: Request):
        request.app.state.store.delete_project(project_id, body.expected_revision, body.confirmed)
        return {'ok': True}

    @app.post('/api/projects/{project_id}/scenes', status_code=201)
    def add_scene(project_id: str, body: NewScene, request: Request):
        return request.app.state.store.add_scene(project_id, body.expected_revision, body.narration_text, body.content)

    @app.post('/api/projects/{project_id}/scenes/concept', status_code=201)
    def add_concept_scene(project_id: str, body: NewConceptScene, request: Request):
        return request.app.state.store.add_concept_scene(project_id, body.expected_revision, body.narration_text, body.elements)

    @app.post('/api/projects/{project_id}/scenes/{scene_id}/duplicate', status_code=201)
    def duplicate_scene(project_id: str, scene_id: str, body: SceneRevision, request: Request):
        return request.app.state.store.duplicate_scene(project_id, body.expected_revision, scene_id, body.expected_scene_revision)

    @app.post('/api/projects/{project_id}/scenes/{scene_id}/delete')
    def delete_scene(project_id: str, scene_id: str, body: DeleteScene, request: Request):
        return request.app.state.store.delete_scene(project_id, body.expected_revision, scene_id, body.expected_scene_revision, body.confirmed)

    @app.post('/api/projects/{project_id}/scenes/reorder')
    def reorder(project_id: str, body: Reorder, request: Request):
        return request.app.state.store.reorder(project_id, body.expected_revision, body.scene_ids)

    @app.post('/api/projects/{project_id}/versions', status_code=201)
    def version(project_id: str, body: Revision, request: Request):
        return request.app.state.store.create_version(project_id, body.expected_revision)

    @app.get('/api/projects/{project_id}/versions')
    def versions(project_id: str, request: Request, before_revision: int | None = Query(default=None, ge=1, le=2147483647)):
        return request.app.state.store.list_versions(project_id, before_revision)

    @app.get('/api/versions/{version_id}')
    def get_version(version_id: str, request: Request):
        return request.app.state.store.get_version(version_id)

    @app.get('/api/scenes/{scene_id}/candidates')
    def candidates(scene_id: str, request: Request):
        return request.app.state.store.get_candidates(scene_id)

    @app.post('/api/scenes/{scene_id}/candidates/{candidate_id}/accept')
    def accept(scene_id: str, candidate_id: str, body: Revision, request: Request):
        return request.app.state.store.accept_candidate(scene_id, candidate_id, body.expected_revision)

    def public_job(row):
        keys = ['project_id', 'scene_id', 'kind', 'state', 'stage', 'progress', 'base_revision', 'attempts',
                'cancel_requested', 'created_at', 'started_at', 'ended_at', 'heartbeat_at', 'error', 'result', 'voice_current']
        result = {'job_id': row['id'], **{k: row.get(k) for k in keys}}
        if (row.get('input') or {}).get('protocol_version') in ['scene-preview:1','scene-preview:2']:
            result.update(scope='scene', preview_scene_id=row['input']['scene_id'])
        return result

    @app.post('/api/projects/{project_id}/estimate')
    def project_estimate(project_id: str, body: CostEstimate, request: Request):
        result = estimate_project(request.app.state.store, request.app.state.jobs.model, project_id,
            body.expected_revision, body.operation, [s.model_dump() for s in body.scenes])
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})

    @app.get('/api/jobs/{job_id}/estimate')
    def job_estimate(job_id: str, request: Request):
        return JSONResponse(estimate_retry(request.app.state.store, job_id), headers={'Cache-Control': 'no-store'})

    @app.post('/api/projects/{project_id}/generate', status_code=202)
    def generate(project_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_generate(project_id, body.expected_revision))

    @app.post('/api/scenes/{scene_id}/preview', status_code=202)
    def preview(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_preview(scene_id, body.expected_revision))

    @app.post('/api/scenes/{scene_id}/timing', status_code=202)
    def timing(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_timing(scene_id, body.expected_revision))

    @app.post('/api/projects/{project_id}/timing', status_code=202)
    def batch_timing(project_id: str, body: BatchVoice, request: Request):
        rows = request.app.state.jobs.submit_batch_timing(project_id, body.expected_revision,
            [scene.model_dump() for scene in body.scenes], body.confirmed)
        return [public_job(row) for row in rows]

    @app.post('/api/projects/{project_id}/voice', status_code=202)
    def batch_voice(project_id: str, body: BatchVoice, request: Request):
        rows = request.app.state.jobs.submit_batch_voice(project_id, body.expected_revision,
            [scene.model_dump() for scene in body.scenes], body.confirmed)
        return [public_job(row) for row in rows]

    @app.post('/api/scenes/{scene_id}/voice', status_code=202)
    def voice(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_voice(scene_id, body.expected_revision))

    @app.post('/api/scenes/{scene_id}/regenerate', status_code=202)
    def regenerate(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_regenerate(scene_id, body.expected_revision))

    @app.post('/api/projects/{project_id}/render', status_code=202)
    def render(project_id: str, body: Render, request: Request):
        return public_job(request.app.state.jobs.submit_render(project_id, body.version_id))

    @app.get('/api/renders/{job_id}')
    def render_info(job_id: str, request: Request):
        job = request.app.state.jobs.get(job_id)
        if job['kind'] != 'render': raise StoreError('not_found', 'Render not found')
        downloads = []
        if job['state'] == 'succeeded':
            result = job.get('result')
            checksums = result.get('checksums') if isinstance(result, dict) else None
            for extension in ['mp4', 'srt']:
                digest = checksums.get(extension) if isinstance(checksums, dict) else None
                if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
                    raise StoreError('assets', 'Published render metadata unavailable')
                downloads.append({'extension': extension, 'url': f"/api/jobs/{job['id']}/files/{extension}", 'sha256': digest})
        return {**public_job(job), 'downloads': downloads}

    @app.get('/api/jobs/{job_id}/files/{extension}')
    def download(job_id: str, extension: Literal['mp4', 'srt'], request: Request):
        file = request.app.state.jobs.render_file(job_id, extension)
        return FileResponse(file, filename='teaching.' + extension,
                            media_type='video/mp4' if extension == 'mp4' else 'application/x-subrip')

    @app.get('/api/jobs/{job_id}')
    def get_job(job_id: str, request: Request):
        request.app.state.jobs.recover()
        return public_job(request.app.state.jobs.get(job_id))

    @app.post('/api/jobs/{job_id}/cancel')
    def cancel_job(job_id: str, request: Request, body: Body = Body()):
        return public_job(request.app.state.jobs.cancel(job_id))

    @app.post('/api/jobs/{job_id}/retry', status_code=202)
    def retry_job(job_id: str, request: Request, body: Body = Body()):
        return public_job(request.app.state.jobs.retry(job_id))

    return app


app = create_app()
