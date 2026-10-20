# Teaching Style (科普 / 知识干货) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `teaching_style` (`popular` | `technical`) on each course, let `/courses/new` and course settings choose it, and branch manuscript + storyboard prompts so 干货 favors flow/compare visuals while 科普 keeps the current approachable tone.

**Architecture:** Store the enum in `projects.config` (missing/illegal → `popular`). Create and a free `PATCH .../teaching-style` write it (bump revision). Freeze the resolved value into generate/regenerate job `input` so the worker never re-reads live config. Split manuscript system/user prompts and `storyboard_request` extras by that frozen value. Strip `teaching_style` from `_dsl` / timing config the same way as `visual_style` so VideoProject schema (`additionalProperties: false`) stays valid.

**Tech Stack:** FastAPI/Pydantic, Postgres JSONB config, Celery job input, DeepSeek prompts, Next.js `/courses/new` + Workbench settings, existing `useLocalDraft`.

**Spec:** `docs/superpowers/specs/2026-10-19-teaching-style-design.md`

**Git note:** Repository may still lack a clean initial commit / have unrelated untracked files. **Skip all `git commit` steps** unless the user explicitly asks. Do not stage the whole tree.

---

## File map

| File | Responsibility |
|------|----------------|
| `services/projects/store.py` | `TEACHING_STYLES`, `normalize_teaching_style`, create/PATCH, `_read` expose, `_dsl` strip |
| `services/api/app.py` | `CreateProject.teaching_style`, `GenerateManuscript.teaching_style`, `TeachingStyle` body + PATCH route |
| `services/workflow/manuscript.py` | Prompt branch by `teaching_style` |
| `services/projects/jobs.py` | Freeze `teaching_style` into generate/regenerate payloads; strip from timing config |
| `services/workflow/providers.py` | `storyboard_request` / `deepseek_storyboard` accept `teaching_style` |
| `services/workflow/worker.py` | Pass frozen `payload['teaching_style']` into DeepSeek (default `popular`) |
| `services/tests/test_teaching_style.py` | Store + API + job freeze + prompt assertions (new) |
| `services/tests/test_manuscript.py` | Extend for style branching |
| `apps/web/lib/drafts.ts` | Optional `teaching_style` on course drafts |
| `apps/web/lib/editor.ts` | `Project.teaching_style?: 'popular' \| 'technical'` |
| `apps/web/app/courses/new/page.tsx` | Style control + wire generate/create |
| `apps/web/app/TeachingStyleSettings.tsx` | Course-settings editor (mirror VoiceSettings pattern) |
| `apps/web/app/Workbench.tsx` | Mount settings under 课程设置 |
| `apps/web/tests/drafts.test.ts` / `teaching-style.test.ts` | Draft + static markup |
| `README.md` / `docs/api-reference.md` | One-line UX + endpoint notes |

Out of scope: new scene types, auto-regenerate on style change, list-page style badges, billing/usage changes, putting style into voice profile equality.

---

### Task 1: Store normalize + create + PATCH + DSL strip

**Files:**
- Modify: `services/projects/store.py`
- Test: `services/tests/test_teaching_style.py` (create)

- [ ] **Step 1: Write failing store tests**

```python
# services/tests/test_teaching_style.py
import unittest
from services.projects.store import StoreError
# Use same DB harness as test_projects / test_workbench_styles when TEST_DATABASE_URL is set.
# Offline-only pieces can test normalize_teaching_style without DB.

class TeachingStyleNormalizeTests(unittest.TestCase):
    def test_normalize_defaults_and_rejects(self):
        from services.projects.store import normalize_teaching_style
        self.assertEqual(normalize_teaching_style(None), 'popular')
        self.assertEqual(normalize_teaching_style(''), 'popular')
        self.assertEqual(normalize_teaching_style('technical'), 'technical')
        with self.assertRaises(StoreError):
            normalize_teaching_style('marketing')
        with self.assertRaises(StoreError):
            normalize_teaching_style(True)

# With DB (skip if no TEST_DATABASE_URL):
class TeachingStyleStoreTests(unittest.TestCase):
    def test_create_persists_and_defaults(self):
        # create_project(..., teaching_style='technical') → project['teaching_style']=='technical'
        # and project['config']['teaching_style']=='technical'
        # omit arg → 'popular'; omit key on old-style config row → _read returns 'popular'
        # set_teaching_style bumps revision; scenes unchanged; same value is no-op (no bump)
        # illegal style → StoreError validation
        # _dsl(project) must NOT contain teaching_style or visual_style
        pass
```

