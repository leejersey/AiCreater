# Visual Upgrade C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No delegation authorized, inline execution, no Git metadata/worktree/commit.

**Status:** Implemented and verified; user playback acceptance pending. 131offline+87disposableDB+181Node, typecheck/build,3real local renders.54→57attempts only render,0paidtasks. No Git/delegation. Evidence output/workbench/visual-C-qa/receipt.json.

**Goal:** Arrays/pointers/variables/loop/input-output in the approved code layout, no execution.
**Architecture:** Optional code.array_name gates rich step fields, shared Schema/semantic validators; current scene edit/candidates/voice/timing persist fields. New CodeStateLesson branch retains old CodeLesson exact default; editor enables empty manually populated snapshot fields.
**Tech Stack:** Existing Python/Postgres/FastAPI/TS/React/Remotion/native SVG only.

## Task1 shared fields/red-green
- [x] Create examples/lessons/code-state.json from maintained python sum example, preserve source/cues, explicitly maintained six snapshots; test services/tests/test_code_state.py and packages/video-schema/tests/code-state.test.ts positive and rejection boundaries.
- [x] Run python3 -m unittest services.tests.test_code_state -v; npx tsx --test packages/video-schema/tests/code-state.test.ts and observe missing-field RED.
- [x] Modify packages/video-schema/schema.json + validate.py + src/validate.ts, regenerate types npm run schema:types. Strict code-only gate array_name and per-step array_items/pointers/loop/input; unique/consecutive/current-reference/finite bounded loop/plain string.
- [x] Focused green, include source-reference restoration, legacy unchanged.

## Task2 renderer/red-green
- [x] Add packages/video-components/tests/code-state.test.ts using final fixture and manual animations for six cues. SSR beforecue/output, pointer cleared yet i retained, empty array, 6cells2pointers, random seek, olddefault, complete long metadata.
- [x] Observe RED, add packages/video-components/src/CodeStateLesson.tsx and branch src/CodeLesson.tsx only when code.array_name defined. Wrap long non-ASCII values4glyphs; preserve ASCII8digit/short lists whole after extra RED/GREEN. New codefont30, code16rows. No dynamic Python/JS evaluation, use existing activeStepAtFrame and palette. Actual max-boundary DOM found tight cell indexes/output; calibrated324/164/190px panels and100px2row cells, final containment verified.
- [x] Focused GREEN; no field mutation/derived math/state.

## Task3 editor and persistence/red-green
- [x] Add apps/web/tests/code-state.test.ts for enable-empty/disable, readonlyIDs/cues/code language, round/JSON fields preserve; services/tests/test_projects.py DB edit/ready/audio/old snapshot/conflict.
- [x] Observe RED; reuse apps/web/lib/editor.ts instead of adding code-state.ts; SceneEditor/CodeStateFields inputs (manual per-step JSON, array_name) preserve older form/updateStep fields. Read apps/web/AGENTS.md and node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md before edit. Provider prompt explains optional fields, no paid invocation.
- [x] GREEN with existing Store.edit_scene/REST, no DB/API extension.

## Task4 verification / idle activation / browser
- [x] python3 -m unittest discover -s services/tests -v; python3 services/tests/run_project_tests.py; npm run test; npm run typecheck; npm run web:build. Final131offline,87realDB,181Node green; production build/typecheck green.
- [x] Verify own services PIDs/CWD and no active jobs, gracefully restart same APIs/workflow/render/beat. Existing web updates only; healthy/HTTP200.
- [x] Independent voiced QA copy: create metadata snapshots retaining spoken text/IDs/cues/animations/captions; self-review,3themes/3local renders,11.669s/350frames each. Verify original project/files/audio/cache/version unchanged, equal decoded PCM and WAV correlation0.9999607672 at original6frame offset.16x48code/6cells/2pointers/44codepointinputoutput/longvariables actual browser checked and temporary fields restored; final containment DOM and normal screenshot inspected. Existing pronunciation unchanged, not new numeric acoustic acceptance.

## Task5 docs/receipt
- [x] README/docs/MVP开发契约.md/docs/mvp-follow-up.md update actual fields/limits and measured results. output/workbench/visual-C-qa/receipt.json evidence; no claims not tested. Only self-review, no Git/independent review, no paid20/nums.
