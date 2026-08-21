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
| claude.ai | 2026-08-21 (full, live authenticated, manual) | Pass — full flow confirmed by the user with the real packaged extension | Round 5 drove the composer directly via `chrome-devtools-mcp` to confirm selectors and the attach mechanism (a real ~3.5MB test image uploaded to a genuine `/api/.../files/.../preview` backend URL) and to find/fix a real `UPLOAD_INDICATOR_SELECTOR` defect (missing `animate-pulse`; deliberately did **not** add `[role="status"]`, since claude.ai keeps unrelated `role="status"` elements in the DOM at rest that would break settle-detection outright). Round 6 closed the remaining gap: the user manually loaded the actual built extension (`apps/extension/dist/`) unpacked in their own real, logged-in Chrome and ran the full draw → 送信 → attach flow themselves — confirmed via two screenshots showing the board open over a real `claude.ai/chat/...` tab and "アップロード完了を確認しました". Same round also found and fixed a real CSP bug (an inline `<script>` in `board.html` was silently blocked by MV3's default CSP on every real load) and maximized the board panel to fill the full viewport — both re-verified live after the fix (extension reloaded, error log clean, fullscreen layout confirmed by screenshot). See `docs/state.md` rounds 5–6. |
| gemini.google.com | 2026-08-21 (live, chrome-devtools-mcp) | Pass — full auto-attach flow confirmed, no Ctrl+V needed, driven tool-side, not yet by the user's own hands | Round 7: composer/anchor selectors confirmed live; Gemini's file input is menu-gated (only exists while "アップロードとツール" is open) and that menu only opens on a browser-trusted click. Round 8 eliminated the resulting clipboard-paste requirement: the launcher button's own trusted click is spent to open that menu and reveal the file input ahead of time (`SiteAdapter.prepareForOpen`, `gemini.ts`'s `ensureFileInputRevealed`), which survives the whole drawing session because clicks inside the board's cross-origin iframe never reach Gemini's top-level page at all (confirmed live) — so nothing triggers Gemini's own outside-click-closes-menu behavior in between. Confirmed end-to-end from a fresh extension reload: launcher click → draw → 送信 → auto-attached, no paste step. The clipboard-fallback tier (Ctrl+V) from round 7 is kept as the automatic degrade path if the reveal ever fails (a Gemini redesign, selector drift) — `mount.ts` now also auto-focuses the composer on that path so only the paste keystroke itself remains. **Accepted risk**: revealing the input requires intercepting a native-file-picker-opening call inside Gemini's own click handler; this is only safe because that call is currently synchronous (confirmed live) — a future Gemini redesign making it async could let a real OS file dialog open and block the tab (this happened once during testing; user cancelled it by hand and accepted the risk knowingly). See `docs/state.md` rounds 7–8. Still needs the user's own manual pass with the packaged extension, same shape as claude.ai's round 6, before this can be marked fully user-confirmed. |
