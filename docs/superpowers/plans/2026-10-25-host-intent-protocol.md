# Host Intent Protocol Integration

Goal: explicitly opt into the offline intent compiler from Node/CLI generation,
without changing existing source or host-motion behavior, API or web defaults.

- [x] Add failing tests for bounded intent/artwork schema, strict assembly parsing,
  generated provenance, inherited single-request repair and tamper rejection.
- [x] Add motion-intent-assembly:1 schema, prompt and trusted compilation adapter.
- [x] Wire host-intent into Node/CLI; freeze raw intent, compiled assembly and
  independent hashes. Recompile and verify both on later repair/preview reads.
- [x] Preserve failure accounting, no-retry behavior, source approval and geometry.
- [x] Run focused/full tests and scoped TypeScript; document remaining API/web work.

No real provider/TTS calls, new scene execution, API jobs or legacy conversions.

Final results: 19 intent/motion focused tests passed; CLI mode case passed in
full regression. Full Node: 793 tests, 792 passed, 1 skipped, 0 failed.
Scoped TypeScript and git diff --check passed. The independent review raised
four failure-recovery integrity gaps; each was reproduced and covered before
the final passing run, and final static re-review found no further clear issue.
Logs: /tmp/aicreater-host-intent-focused-last.log and
/tmp/aicreater-host-intent-complete-tests.log.