Fill the DB cases with the same `Store` fixture pattern as `services/tests/test_project_voice.py` / `test_workbench_styles.py` (create store, create_project, assert).

- [ ] **Step 2: Run — expect fail (missing symbols)**

Run: `python3 -m unittest services.tests.test_teaching_style.TeachingStyleNormalizeTests -v`  
Expected: ImportError / AttributeError for `normalize_teaching_style`

- [ ] **Step 3: Implement store helpers**

In `services/projects/store.py`:

```python
TEACHING_STYLES = frozenset({'popular', 'technical'})

def normalize_teaching_style(value, *, required=False):
    """When required=False, None/'' → popular. Illegal non-empty → StoreError('validation', ...)."""
    if value is None or value == '':
        if required:
            raise StoreError('validation', 'Expected teaching_style popular|technical')
        return 'popular'
    if not isinstance(value, str) or value not in TEACHING_STYLES:
        raise StoreError('validation', 'Expected teaching_style popular|technical')
    return value
```

- `create_project(self, title, source_text, owner_id=None, teaching_style=None)`: normalize (default popular); put `'teaching_style': style` into initial `config` dict alongside `schema_version` / `theme` / …
- `_read`: add `'teaching_style': normalize_teaching_style(row['config'].get('teaching_style'))` (treat illegal stored values as popular for **read** only — use a soft path: if raw not in set, return `'popular'` without raising, matching spec “缺失或非法 → 视为 popular”)
  - Prefer: `def effective_teaching_style(config): raw=config.get('teaching_style'); return raw if raw in TEACHING_STYLES else 'popular'`
  - Keep `normalize_teaching_style` strict for **writes**
- `_dsl`: strip both `visual_style` and `teaching_style`:
  ```python
  config = {k: copy.deepcopy(v) for k, v in project['config'].items()
            if k not in ('visual_style', 'teaching_style')}
  ```
- `set_teaching_style(self, project_id, expected_revision, teaching_style)`: mirror `set_visual_style` / `set_voice`:
  - `revision(expected_revision)`; `style = normalize_teaching_style(teaching_style, required=True)`
  - `_structure_project` (blocks while generate queued/running — same as voice/style)
  - if `effective_teaching_style(project['config']) == style`: return project unchanged
  - else update config key, `revision=revision+1`, return `_read`

- [ ] **Step 4: Re-run store tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 2: API create + manuscript field + PATCH route

**Files:**
- Modify: `services/api/app.py`
- Modify: `services/tests/test_teaching_style.py` (API offline cases)

- [ ] **Step 1: Failing API tests (no DB)**

```python
class TeachingStyleApiOfflineTests(unittest.TestCase):
    def test_create_and_patch_and_manuscript_accept_style(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from unittest.mock import MagicMock, patch
        app = create_app(authentication=False)
        app.state.store = MagicMock()
        app.state.jobs = MagicMock()
        client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))

        app.state.store.create_project.return_value = {'id': 'p', 'teaching_style': 'technical'}
        ok = client.post('/api/projects', json={
            'title': 'RAG', 'source_text': '口播。', 'mode': 'script', 'teaching_style': 'technical'})
        self.assertEqual(ok.status_code, 201)
        app.state.store.create_project.assert_called_once()
        # Prefer kwargs; if create_project uses positional 4th arg, assert args[3] instead.
        kwargs = app.state.store.create_project.call_args.kwargs
        self.assertEqual(kwargs.get('teaching_style'), 'technical')

        bad = client.post('/api/projects', json={
            'title': 'RAG', 'source_text': '口播。', 'mode': 'script', 'teaching_style': 'nope'})
        self.assertIn(bad.status_code, (400, 422))

        app.state.store.set_teaching_style.return_value = {'id': 'p', 'revision': 2, 'teaching_style': 'popular'}
        patch_ok = client.patch('/api/projects/p/teaching-style',
            json={'expected_revision': 1, 'teaching_style': 'popular'})
        self.assertEqual(patch_ok.status_code, 200)
        app.state.store.set_teaching_style.assert_called_once_with('p', 1, 'popular')

        with patch('services.api.app.generate_manuscript', return_value='正文') as gen:
            ms = client.post('/api/manuscripts/generate', json={
                'title': 'RAG', 'teaching_style': 'technical'})
            self.assertEqual(ms.status_code, 200)
            self.assertEqual(gen.call_args.kwargs.get('teaching_style'), 'technical')
```

