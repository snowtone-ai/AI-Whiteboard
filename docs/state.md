# state.md — current project state

Updated: 2026-08-21 (round 4: text summary feature removed entirely — image-only send — see
D-014)

## Current

The project pivoted from a standalone Electron desktop app to a Chrome extension (Manifest V3)
that adds a whiteboard input method to ChatGPT's web UI. See `docs/decisions.md` D-009–D-013
for the full reasoning. The previous complete desktop build is preserved at git tag
`archive/desktop-v1` (branch `feat/complete-ai-whiteboard`, now closed as a PR) and is not part
of the active codebase.

Implemented on `feat/browser-input-method`:

- `apps/extension/`: MV3 extension — a ChatGPT-only content script (launcher button + overlay
  mount), a whiteboard board page (Excalidraw, self-hosted fonts, runs as an isolated
  `chrome-extension://` iframe), and an insertion ladder (file-attach → clipboard fallback).
  Built with esbuild (`apps/extension/build.mjs`), no Vite/Electron in the toolchain.
- `packages/core/`: unchanged and currently unused by the extension. Kept dormant rather than
  deleted — parts of it (regions, semantics, privacy switches) may be relevant again if the
  Context Lens grows past its current minimal pre-insert review. See D-011/D-012.

## Product contract to preserve

ChatGPT web UI, launcher button beside the composer, whiteboard overlay, send = a white-background
PNG of the drawing, attached to the composer (or copied to the clipboard as a fallback). No
accompanying auto-generated text is inserted — see D-014 for why. The user always presses the
site's own send button — this extension never auto-submits and never reads the AI's response
(D-013, hard constraint). No accounts, backend, telemetry, or stored API keys — there are none to
store, since this tool doesn't call any AI provider API itself.

## Round 2 fixes (user-reported, from real usage)

The user loaded the extension and reported four issues by screenshot; all four are fixed on
`feat/browser-input-method`:

- **Board too small** (`apps/extension/src/content/mount.ts`): panel resized from a
  520×640px-ish centered modal to `96vw × 92vh`, near-fullscreen.
- **Excalidraw's own UI (toolbar tooltips, hints) was in English**: `Board.tsx` now passes
  `langCode="ja-JP"` to `<Excalidraw>`. Verified for real, not just by reading code — a
  throwaway `chrome.runtime`-stubbed HTML page loaded `dist/board.js` directly in a Playwright
  browser and screenshotted the rendered UI; the toolbar, hints, and library button all render
  in Japanese. (An earlier bundle-content check gave a false negative because it grepped for
  literal Japanese characters — esbuild's minifier stores non-ASCII as `\uXXXX` escapes, not
  literal UTF-8 — so that check couldn't have found real content either way. Fixed method, not
  a fixed bug: the `langCode` prop worked correctly the whole time.)
- **Hand-drawn strokes produced a useless "手書き線1"…"手書き線9" list** in the composer
  (`apps/extension/src/board/summarize.ts`): consecutive `freedraw` elements were collapsed into
  one `手書きの絵（N画）` entry instead of being numbered individually. **Superseded by D-014**:
  `summarize.ts` no longer exists — the whole per-element text summary was removed, not just this
  one case of it.
- **Launcher button overlapped the response text** instead of sitting beside the composer
  (`apps/extension/src/content/adapters/chatgpt.ts`, `mount.ts`): anchor changed from the
  composer text node to its parent `<form>` (the whole input bar, roughly constant height);
  button now sits in the empty margin to the right of it, vertically centered, with a
  narrow-viewport fallback that sits just inside the bar's right edge instead.

Two more issues raised in the same follow-up, also addressed:

