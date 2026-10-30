"""Opt-in local host ownership and conservative orphan cleanup. No DB or model I/O."""
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid


_ENV = ('PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT')
_HEX = re.compile(r'^[a-f0-9]{64}$')
_LIMIT = 1024 * 1024
_IMAGE = 'aicreater-teaching-renderer:local'
# The child cannot enter the trusted Node bridge until the owner record is durable.
_GATE = ('import os,sys; fd=int(sys.argv[1]); token=os.read(fd,1); os.close(fd); '
         'os.environ["TEACHING_HOST_PGID"]=str(os.getpgrp()); '
         'os.execvpe(sys.argv[2],sys.argv[2:],os.environ) if token==b"1" else sys.exit(125)')


def _directory(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or len(str(path)) > 4096:
        raise ValueError('Unsafe ownership path')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def _location(output):
    output = Path(output)
    if not output.is_absolute() or str(uuid.UUID(output.name)) != output.name:
        raise ValueError('Expected canonical UUID output')
    return output, _directory(output.parent)


def _read(fd, name):
    file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    with os.fdopen(file, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 4096:
            raise ValueError('Unsafe ownership record')
        data = stream.read(4097)
        if len(data) > 4096:
            raise ValueError('Ownership record exceeds limit')
        value = json.loads(data)
        if not isinstance(value, dict):
            raise ValueError('Invalid ownership record')
        return value


def _write(fd, name, value):
    data = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
    if len(data) > 4096:
        raise ValueError('Ownership record exceeds limit')
    file = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
    with os.fdopen(file, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.fsync(fd)


def _terminate(child):
    # Never use a persisted PID. Keep this direct child unreaped while signalling:
    # even if it exits between poll and killpg, its zombie reserves the leader PID.
    for sig in (signal.SIGTERM, signal.SIGKILL):
        if child.poll() is not None:
            break
        try:
            if os.getpgid(child.pid) != child.pid:
                break
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            break
        if sig == signal.SIGTERM:
            time.sleep(.1)
    child.wait()


def _capture(child, data, timeout, command):
    deadline = time.monotonic() + timeout
    output = [bytearray(), bytearray()]
    try:
        with selectors.DefaultSelector() as selector:
            for index, stream in enumerate((child.stdout, child.stderr)):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, index)
            if data:
                os.set_blocking(child.stdin.fileno(), False)
                selector.register(child.stdin, selectors.EVENT_WRITE, 2)
            else:
                child.stdin.close()
            offset = 0
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(command, timeout, bytes(output[0]), bytes(output[1]))
                for key, _ in selector.select(min(remaining, .1)):
                    if key.data == 2:
                        try:
                            offset += os.write(key.fd, data[offset:offset+65536])
                        except BrokenPipeError:
                            offset = len(data)
                        if offset == len(data):
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                    else:
                        chunk = os.read(key.fd, 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                        else:
                            output[key.data].extend(chunk)
                            if len(output[key.data]) > _LIMIT:
                                raise ValueError('Host output exceeds limit')
            remaining = deadline - time.monotonic()
            child.wait(timeout=max(0, remaining))
        return bytes(output[0]), bytes(output[1])
    except BaseException:
        _terminate(child)
        raise
    finally:
        for stream in (child.stdin, child.stdout, child.stderr):
            stream.close()


def run_owned(command, *, input, env, cwd, timeout, output, text=True, capture_output=True):
    """subprocess.run-compatible frozen-render subset; output must not yet exist.

    Always captures bounded stdout/stderr. Ownership records contain no command,
    input or environment. Timeout remains an interruption, never cleanup proof.
    """
    if text is not True or capture_output is not True:
        raise ValueError('Owned renders require text and capture_output')
    if (not isinstance(command, (list, tuple)) or not 1 <= len(command) <= 32
            or any(not isinstance(arg, str) or not arg or '\0' in arg or len(arg) > 4096 for arg in command)):
        raise ValueError('Invalid host command')
    if not isinstance(input, str) or len(input.encode()) > 16 * _LIMIT:
        raise ValueError('Host input exceeds limit')
    if not isinstance(timeout, (int, float)) or not 0 < timeout <= 3600:
        raise ValueError('Invalid host timeout')
    clean_env = {key: env[key] for key in _ENV if key in env}
    if any(not isinstance(value, str) or len(value) > 8192 or '\0' in value for value in clean_env.values()):
        raise ValueError('Invalid host environment')
    cwd_fd = _directory(cwd)
    os.close(cwd_fd)
    output, parent = _location(output)
    read_gate = write_gate = reserve = None
    child = None
    try:
        try:
            os.stat(output.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise FileExistsError('Output must be created by Node')
        owner_name = output.name + '.owner.json'
        # Reserve before spawn. A crash here leaves an invalid/empty record fenced.
        reserve = os.open(owner_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
        reservation = os.fstat(reserve)
        nonce = secrets.token_hex(32)
        clean_env['TEACHING_HOST_NONCE'] = nonce
        read_gate, write_gate = os.pipe()
        child = subprocess.Popen([sys.executable, '-c', _GATE, str(read_gate), *command],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=cwd, env=clean_env, start_new_session=True, pass_fds=(read_gate,))
        os.close(read_gate)
        read_gate = None
        # Keep the original inode across spawn; a pathname replacement cannot gain writes.
        record_fd,reserve=reserve,None
        with os.fdopen(record_fd, 'wb') as stream:
            info = os.fstat(stream.fileno())
            current = os.stat(owner_name,dir_fd=parent,follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode) or info.st_size != 0 or info.st_nlink != 1 or (current.st_dev,current.st_ino)!=(reservation.st_dev,reservation.st_ino):
                raise ValueError('Unsafe owner reservation')
            stream.write(json.dumps({'schemaVersion': 'teaching-host-owner:1', 'jobId': output.name,
                'hostNonce': nonce, 'hostPgid': child.pid}, separators=(',', ':')).encode())
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(parent)
        current=os.stat(owner_name,dir_fd=parent,follow_symlinks=False)
        if (current.st_dev,current.st_ino)!=(reservation.st_dev,reservation.st_ino):raise ValueError('Owner reservation changed before execution')
        os.write(write_gate, b'1')
        os.close(write_gate)
        write_gate = None
        stdout, stderr = _capture(child, input.encode(), timeout, command)
        return subprocess.CompletedProcess(command, child.returncode, stdout.decode(), stderr.decode())
    except BaseException:
        if child is not None:
            _terminate(child)
            for stream in (child.stdin, child.stdout, child.stderr):
                stream.close()
        raise
    finally:
        for fd in (read_gate, write_gate, reserve, parent):
            if fd is not None:
                os.close(fd)


def _docker(args):
    env = {key: os.environ[key] for key in ('PATH', 'HOME') if key in os.environ}
    child = subprocess.Popen(['docker', *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, env=env, start_new_session=True)
    stdout, stderr = _capture(child, b'', 30, ['docker', *args])
    if child.returncode:
        raise OSError('Docker operation unconfirmed')
    return stdout.decode()


def _group_absent(pgid):
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return True
    return False


def execution_marker_present(output):
    try:(Path(output)/'execution.json').lstat();return True
    except FileNotFoundError:return False
    except OSError:return True


def cleanup_verified(output):
    parent=folder=None
    try:
        output,parent=_location(output)
        folder=os.open(output.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
        identity=_read(folder,'execution.json');proof=_read(folder,'cleanup.json')
        nonce=identity.get('executionNonce')
        if (identity.get('schemaVersion')!='teaching-container-execution:1' or identity.get('jobId')!=output.name
                or identity.get('containerName')!='aicreater-teaching-'+output.name or identity.get('image')!=_IMAGE
                or not isinstance(nonce,str) or not _HEX.fullmatch(nonce)
                or proof.get('schemaVersion')!='teaching-container-cleanup:1' or proof.get('status')!='absent'
                or proof.get('jobId')!=output.name or proof.get('containerName')!=identity['containerName']
                or proof.get('executionNonce')!=nonce or not isinstance(proof.get('containerId'),str)
                or not _HEX.fullmatch(proof['containerId'])):return False
        if 'hostNonce' in identity or 'hostPgid' in identity:
            owner=_read(parent,output.name+'.owner.json')
            if (owner.get('schemaVersion')!='teaching-host-owner:1' or owner.get('jobId')!=output.name
                    or not isinstance(owner.get('hostNonce'),str) or not _HEX.fullmatch(owner['hostNonce'])
                    or identity.get('hostNonce')!=owner['hostNonce'] or type(owner.get('hostPgid')) is not int
                    or not 2<=owner['hostPgid']<=2147483647 or identity.get('hostPgid')!=owner['hostPgid']):return False
        return True
    except (OSError,ValueError,TypeError,KeyError,RecursionError):return False
    finally:
        for fd in (folder,parent):
            if fd is not None:os.close(fd)


def _container(identity, target):
    raw = _docker(['inspect', '--type', 'container', target])
    if len(raw.encode()) > _LIMIT:
        raise ValueError('Docker response exceeds limit')
    values = json.loads(raw)
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], dict):
        raise ValueError('Container not positively identified')
    container = values[0]
    config = container.get('Config', {})
    labels = config.get('Labels', {})
    if (not _HEX.fullmatch(container.get('Id', '')) or container.get('Name') != '/'+identity['containerName']
            or config.get('Image') != _IMAGE or labels.get('aicreater.teaching-job') != identity['jobId']
            or labels.get('aicreater.teaching-execution-nonce') != identity['executionNonce']):
        raise ValueError('Container ownership mismatch')
    return container['Id']


def reconcile_orphan(output):
    """Return True only after positively identified orphan removal and durable proof.

    A missing container at the first lookup is NOT evidence of cleanup. No host
    process is ever signalled here other than the non-destructive group probe.
    """
    parent = folder = None
    try:
        output, parent = _location(output)
        folder = os.open(output.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        owner = _read(parent, output.name+'.owner.json')
        identity = _read(folder, 'execution.json')
        pgid = owner.get('hostPgid')
        if (owner.get('schemaVersion') != 'teaching-host-owner:1' or owner.get('jobId') != output.name
                or not isinstance(owner.get('hostNonce'), str) or not _HEX.fullmatch(owner['hostNonce'])
                or type(pgid) is not int or not 2 <= pgid <= 2147483647
                or identity.get('schemaVersion') != 'teaching-container-execution:1'
                or identity.get('jobId') != output.name or identity.get('hostNonce') != owner['hostNonce']
                or type(identity.get('hostPgid')) is not int or identity['hostPgid'] != pgid
                or identity.get('containerName') != 'aicreater-teaching-'+output.name
                or identity.get('image') != _IMAGE or not isinstance(identity.get('executionNonce'), str)
                or not _HEX.fullmatch(identity['executionNonce']) or not _group_absent(pgid)):
            return False
        container_id = _container(identity, identity['containerName'])
        if _container(identity, container_id) != container_id:
            return False
        if (_read(parent, output.name+'.owner.json') != owner or _read(folder, 'execution.json') != identity
                or not _group_absent(pgid)):
            return False
        _docker(['rm', '-f', container_id])
        if (_docker(['ps', '-a', '--filter', 'id='+container_id, '--format', '{{.ID}}']).strip()
                or _docker(['ps', '-a', '--filter', 'name=^/'+identity['containerName']+'$', '--format', '{{.Names}}']).strip()
                or not _group_absent(pgid)):
            return False
        _write(folder, 'cleanup.json', {'schemaVersion': 'teaching-container-cleanup:1',
            'jobId': output.name, 'containerName': identity['containerName'], 'containerId': container_id,
            'executionNonce': identity['executionNonce'], 'status': 'absent'})
        return True
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError, subprocess.SubprocessError):
        return False
    finally:
        for fd in (folder, parent):
            if fd is not None:
                os.close(fd)
