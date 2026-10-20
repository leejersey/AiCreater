import asyncio
import unittest
from unittest.mock import patch

from services.api.local import LocalRequestsMiddleware


class LocalBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def execute(self, receive):
        messages, reached = [], []
        async def send(message): messages.append(message)
        async def app(scope, receive, send): reached.append(True)
        scope = {'type': 'http', 'method': 'POST', 'path': '/api/projects',
                 'client': ('127.0.0.1', 50000), 'headers': [(b'host', b'127.0.0.1:8000')]}
        await LocalRequestsMiddleware(app)(scope, receive, send)
        return messages, reached

    async def test_chunked_body_without_length_is_cumulatively_bounded(self):
        chunks = iter([{'type': 'http.request', 'body': b'x' * (300 * 1024), 'more_body': True},
                       {'type': 'http.request', 'body': b'x' * (300 * 1024), 'more_body': False}])
        async def receive(): return next(chunks)
        messages, reached = await self.execute(receive)
        self.assertEqual(messages[0]['status'], 413)
        self.assertFalse(reached)

    async def test_slow_body_has_wall_clock_budget(self):
        async def receive():
            await asyncio.sleep(0.1)
            return {'type': 'http.request', 'body': b'x', 'more_body': True}
        with patch('services.api.local.BODY_TIMEOUT', 0.01):
            messages, reached = await self.execute(receive)
        self.assertEqual(messages[0]['status'], 408)
        self.assertFalse(reached)
