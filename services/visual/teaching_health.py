"""Database-backed teaching liveness, independent of Celery task execution."""
from contextlib import contextmanager
from threading import Event, Thread
import uuid

from services.projects.store import StoreError


_ROLES = frozenset({'teaching-plan', 'teaching-render', 'scheduler'})
_SCHEMA_VERSION = 'teaching-worker:1'
_BEAT_SECONDS = 10


def _role(value):
    if not isinstance(value, str) or value not in _ROLES:
        raise StoreError('validation', 'Expected a teaching worker role')
    return value


def _unavailable():
    return StoreError('teaching_unavailable', 'Required teaching workers are unavailable')


class WorkerHealth:
    def __init__(self, store):
        self.store = store

    def initialize(self):
        try:
            with self.store.connection() as conn:
                conn.execute('''CREATE TABLE IF NOT EXISTS teaching_worker_health (
                    role text NOT NULL,
                    instance_id uuid NOT NULL,
                    schema_version text NOT NULL,
                    expires_at timestamptz NOT NULL,
                    PRIMARY KEY (role, instance_id)
                )''')
        except Exception:
            raise _unavailable() from None

    def beat(self, role, instance_id):
        role = _role(role)
        try:
            if not isinstance(instance_id, (str, uuid.UUID)):
                raise ValueError()
            instance_id = str(uuid.UUID(str(instance_id)))
        except ValueError:
            raise StoreError('validation', 'Expected a worker instance UUID') from None
        try:
            with self.store.connection() as conn:
                conn.execute('''INSERT INTO teaching_worker_health (role, instance_id, schema_version, expires_at)
                    VALUES (%s, %s, %s, clock_timestamp() + interval '45 seconds')
                    ON CONFLICT (role, instance_id) DO UPDATE
                    SET schema_version=EXCLUDED.schema_version, expires_at=EXCLUDED.expires_at''',
                             [role, instance_id, _SCHEMA_VERSION])
        except Exception:
            raise _unavailable() from None

    def ready(self, roles):
        if isinstance(roles, (str, bytes)):
            return False
        try:
            roles = tuple(roles)
        except TypeError:
            return False
        if not roles or any(not isinstance(role, str) or role not in _ROLES for role in roles):
            return False
        try:
            with self.store.connection() as conn:
                row = conn.execute('''SELECT count(DISTINCT role) AS n FROM teaching_worker_health
                    WHERE role=ANY(%s) AND schema_version=%s AND expires_at>clock_timestamp()''',
                                   [list(set(roles)), _SCHEMA_VERSION]).fetchone()
                return row['n'] == len(set(roles))
        except Exception:
            return False

    def require_ready(self, roles):
        if not self.ready(roles):
            raise _unavailable() from None

    @contextmanager
    def lease(self, role, *, retry_initial=False):
        role = _role(role)
        instance_id = str(uuid.uuid4())
        try:self.beat(role, instance_id)
        except StoreError:
            if not retry_initial:raise
        stopped = Event()

        def renew():
            while not stopped.wait(_BEAT_SECONDS):
                try:
                    self.beat(role, instance_id)
                except StoreError:
                    pass  # No cached readiness; failed writes age out by the database clock.

        thread = Thread(target=renew, name='teaching-health-' + role, daemon=True)
        try:
            thread.start()
            yield instance_id
        finally:
            stopped.set()
            if thread.ident is not None:
                thread.join()  # Finish any in-flight write before deleting, preventing resurrection.
            try:
                with self.store.connection() as conn:
                    conn.execute('DELETE FROM teaching_worker_health WHERE role=%s AND instance_id=%s',
                                 [role, instance_id])
            except Exception:
                pass  # Cleanup is best effort; TTL remains authoritative if the database is unavailable.
