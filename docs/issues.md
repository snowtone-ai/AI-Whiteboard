# issues.md — current blockers only

No active blocker is recorded.

All three site adapters (chatgpt.com, claude.ai, gemini.google.com) have had their attach
mechanism confirmed live — claude.ai fully by the owner's own hands (round 6), chatgpt.com and
gemini.google.com tool-side via `chrome-devtools-mcp` against the owner's real authenticated
sessions (rounds 4/9/10). The remaining gap on those two is the owner's own unpacked-extension
pass, tracked in `tasks.md`'s P006/P008 rows and `docs/adapter-smoke.md` — not a blocker, since
nothing is stopping that pass except the owner's own time.

When a blocker appears, add one row with the task ID, exact symptom, owner, needed decision,
and the next safe action. Remove the row when resolved; this file is read at session start and
is not an archive of old failures.