- **Image not reaching the AI**: root-caused via live DOM experimentation against real
  chatgpt.com (chrome-devtools MCP) — file-attach itself works (dispatches a real `change`
  event, produces a thumbnail + upload-in-progress overlay), but the extension reported
  "attached" immediately, before ChatGPT's own upload to its backend finished; sending before
  that completes drops the image. Mitigated with a 1200ms delay plus explicit status text
  telling the user to wait for the upload indicator to clear before pressing send
  (`mount.ts`'s `runInsertionLadder`). This is a best-effort delay, not a guaranteed fix — there
  is no reliable way to detect true upload completion from outside the site's own UI. Needs
  confirmation from the user's own live session.
- **Text summary could balloon into chat-cluttering length**: `summarize.ts` capped the per-item
  list at 12 items / 400 characters, falling back to a one-line count-by-type summary past that.
  **Superseded by D-014**: moot now that no text summary is generated at all — the strongest
  possible fix for "the text could clutter the chat" is not sending any.
- **Whether text labels correlate to specific strokes in the image**: answered directly (no
  code change needed) — they don't. Labels are drawing-order sequence numbers only; there is no
  spatial link between a label and a mark's position in the PNG.
- **Is PNG the right export format?**: yes, unchanged — board content is flat-color line art
  and text on a white background, exactly what PNG (lossless, sharp edges, no JPEG ringing
  around text/lines) is suited for. No format change made.

## Round 3 fixes (user reported round 2's mitigation still didn't fix "image not reaching the AI")

Investigated further without a live chatgpt.com session available (`chrome-devtools` MCP had no
logged-in tab open — confirmed via `list_pages`, only `about:blank`), so this is two structural
fixes derived from reading our own code plus research, not a live-verified root cause:

- **The board panel itself hides the real send button.** `mount.ts` sizes the panel to
  `96vw × 92vh` — nearly the whole viewport. The user's own screenshot shows the panel still
  open after pressing the board's "送信" (attach) button, which structurally means ChatGPT's own
  composer and send button were not reachable underneath it. Very plausible primary cause: not
  a failed attach, but the user being unable to see/reach the real send button afterward.
  **Fix**: the board now auto-closes itself (`Board.tsx`) a short delay after a successful
  attach/clipboard-fallback result, so the real composer becomes visible. This dismisses only
  our own overlay — it never touches or presses the host's own send button (D-013 unaffected).
- **The fixed 1200ms wait was a blind guess.** Replaced with `waitForUploadSettle`
  (`apps/extension/src/content/insert/waitForUploadSettle.ts`, unit-tested): polls a generic,
  site-agnostic "does anything that looks like a progress/spinner/busy indicator still exist
  inside the composer's form" predicate instead of a fixed sleep. Reports one of `settled`
  (saw an indicator, then it cleared — strongest signal), `timeout` (still busy after 8s — real
  signal something is stuck/slow), or `no-indicator` (nothing matched either way — no
  information). `timeout` now surfaces as a distinct `attached-unconfirmed` outcome with an
  honest "could not confirm" message, instead of silently claiming success. This is a generic
  heuristic (case-insensitive substring match on `role`/`class`/`aria-busy`), not hardcoded to
  chatgpt.com's exact markup, specifically so it doesn't silently stop matching after a
  redesign — but it has **not been confirmed against the real site's actual indicator markup**,
  since no live session was available this round either.

**Still needs the user's own live-session confirmation** — this round's fixes are structurally
sound and unit-tested where testable, but neither has been exercised against real chatgpt.com.

## Whether the text summary is actually useful alongside the image — first pass (superseded by D-014)

Built the real production pipeline (`board.js`/`board.css` from an actual `pnpm build`) into a
throwaway Playwright test harness (temp files under the gitignored `dist/`, deleted after use)
that embeds the real board in an iframe exactly as `mount.ts` does, drew two rectangles + a bound
arrow + a text label through the actual UI, pressed the real "送信" button, and inspected both
the real `summarizeBoard()` output and the real exported PNG side by side.

Result: for that diagram, the PNG alone was already fully unambiguous — the arrow's direction and
both endpoints were clear from pixels alone, so the text summary line
(`3. 四角形3（四角形1 → 四角形2）`) told a vision model nothing the image didn't already show.
At the time this was read as "the summary is cheap and only matters for complex/ambiguous
diagrams, so keep it" — **that conclusion turned out to be wrong, corrected below in D-014.**

## D-014 — the text summary was removed entirely, image-only send (2026-08-21)

The user pushed back on the first-pass conclusion above with two sharp points, both correct:

1. The external research cited above ("captions help VLMs") is about captions that *describe
   image content* (what's depicted, OCR'd embedded text, axis labels) — not about *drawing-order
   bookkeeping* (`四角形1`, `矢印3（四角形1 → 四角形2）`) with no way to map a label back to a
   specific mark in the picture (already established: no spatial correlation exists). A second,
   more targeted search found research on VLMs genuinely struggling with diagram *topology*
   extraction, where structured metadata *does* help — but only when it's grounded (e.g. an ID
   that also appears at that element's position in the image, as in XML-driven approaches). Our
   labels were never grounded that way, so the one piece of research that could have justified
   the connection metadata doesn't actually apply to how it was built. With more than a couple of
   same-type shapes on the board, "矢印3は四角形1→四角形2" is unverifiable by the model and
   becomes noise dressed up as signal, not a safety net.
2. For freedraw-heavy boards — the realistic common case for a *whiteboard* — the summary could
   only ever say "手書きの絵（N画）"; it fundamentally cannot describe what was drawn without
   running actual image understanding, which this extension deliberately never does (no AI
   provider calls — see "Product contract to preserve"). So for the dominant use case, the
   feature was structurally incapable of adding information, not just weak in edge cases.

Net: across both major usage patterns (freehand sketches, shape diagrams beyond the trivial
case), the auto-generated summary added ~zero verifiable value, while being the exact mechanism
the user originally worried would clutter the chat. Given a straight choice between "strip it to
only the literal typed-text content" and "remove entirely," the user chose full removal — the PNG
is now the sole payload sent to the composer.

**Removed**: `apps/extension/src/board/summarize.ts` + its test, `apps/extension/src/content/
insert/insertText.ts` (now unused — nothing calls it once no text is generated), the `summary`
field from `SendPayload` (`shared/messages.ts`), and all call sites in `Board.tsx` / `mount.ts`.

This does not reopen D-013 — the user still always presses the site's own send button; this
change only removes an *auto-generated text payload*, not any part of the manual-send boundary.

Sources: [Vision Language Model-based Caption Evaluation Method](https://arxiv.org/html/2402.17969v1),
[Beyond Intermediate States: Explaining Visual Redundancy through Language](https://arxiv.org/pdf/2503.20540),
[Overcoming Vision Language Model Challenges in Diagram Understanding](https://arxiv.org/abs/2502.04389)

## Next

1. Manual smoke test on chatgpt.com with a real logged-in session (cannot be run from this
   environment — see `docs/adapter-smoke.md` for the checklist and record the result there).
   In particular, confirm whether the board auto-closing and the new `waitForUploadSettle`
   heuristic actually fix "image not reaching the AI" for real — round 2's fixed-delay mitigation
   was reported to still fail, and round 3's fixes are unverified against the live site.
2. Load the unpacked extension (`apps/extension/dist/` after `pnpm build`) via
   `chrome://extensions` → Developer mode → Load unpacked, and confirm the launcher button
   appears, the board opens, and send attaches an image to the composer.
3. Claude adapter, then Gemini adapter, each as its own reviewable change — see `tasks.md`.

## Verification status

- `pnpm verify` (lint, typecheck, test, build) passes locally: 17 tests (4 for
  `waitForUploadSettle`, 13 existing in `packages/core`), clean lint/typecheck, extension bundle
  builds (`content.js` ~5KB, `board.js` ~8MB minified — Excalidraw + React bundled once).
- No live-browser smoke test has been run yet. The adapter (`apps/extension/src/content/
  adapters/chatgpt.ts`) targets ChatGPT's current DOM as of this writing; it is written to
  degrade to the clipboard fallback rather than fail outright if the markup has moved, but
  that has not been exercised against the live site.

## Known assumptions

- Chrome (Chromium-based; Edge/Brave should work unmodified, untested) on Windows 11.
- Node.js 22.12+ and pnpm 10.12 remain the build baseline.
- `chrome.storage`/local persistence is not yet implemented — the board does not currently
  save drafts between opens. Not required for the core loop; add if it becomes a real need.
