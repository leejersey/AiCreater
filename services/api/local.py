"""Loopback-only HTTP boundary, including bounded streamed request bodies."""
import asyncio
import os
from starlette.responses import JSONResponse

API_PORT = int(os.environ.get('AICREATER_API_PORT') or 8000)  # see services/workbench.py
HOSTS = {f'localhost:{API_PORT}', f'127.0.0.1:{API_PORT}', f'[::1]:{API_PORT}'}
ORIGINS = {'http://localhost:3000', 'http://127.0.0.1:3000',
           f'http://localhost:{API_PORT}', f'http://127.0.0.1:{API_PORT}'}
MAX_BODY = 512 * 1024
# Video uploads stream straight to the route, which writes them to disk with its own size and time limits.
STREAMED = {('POST', '/api/studio/breakdowns/upload')}
BODY_TIMEOUT = 15


class LocalRequestsMiddleware:
    def __init__(self, app): self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {k.lower(): v for k, v in scope.get('headers', [])}
        host = headers.get(b'host', b'').decode('latin-1').lower()
        origin = headers.get(b'origin')
        async def reject(status, code):
            await JSONResponse({'code': code, 'message': 'Request rejected'}, status_code=status)(scope, receive, send)
        peer = scope.get('client')
        if (not peer or peer[0] not in {'127.0.0.1', '::1'} or host not in HOSTS or
                (origin is not None and origin.decode('latin-1') not in ORIGINS)):
            return await reject(403, 'local_only')
        if (scope.get('method'), scope.get('path')) in STREAMED:
            return await self.app(scope, receive, send)
        deadline = asyncio.get_running_loop().time() + BODY_TIMEOUT
        chunks, size = [], 0
        while True:
            try:
                message = await asyncio.wait_for(receive(), max(0, deadline - asyncio.get_running_loop().time()))
            except asyncio.TimeoutError:
                return await reject(408, 'body_timeout')
            if message['type'] == 'http.disconnect': return
            chunk = message.get('body', b'')
            size += len(chunk)
            if size > MAX_BODY: return await reject(413, 'body_limit')
            if chunk: chunks.append(chunk)
            if not message.get('more_body', False): break
        consumed = False
        async def buffered_receive():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {'type': 'http.request', 'body': b''.join(chunks), 'more_body': False}
            return await receive()
        async def private_send(message):
            if message['type']=='http.response.start' and scope['path'].startswith('/api/'):
                message={**message,'headers':[(k,v) for k,v in message.get('headers',[]) if k.lower()!=b'cache-control']+
                         [(b'cache-control',b'no-store')]}
            await send(message)
        await self.app(scope, buffered_receive, private_send)
