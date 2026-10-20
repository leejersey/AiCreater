# Manuscript-from-title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/courses/new`, let users generate or hand-write a teaching manuscript from a title (plus optional hints), review it on the same page, then create a free draft via existing `POST /api/projects`.

**Architecture:** Add a sync `POST /api/manuscripts/generate` that calls DeepSeek through a small workflow helper (not storyboard). Keep create-project unchanged. Extend local course draft fields for optional hints. Update only the dedicated new-course page UI (not legacy Workbench create form).

**Tech Stack:** FastAPI, httpx/DeepSeek, Next.js client page, existing `request`/`useLocalDraft`, Node + unittest.

**Spec:** `docs/superpowers/specs/2026-10-19-manuscript-from-title-design.md`

**Git note:** Repository still has no initial commit. **Skip all `git commit` steps** in this plan (same rule as account-course-flow). Do not stage the whole tree.

---

## File map

| File | Responsibility |
|------|----------------|
| `services/workflow/manuscript.py` | Build prompt, call DeepSeek, validate plain-text length, structured log |
| `services/api/app.py` | `GenerateManuscript` body + `POST /api/manuscripts/generate` |
| `services/tests/test_manuscript.py` | Offline unit tests for helper + API with mocked client |
| `apps/web/lib/drafts.ts` | Optional `audience` / `duration_hint` / `outline` on course drafts |
| `apps/web/lib/manuscript.ts` | Pure helpers: canGenerate, needsOverwriteConfirm, createButtonLabel |
| `apps/web/app/courses/new/page.tsx` | UI: hints, generate, overwrite warn, confirm-create |
| `apps/web/tests/drafts.test.ts` | Course draft optional fields |
| `apps/web/tests/manuscript.test.ts` | Helper + static markup checks for new page copy/buttons |
| `README.md` / `docs/api-reference.md` | Document new endpoint and create flow |

Out of scope: Workbench legacy create form, storyboard generate, billing confirm, usage tables, async jobs.

---

### Task 1: Manuscript provider helper (offline TDD)

**Files:**
- Create: `services/workflow/manuscript.py`
- Test: `services/tests/test_manuscript.py`

- [x] **Step 1: Write failing unit tests**

```python
# services/tests/test_manuscript.py
import json
import logging
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError, Settings


class ManuscriptHelperTests(unittest.TestCase):
    def settings(self):
        return Settings('sk', 'deepseek-flash', '', 'app', 'ak', 'seed-tts-2.0', 'speaker')

    def test_rejects_blank_title_and_overlong_hints(self):
        from services.workflow import manuscript as m
        with self.assertRaises(ProviderError):
            m.generate_manuscript('', self.settings(), MagicMock())
        with self.assertRaises(ProviderError):
            m.generate_manuscript('题', self.settings(), MagicMock(), audience='x' * 81)

    def test_happy_path_returns_text_and_logs(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(
            status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '蒸发发生在液体表面。'}}],
                          'usage': {'prompt_tokens': 1, 'completion_tokens': 2}})
        with self.assertLogs('services.workflow.manuscript', level='INFO') as logs:
            text = m.generate_manuscript('蒸发', self.settings(), client, user_id='u1',
                                         audience='初中', duration_hint='3分钟', outline='定义→例子')
        self.assertEqual(text, '蒸发发生在液体表面。')
        self.assertTrue(any('manuscript_generate' in r.getMessage() for r in logs.records))
        body = client.post.call_args.kwargs['json']
        self.assertEqual(body['messages'][0]['role'], 'system')
        self.assertIn('蒸发', body['messages'][1]['content'])

    def test_empty_or_overlong_model_text_raises(self):
        from services.workflow import manuscript as m
        client = MagicMock()
        client.post.return_value = MagicMock(
            status_code=200, content=b'{}',
            json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': '   '}}]})
        with self.assertRaises(ProviderError):
            m.generate_manuscript('题', self.settings(), client)
        client.post.return_value.json = lambda: {
            'choices': [{'finish_reason': 'stop', 'message': {'content': '字' * 4001}}]}
        with self.assertRaises(ProviderError) as ctx:
            m.generate_manuscript('题', self.settings(), client)
        self.assertEqual(ctx.exception.code, 'output_limit')
```

- [ ] **Step 2: Run tests — expect fail (import / missing module)**

Run: `python3 -m unittest services.tests.test_manuscript.ManuscriptHelperTests -v`  
Expected: FAIL / ImportError for `services.workflow.manuscript`

- [ ] **Step 3: Minimal implementation**

Create `services/workflow/manuscript.py`:

