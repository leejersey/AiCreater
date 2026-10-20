"""Foreground macOS workbench control. Never launches Docker, workers or beat."""
import argparse
import json
import os
import platform
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
PORTS = {'api': 8000, 'web': 3000}
COMMANDS = {
    'api': [sys.executable, '-m', 'uvicorn', 'services.api.app:app', '--host', '127.0.0.1', '--port', '8000', '--no-proxy-headers'],
    'web': ['npm', 'run', 'web'],
}


class SafetyError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def emit(code, **details):
    print(json.dumps({'code': code, **details}), flush=True)


def trusted_config():
    env = dict(os.environ)
    for name in ['.env', '.env.local-services']:
        file = ROOT / name
        if file.is_symlink() or not file.is_file(): raise SafetyError('private_config_missing')
        stat = file.stat()
        if stat.st_uid != os.getuid() or stat.st_mode & 0o077: raise SafetyError('private_config_permissions')
        env.update({k: v for k, v in dotenv_values(file).items() if v is not None})
    return env


def local_url(value, schemes):
    try:
        url = urlsplit(value or '')
        if (url.scheme not in schemes or url.hostname not in {'127.0.0.1', 'localhost', '::1'}
                or not url.port or url.query or url.fragment): raise ValueError()
        return url
    except ValueError:
        raise SafetyError('local_configuration_required') from None


def activity(env):
    dsn = env.get('DATABASE_URL')
    local_url(dsn, {'postgres', 'postgresql'})
    try:
        with psycopg.connect(dsn, connect_timeout=3,
                             options='-c default_transaction_read_only=on -c statement_timeout=3000') as db:
            rows = db.execute("SELECT kind,state,count(*) FROM aicreater.jobs WHERE state IN ('queued','running') GROUP BY kind,state ORDER BY kind,state").fetchall()
        if any(kind not in {'generate', 'voice', 'timing', 'render'} or state not in {'queued', 'running'} for kind, state, n in rows):
            raise SafetyError('unknown_task_state')
        return [{'kind': kind, 'state': state, 'count': n} for kind, state, n in rows]
    except psycopg.Error:
        raise SafetyError('database_unavailable') from None


def basic_ready(env):
    tasks = activity(env)
    redis = local_url(env.get('CELERY_BROKER_URL'), {'redis'})
    storage = local_url(env.get('MINIO_ENDPOINT'), {'http', 'https'})
    if storage.username or storage.password or storage.path not in {'', '/'}: raise SafetyError('local_configuration_required')
    try:
        with socket.create_connection((redis.hostname, redis.port), timeout=3): pass
        with httpx.Client(timeout=3, trust_env=False, follow_redirects=False) as client:
            if client.get(env['MINIO_ENDPOINT'].rstrip('/') + '/health').status_code != 200: raise SafetyError('storage_unavailable')
    except (OSError, httpx.HTTPError):
        raise SafetyError('foundation_unavailable') from None
    return tasks


def checked_command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=3,
                                env={**os.environ, 'LC_ALL': 'C'})
        if result.returncode: raise SafetyError('process_inspection_failed')
        return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        raise SafetyError('process_inspection_failed') from None


