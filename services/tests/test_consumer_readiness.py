import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from services.workflow.readiness import inspect_consumers


class ConsumerReadinessTests(unittest.TestCase):
    def inspect(self, reply=None, error=None):
        with patch.dict('os.environ', {'CELERY_BROKER_URL':'redis://127.0.0.1:16379/0'}), patch('services.workflow.readiness.Celery') as factory:
            client=factory.return_value
            probe=client.control.inspect.return_value.active_queues
            probe.return_value=reply
            probe.side_effect=error
            result=inspect_consumers()
            factory.assert_called_once_with('aicreater-inspect',broker='redis://127.0.0.1:16379/0',set_as_current=False)
            self.assertEqual(set(result),{'checked_at','code','queues'})
            self.assertEqual(set(result['queues']),{'workflow','render'})
            self.assertTrue(result['checked_at'].endswith('+00:00'))
            client.close.assert_called_once()
            client.send_task.assert_not_called()
            factory.return_value.control.broadcast.assert_not_called()
            config=client.conf.update.call_args.kwargs
            self.assertEqual(config['broker_connection_max_retries'],0)
            self.assertEqual(config['broker_transport_options']['socket_timeout'],1)
            self.assertEqual(config['broker_transport_options']['socket_connect_timeout'],1)
            self.assertEqual(client.control.inspect.call_args.kwargs,{'timeout':1})
            return result

    def test_each_queue_counts_only_its_subscribers_without_leaking_names(self):
        result=self.inspect({'private-worker-a':[{'name':'workflow'},{'name':'unrelated'}], 'private-worker-b':[{'name':'render'},{'name':'workflow'}]})
        self.assertEqual(result['queues'],{'workflow':{'state':'detected','responders':2},'render':{'state':'detected','responders':1}})
        self.assertNotIn('private-worker',json.dumps(result))

    def test_one_responding_queue_does_not_imply_other_lane_online(self):
        result=self.inspect({'n':[{'name':'render'}]})
        self.assertEqual(result['queues']['workflow'],{'state':'not_detected','responders':0})
        self.assertEqual(result['queues']['render']['state'],'detected')

    def test_no_reply_is_not_detected_not_an_offline_claim(self):
        for reply in [None,{}, {'n':[]}]:
            with self.subTest(reply=reply):
                result=self.inspect(reply)
                self.assertEqual(result['code'],'checked')
                self.assertTrue(all(v=={'state':'not_detected','responders':0} for v in result['queues'].values()))

    def test_malformed_metadata_is_unknown_not_success(self):
        for reply in [[],{'n':None},{'n':[None]},{'n':[{'name':42}]},{'n':[{'name':'workflow'},{'name':'workflow'}]}]:
            with self.subTest(reply=reply):
                result=self.inspect(reply)
                self.assertEqual(result['code'],'invalid_response')
                self.assertTrue(all(v=={'state':'unknown','responders':0} for v in result['queues'].values()))

    def test_failure_never_returns_exception_or_broker_secrets(self):
        result=self.inspect(error=OSError('redis://user:private-secret@private-host:6379/1'))
        self.assertEqual(result['code'],'inspection_failed')
        self.assertNotIn('private',json.dumps(result))
        self.assertTrue(all(v['state']=='unknown' for v in result['queues'].values()))

    def test_nonlocal_or_invalid_broker_does_not_create_client(self):
        for broker in ['amqp://localhost:5672','redis://example.com:6379/0','redis://127.0.0.1/bad','redis://localhost:bad/0']:
            with self.subTest(broker=broker), patch.dict('os.environ',{'CELERY_BROKER_URL':broker}), patch('services.workflow.readiness.Celery') as factory:
                self.assertEqual(inspect_consumers()['code'],'configuration')
                factory.assert_not_called()

    def test_local_route_is_nocache_and_never_touches_database(self):
        from services.api.app import create_app
        fake={'checked_at':'2026-10-15T00:00:00+00:00','code':'checked','queues':{name:{'state':'not_detected','responders':0} for name in ['workflow','render']}}
        # No lifespan: metadata route must not depend on Store/Jobs initialization.
        with patch('services.api.app.inspect_consumers',return_value=fake):
            client=TestClient(create_app(authentication=False),base_url='http://127.0.0.1:8000',client=('127.0.0.1',50000))
            response=client.get('/api/consumers')
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json(),fake)
            self.assertEqual(response.headers['cache-control'],'no-store')
            self.assertEqual(client.post('/api/consumers').status_code,405)
            rejected=client.get('/api/consumers',headers={'Host':'evil.example'})
            self.assertEqual(rejected.status_code,403)


if __name__=='__main__':unittest.main()
