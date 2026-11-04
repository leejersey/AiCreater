"""One job table, one lease policy. Voice and timing (services.projects.jobs) and the Scene Agent and course export
(services.visual.store) share claiming, heartbeats, expiry and cancellation here; each module adds its own inputs,
results and public shape."""
import uuid

from psycopg.types.json import Jsonb

from services.projects.store import StoreError, identifier

# Seconds a claimed attempt may run, and the lane whose single running slot it takes.
LEASE_SECONDS = {'voice': 900, 'timing': 900, 'agent': 1800, 'export': 1800, 'restyle': 1800}
LANES = {'workflow': ('voice', 'timing', 'agent'), 'render': ('export', 'restyle')}
HEARTBEAT_SECONDS = 60
STAGES = {'voice': 'tts', 'timing': 'timing', 'agent': 'agent', 'export': 'export', 'restyle': 'render'}
LEASE_SQL = ('CASE kind ' + ' '.join(f"WHEN '{kind}' THEN interval '{seconds} seconds'" for kind, seconds in LEASE_SECONDS.items()) +
             " ELSE interval '900 seconds' END")
EXPIRED = f"""(state='running' AND heartbeat_at <= now()-interval '{HEARTBEAT_SECONDS} seconds')
    OR (state IN ('running','queued') AND started_at <= now() - {LEASE_SQL})"""


def row(value):
    value = dict(value)
    for key in ('id', 'project_id', 'scene_id', 'attempt_id'):
        if value.get(key) is not None: value[key] = str(value[key])
    return value


def terminal(conn, job, state, error=None):
    conn.execute('UPDATE jobs SET state=%s,error=%s,ended_at=now() WHERE id=%s', [state, Jsonb(error) if error else None, job['id']])
    if job.get('attempt_id'):
        conn.execute("UPDATE job_attempts SET state=%s,error=%s,ended_at=now() WHERE id=%s AND state='running'",
                     [state, Jsonb(error) if error else None, job['attempt_id']])


EXPIRED_MESSAGES = {
    'timeout': 'Workflow time budget exceeded', 'worker_lost': 'Worker heartbeat expired; retry may incur charges',
    'timing_lost': 'Local timing worker heartbeat expired; explicit retry does not call a provider',
    'visual': '工作进程租约或执行时限已过期，未自动重试。'}


def expired_error(job, timed_out):
    """Voice may be retried after a lost heartbeat (not after its time budget); Agent, export and restyle jobs never retry."""
    base = {'stage': job['stage'], 'scene_id': job['scene_id']}
    if job['kind'] in ('agent', 'export', 'restyle'):
        return {**base, 'code': 'expired', 'message': EXPIRED_MESSAGES['visual'], 'retryable': False}
    code = 'timeout' if timed_out else 'worker_lost'
    message = EXPIRED_MESSAGES['timing_lost' if job['kind'] == 'timing' and not timed_out else code]
    return {**base, 'code': code, 'message': message, 'retryable': not timed_out and job['attempts'] < 3}


def recover(conn):
    """Ends attempts whose heartbeat stopped or whose lease ran out."""
    rows = conn.execute(f"""SELECT *, started_at <= now() - {LEASE_SQL} AS timed_out FROM jobs
        WHERE {EXPIRED} ORDER BY id FOR UPDATE""").fetchall()
    for job in rows:
        job = row(job)
        if job['cancel_requested']: terminal(conn, job, 'cancelled')
        else: terminal(conn, job, 'failed', expired_error(job, job['timed_out']))
    return len(rows)


def claim(conn, lane, kinds, initial_usage):
    """Claims the oldest queued job of `kinds` in `lane`, unless the lane's single slot is taken. Returns the row or None."""
    if lane not in LANES: raise StoreError('validation', 'Expected workflow or render lane')
    kinds = [k for k in LANES[lane] if k in kinds]
    if not kinds: return None
    conn.execute("SELECT pg_advisory_xact_lock(hashtext('aicreater.jobs.' || %s))", [lane])
    recover(conn)
    if conn.execute("SELECT id FROM jobs WHERE state='running' AND kind=ANY(%s) LIMIT 1", [list(LANES[lane])]).fetchone(): return None
    found = conn.execute("""SELECT * FROM jobs WHERE state='queued' AND available_at<=now() AND kind=ANY(%s)
        ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED""", [kinds]).fetchone()
    if found is None: return None
    attempt_id = str(uuid.uuid4())
    conn.execute("INSERT INTO job_attempts (id,job_id,number,state,usage) VALUES (%s,%s,%s,'running',%s)",
                 [attempt_id, found['id'], found['attempts'] + 1, Jsonb(initial_usage(found['input']))])
    conn.execute("""UPDATE jobs SET state='running',attempts=attempts+1,attempt_id=%s,started_at=COALESCE(started_at,now()),
        heartbeat_at=now(),stage=%s,progress=0,error=NULL,ended_at=NULL WHERE id=%s""",
                 [attempt_id, STAGES[found['kind']], found['id']])
    return row(conn.execute('SELECT * FROM jobs WHERE id=%s', [found['id']]).fetchone())


def active(conn, job_id, attempt_id):
    """The running attempt, locked, if it still holds its lease; otherwise None."""
    found = conn.execute(f"""SELECT *, heartbeat_at > now()-interval '{HEARTBEAT_SECONDS} seconds'
        AND started_at > now() - {LEASE_SQL} AS lease_valid FROM jobs WHERE id=%s FOR UPDATE""", [identifier(job_id)]).fetchone()
    if found is None or found['state'] != 'running' or str(found['attempt_id']) != identifier(attempt_id) or not found['lease_valid']:
        return None
    return row(found)
