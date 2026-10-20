"""Run repository integration tests against an owned, disposable local PostgreSQL."""
import os
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def main():
    name = 'aicreater-test-' + uuid.uuid4().hex[:12]
    password = secrets.token_hex(24)
    env = {**os.environ, 'POSTGRES_PASSWORD': password}
    try:
        subprocess.run(['docker', 'run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD',
                        '-e', 'POSTGRES_DB=aicreater_test', '-p', '127.0.0.1::5432', 'postgres:16.13@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51'],
                       env=env, check=True, capture_output=True, timeout=60)
        port = subprocess.run(['docker', 'port', name, '5432/tcp'], check=True,
                              capture_output=True, text=True, timeout=10).stdout.strip().rsplit(':', 1)[1]
        assert port.isdigit(), 'Invalid localhost binding'
        env['TEST_DATABASE_URL'] = f'postgresql://postgres:{password}@127.0.0.1:{port}/aicreater_test'
        for _ in range(40):
            try:
                # The image's initialization server has a ready UNIX socket but no host TCP listener.
                with psycopg.connect(env['TEST_DATABASE_URL'], connect_timeout=1) as conn:
                    conn.execute('SELECT 1')
                break
            except psycopg.Error:
                time.sleep(0.5)
        else: raise RuntimeError('Temporary PostgreSQL did not become ready')
        return subprocess.run([sys.executable, '-m', 'unittest', 'services.tests.test_projects', 'services.tests.test_api', 'services.tests.test_jobs', 'services.tests.test_data_chart.ChartStoreTests', '-v'],
                              cwd=ROOT, env=env, timeout=180).returncode
    except (subprocess.SubprocessError, OSError, RuntimeError):
        print('Temporary PostgreSQL test environment failed; no tests reported as passing.', file=sys.stderr)
        return 1
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=15)


if __name__ == '__main__': sys.exit(main())
