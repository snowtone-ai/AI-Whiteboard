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
| P006 | verified | main | P003,P004,P005 | (none — verification only) | Live ChatGPT smoke test passes the `docs/adapter-smoke.md` checklist | manual, logged-in Chrome session | round 4 (2026-08-21): unauthenticated Playwright run confirmed the attach mechanism end-to-end and found/fixed a real `UPLOAD_INDICATOR_SELECTOR` defect. Round 10 (2026-08-21), once the owner's upload limit reset: drove the real packaged extension against the owner's own authenticated chatgpt.com session via `chrome-devtools-mcp` — launcher → draw → 送信 → real attach → auto-close → send → confirmed the model actually read the image (replied describing the handwritten text). Round 12 (2026-08-21): the owner reloaded the packaged extension themselves and confirmed the flow live in their own hands — reported OK. See `docs/adapter-smoke.md`. |
| P007 | verified | main | P006 | `apps/extension/manifest.json`, `src/content/adapters/claude.ts` | Claude (claude.ai) adapter added as its own reviewable change; host_permissions extended explicitly | unit tests for any pure logic, manual smoke | `claude.ts` built and wired in (`src/content/index.ts` now selects by hostname); `manifest.json` extended explicitly to `https://claude.ai/*`. Round 5 (2026-08-21) verified the attach mechanism and fixed a real `UPLOAD_INDICATOR_SELECTOR` defect via `chrome-devtools-mcp --autoConnect` against the user's authenticated session. Round 6 (2026-08-21) closed the remaining gap: the user manually loaded the real built extension unpacked in their own logged-in Chrome and completed the full draw → 送信 → attach flow themselves (see `docs/state.md` rounds 5–6, `docs/adapter-smoke.md`) — the first fully real, packaged-extension pass in this project. Same round found/fixed a real CSP bug in `board.html` and maximized the board panel, both re-verified live |
| P008 | verified | main | P007 | `apps/extension/manifest.json`, `src/content/adapters/gemini.ts`, `src/board/Board.tsx`, `src/content/mount.ts` | Gemini (gemini.google.com) adapter added last — most unusual composer of the three | unit tests for any pure logic, manual smoke | `gemini.ts` built and wired in; `manifest.json` extended explicitly. Round 7 (2026-08-21) verified composer/anchor selectors and confirmed Gemini's file input is menu-gated behind a browser-trusted click a content script cannot generate — the adapter relies on the clipboard-fallback tier (Ctrl+V + auto-focus), confirmed working live. Round 8 (2026-08-21) tried eliminating that paste step via a `SiteAdapter.prepareForOpen()` hook — confirmed working tool-side, but round 9 (2026-08-21) reverted it after the user's next real use opened a genuine native Windows file-picker dialog instead (the accepted risk materializing for real). `prepareForOpen` was removed entirely; Gemini went back to clipboard-fallback only. Round 11 (2026-08-21) fixed a real bug the user hit in live use: nothing was attaching after 送信. Root cause was two-fold — (1) the panel auto-closed on a timer even though clipboard-fallback still has a pending user action (the paste), risking the panel vanishing before the paste happened, and (2) once the panel was made to require a manual ✕ close instead, that close click itself was found (live) to steal DOM focus into the iframe, silently breaking the very next Ctrl+V. Fixed both: `Board.tsx` no longer auto-closes on `clipboard-fallback`, and `mount.ts`'s `closeOverlay()` now re-focuses the composer on every close. Re-verified live: draw → 送信 → panel stays open → ✕ → Ctrl+V → image actually pasted into Gemini's composer. Also re-confirmed no safe programmatic path exists around the native picker (menu-open doesn't reveal the input pre-click; synthetic `drop` events are ignored) — round 9's revert stands. Round 12 (2026-08-21): the owner reloaded the packaged extension themselves, confirmed the manual ✕-then-paste step is the intended design (not a bug), and reported the flow OK in their own hands. `pnpm verify` passes. |
| P009 | verified | main | P002–P005 | `docs/*.md`, `README.md`, `tasks.md` | Docs describe the extension product, not the archived desktop app; decisions D-009–D-013 record the pivot | `git diff --check`, `pnpm verify` | this ledger entry |

## Execution rule

Do not mark a phase `done`/`verified` because the UI exists. Record the command, fixture, or
manual-checklist result that proves the acceptance row. Site-adapter correctness cannot be
proven by CI — `docs/adapter-smoke.md`'s "last verified" log is the evidence trail for that
part, and a stale date there is a real signal to re-check, not paperwork.

## Current pointer

`pnpm verify` (lint, typecheck, test, build) passes locally; 22 tests. This environment can now
drive the user's own real, logged-in Chrome via `chrome-devtools-mcp --autoConnect` (see
`docs/state.md` rounds 5–12). All three site adapters are now `verified`: P007 (claude.ai) since
round 6, P006 (chatgpt.com) and P008 (gemini.google.com) since round 12, when the owner reloaded
the packaged extension themselves and confirmed all three live in their own hands — including
confirming that Gemini's clipboard-fallback flow requiring a manual ✕ close after pasting (added in
round 11's bug fix, see below) is the intended design, not a defect. P008's road here: round 7 built
the adapter on the clipboard-fallback tier (Ctrl+V), confirmed working live; round 8's attempt to
eliminate that paste step via a trusted-click file-input reveal worked in testing but opened a real
native OS file-picker dialog on the user's next real use, so round 9 reverted it entirely
(`prepareForOpen` removed from `types.ts`/`gemini.ts`/`mount.ts`). Round 11 then fixed a real
live-use bug where sending from the whiteboard attached nothing: the panel was auto-closing before
the still-pending Ctrl+V happened, and — once fixed to require a manual close — that close click was
found to steal focus away from the composer, silently breaking the paste. Both are fixed
(`Board.tsx`, `mount.ts`). P006's road here: round 10 closed the login-gated gap once the owner's
upload limit reset, driving the real packaged extension via `chrome-devtools-mcp` against the
owner's own authenticated session and confirming the model actually reads the attached image.
