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
   - [ ] Drawing something with at least two connected shapes and one text element, then
         pressing 送信, either:
     - attaches the image to the composer and inserts the ordered text description, or
     - falls back to "copied to clipboard" with a visible message, and Ctrl+V in the composer
       actually pastes the image.
   - [ ] Nothing is auto-submitted — the message stays in the composer until the site's own
         send button is pressed by hand.
   - [ ] No uncaught errors appear in the page's DevTools console attributable to the extension.
5. Record the result below.

## Log

| Site | Last verified | Result | Notes |
|---|---|---|---|
| chatgpt.com | *(not yet run)* | — | Built and unit-tested; no live-browser pass yet. |
| chat.openai.com | *(not yet run)* | — | Redirects to chatgpt.com in most sessions; confirm the redirect still lands the content script. |
| claude.ai | *(not built)* | — | Planned next phase — see `tasks.md`. |
| gemini.google.com | *(not built)* | — | Planned last — composer is the most unusual of the three. |