- [ ] **Step 2: Run — expect fail (422 extra field / 404 PATCH)**

- [ ] **Step 3: Implement API**

```python
class GenerateManuscript(Body):
    ...
    teaching_style: Literal['popular', 'technical'] = 'popular'

class CreateProject(Body):
    title: str = ...
    source_text: str = ...
    mode: Literal['script'] = 'script'
    teaching_style: Literal['popular', 'technical'] = 'popular'

class TeachingStyle(Revision):
    teaching_style: Literal['popular', 'technical']

# create():
return store.create_project(body.title, body.source_text, owner_id, teaching_style=body.teaching_style)

# manuscript_generate: pass teaching_style=body.teaching_style into generate_manuscript

@app.patch('/api/projects/{project_id}/teaching-style')
def project_teaching_style(project_id, body: TeachingStyle, request):
    return request.app.state.store.set_teaching_style(project_id, body.expected_revision, body.teaching_style)
```

Map store `validation` → 400/422 via existing StoreError handlers (same as voice).

- [ ] **Step 4: Re-run API offline tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 3: Manuscript prompt branching

**Files:**
- Modify: `services/workflow/manuscript.py`
- Modify: `services/tests/test_manuscript.py`

- [ ] **Step 1: Failing helper tests**

Extend `ManuscriptHelperTests`:

```python
def test_technical_vs_popular_prompts(self):
    from services.workflow import manuscript as m
    client = MagicMock()
    client.post.return_value = MagicMock(
        status_code=200, content=b'{}',
        json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '口播正文。'}}],
                      'usage': {'prompt_tokens': 1, 'completion_tokens': 1}})
    m.generate_manuscript('RAG', self.settings(), client, teaching_style='technical', outline='')
    tech_system = client.post.call_args.kwargs['json']['messages'][0]['content']
    tech_user = client.post.call_args.kwargs['json']['messages'][1]['content']
    self.assertIn('机制', tech_system)  # or assert distinctive technical clause
    self.assertIn('这里不展开', tech_system)  # forbidden-skip instruction present for technical

    m.generate_manuscript('蒸发', self.settings(), client, teaching_style='popular')
    pop_system = client.post.call_args.kwargs['json']['messages'][0]['content']
    self.assertNotEqual(tech_system, pop_system)
    # popular may allow metaphor; must not require empty-outline mechanism extraction the same way

def test_rejects_bad_teaching_style(self):
    from services.workflow import manuscript as m
    with self.assertRaises(ProviderError):
        m.generate_manuscript('题', self.settings(), MagicMock(), teaching_style='nope')
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement branching**

Refactor `manuscript.py`:

- `generate_manuscript(..., teaching_style='popular')`
- Validate style ∈ `{popular, technical}` (else `ProviderError('manuscript','input_limit',...)`)
- **`_SYSTEM_POPULAR`**: approachable teaching narration; metaphors/concepts OK; still plain Chinese text, no invented facts, ≤4000; lighter on forced terminology when outline empty
- **`_SYSTEM_TECHNICAL`**: keep today’s dry-goods rules (no “这里不展开”; cover outline terms; English terms + Chinese gloss; mechanism-first; no fabricated numbers)
- `_user_message`: for `technical` + empty outline → “从标题提炼可操作机制与常用术语…”; for `popular` → softer “可按概念与例子展开” (still cover outline if present)
- Default parameter `teaching_style='popular'` so old callers stay 科普

- [ ] **Step 4: Re-run manuscript tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 4: Freeze style into generate / regenerate jobs + worker

**Files:**
- Modify: `services/projects/jobs.py`
- Modify: `services/workflow/worker.py`
- Modify: `services/workflow/providers.py`
- Modify: `services/tests/test_teaching_style.py` (job cases; needs DB)

- [ ] **Step 1: Failing job / provider tests**

```python
# DB: submit_generate on technical project → job['input']['teaching_style']=='technical'
# DB: project without key → input teaching_style 'popular'
# DB: submit_regenerate likewise freezes current effective style
# Do NOT add teaching_style to the SQL SELECT dedup WHERE (spec); only put it inside payload
# (PATCH bumps revision → new base_revision slot)

