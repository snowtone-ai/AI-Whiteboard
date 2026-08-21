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
| chatgpt.com | 2026-08-21 (full, live authenticated, manual) | Pass — full flow confirmed end-to-end, including by the owner's own hands | Round 4 (see below) confirmed the attach mechanism unauthenticated via Playwright and fixed a real `UPLOAD_INDICATOR_SELECTOR` defect. Round 10 (2026-08-21) closed the login-gated gap once the owner's upload limit reset: drove the real packaged extension against the owner's own authenticated `chatgpt.com` session via `chrome-devtools-mcp`, confirmed the model actually read the attached image (replied describing the handwritten text). Round 12 (2026-08-21): the owner reloaded the packaged extension themselves and confirmed the flow live in their own hands — reported OK. |
| chat.openai.com | *(not yet run)* | — | Redirects to chatgpt.com in most sessions; confirm the redirect still lands the content script. |
| claude.ai | 2026-08-21 (full, live authenticated, manual) | Pass — full flow confirmed by the user with the real packaged extension | Round 5 drove the composer directly via `chrome-devtools-mcp` to confirm selectors and the attach mechanism (a real ~3.5MB test image uploaded to a genuine `/api/.../files/.../preview` backend URL) and to find/fix a real `UPLOAD_INDICATOR_SELECTOR` defect (missing `animate-pulse`; deliberately did **not** add `[role="status"]`, since claude.ai keeps unrelated `role="status"` elements in the DOM at rest that would break settle-detection outright). Round 6 closed the remaining gap: the user manually loaded the actual built extension (`apps/extension/dist/`) unpacked in their own real, logged-in Chrome and ran the full draw → 送信 → attach flow themselves — confirmed via two screenshots showing the board open over a real `claude.ai/chat/...` tab and "アップロード完了を確認しました". Same round also found and fixed a real CSP bug (an inline `<script>` in `board.html` was silently blocked by MV3's default CSP on every real load) and maximized the board panel to fill the full viewport — both re-verified live after the fix (extension reloaded, error log clean, fullscreen layout confirmed by screenshot). See `docs/state.md` rounds 5–6. Reconfirmed OK by the owner in round 12's three-site reload pass. |
| gemini.google.com | 2026-08-21 (full, live authenticated, manual) | Pass — clipboard-fallback flow confirmed end-to-end by the owner's own hands, after fixing a real focus/auto-close bug found in the owner's live use | Round 7: composer/anchor selectors confirmed live; Gemini's file input is menu-gated (only exists while "アップロードとツール" is open) and that menu only opens on a browser-trusted click — the adapter uses the clipboard-fallback tier (Ctrl+V), confirmed working live. Round 8 tried eliminating that paste step by spending the launcher button's trusted click to reveal the file input ahead of time (`SiteAdapter.prepareForOpen`) — this worked when tested tool-side, but on the user's next real use it instead opened a genuine native Windows file-picker dialog (the accepted risk from round 8 firing for real, not hypothetically). Round 9 reverted the mechanism entirely rather than harden it further — `prepareForOpen` is removed from `types.ts`/`gemini.ts`/`mount.ts`, and Gemini is back to clipboard-fallback only, same design as claude.ai/chatgpt.com. Round 10 left Gemini untouched. Round 11: after reloading all three adapters, the owner reported nothing attached on Gemini anymore. Reproduced live and found two compounding bugs — the panel auto-closed before the still-pending Ctrl+V could happen, and once fixed to require a manual ✕ close, that close click was found to steal DOM focus into the iframe, breaking the very next paste. Fixed both (`Board.tsx` no longer auto-closes this outcome; `mount.ts`'s `closeOverlay()` re-focuses the composer on every close) and re-verified live end-to-end. Also re-confirmed no safe way exists to auto-attach without the native picker (menu-open doesn't reveal the input pre-click; synthetic drop events are ignored by the page). Round 12 (2026-08-21): the owner reloaded the packaged extension themselves and confirmed the ✕-then-paste step is the intended design, not a defect — reported OK. See `docs/state.md` rounds 7–12. |
