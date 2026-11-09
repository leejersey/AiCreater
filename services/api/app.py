"""Local teaching API: accounts, projects, voice and timing jobs, and the visual (Scene Agent) routes."""
from contextlib import asynccontextmanager
import os
from typing import Literal

import httpx
from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel, ConfigDict, Field

from services.api.local import LocalRequestsMiddleware, ORIGINS
from services.api.accounts import access, router as account_routes
from services.api.visual import router as visual_routes
from services.visual.store import VisualJobs
from services.accounts.auth import Accounts
from services.projects.manage import profile
from services.projects.jobs import Jobs
from services.projects.estimates import estimate_project, estimate_retry
from services.projects.store import Store, StoreError
from services.projects.storage import ObjectStore
from services.accounts.model_settings import resolve_llm
from services.workflow.manuscript import generate_manuscript
from services.workflow import ideation
from services.workflow.providers import ProviderError
from services.projects.store import ROOT


class Body(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class GenerateManuscript(Body):
    title: str = Field(min_length=1, max_length=80)
    audience: str = Field(default='', max_length=80)
    duration_hint: str = Field(default='', max_length=40)
    outline: str = Field(default='', max_length=1000)
    manuscript_format: Literal['plain', 'markdown'] = 'plain'
    teaching_style: Literal['popular', 'technical'] = 'popular'
    plan: dict | None = None  # {angle, outline} from ideation; checked by services.workflow.ideation


class IdeaContext(Body):
    topic: str = Field(min_length=1, max_length=80)
    notes: str = Field(default='', max_length=300)
    audience: str = Field(default='', max_length=80)
    duration_hint: str = Field(default='', max_length=40)
    teaching_style: Literal['popular', 'technical'] = 'popular'


class IdeaAngles(IdeaContext):
    count: int = Field(default=4, ge=3, le=6)
    exclude: list[str] = Field(default_factory=list, max_length=30)
    custom: str = Field(default='', max_length=200)
    merge: list[dict] | None = Field(default=None, min_length=2, max_length=2)
    scope: Literal['single'] = 'single'  # a series plugs in here later


class IdeaOutline(IdeaContext):
    angle: dict
    previous: dict | None = None
    feedback: str = Field(default='', max_length=300)


class CreateProject(Body):
    title: str = Field(min_length=1, max_length=80)
    source_text: str = Field(min_length=1, max_length=24000)
    manuscript_format: Literal['plain', 'markdown'] = 'plain'
    mode: Literal['script'] = 'script'
    teaching_style: Literal['popular', 'technical'] = 'popular'
    theme_id: str | None = Field(default=None, max_length=40)
    origin: dict | None = None  # how the video was conceived (ideation); checked by services.workflow.ideation


class Revision(Body):
    expected_revision: int = Field(ge=1)


class VoiceScene(Revision):
    scene_id: str


class CostEstimate(Revision):
    operation: Literal['voice']
    scenes: list[VoiceScene] = Field(default_factory=list, max_length=20)


class ProjectVoice(Revision):
    speaker: str = Field(min_length=1, max_length=200)


class ProjectTheme(Revision):
    theme_id: str = Field(min_length=1, max_length=40)
    accent: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')


class DeleteProject(Revision):
    confirmed: bool


def _provider_error_status(code):
    if code in ('output_limit', 'input_limit', 'unsafe_destination'):
        return 422
    if code in ('missing_setting', 'invalid_auth', 'invalid_setting'):
        return 503
    return 502


EVENT_TICKS = 600  # one per second: an event stream lasts 10 minutes, then the browser reconnects


def create_app(store=None, *, authentication=True):
    @asynccontextmanager
    async def lifespan(app):
        configured = store
        if configured is None:
            from services.config import load_local_config
            load_local_config()
            dsn = os.getenv('DATABASE_URL')
            if not dsn: raise RuntimeError('Configure DATABASE_URL locally before starting the API')
            configured = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
        configured.initialize()
        app.state.store = configured
        app.state.authentication = authentication
        app.state.accounts = Accounts(configured)
        app.state.jobs = Jobs(configured, model=os.getenv('DEEPSEEK_MODEL', 'deepseek-flash'))
        app.state.visual = VisualJobs(configured)
        yield

    app = FastAPI(title='Teaching Projects', lifespan=lifespan, docs_url=None, redoc_url=None,
                  dependencies=[Depends(access)])
    app.state.authentication = authentication
    app.include_router(account_routes)
    app.include_router(visual_routes)
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

    @app.post('/api/manuscripts/generate')
    def manuscript_generate(body: GenerateManuscript, request: Request):
        try:
            llm = resolve_llm(request.app.state.store, getattr(request.state, 'user', {}).get('id'))
            # Direct, never via HTTP(S)_PROXY: the destination check pins the connection to an address it checked.
            with httpx.Client(timeout=120, trust_env=False) as client:
                text = generate_manuscript(body.title, llm, client, audience=body.audience,
                    duration_hint=body.duration_hint, outline=body.outline,
                    user_id=getattr(request.state, 'user', {}).get('id'),
                    teaching_style=body.teaching_style, manuscript_format=body.manuscript_format, plan=body.plan)
        except ProviderError as exc:
            return JSONResponse({'code': exc.code, 'message': str(exc)},
                                status_code=_provider_error_status(exc.code))
        return {'text': text}

    @app.post('/api/ideas/angles')
    def idea_angles(body: IdeaAngles, request: Request):
        user_id = getattr(request.state, 'user', {}).get('id')
        try:
            merge = [ideation.check_angle(a) for a in body.merge] if body.merge else None
            exclude = [ideation._text(t, 40, 'exclude') for t in body.exclude]
        except ValueError as problem:
            return JSONResponse({'code': 'validation', 'message': str(problem)}, status_code=422)
        if body.custom.strip() and merge:
            return JSONResponse({'code': 'validation', 'message': 'custom 与 merge 只能选一个'}, status_code=422)
        try:
            llm = resolve_llm(request.app.state.store, user_id)
            with httpx.Client(timeout=120, trust_env=False) as client:
                angles = ideation.generate_angles(llm, client, topic=body.topic.strip(), notes=body.notes.strip(),
                    audience=body.audience.strip(), duration_hint=body.duration_hint.strip(), teaching_style=body.teaching_style,
                    count=body.count, exclude=exclude, custom=body.custom.strip(), merge=merge, user_id=user_id)
        except ProviderError as exc:
            return JSONResponse({'code': exc.code, 'message': str(exc)}, status_code=_provider_error_status(exc.code))
        return {'angles': angles}

    @app.post('/api/ideas/outline')
    def idea_outline(body: IdeaOutline, request: Request):
        user_id = getattr(request.state, 'user', {}).get('id')
        try:
            angle = ideation.check_angle(body.angle)
            previous = ideation.check_outline(body.previous) if body.previous is not None else None
        except ValueError as problem:
            return JSONResponse({'code': 'validation', 'message': str(problem)}, status_code=422)
        if (previous is None) != (not body.feedback.strip()):
            return JSONResponse({'code': 'validation', 'message': '修改意见需要和上一版大纲一起提交'}, status_code=422)
        try:
            llm = resolve_llm(request.app.state.store, user_id)
            with httpx.Client(timeout=120, trust_env=False) as client:
                outline = ideation.generate_outline(llm, client, topic=body.topic.strip(), angle=angle, notes=body.notes.strip(),
                    audience=body.audience.strip(), duration_hint=body.duration_hint.strip(), teaching_style=body.teaching_style,
                    previous=previous, feedback=body.feedback.strip(), user_id=user_id)
        except ProviderError as exc:
            return JSONResponse({'code': exc.code, 'message': str(exc)}, status_code=_provider_error_status(exc.code))
        return {'outline': outline}

    @app.post('/api/projects', status_code=201)
    def create(body: CreateProject, request: Request):
        project = request.app.state.store.create_project(body.title, body.source_text,
            getattr(request.state, 'user', {}).get('id'), teaching_style=body.teaching_style, theme_id=body.theme_id, origin=body.origin,
            **({'manuscript_format': 'markdown'} if body.manuscript_format == 'markdown' else {}))
        # Chapters right away (free, local): the workbench opens ready to voice.
        return request.app.state.visual.prepare(project['id'], project['revision'])

    @app.get('/api/projects/{project_id}')
    def get_project(project_id: str, request: Request):
        return request.app.state.store.get_project(project_id)

    @app.get('/api/projects')
    def projects(request: Request):
        return request.app.state.store.list_projects(getattr(request.state,'user',{}).get('id'))

    @app.get('/api/projects/{project_id}/assets/{asset_id}')
    def media(project_id: str, asset_id: str, request: Request):
        file = request.app.state.store.asset_file(project_id, asset_id)
        mime = {'.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.mp3':'audio/mpeg', '.m4a':'audio/mp4'}.get(file.suffix.lower(), 'audio/wav')
        return FileResponse(file, media_type=mime, headers={'X-Content-Type-Options':'nosniff'})

    @app.get('/api/projects/{project_id}/events')
    async def project_events(project_id: str, request: Request):
        """Server-sent events: `change` whenever the course or one of its jobs changes, so the page refreshes at once
        instead of polling. Ends after 10 minutes; EventSource reconnects by itself."""
        import asyncio, hashlib
        store = request.app.state.store
        store.get_project(project_id)  # 404 before streaming
        def signature():
            with store.connection() as conn:
                row = conn.execute('''SELECT p.revision, p.config->'autopilot' AS pilot,
                    (SELECT string_agg(j.id::text||j.state||j.stage||coalesce(j.heartbeat_at::text,'')||coalesce(j.ended_at::text,''), ',' ORDER BY j.id)
                     FROM jobs j WHERE j.project_id=p.id AND (j.state IN ('queued','running') OR j.ended_at > now() - interval '15 minutes')) AS jobs
                    FROM projects p WHERE p.id=%s''', [project_id]).fetchone()
            return hashlib.sha256(repr(tuple(row.values()) if row else ()).encode()).hexdigest()[:16]
        async def stream():
            last, quiet = None, 0
            for _ in range(EVENT_TICKS):
                if await request.is_disconnected(): return
                current = await asyncio.to_thread(signature)
                if current != last:
                    last, quiet = current, 0
                    yield f'event: change\ndata: {current}\n\n'
                else:
                    quiet += 1
                    if quiet % 15 == 0: yield ': keep-alive\n\n'
                await asyncio.sleep(1)
        return StreamingResponse(stream(), media_type='text/event-stream',
                                 headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})

    @app.get('/api/projects/{project_id}/jobs')
    def project_jobs(project_id: str, request: Request):
        request.app.state.jobs.recover()
        return [public_job(row) for row in request.app.state.jobs.list_project(project_id)]

    @app.patch('/api/projects/{project_id}/voice')
    def project_voice(project_id: str, body: ProjectVoice, request: Request):
        return request.app.state.store.set_voice(project_id, body.expected_revision, body.speaker)

    @app.patch('/api/projects/{project_id}/theme')
    def project_theme(project_id: str, body: ProjectTheme, request: Request):
        return request.app.state.store.set_theme(project_id, body.expected_revision, body.theme_id, body.accent)

    @app.get('/api/themes')
    def theme_list():
        from services import themes
        return themes.summaries()

    @app.post('/api/projects/{project_id}/delete')
    def delete_project(project_id: str, body: DeleteProject, request: Request):
        request.app.state.store.delete_project(project_id, body.expected_revision, body.confirmed)
        return {'ok': True}

    def public_job(row):
        keys = ['project_id', 'scene_id', 'kind', 'state', 'stage', 'progress', 'base_revision', 'attempts',
                'cancel_requested', 'created_at', 'started_at', 'ended_at', 'heartbeat_at', 'error', 'result', 'voice_current']
        return {'job_id': row['id'], **{k: row.get(k) for k in keys}}

    @app.post('/api/projects/{project_id}/estimate')
    def project_estimate(project_id: str, body: CostEstimate, request: Request):
        result = estimate_project(request.app.state.store, request.app.state.jobs.model, project_id,
            body.expected_revision, body.operation, [s.model_dump() for s in body.scenes])
        return JSONResponse(result, headers={'Cache-Control': 'no-store'})

    @app.get('/api/jobs/{job_id}/estimate')
    def job_estimate(job_id: str, request: Request):
        return JSONResponse(estimate_retry(request.app.state.store, job_id), headers={'Cache-Control': 'no-store'})

    @app.post('/api/scenes/{scene_id}/timing', status_code=202)
    def timing(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_timing(scene_id, body.expected_revision))

    @app.post('/api/scenes/{scene_id}/voice', status_code=202)
    def voice(scene_id: str, body: Revision, request: Request):
        return public_job(request.app.state.jobs.submit_voice(scene_id, body.expected_revision))

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
