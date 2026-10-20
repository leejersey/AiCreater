# Project Delete (我的视频) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users permanently remove a course from「我的视频」via `POST /api/projects/{id}/delete`, clearing related DB rows while refusing when jobs are queued/running, without scrubbing object storage.

**Architecture:** Add `Store.delete_project` with project lock + active-job guard + FK-safe delete order (`scene_candidates` → `job_attempts` → `jobs` → `scenes` → `project_versions` → `projects`). Expose POST route mirroring scene-delete `confirmed`/`expected_revision`. Wire `/courses` card delete + confirm dialog.

**Tech Stack:** FastAPI, Postgres (psycopg), Next.js courses page, existing `useConfirm` / `request`.

**Spec:** `docs/superpowers/specs/2026-10-20-project-delete-design.md`

**Git note:** Skip all `git commit` steps unless the user explicitly asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `services/projects/store.py` | `delete_project(...)` |
| `services/api/app.py` | `DeleteProject` body + `POST .../delete` |
| `services/tests/test_project_delete.py` | Store + offline API tests (new) |
| `apps/web/app/courses/page.tsx` | Delete control + confirm + refresh |
| `apps/web/lib/drafts.ts` (optional helper) | Clear drafts for a `projectId` |
| `docs/api-reference.md` / `README.md` | Document endpoint |

---

### Task 1: Store `delete_project` (DB TDD)

**Files:**
- Modify: `services/projects/store.py`
- Create: `services/tests/test_project_delete.py`

- [ ] **Step 1: Write failing DB tests** (`@unittest.skipUnless(TEST_DATABASE_URL, ...)`, reuse `ProjectFixture`)

```python
class ProjectDeleteStoreTests(ProjectFixture, unittest.TestCase):
    def test_delete_removes_project_and_children(self):
        # create_project; optionally add scene via fixture project
        # delete_project(id, revision, confirmed=True)
        # get_project → StoreError not_found
        # SQL counts for scenes/jobs/versions for that id == 0

    def test_delete_rejects_unconfirmed_and_stale_revision(self):
        # confirmed=False → validation
        # wrong revision → conflict

    def test_delete_rejects_active_jobs(self):
        # submit_generate on empty project → queued
        # delete_project → not_ready; project still gettable
        # cancel job (or succeed) then delete ok

    def test_delete_with_candidate_and_attempt_fk(self):
        # Prefer: accept a regenerate candidate path OR insert minimal rows:
        # scene + job + job_attempt + scene_candidates referencing (source_job_id, source_attempt_id)
        # delete_project must succeed (guards the FK order)
```

Inspect how other tests create candidates (`test_projects` accept candidate) if inserting by hand is awkward.

- [ ] **Step 2: Run — expect fail (missing method)**

```bash
python3 -m unittest services.tests.test_project_delete.ProjectDeleteStoreTests -v
# or via run_project_tests only if env provides disposable PG; prefer TEST_DATABASE_URL
```

- [ ] **Step 3: Implement `delete_project`**

```python
def delete_project(self, project_id, expected_revision, confirmed):
    revision(expected_revision)
    if confirmed is not True:
        raise StoreError('validation', 'Explicit project deletion confirmation required')
    with self.connection() as conn:
        project = self._read(conn, project_id, lock=True)
        if project['revision'] != expected_revision:
            raise StoreError('conflict', 'Project revision changed')
        if conn.execute(
            "SELECT id FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1",
            [project['id']]).fetchone():
            raise StoreError('not_ready', 'Wait for project jobs to finish or cancel them first')
        pid = project['id']
        conn.execute(
            '''DELETE FROM scene_candidates WHERE scene_id IN
               (SELECT id FROM scenes WHERE project_id=%s)''', [pid])
        conn.execute(
            '''DELETE FROM job_attempts WHERE job_id IN
               (SELECT id FROM jobs WHERE project_id=%s)''', [pid])
        conn.execute('DELETE FROM jobs WHERE project_id=%s', [pid])
        conn.execute('DELETE FROM scenes WHERE project_id=%s', [pid])
        conn.execute('DELETE FROM project_versions WHERE project_id=%s', [pid])
        conn.execute('DELETE FROM projects WHERE id=%s', [pid])
```

Ownership is enforced by API layer (existing access middleware + project ownership checks on routes—mirror how `get_project` / scene delete authorize). If store is called only after access, OK; if other routes check owner in store, follow the same pattern.

- [ ] **Step 4: Re-run store tests — PASS**

- [ ] **Step 5: Skip commit**

---

### Task 2: API route

**Files:**
- Modify: `services/api/app.py`
- Modify: `services/tests/test_project_delete.py` (offline API cases)

- [ ] **Step 1: Failing offline API test**

```python
class ProjectDeleteApiOfflineTests(unittest.TestCase):
    def test_delete_route_validates_and_delegates(self):
        # create_app(authentication=False); mock store
        # POST /api/projects/p/delete {expected_revision:1,confirmed:true} → 200
        # store.delete_project.assert_called_once_with('p', 1, True)
        # confirmed false / missing → 422
        # Origin evil → 403 if other routes do
```

- [ ] **Step 2: Implement**

```python
class DeleteProject(Revision):
    confirmed: bool

@app.post('/api/projects/{project_id}/delete')
def delete_project(project_id: str, body: DeleteProject, request: Request):
    request.app.state.store.delete_project(project_id, body.expected_revision, body.confirmed)
    return {'ok': True}
```

Place near other project routes. Ensure StoreError mapping already returns 409 for `not_ready`/`conflict` and 422 for `validation`.

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Skip commit**

---

### Task 3: Courses list UI

**Files:**
- Modify: `apps/web/app/courses/page.tsx`
- Optional: `apps/web/lib/drafts.ts` add `clearProjectDrafts(storage, projectId)` that iterates keys under `DRAFT_PREFIX` / user prefix and removes scopes with matching `projectId`
- Optional test: `apps/web/tests/courses-delete.test.ts` static markup or helper

- [ ] **Step 1: UI**

On each card (besides「继续制作」):

- Button「删除」(`Trash2` icon if available in Icons)
- `useConfirm`: title「删除此视频？」; message 不可恢复、不从对象存储清文件可省略细节；detail 若有活动任务请先进课取消
- On confirm: `request('/api/projects/'+p.id+'/delete', {expected_revision: p.revision, confirmed: true})`  
  Note: list summaries include `revision` — use it; if missing, load fails → show error
- Success: `setProjects` filter out id or `load()`; optionally `clearProjectDrafts`
- Busy: disable delete while `loading` or per-card `deletingId`

- [ ] **Step 2: Manual / unit check**

Confirm cancel does not call API (if testing with mock request helper patterns exist).

- [ ] **Step 3: Skip commit**

---

### Task 4: Docs + verification

**Files:**
- `docs/api-reference.md` — new `POST /api/projects/{id}/delete` section
- `README.md` or getting-started — one line under 账号与课程：列表可删除整课（有任务时需先取消）

- [ ] **Step 1: Docs**

- [ ] **Step 2: Run**

```bash
python3 -m unittest services.tests.test_project_delete -v
# with TEST_DATABASE_URL for store cases
cd apps/web && npx tsx --test tests/courses-delete.test.ts  # if added
```

- [ ] **Step 3: Skip commit** unless asked

---

## Implementation notes

1. **FK order is mandatory** — candidates before attempts.
2. **No storage scrub** — do not call ObjectStore delete.
3. **Restart API** after deploy so the new route exists (404 otherwise).
4. List `revision` must be sent; summaries already expose it per api-reference.
