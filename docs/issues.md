# issues.md — current blockers only

No active blocker is recorded.

Live-browser verification remains: this environment cannot drive a real, logged-in Chrome
session against chatgpt.com, so P006 in `tasks.md` (the launcher button, board overlay, and
insertion ladder actually working against the live site) has not been exercised — only unit
tests, typecheck, lint, and the extension build have run. Follow `docs/adapter-smoke.md` to run
the manual checklist and record the result before relying on this for real use.

When a blocker appears, add one row with the task ID, exact symptom, owner, needed decision,
and the next safe action. Remove the row when resolved; this file is read at session start and
is not an archive of old failures.
