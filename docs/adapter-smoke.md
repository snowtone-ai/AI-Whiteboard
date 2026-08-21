# adapter-smoke.md — manual site-adapter verification log

No CI command can prove a site adapter still matches a live site's DOM — that requires a real,
logged-in browser session against a page that can change without notice. This file is the
substitute: a checklist to run by hand after any change to `apps/extension/src/content/
adapters/*.ts`, and after enough time has passed that the site may have redesigned. A stale
"last verified" date here is a real signal, not paperwork — treat an entry older than a few
weeks as unverified.

## How to run the checklist

1. `pnpm build` in the repo root (builds `apps/extension/dist/`).
2. Open `chrome://extensions`, enable Developer mode, "Load unpacked" → select
   `apps/extension/dist/`.
3. Visit the target site, logged in, with an existing conversation open.
4. Confirm:
   - [ ] The launcher button (✎) appears near the message composer and follows it on scroll/resize.
   - [ ] Clicking it opens the whiteboard overlay; drawing works; the close button (✕) and
         Escape both close it.
   - [ ] Drawing something, then pressing 送信, either:
     - attaches the image to the composer (image only — no auto-generated text is inserted,
       see D-014), or
     - falls back to "copied to clipboard" with a visible message, and Ctrl+V in the composer
       actually pastes the image.
   - [ ] After attach, the board panel should auto-close within ~1-2 seconds, revealing the real
         composer. Confirm the status message shown just before closing is accurate: "アップロード
         完了を確認しました" should mean the thumbnail's loading indicator is actually gone by
         then; "アップロード完了は確認できませんでした" (attached-unconfirmed) means our generic
         indicator heuristic (`waitForUploadSettle` in `apps/extension/src/content/insert/
         waitForUploadSettle.ts`) never saw the busy state clear within 8s — check by eye whether
         that matches reality, since this heuristic has not been confirmed against chatgpt.com's
         actual markup yet.
   - [ ] Confirm the image actually reaches the AI (not just a thumbnail in the composer) once
         you press the site's own send button after the panel closes.
   - [ ] Nothing is auto-submitted — the message stays in the composer until the site's own
         send button is pressed by hand.
   - [ ] No uncaught errors appear in the page's DevTools console attributable to the extension.
5. Record the result below.

## Log

| Site | Last verified | Result | Notes |
|---|---|---|---|
| chatgpt.com | 2026-08-21 (partial, automated) | Attach mechanism confirmed live; login-gated steps still open | Playwright-driven Chromium with the real `--load-extension` build against live chatgpt.com, unauthenticated (see `docs/state.md` round 4). Confirmed: launcher mounts, board opens, drawing + 送信 attaches a real thumbnail via `#upload-files`, panel auto-closes once `waitForUploadSettle` settles. Found and fixed a real defect: `UPLOAD_INDICATOR_SELECTOR` never matched chatgpt.com's actual upload-spinner markup (a `cursor-wait` + `circle[stroke-dashoffset]` radial ring), so every real attach was silently timing out its confidence check instead of observing it — now fixed and covered by a regression test using the captured markup. **Not confirmed**: authenticated backend upload success or the image reaching the model — needs a real logged-in run by the owner. |
| chat.openai.com | *(not yet run)* | — | Redirects to chatgpt.com in most sessions; confirm the redirect still lands the content script. |
| claude.ai | *(not built)* | — | Planned next phase — see `tasks.md`. |
| gemini.google.com | *(not built)* | — | Planned last — composer is the most unusual of the three. |
