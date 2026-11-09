"""整课流水线: one confirmation for the whole course, then the runner moves every chapter along by itself.

The person confirms once, seeing what it may cost: the chapters to voice (with the TTS price) and the chapters to
generate (with the turn limit each). The runner then submits one job at a time, in chapter order: voice if the chapter
needs it, local timing if it has audio without timing, then the Agent. It stops at review (a passed version waits for
the person), never retries a step that failed after the pipeline started, and stops entirely if the course owner's model
settings change. State lives in projects.config.autopilot; nothing is queued that was not covered by the confirmation.
"""
import copy
import os
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from services.accounts.model_settings import resolve_llm
from services.projects.estimates import combine_estimates, estimate_payload
from services.projects.jobs import Jobs
from services.projects.store import StoreError, revision
from services.visual.store import AGENT_MAX_TURNS, VisualJobs


class Autopilot:
    def __init__(self, store):
        self.store = store
        self.visual = VisualJobs(store)
        self.voice = Jobs(store, model=os.environ.get('DEEPSEEK_MODEL', 'deepseek-flash'))

    # What the pipeline would do now -------------------------------------------------------------------------------
    def _has_version(self, conn, project, scene_id):
        """A current, passed Agent version exists (confirmed or waiting for review): nothing to generate."""
        rows = conn.execute("""SELECT * FROM jobs WHERE project_id=%s AND scene_id=%s AND kind='agent' AND state='succeeded'
            ORDER BY created_at DESC""", [project['id'], scene_id]).fetchall()
        return any(self.visual._acceptable(self.visual._raw(r)) and self.visual._current(conn, project, self.visual._raw(r)) for r in rows)

    def _steps(self, conn, project, row):
        if self._has_version(conn, project, row['id']): return []
        steps = ['voice'] if row['state'] == 'needs_voice' else ['timing'] if row['state'] == 'needs_timing' else []
        return steps + ['agent']

    def plan(self, project_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            chapters, quotes = [], []
            for index, row in enumerate(project['scenes']):
                steps = self._steps(conn, project, row)
                if not steps: continue
                chapters.append({'scene_id': row['id'], 'index': index, 'steps': steps})
                if 'voice' in steps:
                    payload = {'kind': 'voice', 'scene': Jobs._draft_scene(row['scene']), 'profile': self.store.profile_for(project),
                               'protocol_version': 'native-voice:1'}
                    quotes.append(estimate_payload(payload))
            owner = self.visual.owner(conn, project['id'])
        agents = sum('agent' in c['steps'] for c in chapters)
        return {'revision': project['revision'], 'chapters': chapters, 'autopilot': project.get('autopilot'),
                'voice': combine_estimates(quotes) if quotes else None,
                'agent': {'chapters': agents, 'max_turns_each': AGENT_MAX_TURNS, 'max_turns_total': agents * AGENT_MAX_TURNS},
                'llm': {k: v for k, v in resolve_llm(self.store, owner).public().items() if k in ('source', 'model')}}

    # Start / stop ------------------------------------------------------------------------------------------------
    def start(self, project_id, expected_revision, confirmed, max_turns):
        if confirmed is not True or type(max_turns) is not int or not 1 <= max_turns <= AGENT_MAX_TURNS:
            raise StoreError('validation', f'必须明确确认整课流水线与每章 Agent 轮数上限（1–{AGENT_MAX_TURNS}）')
        revision(expected_revision)
        plan = self.plan(project_id)
        if not plan['chapters']: raise StoreError('not_ready', '没有需要配音或生成的章节')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            if (project.get('autopilot') or {}).get('state') == 'running': return project
            owner = self.visual.owner(conn, project['id'])
            state = {'state': 'running', 'started_at': datetime.now(timezone.utc).isoformat(), 'max_turns': max_turns,
                     'scene_ids': [c['scene_id'] for c in plan['chapters']], 'llm': resolve_llm(self.store, owner).public()}
            self._save(conn, project['id'], state)
            return self.store._read(conn, project['id'])

    def stop(self, project_id, reason='user'):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            state = project.get('autopilot')
            if state and state.get('state') == 'running':
                self._save(conn, project['id'], {**state, 'state': 'stopped', 'reason': reason})
            return self.store._read(conn, project['id'])

    @staticmethod
    def _save(conn, project_id, state):
        # Not a content change: the revision stays, so exports and confirmations are unaffected.
        conn.execute("UPDATE projects SET config=jsonb_set(config,'{autopilot}',%s) WHERE id=%s", [Jsonb(state), project_id])

    # The runner's step ---------------------------------------------------------------------------------------------
    def advance(self):
        """Moves every running pipeline one step; called by the runner between jobs. Returns what was submitted."""
        with self.store.connection() as conn:
            ids = [str(r['id']) for r in conn.execute("SELECT id FROM projects WHERE config->'autopilot'->>'state'='running'").fetchall()]
        return [step for project_id in ids if (step := self._advance(project_id))]

    def _advance(self, project_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            state = copy.deepcopy(project.get('autopilot') or {})
            if state.get('state') != 'running': return None
            if conn.execute("SELECT 1 FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1", [project['id']]).fetchone():
                return None  # one step at a time; the next one starts when this finishes
            started = datetime.fromisoformat(state['started_at'])
            rows = {r['id']: r for r in project['scenes']}
            for scene_id in state['scene_ids']:
                row = rows.get(scene_id)
                if row is None: continue  # deleted since
                since = conn.execute("""SELECT kind,state FROM jobs WHERE scene_id=%s AND created_at>=%s ORDER BY created_at""",
                                     [scene_id, started]).fetchall()
                failed = {j['kind'] for j in since if j['state'] in ('failed', 'cancelled')}
                if row['state'] == 'needs_voice':
                    if 'voice' in failed: continue  # never retried by the pipeline
                    return ('voice', self.voice.submit_voice(scene_id, row['revision'])['id'])
                if row['state'] == 'needs_timing':
                    if 'timing' in failed: continue
                    return ('timing', self.voice.submit_timing(scene_id, row['revision'])['id'])
                if row['state'] != 'ready' or any(j['kind'] == 'agent' for j in since) or self._has_version(conn, project, scene_id):
                    continue  # tried once since the start, or a version is waiting for review
                if resolve_llm(self.store, self.visual.owner(conn, project['id'])).public() != state['llm']:
                    self._save(conn, project['id'], {**state, 'state': 'stopped', 'reason': 'llm_changed'})
                    return ('stopped', 'llm_changed')
                break
            else:
                self._save(conn, project['id'], {**state, 'state': 'done'})
                return ('done', project['id'])
        job = self.visual.agent(project['id'], scene_id, project['revision'], True, state['max_turns'])
        return ('agent', job['id'])
