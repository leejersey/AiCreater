"""A course's content review and its gate: blocking items keep the course from being voiced or generated.

State lives in projects.config.review = {required, result, overrides}; the evidence pack in projects.config.evidence.
The review reads the chapters as they are now (what would be voiced), with each chapter's visual materials taken from
the manuscript section of the same narration. A result is tied to that narration's hash: editing a chapter makes it
stale, and a required review must be run again. Only courses created with an evidence pack, or where the person turned
review on, are gated; others are unaffected. Changing review state is not a content change: the revision stays."""
import re
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from services.projects.store import StoreError
from services.workflow import review as rv

MAX_NOTE = 300


def _norm(text):
    return re.sub(r'\s+', '', text or '')


def sections(project):
    """The chapters to review: {id, label, narration, materials}."""
    manuscript = (project.get('config') or {}).get('manuscript') or {}
    by_text = {_norm(s['narration']): s for s in manuscript.get('sections') or []}
    out = []
    for i, scene in enumerate(project['scenes'], 1):
        text = scene['scene']['narration']['text']
        section = by_text.get(_norm(text))
        title = section['title'] if section else text.strip()[:12]
        out.append({'id': scene['id'], 'label': f'第 {i} 章（{title}）', 'narration': text, 'materials': section['materials'] if section else ''})
    return out


def current_hash(project):
    return rv.narration_hash(''.join(s['scene']['narration']['text'] for s in project['scenes']))


def state(project):
    """The review as the page shows it: is it required, the last result, whether that result is for the current text."""
    review = (project.get('config') or {}).get('review') or {}
    result, overrides = review.get('result'), review.get('overrides') or {}
    current = bool(result) and result['hash'] == current_hash(project)
    return {'required': bool(review.get('required')), 'result': result, 'overrides': overrides, 'current': current,
            'level': rv.level(result['items'], overrides) if result else None,
            'evidence': len((project.get('config') or {}).get('evidence') or [])}


def gate(project):
    """Raises when a required review is missing, stale or still has unconfirmed blocking items."""
    s = state(project)
    if not s['required']: return
    if not s['result']:
        raise StoreError('review_required', '这门课需要先通过内容审核，才能配音或生成画面')
    if not s['current']:
        raise StoreError('review_required', '口播改过了，请重新运行内容审核后再配音或生成画面')
    if s['level'] == 'block':
        blocking = [i for i in s['result']['items'] if i['severity'] == 'block' and i['id'] not in s['overrides']]
        raise StoreError('review_required', f'内容审核还有 {len(blocking)} 条阻断项（如找不到来源的断言），修改口播或逐条确认后才能配音或生成画面')


class CourseReview:
    def __init__(self, store):
        self.store = store

    def _save(self, conn, project_id, review):
        conn.execute("UPDATE projects SET config=jsonb_set(config,'{review}',%s) WHERE id=%s", [Jsonb(review), project_id])

    def run(self, project_id, *, ai=False, llm=None, client=None, user_id=None):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
        if not project['scenes']: raise StoreError('not_ready', '还没有章节，请先整理章节')
        evidence = (project.get('config') or {}).get('evidence') or []
        result = rv.review_units(sections(project), evidence, llm=llm, client=client, ai=ai, user_id=user_id)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if current_hash(project) != result['hash']:
                raise StoreError('conflict', '审核期间口播被修改了，请重新审核')
            review = dict((project.get('config') or {}).get('review') or {})
            # Confirmations carry over to the same item in a new result; confirmations of items that are gone are dropped.
            ids = {i['id'] for i in result['items']}
            review.update(result=result, overrides={k: v for k, v in (review.get('overrides') or {}).items() if k in ids})
            self._save(conn, project['id'], review)
            return state(self.store._read(conn, project['id']))

    def override(self, project_id, item_id, note, user_id=None):
        if not isinstance(note, str) or not 1 <= len(note.strip()) <= MAX_NOTE:
            raise StoreError('validation', f'请写明核实依据（1–{MAX_NOTE} 字）')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            s = state(project)
            if not s['result'] or not s['current']: raise StoreError('not_ready', '请先对当前口播运行内容审核')
            item = next((i for i in s['result']['items'] if i['id'] == item_id), None)
            if not item or item['severity'] != 'block': raise StoreError('not_found', '没有这条阻断项')
            review = dict(project['config']['review'])
            review['overrides'] = {**s['overrides'], item_id: {'note': note.strip(), 'by': user_id, 'at': datetime.now(timezone.utc).isoformat()}}
            self._save(conn, project['id'], review)
            return state(self.store._read(conn, project['id']))

    def set_required(self, project_id, required):
        if type(required) is not bool: raise StoreError('validation', 'required must be true or false')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            review = dict((project.get('config') or {}).get('review') or {})
            review['required'] = required
            self._save(conn, project['id'], review)
            return state(self.store._read(conn, project['id']))
