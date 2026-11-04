"""The built-in scene themes, read from packages/scene-themes/themes. The renderer (TypeScript) owns their validation;
here a course picks one by id and every Agent and export job freezes the theme it was started with."""
import copy
import json
from functools import lru_cache
from pathlib import Path

THEMES_DIR = Path(__file__).resolve().parents[1] / 'packages/scene-themes/themes'
DEFAULT_THEME = 'blueprint'


@lru_cache(maxsize=1)
def _themes():
    themes = {}
    for file in sorted(THEMES_DIR.glob('*.json')):
        theme = json.loads(file.read_text(encoding='utf-8'))
        if theme.get('id') != file.stem: raise RuntimeError(f'theme file {file.name} does not match its id')
        themes[theme['id']] = theme
    if DEFAULT_THEME not in themes: raise RuntimeError('the default theme is missing')
    return themes


def require(theme_id):
    if not isinstance(theme_id, str) or theme_id not in _themes():
        from services.projects.store import StoreError  # the store imports this module
        raise StoreError('validation', 'Unknown theme; expected one of ' + ', '.join(_themes()))
    return theme_id


def effective(config):
    """A project's theme: the one it chose, or the default for courses made before themes."""
    value = (config or {}).get('theme_id')
    return value if value in _themes() else DEFAULT_THEME


def snapshot(theme_id):
    return copy.deepcopy(_themes()[require(theme_id)])


def summaries():
    """What the picker shows: names, fit and four preview colors; not the full token set."""
    return [{'id': t['id'], 'name': t['name'], 'name_zh': t['nameZh'], 'description_zh': t['descriptionZh'],
             'mood': t['mood'], 'best_for': t['bestFor'], 'dark': t['dark'], 'default': t['id'] == DEFAULT_THEME,
             'preview': {k: t['colors'][k] for k in ('background', 'surface', 'foreground', 'accent')}}
            for t in _themes().values()]
