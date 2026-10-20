# Storyboard Template Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bias DeepSeek storyboard generation toward teaching-action → existing template mapping so courses use varied scene types when the manuscript supports it, without new components or hard diversity failures.

**Architecture:** Prompt-only changes inside `storyboard_request`: add a shared action→template selector block; soften base-prompt “always prefer flow” wording; keep/revise `technical` append (no whole-course single flow); add symmetric `popular` append for interleaving. Job freeze / worker paths already pass `teaching_style`—no job API changes.

**Tech Stack:** Python `services/workflow/providers.py`, existing unittest offline prompt assertions, README/getting-started one-liners.

**Spec:** `docs/superpowers/specs/2026-10-19-storyboard-template-diversity-design.md`

**Git note:** Skip all `git commit` steps unless the user explicitly asks. Do not stage the whole tree.

---

## File map

| File | Responsibility |
|------|----------------|
| `services/workflow/providers.py` | Shared diversity block + technical/popular appends; soften conflicting base prefer-flow lines |
| `services/tests/test_teaching_style.py` (or new `test_storyboard_diversity.py`) | Offline prompt assertions for shared + style branches |
| `README.md` / `docs/getting-started.md` | One-line UX note |
| `docs/superpowers/specs/2026-10-19-teaching-style-design.md` | Optional one-line cross-ref to diversity override |

Out of scope: new scene types, hard ≥N type fail, auto re-call model, UI template picker, job/store changes.

---

### Task 1: Failing prompt tests for diversity clauses

**Files:**
- Create or modify: `services/tests/test_storyboard_diversity.py` (prefer new focused file) **or** extend `TeachingStyleProviderTests` in `test_teaching_style.py`
- Prefer **new file** to keep teaching_style tests about persistence/jobs.

- [ ] **Step 1: Write failing tests**

```python
# services/tests/test_storyboard_diversity.py
import unittest
from services.workflow.providers import storyboard_request

def _prompt_text(body):
    return ' '.join(
        m['content'] if isinstance(m['content'], str) else str(m['content'])
        for m in body['messages'])

class StoryboardDiversityPromptTests(unittest.TestCase):
    def test_shared_action_to_template_guidance_present_on_both_styles(self):
        opener = 'Template selection by teaching action'
        for style in ('popular', 'technical'):
            with self.subTest(style=style):
                body, _ = storyboard_request('解释召回与重排。', 'deepseek-flash', teaching_style=style)
                text = _prompt_text(body)
                self.assertIn(opener, text)
                self.assertIn('title_reveal', text)
                self.assertIn('concept', text)
                self.assertIn('flow_diagram', text)
                self.assertIn('comparison_panel', text)
                self.assertIn('code_walkthrough', text)
                self.assertRegex(text, r'do not invent|without fabricating|only when the script supports', re.I)

    def test_technical_forbids_whole_course_single_flow(self):
        body, _ = storyboard_request('解释召回。', 'deepseek-flash', teaching_style='technical')
        text = _prompt_text(body)
        self.assertIn('Template selection by teaching action', text)
        self.assertIn('Teaching style is technical dry-goods', text)
        self.assertRegex(text, r'single flow|整课|entire (script|course|lesson).{0,40}flow', re.I)

    def test_popular_interleaving_append_present_not_technical(self):
        body, _ = storyboard_request('解释蒸发。', 'deepseek-flash', teaching_style='popular')
        text = _prompt_text(body)
        self.assertNotIn('Teaching style is technical dry-goods', text)
        self.assertRegex(text, r'Teaching style is popular|科普|interleav|穿插', re.I)
        self.assertRegex(text, r'concept|title_reveal|card_sequence', re.I)
```

Use exact substrings once implementation strings are chosen; keep assertions distinctive so a missing popular branch fails.

- [ ] **Step 2: Run — expect FAIL**

```bash
python3 -m unittest services.tests.test_storyboard_diversity -v
```

- [ ] **Step 3: Skip commit**

---

### Task 2: Implement storyboard_request diversity prompts

**Files:**
- Modify: `services/workflow/providers.py` (`storyboard_request`)

- [ ] **Step 1: Add shared diversity block**

Append the shared block to the **base** `prompt` string **immediately before** the existing `if style == 'technical':` branch (so both styles and the regenerate-only suffix see “rules above”). Cover the action→template table from the spec, plus:

- Prefer ~4–8 scenes by cognitive steps
- Adjacent scenes: avoid pointless same-`type` repeats; consecutive flow OK for multi-step mechanisms
- Whole lesson may be only flow **if** the script is pure steps with no definition/contrast/open-close material—do not fabricate concept/comparison to pad diversity
- Never invent absent contrast pairs or fake definitions

Suggested distinctive opener string for tests, e.g.:

`Template selection by teaching action (only when the script supports it; do not invent material): ...`

- [ ] **Step 2: Soften conflicting base prefer-flow lines**

Locate lines like `'Prefer flow_diagram for multi-step methods and comparison_panel for side-by-side options...'` and `'For AI show concrete input... using flow_diagram'`.

Reframe so they defer to the new selector, e.g. keep comparison/flow as **options for those semantics**, not a default for the whole script. Do not delete concept/comparison/schema rules.

- [ ] **Step 3: Revise technical append**

Replace/extend current technical append so it still prefers short labels + flow for mechanisms, and **explicitly** says:

- Do not collapse the entire script into a single `flow_diagram`
- When definition / fork-contrast / opening / closing material exists, switch types per the shared table

Keep a stable test marker: `'Teaching style is technical dry-goods'`

- [ ] **Step 4: Add popular append**

```python
elif style == 'popular':
    prompt += (
        'Teaching style is popular science: interleave title_reveal/card_sequence openings, '
        'concept for definitions/examples, and flow_diagram only for real multi-step mechanisms; '
        'do not force long unstructured flows when metaphors and concepts dominate. '
        'Still obey schema and the Template selection by teaching action rules above. '
    )
```

- [ ] **Step 5: Re-run diversity tests — PASS**

Also re-run:

```bash
python3 -m unittest services.tests.test_teaching_style.TeachingStyleProviderTests -v
```

Update any assertion that depended on old technical-only wording if you changed the technical string set (existing test checks `'Teaching style is technical dry-goods'` and absence on popular—keep those valid).

- [ ] **Step 6: Skip commit**

---

### Task 3: Docs + smoke note

**Files:**
- Modify: `README.md` (near teaching style / storyboard note)
- Modify: `docs/getting-started.md` if it mentions 分镜
- Modify: `docs/superpowers/specs/2026-10-19-teaching-style-design.md` — one cross-ref line under 分镜与候选 pointing to the diversity spec for “不得整课单一 flow / 有材料换型”

- [x] **Step 1: Doc edits**

One sentence each: 分镜按讲稿教学动作在现有模板间切换（有材料才换型）；不新增组件；多样性为提示偏好、不因类型过少单独失败。

- [x] **Step 2: Verification**

```bash
python3 -m unittest services.tests.test_storyboard_diversity services.tests.test_teaching_style.TeachingStyleProviderTests -v
```

Manual smoke (optional, costs money): regenerate RAG course with definition+pipeline manuscript; expect ≥2 scene types when materials exist. Not required for plan completion.

- [x] **Step 3: Skip commit** unless user asks

---

## Implementation notes

1. **No job/worker changes** — `teaching_style` already frozen and passed into `deepseek_storyboard`.
2. **No hard diversity validator** — low type diversity must not fail jobs.
3. **Preserve source-owned rules** — diversity must not encourage rewriting narration.
4. After API/worker code change, **restart uvicorn/worker** if running without `--reload` so new prompts load.
