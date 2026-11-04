"""Copies every voice asset and every published Agent/export file into the configured object store.

  python -m services.projects.sync_storage   # local caches -> TOS

Objects are content-addressed and `put` skips ones already stored, so it is safe to repeat."""
import json
import os
import sys

import psycopg
from psycopg.rows import dict_row

from services.projects.storage import ObjectStore
from services.projects.store import ROOT, StoreError

PUBLIC = ROOT / 'apps/renderer/public'


def files(conn):
    """(local path, checksum, limit) of everything the database references."""
    for row in conn.execute('SELECT config FROM aicreater.projects').fetchall():
        for asset in (row['config'] or {}).get('assets', []):
            yield PUBLIC / asset['storage_key'], asset['checksum'], (10 if asset['type'] == 'image' else 50) * 1024**2
    from services.visual.worker import file_limit, job_directory
    for row in conn.execute("SELECT id, result FROM aicreater.jobs WHERE kind IN ('agent','export','restyle') AND state='succeeded'").fetchall():
        for name, checksum in ((row['result'] or {}).get('_files') or {}).items():
            yield job_directory(str(row['id'])) / name, checksum, file_limit(name)


def main(argv):
    target = ObjectStore.from_env()
    if target is None: raise SystemExit('Configure TOS_* first')
    counts = {'stored': 0, 'missing': 0, 'failed': 0}
    with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row) as conn:
        for path, checksum, limit in files(conn):
            try:
                if not path.exists(): counts['missing'] += 1; print(f'missing locally: {path.relative_to(ROOT)}', file=sys.stderr); continue
                target.put(path, checksum, limit); counts['stored'] += 1
            except StoreError as error:
                counts['failed'] += 1; print(f'{error.code}: {path.relative_to(ROOT)}', file=sys.stderr)
    print(json.dumps(counts))
    return 1 if counts['failed'] or counts['missing'] else 0


if __name__ == '__main__': raise SystemExit(main(sys.argv[1:]))
