# AI Whiteboard — pm-zero v12.1 project rules

This file is the shared project ruleset. Codex reads it first through `AGENTS.md`; do not
duplicate these rules there.

## Product boundary

AI Whiteboard is a Chrome extension (Manifest V3) that adds a whiteboard input method to
ChatGPT's web UI (Claude and Gemini in later phases). A launcher button beside the site's own
composer opens a whiteboard overlay; drawing and pressing "送信" inserts a white-background PNG
plus an ordered structured text description of what was drawn into that composer. The user
always presses the site's own send button. **This tool never auto-submits and never reads the
AI's response** — see `docs/decisions.md` D-013, a hard constraint, not a style choice.

An earlier standalone Electron desktop app with its own direct AI-provider API calls is
preserved at git tag `archive/desktop-v1` and is not the active product — see D-009 for why
that direction was superseded. Accounts, a backend, cloud collaboration, always-on telemetry,
and stored API keys remain non-goals — the extension calls no AI provider API itself, so there
are no keys to hold.

## Source of truth and startup

Read this file, then `docs/state.md`, `docs/issues.md`, `docs/decisions.md`, and
`docs/repo-map.md` at session start. Open `docs/vision.md` and `tasks.md` when planning or
changing scope. Read `HANDOFF-JA.md` when resuming a handoff. If a path matches a file in
`.claude/rules/`, open that rule before editing it.

- Intent: `docs/vision.md`
- Execution ledger: `tasks.md` (the main agent owns it)
- Current state: `docs/state.md`
- Decisions: `docs/decisions.md`
- Current blockers only: `docs/issues.md`
- Navigation: `docs/repo-map.md`
- Research: `docs/product-research.md`
- Visual language: `docs/design-system.md`

## Architecture invariants

- The whiteboard (`apps/extension/src/board/`) runs as an isolated `chrome-extension://` page
  inside an iframe — never injected directly into the host page's own DOM/React tree, to avoid
  Excalidraw's global CSS and keyboard handling colliding with the site's own.
- The content script (`apps/extension/src/content/`) only locates and mutates the host page's
  DOM; it never throws uncaught (a content script runs on every matched page load — an
  exception here is user-visible noise on someone else's site, not a contained failure).
- Board ↔ content-script communication is `postMessage` only, always targeted at an explicit
  origin and validated (`event.origin`, `event.source`) by both sides on receipt. Never `'*'`.
- Site differences are isolated behind a `SiteAdapter` interface
  (`apps/extension/src/content/adapters/types.ts`); a lookup that can't find its target returns
  `null`, never throws. Insertion logic (`apps/extension/src/content/insert/`) is site-independent
  and always has a selector-free clipboard fallback as its last tier.
- `host_permissions` cover only the sites actively supported; adding a site is an explicit,
  reviewable manifest change, not a broadened wildcard.
- Excalidraw is the canvas base because it is MIT-licensed. Do not add tldraw without an
  explicit license decision.
- Never add code that auto-submits a message on the host site or reads/surfaces the AI's
  response — see `docs/decisions.md` D-013. A change that touches this needs that decision
  revisited first, not a quiet workaround.

## Quality and workflow

Use PowerShell and `apply_patch` for edits. Keep changes small and preserve unrelated work.
Every bug fix starts with a reproduction test. Run `pnpm verify` (lint, typecheck, test,
build) at standard depth; CI is the merge gate. Run `git diff --check` before handoff and
`gitleaks git --no-banner` before push when available. Never commit `.env*` or secrets.

The project is on a feature branch. The owner's pm-zero delivery order authorizes logical commits,
pushes to that branch, and a pull request; never push directly to `main`.
For large or behaviour-changing diffs, use a fresh-context read-only reviewer and ask for
all findings with severity and confidence.

## Language and interaction

User-facing Japanese and English are both first-class. Keep identifiers and commands in
English. Prefer concise Japanese in handoffs and ledger updates. Accessibility includes
keyboard navigation, visible focus, reduced motion, readable contrast, and Japanese text
input/font fallback.
