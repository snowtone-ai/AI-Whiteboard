# issues.md — current blockers only

No active blocker is recorded.

Credential-dependent verification remains: live OpenAI, Anthropic and Gemini requests were
not executed because no API secrets are stored in the repository. The adapters are covered by
validation/offline tests and compile against their official SDKs; perform one live request per
configured provider before relying on it for a family workflow.

When a blocker appears, add one row with the task ID, exact symptom, owner, needed decision,
and the next safe action. Remove the row when resolved; this file is read at session start and
is not an archive of old failures.
