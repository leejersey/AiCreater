# Visible Video Task Feedback

Scope: fix contradictory approval messages during rendering and restore essential live feedback outside collapsed history. No provider calls, rendering or task mutation for verification.

- [x] An active chapter job suppresses the previous prepared-source approval action.
- [x] Show truthful task phases, submit elapsed time, last successful poll, explicit refresh and cancellation.
- [x] Use indeterminate progress only; backend does not expose numeric frame progress.
- [x] Surface failure/cancellation and missing-video results in the main video area.
- [x] Explain project-wide blocking tasks and allow navigation to the executing chapter.
- [x] Retain real job creation timestamps in strict response parsing.
- [x] Verify48 focused tests, web typecheck and live payload compatibility.

The elapsed label includes queue time and is deliberately "已等待", not CPU/render runtime. State polling remains every3 seconds; elapsed display updates every second only while a task is active. A stale-state warning appears after15 seconds without a successful poll. Native progress is indeterminate rather than a fabricated percentage. Exact source-hash approval and all backend safety gates remain unchanged.
