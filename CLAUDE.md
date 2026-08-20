# AI Whiteboard — pm-zero v12 project rules

This file is the shared project ruleset. Codex reads it first through `AGENTS.md`; do not
duplicate these rules there.

## Product boundary

AI Whiteboard is a Windows-first Electron desktop whiteboard for one person and a family.
It must support technical work (architecture, code, planning, diagrams) and education/STEM
(explanations, experiments, lessons, worked examples). The finished v1 includes the desktop
core, three provider adapters, local history replay, region-scoped AI sends, semantic
extraction, voice input with a Web Speech fallback, proposed edits with accept/reject and
provenance, export/import, crash recovery, and accessible keyboard operation.

Accounts, cloud collaboration, and always-on telemetry are non-goals for the personal/family
product. Browser/mobile companions are deferred outside v1. AI is opt-in and network calls
are visible to the user.

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

- Renderer code is browser-safe React/TypeScript; filesystem, `safeStorage`, native menus,
  global shortcuts, and provider requests cross an explicit Electron preload boundary.
- The domain and AWCP contracts are provider-neutral. OpenAI, Anthropic, and Gemini are
  adapters, never imports from canvas components.
- Board state is local-first, versioned, and persisted with atomic write/rename plus a
  recoverable backup and event/snapshot history. API keys use Electron `safeStorage`; plaintext keys never enter board
  JSON, logs, exports, or renderer storage.
- AI receives a visible Context Lens selection and a structured AWCP Context Capsule. Never
  imply hidden chain-of-thought: show interaction order, selected evidence, tool calls, and
  proposed mutations only.
- Excalidraw is the canvas base because it is MIT-licensed. Do not add tldraw without an
  explicit license decision.

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
