"""The built-in scene themes, read from packages/scene-themes/themes. The renderer (TypeScript) owns their validation;
here a course picks one by id and every Agent and export job freezes the theme it was started with."""
import copy
import json
import re
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


def _luminance(hex_color):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a, b):
    x, y = sorted([_luminance(a), _luminance(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


def check_accent(theme_id, accent):
    """A course's own accent color (e.g. a brand color) on a built-in theme: #rrggbb, readable on its background."""
    if accent is None: return None
    from services.projects.store import StoreError
    if not isinstance(accent, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', accent):
        raise StoreError('validation', '强调色需为 #rrggbb 格式')
    accent = accent.lower()
    background = _themes()[require(theme_id)]['colors']['background']
    if contrast(accent, background) < 3:
        raise StoreError('validation', f'强调色在这个主题的背景上对比度不足（{contrast(accent, background):.1f}:1，至少 3:1），换一个更深或更亮的颜色')
    return accent


def snapshot(theme_id, accent=None):
    """The theme a job freezes; with a course accent, its accent and translucent accent replaced."""
    theme = copy.deepcopy(_themes()[require(theme_id)])
    if accent:
        alpha = theme['colors']['accentSoft'][7:]
        theme['colors'].update(accent=accent, accentSoft=accent + alpha)
    return theme


def accent_of(config):
    """The course's own accent, or None for the theme's."""
    value = (config or {}).get('theme_accent')
    return value if isinstance(value, str) and re.fullmatch(r'#[0-9a-f]{6}', value) else None


def course_snapshot(project):
    return snapshot(project['theme_id'], project.get('theme_accent'))


def summaries():
    """What the picker shows: names, fit and four preview colors; not the full token set."""
    return [{'id': t['id'], 'name': t['name'], 'name_zh': t['nameZh'], 'description_zh': t['descriptionZh'],
             'mood': t['mood'], 'best_for': t['bestFor'], 'dark': t['dark'], 'default': t['id'] == DEFAULT_THEME,
             'preview': {k: t['colors'][k] for k in ('background', 'surface', 'foreground', 'accent')}}
            for t in _themes().values()]