- `generate_manuscript(title, settings, client, *, audience='', duration_hint='', outline='', user_id=None) -> str`
- Validate: title strip 1–80; optional fields ≤80 / 40 / 1000; no control chars (same spirit as Settings)
- System prompt: write a Chinese teaching narration (plain text only), structure 概念→定义/原理→例子→总结, do not invent unverifiable facts, stay within 4000 code points, no JSON/markdown fences
- POST `https://api.deepseek.com/chat/completions` with Bearer key; disable thinking for flash models like `deepseek_storyboard`
- Parse `choices[0].message.content` as **plain text** (strip); if empty → `ProviderError('manuscript','invalid_response',...)`; if `len(text)>4000` → `ProviderError('manuscript','output_limit',...)`
- On success/failure path used by API: `logging.getLogger(__name__).info` JSON-ish one-liner with keys `event=manuscript_generate`, `user_id`, `chars`, `ok` — never log prompt/body/secrets
- Reuse `_status` / transport error patterns from `providers.py` (import helpers or duplicate minimal HTTP check)

- [ ] **Step 4: Re-run helper tests — expect PASS**

Run: `python3 -m unittest services.tests.test_manuscript.ManuscriptHelperTests -v`  
Expected: OK

- [ ] **Step 5: Skip commit** (no initial git commit)

---

### Task 2: API route with mocked provider

**Files:**
- Modify: `services/api/app.py`
- Modify: `services/tests/test_manuscript.py` (add API cases)

- [ ] **Step 1: Write failing API tests**

Append to `test_manuscript.py` (use same pattern as `ApiTests`: `create_app(store, authentication=False)` **only if** `TEST_DATABASE_URL` set; **also** add a no-DB FastAPI test with MagicMock store like `test_cost_estimates.py`):

```python
class ManuscriptApiOfflineTests(unittest.TestCase):
    def test_route_validates_and_maps_errors(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from unittest.mock import patch, MagicMock
        app = create_app(authentication=False)
        app.state.store = MagicMock()
        app.state.jobs = MagicMock()
        client = TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000))
        bad = client.post('/api/manuscripts/generate', json={'title': ''})
        self.assertIn(bad.status_code, (400, 422))
        with patch('services.api.app.generate_manuscript', return_value='讲稿正文') as gen:
            ok = client.post('/api/manuscripts/generate', json={
                'title': '蒸发', 'audience': '初中', 'duration_hint': '3分钟', 'outline': '定义'})
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(ok.json(), {'text': '讲稿正文'})
            gen.assert_called_once()
        with patch('services.api.app.generate_manuscript', side_effect=ProviderError('manuscript', 'output_limit', 'too long')):
            over = client.post('/api/manuscripts/generate', json={'title': '蒸发'})
            self.assertEqual(over.status_code, 422)
            self.assertEqual(over.json()['code'], 'output_limit')
        app.state.store.create_project.assert_not_called()
        if hasattr(app.state.jobs, 'submit_generate'):
            app.state.jobs.submit_generate.assert_not_called()
```

Assert after success path: `create_project` / generate job submit never called.

Map ProviderError codes in a small handler or inline:

| code | HTTP |
|------|------|
| `output_limit` / validation-ish | 422 |
| `missing_setting` / `invalid_auth` / `invalid_setting` | 503 |
| transport / http / invalid_response | 502 |

- [ ] **Step 2: Run — expect fail (404 route)**

Run: `python3 -m unittest services.tests.test_manuscript.ManuscriptApiOfflineTests -v`  
Expected: FAIL (404 or missing symbol)

- [ ] **Step 3: Implement route**

In `services/api/app.py`:

```python
class GenerateManuscript(Body):
    title: str = Field(min_length=1, max_length=80)
    audience: str = Field(default='', max_length=80)
    duration_hint: str = Field(default='', max_length=40)
    outline: str = Field(default='', max_length=1000)

@app.post('/api/manuscripts/generate')
def manuscript_generate(body: GenerateManuscript, request: Request):
    # Settings.from_env(); httpx.Client(timeout=...); generate_manuscript(... user_id=request.state.user id)
    # catch ProviderError -> JSONResponse with code/message and status mapping
    return {'text': text}
```

Use short-lived `httpx.Client(timeout=120)` (same as `services/workflow/worker.py` DeepSeek/voice clients). Do **not** create projects/jobs. Auth: same `Depends(access)` as other routes (login required when authentication=True).

- [ ] **Step 4: Re-run API offline tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 3: Local draft optional hint fields

