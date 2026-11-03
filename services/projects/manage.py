"""Store profile: pinned theme/template/font versions and the public voice settings from .env."""
import hashlib
import os
import platform

from services.projects.store import ROOT, StoreError


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