# Offline provider:
def test_storyboard_prompt_includes_technical_guidance():
    from services.workflow.providers import storyboard_request
    body, _ = storyboard_request('解释召回。', 'deepseek-flash', teaching_style='technical')
    prompt = body['messages'][0]['content']  # or whichever message holds instructions
    self.assertIn('flow_diagram', prompt)
    self.assertIn('comparison_panel', prompt)
    # distinctive: prefer flow; comparison only 2/4/6 elements; avoid long unstructured text cards

    body2, _ = storyboard_request('解释蒸发。', 'deepseek-flash', teaching_style='popular')
    self.assertNotIn('少用无结构长文案卡', body2['messages']...)  # or whatever unique technical clause
```

Inspect current `storyboard_request` message layout before asserting indices.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement freeze + prompts**

`jobs.py` — in both generate payload sites (fresh insert + cancelled/failed reopen) and `submit_regenerate`:

```python
'teaching_style': project['teaching_style'],  # from _read / effective_teaching_style(config)
```

`_timing_payload` config filter: also exclude `teaching_style` (timing does not need it; avoids accidental DSL bleed).

`providers.py`:

```python
def storyboard_request(text, model, original_scene=None, *, cue_quotes=True, teaching_style='popular'):
    style = teaching_style if teaching_style in ('popular', 'technical') else 'popular'
    ...
    if style == 'technical':
        prompt += (
            'Teaching style is technical dry-goods: prefer flow_diagram for multi-step mechanisms; '
            'use comparison_panel only for real forks/options with exactly 2, 4, or 6 elements; '
            'prefer short term labels over long unstructured text-only cards; '
            'still obey all schema, concept_role, and field-isolation rules above. '
        )
    # popular: leave existing preference text as-is (already mentions flow/comparison optionally)

def deepseek_storyboard(..., teaching_style='popular', ...):
    body, parts = storyboard_request(..., teaching_style=teaching_style)
```

`worker.py` child path for generate/regenerate:

```python
style = payload.get('teaching_style') or 'popular'
if style not in ('popular', 'technical'):
    style = 'popular'
