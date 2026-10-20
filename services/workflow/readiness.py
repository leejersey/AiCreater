"""Observe queue subscriptions only; never import or dispatch workflow tasks."""
from datetime import datetime, timezone
import os
from urllib.parse import urlsplit

from celery import Celery


def inspect_consumers():
    result = {'checked_at': datetime.now(timezone.utc).isoformat(), 'code': 'checked',
              'queues': {name: {'state': 'unknown', 'responders': 0} for name in ['workflow', 'render']}}
    broker = os.getenv('CELERY_BROKER_URL', 'redis://127.0.0.1:16379/0')
    try:
        url = urlsplit(broker)
        if url.scheme != 'redis' or url.hostname not in ['127.0.0.1', 'localhost', 'redis'] or url.port is None:
            raise ValueError()
    except ValueError:
        return {**result, 'code': 'configuration'}
    client = None
    try:
        client = Celery('aicreater-inspect', broker=broker, set_as_current=False)
        client.conf.update(accept_content=['json'], broker_connection_retry=False,
                           broker_connection_retry_on_startup=False, broker_connection_max_retries=0,
                           broker_transport_options={'socket_connect_timeout': 1, 'socket_timeout': 1,
                                                     'retry_on_timeout': False, 'max_retries': 0})
        reply = client.control.inspect(timeout=1).active_queues()
    except Exception:
        return {**result, 'code': 'inspection_failed'}
    finally:
        if client is not None:
            try: client.close()
            except Exception: pass  # Control-client cleanup must not expose broker details.
    try:
        if reply is None: reply = {}
        if not isinstance(reply, dict) or len(reply) > 256: raise ValueError()
        counts = {'workflow': 0, 'render': 0}
        for node, queues in reply.items():
            if not isinstance(node, str) or not node or not isinstance(queues, list) or len(queues) > 128:
                raise ValueError()
            names = set()
            for queue in queues:
                if not isinstance(queue, dict) or not isinstance(queue.get('name'), str) or not queue['name'] or queue['name'] in names:
                    raise ValueError()
                names.add(queue['name'])
            for name in counts: counts[name] += int(name in names)
        result['queues'] = {name: {'state': 'detected' if count else 'not_detected', 'responders': count}
                            for name, count in counts.items()}
        return result
    except (ValueError, TypeError):
        return {**result, 'code': 'invalid_response'}
