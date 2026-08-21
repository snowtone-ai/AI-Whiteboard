# state.md — current project state

Updated: 2026-08-21 (round 7: Gemini adapter built and live-verified end-to-end via
chrome-devtools-mcp, including full board UI draw → 送信 → clipboard-paste attach confirmation)

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

## Round 4 — root cause found and fixed via live automated verification against real chatgpt.com (2026-08-21)

The user reported that after round 3's fixes (auto-close + `waitForUploadSettle`), the image
still did not reach ChatGPT when they tried it themselves. This environment still has no
logged-in Chrome session, but it does now have the tools to test the real, built extension
against the real live site, unauthenticated — which turned out to be enough to reproduce and
fix the actual bug:

- **Method**: built the real extension (`pnpm build`), installed `playwright` (temporary, in
  the OS scratch dir, not a project dependency) with a real Chromium, and launched a persistent
  context with `--load-extension=<dist>` pointed at the actual `apps/extension/dist/` output —
  the real content script, running in its real isolated world, against the real
  `https://chatgpt.com/` DOM. Logged out, so the final "did OpenAI's backend accept the upload"
  step can't be confirmed this way — but everything up to that (composer lookup, file-input
  lookup, the synthetic `DataTransfer` + `change` event, ChatGPT's own client-side handling of
  it, the upload-in-progress indicator, and the board's auto-close) is fully exercised.
- **The file-attach mechanism itself works.** Drawing a stroke, pressing 送信, and inspecting
  the real composer afterward showed `#upload-files` correctly populated with `whiteboard.png`
  and a real thumbnail (`<img src="blob:...">`) rendered by ChatGPT's own code — the
  `attachImageFile` technique (isolated-world `File` via `DataTransfer` + a dispatched `change`
  event) is not the problem. This rules out the "wrong/missing file input" and "cross-world File
  object" theories that were the leading suspects going in.
- **The actual bug**: `UPLOAD_INDICATOR_SELECTOR` (`apps/extension/src/content/insert/
  waitForUploadSettle.ts`) never matched chatgpt.com's real upload-in-progress markup. Captured
  directly from the live DOM while an upload was in flight: a radial SVG progress ring
  (`<circle stroke-dashoffset="...">`) inside a wrapper carrying a `cursor-wait` class — none of
  which contains "progress", "spinner", or "loading", the only substrings the old selector
  looked for. So `waitForUploadSettle` never once observed the busy state on this site; every
  real attach fell through to `no-indicator` only after burning the full 8-second `maxWaitMs`,
  and — because `runInsertionLadder` treats `no-indicator` the same as a confirmed `settled` —
  reported "アップロード完了を確認しました" (upload confirmed) on pure timeout, not real
  confirmation. Re-running the same live Playwright reproduction after the fix showed the panel
  auto-closing markedly faster (~6s vs ~10.5s), consistent with the indicator now actually being
  observed and cleared instead of the selector blindly waiting out the deadline.
- **Fix**: added `[class*="cursor-wait" i]` and `circle[stroke-dashoffset]` to
  `UPLOAD_INDICATOR_SELECTOR`, still deliberately generic (a "cursor-wait" utility class and a
  radial SVG progress ring are common patterns, not chatgpt.com-specific markup) rather than
  hardcoding today's exact class names. Added a regression test
  (`waitForUploadSettle.test.ts`) using the real captured markup as a fixture (`jsdom`, added as
  a new dev dependency for this one DOM-selector test — the rest of the suite stays on the
  default `node` environment) so this selector can never silently stop matching this pattern
  again without a test failing.
- **Still not fully closed**: this confirms the client-side attach and indicator-detection path
  end-to-end, but not the actual backend upload succeeding under a real, authenticated OpenAI
  account, nor the message actually reaching the model. That last step still needs the user's
  own logged-in confirmation per `docs/adapter-smoke.md` — but the specific, previously-unknown
  defect that was silently corrupting the "is it safe to send yet" signal on the real site is now
  identified, fixed, and covered by a test, not just re-guessed a third time.

## Round 5 — Claude adapter built and verified live against the user's own authenticated claude.ai (2026-08-21)

ChatGPT's free-tier upload limit blocked further chatgpt.com testing (~3h cooldown), so the user
redirected: build and verify the Claude adapter next, using their own already-open, already
logged-in Chrome. `chrome-devtools-mcp` was reconfigured with `--autoConnect` (`.mcp.json`) and
reconnected via `/mcp`, which connects to the real running Chrome through the
`chrome://inspect/#remote-debugging` toggle (port 9222) — a different protocol from classic CDP's
`/json/version` HTTP discovery surface, which that toggle does not serve. This is the first round
in this project able to drive a real, authenticated site session directly.