**Files:**
- Modify: `apps/web/lib/drafts.ts`
- Modify: `apps/web/tests/drafts.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
test('course drafts accept optional manuscript hints and keep old title/source drafts valid', () => {
  const storage = new MemoryStorage();
  const scope: DraftScope = {kind: 'course', projectId: '', sceneId: ''};
  const raw = writeDraft(storage, scope, 0, {title: '蒸发', source: '旧稿', audience: '初中', duration_hint: '3分钟', outline: '定义'}, null);
  assert.ok(readDraft(raw, scope));
  assert.ok(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b'}}), scope));
  assert.equal(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b',audience:1}}), scope), null);
});
```

(`MemoryStorage` is the local class already defined at the top of `drafts.test.ts`.)

- [ ] **Step 2: Run `npm test -- apps/web/tests/drafts.test.ts` — FAIL**

- [ ] **Step 3: Update `DraftData.course` and `validData`**

```typescript
course: {title: string; source: string; audience?: string; duration_hint?: string; outline?: string};
```

In `validData` for course: required strings `title`,`source`; allowed keys include optional three; each optional must be `string` if present.

- [ ] **Step 4: Re-run drafts tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 4: New course page + UI helpers

**Files:**
- Create: `apps/web/lib/manuscript.ts`
- Create: `apps/web/tests/manuscript.test.ts`
- Modify: `apps/web/app/courses/new/page.tsx`
- Modify: `apps/web/app/courses/page.tsx` — empty-state / intro copy: no longer imply paste-only (“粘贴讲稿” → “生成或填写讲稿”)

- [ ] **Step 1: Failing helper tests**

```typescript
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canGenerate, needsOverwriteConfirm, createButtonLabel} from '../lib/manuscript';

test('generate requires title; overwrite when source non-empty', () => {
  assert.equal(canGenerate({title: '', source: ''}), false);
  assert.equal(canGenerate({title: '蒸发', source: ''}), true);
  assert.equal(needsOverwriteConfirm(''), false);
  assert.equal(needsOverwriteConfirm('已有'), true);
  assert.equal(createButtonLabel(false), '确认讲稿并创建草稿');
});
```

- [ ] **Step 2: Implement `apps/web/lib/manuscript.ts` helpers + page behavior**

Page requirements (from spec):

1. Copy: 可生成或手写讲稿；确认后再创建草稿；生成可能产生模型费用；创建草稿不计费  
2. Optional fields: audience / duration_hint / outline  
3. Button「生成讲稿」: disabled without title or while generating/blocked; if `needsOverwriteConfirm(source)` → `window.confirm('将替换当前讲稿，是否继续？')`; cancel → no request  
4. `request<{text:string}>('/api/manuscripts/generate', {title, audience, duration_hint, outline})`  
5. On success set `source` via draft.change; on failure keep source, show error (`cause` 422 → message)  
6. Submit button label「确认讲稿并创建草稿」; still `POST /api/projects` with title+source only  
7. generating disables generate + create

Initial draft value: `{title:'', source:'', audience:'', duration_hint:'', outline:''}`

- [ ] **Step 3: Static markup / helper tests PASS**

Run: `npm test -- apps/web/tests/manuscript.test.ts apps/web/tests/drafts.test.ts`  
Also `npm run typecheck`

- [ ] **Step 4: Manual smoke (when API up):** title → generate → edit → create → course opens with `source_text`; hand-write path; overwrite cancel

- [ ] **Step 5: Skip commit**

---

### Task 5: Docs + full verification

**Files:**
- Modify: `docs/api-reference.md` — document `POST /api/manuscripts/generate`
- Modify: `README.md` — one line under course create flow
- Do **not** claim project_usage for this path

- [ ] **Step 1: Update docs** to match shipped behavior (sync `{text}`, field caps, 422 on >4000, no project/job)

- [ ] **Step 2: Run verification**

```bash
python3 -m unittest services.tests.test_manuscript -v
npm test
npm run typecheck
```

If `TEST_DATABASE_URL` available, also run existing account/project suites unchanged (create_project still free / no jobs).

- [ ] **Step 3: Skip commit**; record receipt under `output/workbench/manuscript-from-title/` only if user wants evidence later

---

## Acceptance mapping

| Spec # | Covered by |
|--------|------------|
| 1 generate→edit→create | Task 4 smoke + API returns text only |
| 2 hand-write create | Task 4 (unchanged projects POST) |
| 3 overwrite warn | Task 4 confirm |
| 4 failure keeps text | Task 4 error path |
| 5 free create | unchanged `POST /api/projects` |
| 6 >4000 → 422 | Task 1–2 |
| 7 no project_usage | Task 2 asserts no create/job; logging only |

---

## Execution handoff

After plan review approval, choose:

1. **Subagent-Driven** (recommended) — `superpowers:subagent-driven-development`
2. **Inline Execution** — `superpowers:executing-plans`
