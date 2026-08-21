# state.md — current project state

Updated: 2026-08-21

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

ChatGPT web UI, launcher button beside the composer, whiteboard overlay, send = PNG (white
background) + an ordered structured text description of what was drawn, inserted into the
composer. The user always presses the site's own send button — this extension never
auto-submits and never reads the AI's response (D-013, hard constraint). No accounts, backend,
telemetry, or stored API keys — there are none to store, since this tool doesn't call any AI
provider API itself.

## Next

1. Manual smoke test on chatgpt.com with a real logged-in session (cannot be run from this
   environment — see `docs/adapter-smoke.md` for the checklist and record the result there).
2. Load the unpacked extension (`apps/extension/dist/` after `pnpm build`) via
   `chrome://extensions` → Developer mode → Load unpacked, and confirm the launcher button
   appears, the board opens, and send attaches an image to the composer.
3. Claude adapter, then Gemini adapter, each as its own reviewable change — see `tasks.md`.

## Verification status

- `pnpm verify` (lint, typecheck, test, build) passes locally: 18 tests (5 new for
  `summarizeBoard`, 13 existing in `packages/core`), clean lint/typecheck, extension bundle
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
