"""Local PostgreSQL project CLI. Credentials are read from .env, never CLI arguments."""
import argparse
import hashlib
import json
import os
import platform
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv

from services.projects.store import Store, StoreError
from services.workflow.storyboard import ROOT


def profile():
    fonts = ROOT / 'node_modules/@fontsource/noto-sans-sc'
    files = sorted(fonts.glob('files/*-400-normal.woff2'))
    if not files: raise StoreError('fonts', 'Install the project font dependency first')
    digest = hashlib.sha256()
    for file in files:
        digest.update(file.name.encode())
        digest.update(file.read_bytes())
    # ponytail: system monospace is not bundled; pin a mono font before multi-host rendering.
    digest.update(platform.platform().encode())
    return {'theme_version': 'tech_explainer:1', 'template_version': 'teaching:4', 'font_hash': digest.hexdigest(),
            'voice': {'resource_id': os.getenv('VOLCENGINE_RESOURCE_ID', ''),
                      'speaker': os.getenv('VOLCENGINE_SPEAKER', '')}}


def read_json(file):
    path = Path(file)
    if path.stat().st_size > 512 * 1024: raise StoreError('input_limit', 'JSON exceeds 512 KiB')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def publish(document, destination):
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, encoding='utf-8', delete=False) as file:
            temp = Path(file.name)
            json.dump(document, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.link(temp, path)
    finally:
        if temp is not None: temp.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('import'); p.add_argument('dsl'); p.add_argument('--title', required=True)
    p = commands.add_parser('get'); p.add_argument('project_id')
    p = commands.add_parser('edit'); p.add_argument('scene_id'); p.add_argument('patch'); p.add_argument('--revision', type=int, required=True)
    p = commands.add_parser('reorder'); p.add_argument('project_id'); p.add_argument('order'); p.add_argument('--revision', type=int, required=True)
    p = commands.add_parser('version'); p.add_argument('project_id'); p.add_argument('--revision', type=int, required=True)
    p = commands.add_parser('export'); p.add_argument('version_id'); p.add_argument('output')
    args = parser.parse_args(argv)
    try:
        load_dotenv(ROOT / '.env', override=False)
        dsn = os.getenv('DATABASE_URL')
        if not dsn: raise StoreError('missing_database', 'Configure DATABASE_URL locally')
        from services.projects.storage import ObjectStore
        store = Store(dsn, ROOT / 'apps/renderer/public', profile(), objects=ObjectStore.from_env())
        store.initialize()
        if args.command == 'import': result = store.import_project(args.title, read_json(args.dsl))
        elif args.command == 'get': result = store.get_project(args.project_id)
        elif args.command == 'edit': result = store.edit_scene(args.scene_id, args.revision, read_json(args.patch))
        elif args.command == 'reorder': result = store.reorder(args.project_id, args.revision, read_json(args.order))
        elif args.command == 'version': result = store.create_version(args.project_id, args.revision)
        else:
            version = store.get_version(args.version_id)
            publish(version['dsl'], args.output)
            result = {'version_id': args.version_id, 'dsl': args.output}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except StoreError as error:
        print(json.dumps({'stage': 'project', 'code': error.code, 'message': str(error)}), file=sys.stderr)
    except (OSError, ValueError):
        print('{"stage":"project","code":"file_error","message":"Invalid input or existing/unwritable output"}', file=sys.stderr)
    return 1


if __name__ == '__main__': sys.exit(main())