options = {**usage_options, ..., 'teaching_style': style}
```

`estimates.py` uses `storyboard_request` for token estimates — optional: pass project style if estimate payload gains it later; **this round** default `popular` is OK (spec: estimates not required). Do not break call sites.

- [ ] **Step 4: Re-run teaching_style + related provider tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 5: Frontend drafts + new course page

**Files:**
- Modify: `apps/web/lib/drafts.ts`
- Modify: `apps/web/app/courses/new/page.tsx`
- Modify: `apps/web/tests/drafts.test.ts`
- Create/modify: `apps/web/tests/teaching-style.test.ts` (static markup)

- [ ] **Step 1: Failing draft + page tests**

```typescript
// drafts.test.ts
test('course drafts accept optional teaching_style popular|technical', () => {
  const storage = new MemoryStorage();
  const scope: DraftScope = {kind: 'course', projectId: '', sceneId: ''};
  assert.ok(writeDraft(storage, scope, 0, {title: 'a', source: 'b', teaching_style: 'technical'}, null));
  assert.ok(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b'}}), scope));
  assert.equal(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',
    data:{title:'a',source:'b',teaching_style:'nope'}}), scope), null);
});
```

Page markup test (renderToStaticMarkup): default radio/select 科普; outline placeholder mentions术语链路 when technical selected — can unit-test a tiny helper if markup is awkward:

```typescript
// apps/web/lib/teaching-style.ts
export type TeachingStyle = 'popular' | 'technical';
export function outlinePlaceholder(style: TeachingStyle): string {
  return style === 'technical'
    ? '例如：embedding 向量化 → 召回 topK → rerank → 拼上下文生成；越具体越偏干货'
    : '例如：先讲清概念，再用生活例子帮助理解';
}
export function isTeachingStyle(v: unknown): v is TeachingStyle {
  return v === 'popular' || v === 'technical';
}
```

- [ ] **Step 2: Run web tests — expect fail**

- [ ] **Step 3: Implement**

`drafts.ts`:
- `course: { ..., teaching_style?: string }`
- `allowed` includes `teaching_style`
- Accept only if undefined or `'popular'|'technical'` (reject other strings like outline type check)

`courses/new/page.tsx`:
- `initial = {..., teaching_style: 'popular'}`
- Control: `<label>讲解风格<select value=...>` with 科普 / 知识干货
- Hint under control: 干货偏机制与术语；科普可偏比喻与概念。创建后仍可在课程设置中修改（只影响之后新生成的分镜）。
- `onGenerate` body includes `teaching_style: draft.value.teaching_style ?? 'popular'`
- Create POST includes `teaching_style`
- Outline placeholder from `outlinePlaceholder(...)`

- [ ] **Step 4: Re-run web unit tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 6: Course settings UI

**Files:**
- Create: `apps/web/app/TeachingStyleSettings.tsx`
- Modify: `apps/web/app/Workbench.tsx`
- Modify: `apps/web/lib/editor.ts` (`Project.teaching_style?`)
- Modify: `apps/web/lib/drafts.ts` (new draft kind `teaching-style`)
- Test: `apps/web/tests/teaching-style.test.ts` / `drafts.test.ts`

- [ ] **Step 1: Failing markup test**

Mirror `project-voice.test.ts`: render `TeachingStyleSettings` with a fake project; assert copy contains「仅影响之后新生成的分镜」and options 科普/知识干货; busy disables fieldset.

- [ ] **Step 2: Implement component**

Pattern from `VoiceSettings` / `VisualStyleSettings`:
- Local draft kind: either reuse a new draft kind `'teaching-style': {teaching_style:string}` **or** keep ephemeral React state only.
  - Prefer **new draft kind** for 409 recovery parity with voice (spec: “409 时前端保留表单输入”).
  - That requires extending `DraftData` / `validData` / `validScope` (kind with projectId, empty sceneId like voice).
- `onSave(style)` → parent `PATCH /api/projects/{id}/teaching-style` with `expected_revision`
- On success clear draft; parent `setProject(data)`
- Summary text under 课程设置: update to「课程设置 · 声音、视觉风格与讲解风格」
- Mirror `voiceEditing` / `styleEditing` with `teachingStyleEditing`; include it in Workbench/`SceneEditor` dirty/disabled logic the same way visual style is gated.

Workbench mount next to VoiceSettings / VisualStyleSettings.

`Project` type: `teaching_style?: 'popular' | 'technical'` — when undefined (old API), UI treats as `popular`.

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Skip commit**

---

### Task 7: Docs + full verification

**Files:**
- Modify: `README.md` (short note near create-course / manuscript flow)
- Modify: `docs/api-reference.md` (create body field, manuscript field, new PATCH)
- Modify: `docs/getting-started.md` (one-line note if the create-course section exists)

- [x] **Step 1: Doc edits**

- README: 新建课可选「科普 / 知识干货」；风格写入课程并影响讲稿与后续分镜偏好；改风格不自动重跑已有场景。
- getting-started: same one-liner near first-course steps if present.
- api-reference: document `teaching_style` on `POST /api/projects`, `POST /api/manuscripts/generate`, `PATCH /api/projects/{id}/teaching-style`; note defaults/`popular`; note generate job input freeze.

- [x] **Step 2: Run verification**

```bash
python3 -m unittest services.tests.test_teaching_style services.tests.test_manuscript -v
# If TEST_DATABASE_URL set, also:
python3 -m unittest services.tests.test_projects.ProjectVoiceTests -v  # smoke unrelated regression optional
cd apps/web && node --test tests/drafts.test.ts tests/teaching-style.test.ts tests/manuscript.test.ts
```

Expected: all OK.

Manual acceptance (from spec):
1. New course technical → manuscript request + create config `technical`
2. Old project missing key → reads popular; generate input popular
3. Technical storyboard prompt differs; popular does not get technical-only clauses
4. PATCH bumps revision; scenes unchanged; next generate uses new style
5. LocalDraft restores teaching_style; illegal rejected
6. Omitting field still works (popular)

- [x] **Step 3: Skip commit** unless user asks

---

## Implementation notes (do not skip)

1. **`_dsl` must strip `teaching_style`** — VideoProject JSON schema has `additionalProperties: false`. Same for timing payload config filter.
2. **Dedup SELECT** stays without `teaching_style`; PATCH always bumps revision so new generates get a new `base_revision` slot.
3. **Worker only trusts job input**, never live `get_project` for style during storyboard.
4. **Voice profile equality** must ignore teaching_style (it is not in voice/profile objects if you only store it under `config` and job input).
5. **No auto regenerate** after PATCH — UI copy must say so.
6. Current `manuscript.py` system prompt is already dry-goods-leaning; Task 3 must **split** so `popular` is softer and `technical` keeps the strict rules — do not leave both styles on the current single prompt.