- **Method**: with the real claude.ai tab selected, used `evaluate_script` to inspect the live,
  authenticated composer DOM directly (a11y snapshot first, then targeted `querySelector` probes)
  — not a fresh unauthenticated instance (claude.ai's login is bot-detection-gated; the user's own
  session sidesteps that entirely).
- **Composer structure found**: claude.ai's composer is a tiptap/ProseMirror `contenteditable`
  div at `[data-testid="chat-input"]`, with no `<form>` ancestor (unlike ChatGPT's composer,
  which sits inside one). The hidden file input is `input[data-testid="file-upload"]`
  (`id="chat-input-file-upload-onpage"`, `multiple`, `accept=""`). Attach-menu button:
  `[data-testid="chat-input-attach"]`. Send button: `[data-testid="chat-input-send"]`. A
  `<fieldset>` a few levels above the composer wraps the whole input bar and is a stable anchor
  point for the launcher button.
- **The same `DataTransfer` + dispatched `change` event attach technique used for ChatGPT works
  unmodified on claude.ai** — tested live with real PNGs (a 62-byte 1×1 test image, then a
  ~3.5MB canvas-generated image closer to a real whiteboard export). The file input accepted it,
  claude.ai's own React code rendered a real thumbnail, and — stronger confirmation than was
  possible on chatgpt.com — the thumbnail's `<img>` `src` became a real backend URL
  (`/api/<org>/files/<id>/preview`), proving the authenticated upload actually completed
  server-side, not just a client-side preview. (Test attachments were deleted afterward via their
  own delete button so nothing was left in the user's real chat.)
- **Found and fixed the same class of bug as round 4, on a different site**: `UPLOAD_INDICATOR_SELECTOR`
  did not match claude.ai's busy state either. Captured live: while an upload is in flight,
  claude.ai's thumbnail `<img>` carries a Tailwind `animate-pulse` class, dropped once the real
  file URL loads — the old selector's "progress"/"spinner"/"loading"/"cursor-wait" substrings and
  `circle[stroke-dashoffset]` all miss it. Fixed by adding `[class*="pulse" i]`. Explicitly did
  **not** add `[role="status"]`, even though claude.ai's initial upload skeleton also uses it —
  live-checked and confirmed claude.ai keeps 7 unrelated `role="status"` live-region elements in
  the DOM at rest, which would make `hasIndicator()` return true permanently and break `'settled'`
  detection outright (worse than the miss it would fix). Added regression tests
  (`waitForUploadSettle.test.ts`) using the real captured claude.ai markup, including a dedicated
  test locking in the "ignore `role=\"status\"`" decision so it can't be silently reverted later.
- **Built the adapter**: `apps/extension/src/content/adapters/claude.ts`, following the same
  cascade-from-specific-to-generic pattern as `chatgpt.ts`. `manifest.json` extended explicitly
  (`content_scripts.matches`, `web_accessible_resources.matches`, `host_permissions` all gained
  `https://claude.ai/*`) — no wildcard. `content/index.ts` now selects an adapter by
  `window.location.hostname` instead of hardcoding ChatGPT's.
- **Incidental fix**: `scripts/verify.mjs`'s design-token lint flagged the verbatim claude.ai
  markup embedded in the new test fixtures (raw `120px` values from claude.ai's own CSS, not this
  project's design system) as unregistered design values. Excluded `*.test.ts`/`*.test.tsx` from
  that check's diff scope — test fixtures capturing third-party markup for regression testing are
  categorically not this project's UI code.
- **Still not fully closed**: everything above was done via direct DOM script evaluation against
  the real authenticated tab, which proves the *mechanism* end-to-end including a real backend
  upload — but not the packaged extension's content script itself running in its own isolated
  world against this site (no way to script Chrome's native "Load unpacked" folder picker into
  the user's already-running browser via CDP). A real logged-in run with the actual built
  extension loaded (`chrome://extensions` → load unpacked → `apps/extension/dist/`) is the one
  remaining gap, same shape as chatgpt.com's.

## Round 6 — user's real manual test succeeded on claude.ai; board maximized; a real CSP bug found and fixed (2026-08-21)

The user manually loaded the built extension in their own real, logged-in Chrome and ran the full
draw → 送信 → attach flow against claude.ai themselves (two screenshots showing
`AIホワイトボード` open over a real `claude.ai/chat/...` tab, and "アップロード完了を確認しまし
た" / the send flow completing). **This is the first fully real, authenticated, packaged-extension
confirmation in the project** — it closes the one gap round 5 explicitly flagged as still open.
Same session, the user also reported the board panel was still too small to draw comfortably
("最大までしてほしい"), same complaint as an earlier ChatGPT round, and asked that Gemini's
future adapter not repeat it.

- **Board panel maximized**: `apps/extension/src/content/mount.ts`'s `.panel` was `96vw`/`92vh`
  offset `2vw`/`4vh` (already near-fullscreen from round 2, per the user this still wasn't
  enough) — changed to `100vw`/`100vh` at `0`/`0`, i.e. the overlay now fills the entire
  viewport exactly. This is shared, site-independent code (`mount.ts`, not a per-site adapter),
  so it already applies uniformly to ChatGPT, Claude, and whatever Gemini adapter comes next —
  nothing further to do per-site for this specific complaint.
- **Found a real, separate bug while reloading the extension to test the resize**: the Chrome
  extensions page showed a persistent "エラー" (error) badge on the extension. Inspecting it
  live: `board.html`'s inline `<script>window.EXCALIDRAW_ASSET_PATH = chrome.runtime.getURL('/')
  </script>` was being silently blocked on every real page load by MV3's default CSP for
  extension pages (`script-src 'self'`, no `unsafe-inline`) — meaning this assignment had never
  actually executed in any real (non-dev-server) load of the board, including during round 5's
  successful attach test. It happened to be harmless so far because Excalidraw's font loader
  (the only consumer of this global, confirmed by grepping the built bundle) apparently degrades
  gracefully without it, but it's a real defect nonetheless, not a hypothetical one — it was
  sitting in the extension's own error log the whole time.
- **Fix**: moved the assignment out of the inline `<script>` and into `apps/extension/src/
  board/main.tsx`, run as a normal statement before `createRoot(root).render(<Board />)` — an
  external module script (`<script type="module" src="board.js">`) is CSP-compliant, and the
  assignment only needs to happen before Excalidraw's font loader first runs during Board's
  render, not before module evaluation. Added a `declare global { interface Window { ... } }`
  block for the new property (no prior global type-augmentation file existed in this app).
- **Verified live, not just by reasoning**: rebuilt, reloaded the unpacked extension in the
  user's real Chrome via `chrome://extensions` (driven through `chrome-devtools-mcp
  --autoConnect`), confirmed the stale CSP error was gone from a *fresh* error log (cleared it,
  then reloaded the actual claude.ai tab and re-opened the board — zero new errors), and
  confirmed visually via screenshot that the board now renders as a true fullscreen overlay
  (toolbar pinned to the very top edge, canvas filling the rest of the viewport, no visible
  margin).
- **Incidental**: this is also the moment P007 (Claude adapter)'s live smoke-test gap closes —
  see `tasks.md` and `docs/adapter-smoke.md`.

## Round 7 — Gemini adapter (2026-08-21)

Built and live-verified `apps/extension/src/content/adapters/gemini.ts` against the user's real,
authenticated `gemini.google.com` session via `chrome-devtools-mcp --autoConnect`, following the
same methodology as rounds 5–6.

- **Gemini's file input does not exist at rest** — unlike ChatGPT/Claude, where a hidden
  `<input type="file">` is always present in the DOM, Gemini's is an Angular component
  instantiated only while the "アップロードとツール" menu is open (confirmed live: 0 file inputs
  in the DOM normally, 3 appear only after opening that menu, all destroyed again on close).
- **The menu can only be opened by a browser-trusted click** — confirmed live that a
  content-script-style `.click()` call on the toggle button does nothing (no menu appears, with
  or without a delay), while the same call via `chrome-devtools-mcp`'s CDP-level trusted click
  does open it. A content script cannot generate a trusted click, so this path is not
  automatable from within the extension. A synthetic `drop` event with a real, populated
  `DataTransfer` against the composer's dropzone (`[xapfileselectordropzone]`) was also tried and
  confirmed *not* to work (Angular's dropzone directive never reacted, despite the event
  correctly carrying file data to a manually-attached listener) — abandoned rather than shipped
  half-working.
- **Decision**: `findFileInput()` returns null whenever the menu-gated input isn't already open
  (the common case), which the existing insertion ladder in `mount.ts` already handles by
  falling through to the clipboard tier automatically — no interface change needed.
- **Confirmed the clipboard-fallback path actually works on this site**: wrote a real PNG to the
  clipboard and pressed Ctrl+V (a genuine trusted keypress, via `chrome-devtools-mcp`'s
  `press_key`) into Gemini's composer — the image attached correctly (Gemini's editor is a Quill
  instance with built-in paste support).
- **Full end-to-end live test through the actual board UI**: opened the real launcher button,
  drew a text element on the real board (canvas drag wasn't available through the connected
  tooling, so the text tool was used instead — same insertion ladder either way, since both just
  export a PNG), pressed 送信, confirmed the panel auto-closed, then pressed Ctrl+V in Gemini's
  composer and confirmed the drawn PNG attached as a real thumbnail. Cleaned up the test
  attachment afterward so it didn't pollute the user's real chat history.
- `apps/extension/manifest.json` extended to `https://gemini.google.com/*` (content script
  matches, web-accessible-resources matches, host_permissions).
- `apps/extension/src/content/index.ts`'s `selectAdapter` now also routes
  `gemini.google.com` → `geminiAdapter`.
- `pnpm verify` (lint, typecheck, test, build) passes; no new tests needed since Gemini's adapter
  has no new pure logic to unit-test (its selectors are DOM lookups already exercised live, and
  it doesn't touch `UPLOAD_INDICATOR_SELECTOR` since the file-attach tier is never reached here).

## Next

1. Once ChatGPT's upload limit resets, get the user's own logged-in, real-extension confirmation
   for chatgpt.com per `docs/adapter-smoke.md` — the same kind of manual test the user already
   completed successfully for claude.ai in round 6, still outstanding for ChatGPT.
2. If chatgpt.com's fix does *not* fully resolve it, re-capture its real indicator markup
   (DevTools → inspect the attachment tile while it's uploading) and diff it against
   `REAL_CHATGPT_UPLOADING_TILE_HTML` in `waitForUploadSettle.test.ts` — a further redesign could
   change it again.
3. Get the user's own manual, packaged-extension confirmation for gemini.google.com too, same
   shape as the claude.ai round-6 test — this round's live verification was thorough but was
   still driven through `chrome-devtools-mcp`, not a fully independent user pass.

## Verification status

- `pnpm verify` (lint, typecheck, test, build) passes locally: 22 tests (9 for
  `waitForUploadSettle` — 4 polling-logic + 5 selector-fixture, covering both chatgpt.com and
  claude.ai's real captured markup — 13 existing in `packages/core`), clean lint/typecheck,
  extension bundle builds (`content.js` ~6KB, `board.js` ~8MB minified — Excalidraw + React
  bundled once).
- Round 4 (2026-08-21) ran the real built extension against live `https://chatgpt.com/` via a
  Playwright-launched Chromium with `--load-extension`, unauthenticated. Confirmed live: the
  launcher mounts, the board opens, `findComposer`/`findFileInput` resolve to the real
  `#prompt-textarea`/`#upload-files`, the synthetic file-attach is accepted by ChatGPT's own code
  (real thumbnail rendered), and the board auto-closes after `waitForUploadSettle` resolves. Not
  confirmed: the authenticated backend upload succeeding and the image reaching the model — that
  requires the user's own logged-in session (see `docs/adapter-smoke.md`).
- Round 5 (2026-08-21) drove the real, authenticated claude.ai session directly (the user's own
  logged-in Chrome, via `chrome-devtools-mcp --autoConnect`). Confirmed live, with a real backend
  response: the attach mechanism, the composer/file-input selectors now in `claude.ts`, and (after
  the fix) accurate upload-settle detection. Not confirmed at that point: the packaged extension's
  own content script running against this site.
- Round 6 (2026-08-21) closed that last gap: the user manually loaded the real built extension in
  their own logged-in Chrome and completed the full draw → 送信 → attach flow on claude.ai
  themselves — the first fully real, end-to-end, packaged-extension confirmation in this project.
  Same round: found and fixed a real CSP bug (an inline `<script>` in `board.html` silently
  blocked by MV3's default CSP on every real load, moved into `main.tsx`) and maximized the board
  panel to fill the full viewport — both verified live afterward (extension reloaded via
  `chrome://extensions`, error log confirmed clean on a fresh load, fullscreen layout confirmed by
  screenshot).
- Round 7 (2026-08-21) built the Gemini adapter and confirmed live that its file input is
  menu-gated behind a browser-trusted click that a content script cannot generate (both a plain
  `.click()` and a synthetic `drop` event were tried and confirmed not to work), so the adapter
  relies on the existing clipboard-fallback tier — confirmed working via a real Ctrl+V paste, and
  then confirmed again through the actual board UI end-to-end (draw → 送信 → auto-close → paste
  → real thumbnail attached, then cleaned up).

## Known assumptions

- Chrome (Chromium-based; Edge/Brave should work unmodified, untested) on Windows 11.
- Node.js 22.12+ and pnpm 10.12 remain the build baseline.
- `chrome.storage`/local persistence is not yet implemented — the board does not currently
  save drafts between opens. Not required for the core loop; add if it becomes a real need.
