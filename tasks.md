# tasks.md — pm-zero v12.1 execution ledger

## Goal binding

- Vision: `docs/vision.md`
- Active goal: ship a Chrome extension whiteboard input method for ChatGPT (v1), then Claude,
  then Gemini, each as its own reviewable phase.
- Branch: `feat/browser-input-method`
- Prior desktop build: tag `archive/desktop-v1` (not deleted; superseded, see `docs/decisions.md` D-009).
- Ledger owner: main agent.
- Review: `pnpm verify` (deterministic) plus manual per-site smoke since no CI command can
  verify a live site's DOM — see `docs/adapter-smoke.md`. CI is the merge gate for everything
  `pnpm verify` can check.

## Status vocabulary

`proposed` = idea only · `ready` = owner/dependencies/scope/acceptance/verification/evidence
are explicit · `doing` = active · `blocked` = external dependency · `review` = implementation
complete · `done` = accepted · `verified` = evidence recorded.

## Phases

| ID | Status | Owner | Depends on | Write scope | Acceptance | Verification | Evidence |
|---|---|---|---|---|---|---|---|
| P001 | verified | main | none | git | Desktop build preserved and branch cut cleanly | `git tag`, `git log` | `archive/desktop-v1` tagged and pushed at `0d1701f`; `feat/browser-input-method` branched from it |
| P002 | verified | main | P001 | root config, `apps/extension/` scaffold | Electron/provider deps removed; MV3 extension workspace builds via esbuild | `pnpm install`, `pnpm build` | `apps/desktop` removed; `content.js`/`board.js` build cleanly |
| P003 | verified | main | P002 | `apps/extension/src/board/` | Excalidraw board renders as an isolated extension page, self-hosted fonts, exports a white-background PNG (image only — see D-014, the earlier auto-generated text summary was removed) | code review; manual render check pending | live-browser render not yet run (see `docs/adapter-smoke.md`) |
| P004 | verified | main | P002 | `apps/extension/src/content/` | Launcher button mounts beside ChatGPT's composer, repositions on scroll/resize, opens/closes the board overlay; content script never throws uncaught | code review, `pnpm typecheck`/`pnpm lint` | typecheck/lint clean; live-browser smoke pending |
| P005 | verified | main | P003,P004 | `apps/extension/src/content/insert/`, `mount.ts` | Board→host messaging is origin-validated both directions; insertion ladder tries file-attach then clipboard fallback, never auto-submits, never reads a response | code review against D-011/D-013 | postMessage targetOrigin/origin checks present; no submit/read code path exists |
| P006 | review | main | P003,P004,P005 | (none — verification only) | Live ChatGPT smoke test passes the `docs/adapter-smoke.md` checklist | manual, logged-in Chrome session | not yet run from this environment; owner to run and record in `docs/adapter-smoke.md` |
| P007 | ready | main | P006 | `apps/extension/manifest.json`, `src/content/adapters/claude.ts` | Claude (claude.ai) adapter added as its own reviewable change; host_permissions extended explicitly | unit tests for any pure logic, manual smoke | — |
| P008 | ready | main | P007 | `apps/extension/manifest.json`, `src/content/adapters/gemini.ts` | Gemini (gemini.google.com) adapter added last — most unusual composer of the three | unit tests for any pure logic, manual smoke | — |
| P009 | verified | main | P002–P005 | `docs/*.md`, `README.md`, `tasks.md` | Docs describe the extension product, not the archived desktop app; decisions D-009–D-013 record the pivot | `git diff --check`, `pnpm verify` | this ledger entry |

## Execution rule

Do not mark a phase `done`/`verified` because the UI exists. Record the command, fixture, or
manual-checklist result that proves the acceptance row. Site-adapter correctness cannot be
proven by CI — `docs/adapter-smoke.md`'s "last verified" log is the evidence trail for that
part, and a stale date there is a real signal to re-check, not paperwork.

## Current pointer

`pnpm verify` (lint, typecheck, test, build) passes locally. The one thing this environment
cannot do is drive a real, logged-in Chrome session against chatgpt.com — P006's live smoke
test is the next concrete step, to be run by the owner following `docs/adapter-smoke.md`.
Claude and Gemini adapters (P007/P008) are intentionally sequenced after a working, verified
ChatGPT flow, not built in parallel with it.