def listeners(port):
    try:
        result = subprocess.run(['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN', '-Fpn'],
                                capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        raise SafetyError('process_inspection_failed') from None
    if result.returncode == 1 and not result.stdout and not result.stderr: return {}
    if result.returncode: raise SafetyError('process_inspection_failed')
    found = {}; pid = None
    for line in result.stdout.splitlines():
        if line.startswith('p'):
            if not line[1:].isdigit(): raise SafetyError('process_inspection_failed')
            pid = int(line[1:]); found[pid] = []
        elif line.startswith('n') and pid is not None: found[pid].append(line[1:])
    if not found or any(not addresses for addresses in found.values()): raise SafetyError('process_inspection_failed')
    return found


def process_identity(pid, role):
    cwd = checked_command(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'])
    paths = [line[1:] for line in cwd.splitlines() if line.startswith('n')]
    started = checked_command(['ps', '-p', str(pid), '-o', 'lstart='])
    command = checked_command(['ps', '-p', str(pid), '-o', 'command='])
    allowed = {str(ROOT)} if role == 'api' else {str(ROOT), str(ROOT / 'apps/web')}
    try: args = shlex.split(command)
    except ValueError: raise SafetyError('unknown_listener') from None
    is_api = bool(args) and Path(args[0]).name.startswith('python') and args[1:4] == ['-m', 'uvicorn', 'services.api.app:app']
    is_web = command.startswith('next-server (v') and command.endswith(')')
    if len(paths) != 1 or paths[0] not in allowed or not started or not (is_api if role == 'api' else is_web):
        raise SafetyError('unknown_listener')
    return pid, started, paths[0], command


def healthy(role):
    path = '/health' if role == 'api' else '/'
    try:
        with httpx.Client(timeout=3, trust_env=False, follow_redirects=False) as client:
            response = client.get(f'http://127.0.0.1:{PORTS[role]}{path}')
            return response.status_code == 200 and (role == 'web' or response.json().get('status') == 'ready')
    except (httpx.HTTPError, ValueError, AttributeError):
        return False


def inspect_role(role):
    port = PORTS[role]; found = listeners(port)
    if not found: return {'state': 'absent', 'groups': []}
    if any(address not in {f'127.0.0.1:{port}', f'[::1]:{port}'} for addresses in found.values() for address in addresses):
        raise SafetyError('non_loopback_listener')
    before = {pid: process_identity(pid, role) for pid in found}
    ready = healthy(role)
    if found != listeners(port) or before != {pid: process_identity(pid, role) for pid in found}:
        raise SafetyError('listener_changed')
    if not ready: raise SafetyError('service_unhealthy')
    try: groups = sorted({os.getpgid(pid) for pid in found})
    except ProcessLookupError: raise SafetyError('listener_changed') from None
    return {'state': 'ready', 'groups': groups}


def group_active(group):
    for line in checked_command(['ps', '-axo', 'pgid=,stat=']).splitlines():
        fields = line.split()
        if len(fields) != 2 or not fields[0].isdigit(): raise SafetyError('process_inspection_failed')
        if int(fields[0]) == group and not fields[1].startswith('Z'): return True
    return False


class Supervisor:
    def __init__(self, env):
        self.env = env
        self.processes = {}
        self.requested = False
        self.pending_groups = set()
        self.stopping = False

    def request_stop(self, signum, frame):
        self.requested = True

    def await_ready(self, role):
        deadline = time.monotonic() + 30
        process = self.processes[role]
        while time.monotonic() < deadline:
            if self.requested: raise SafetyError('stop_requested')
            if process.poll() is not None: raise SafetyError('child_exited')
            try: state = inspect_role(role)
            except SafetyError as error:
                if error.code != 'service_unhealthy': raise
                state = {'state': 'starting'}
            if state['state'] == 'ready':
                if state['groups'] != [process.pid]: raise SafetyError('port_race')
                return
            time.sleep(.2)
        raise SafetyError('startup_timeout')

    def start(self):
        for role in COMMANDS:
            if self.requested: raise SafetyError('stop_requested')
            if inspect_role(role)['state'] == 'ready':
                emit('reused_not_controlled', role=role)
                continue
            self.processes[role] = subprocess.Popen(COMMANDS[role], cwd=ROOT, env=self.env,
                                                   stdin=subprocess.DEVNULL, start_new_session=True)
            self.await_ready(role)
            emit('started_owned', role=role)

    def stop(self):
        live = [process for process in self.processes.values() if process.poll() is None]
        if not live:
            try: self.pending_groups = {group for group in self.pending_groups if group_active(group)}
            except SafetyError:
                emit('shutdown_group_unverified'); return False
            if self.pending_groups: emit('shutdown_group_still_running_no_kill')
            return not self.pending_groups
        try:
            tasks = activity(self.env)
            if tasks:
                emit('shutdown_blocked_tasks', tasks=tasks)
                return False
        except SafetyError as error:
            emit('shutdown_blocked_database', reason=error.code)
            return False
        self.stopping = True
        # Unreaped Popen children reserve their PIDs; never signal a stored cross-session PID.
        for process in live:
            self.pending_groups.add(process.pid)
            try: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: pass
            except OSError:
                emit('shutdown_signal_failed'); return False
        complete = True
        for process in live:
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: complete = False
        if not complete:
            emit('shutdown_timeout_no_kill'); return False
        deadline = time.monotonic() + 5
        try:
            while self.pending_groups:
                self.pending_groups = {group for group in self.pending_groups if group_active(group)}
                if not self.pending_groups: return True
                if time.monotonic() >= deadline:
                    emit('shutdown_group_still_running_no_kill'); return False
                time.sleep(.1)
        except SafetyError:
            emit('shutdown_group_unverified'); return False
        return True

    def run(self):
        previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        for sig in previous: signal.signal(sig, self.request_stop)
        failed = False
        try:
            try: self.start()
            except (SafetyError, OSError) as error:
                code = error.code if isinstance(error, SafetyError) else 'launch_failed'
                emit(code); failed = code != 'stop_requested'; self.requested = True
            if not self.processes: return int(failed)
            emit('foreground_owned_only', stop='Ctrl+C; busy or unavailable database blocks shutdown')
            while True:
                exited = {p.pid for p in self.processes.values() if p.poll() is not None}
                self.pending_groups.update(exited)
                if not failed and exited and not self.stopping:
                    emit('child_exited_manual_orphan_check'); failed = True; self.requested = True
                if self.requested:
                    self.requested = False
                    if self.stop(): return int(failed)
                    emit('resolve_tasks_then_press_ctrl_c_again')
                time.sleep(.2)
        finally:
            for sig, handler in previous.items(): signal.signal(sig, handler)


def disk_status():
    # ponytail: ROOT filesystem only; check VM quotas separately before enforcing render capacity.
    threshold = 20 * 1024 ** 3
    try:
        free = shutil.disk_usage(ROOT).free
    except OSError:
        return {'state': 'unavailable', 'available_bytes': None, 'threshold_bytes': threshold}
    return {'state': 'low' if free < threshold else 'ok', 'available_bytes': free, 'threshold_bytes': threshold}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'run'])
    args = parser.parse_args(argv)
    try:
        if platform.system() != 'Darwin': raise SafetyError('macos_only')
        if any(not shutil.which(tool) for tool in ['lsof', 'ps']): raise SafetyError('inspection_tools_missing')
        env = trusted_config()
        tasks = basic_ready(env)
        if args.command == 'status':
            roles = {role: {'state': inspect_role(role)['state'], 'controlled': False} for role in COMMANDS}
            emit('status', services=roles, tasks=tasks, disk=disk_status())
            return 0
        if not shutil.which('npm'): raise SafetyError('npm_missing')
        return Supervisor(env).run()
    except SafetyError as error:
        emit(error.code)
    except (OSError, ValueError):
        emit('local_check_failed')
    return 1


if __name__ == '__main__': sys.exit(main())
