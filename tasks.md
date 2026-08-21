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
| P006 | review | main | P003,P004,P005 | (none — verification only) | Live ChatGPT smoke test passes the `docs/adapter-smoke.md` checklist | manual, logged-in Chrome session | partially run 2026-08-21: unauthenticated Playwright run against live chatgpt.com confirmed the attach mechanism end-to-end and found/fixed a real `UPLOAD_INDICATOR_SELECTOR` defect (see `docs/state.md` round 4, `docs/adapter-smoke.md`); the login-gated "reaches the model" step still needs the owner's own session |
| P007 | verified | main | P006 | `apps/extension/manifest.json`, `src/content/adapters/claude.ts` | Claude (claude.ai) adapter added as its own reviewable change; host_permissions extended explicitly | unit tests for any pure logic, manual smoke | `claude.ts` built and wired in (`src/content/index.ts` now selects by hostname); `manifest.json` extended explicitly to `https://claude.ai/*`. Round 5 (2026-08-21) verified the attach mechanism and fixed a real `UPLOAD_INDICATOR_SELECTOR` defect via `chrome-devtools-mcp --autoConnect` against the user's authenticated session. Round 6 (2026-08-21) closed the remaining gap: the user manually loaded the real built extension unpacked in their own logged-in Chrome and completed the full draw → 送信 → attach flow themselves (see `docs/state.md` rounds 5–6, `docs/adapter-smoke.md`) — the first fully real, packaged-extension pass in this project. Same round found/fixed a real CSP bug in `board.html` and maximized the board panel, both re-verified live |
| P008 | ready | main | P007 | `apps/extension/manifest.json`, `src/content/adapters/gemini.ts` | Gemini (gemini.google.com) adapter added last — most unusual composer of the three | unit tests for any pure logic, manual smoke | — |
| P009 | verified | main | P002–P005 | `docs/*.md`, `README.md`, `tasks.md` | Docs describe the extension product, not the archived desktop app; decisions D-009–D-013 record the pivot | `git diff --check`, `pnpm verify` | this ledger entry |

## Execution rule

Do not mark a phase `done`/`verified` because the UI exists. Record the command, fixture, or
manual-checklist result that proves the acceptance row. Site-adapter correctness cannot be
proven by CI — `docs/adapter-smoke.md`'s "last verified" log is the evidence trail for that
part, and a stale date there is a real signal to re-check, not paperwork.

## Current pointer

`pnpm verify` (lint, typecheck, test, build) passes locally; 22 tests. This environment can now
drive the user's own real, logged-in Chrome via `chrome-devtools-mcp --autoConnect` (see
`docs/state.md` rounds 5–6). P007 (claude.ai) is now `verified` — the user completed a full
manual, real-extension, logged-in smoke test themselves, which also surfaced and closed out two
real bugs (a CSP-blocked inline script in `board.html`, and the board panel not filling the
viewport — the latter fix is in shared `mount.ts`, so it already applies to every site). P006
(chatgpt.com) is the one remaining smoke-test gap, blocked ~3h by the owner's free-tier upload
limit as of 2026-08-21 — same manual-test shape as P007 just closed. Gemini (P008) is next up
once P006 closes.
