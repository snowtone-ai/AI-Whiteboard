# tasks.md — pm-zero v12.1 execution ledger

## Goal binding

- Vision: `docs/vision.md`
- Active goal: ship the complete personal/family Windows desktop AI Whiteboard v1, not an MVP.
- Branch: `feat/complete-ai-whiteboard`
- Ledger owner: main agent. Workers edit only the write scopes assigned in a row and report
  evidence; the main agent updates status.
- Review: deterministic `pnpm verify` plus a fresh-context reviewer for large or behavioural
  diffs. CI is the merge gate.

## Status vocabulary

`proposed` = idea only · `ready` = owner/dependencies/scope/acceptance/verification/evidence
are explicit · `doing` = active · `blocked` = external dependency · `review` = implementation
complete · `done` = accepted · `verified` = evidence recorded.

## Complete-product phases

| ID | Status | Owner | Depends on | Write scope | Acceptance | Verification | Evidence |
|---|---|---|---|---|---|---|---|
| T001 | verified | main | none | root package/workspace config | Electron+React+TS+Vite/electron-vite workspace installs on Windows; app and domain package boundaries are explicit | `pnpm install`, `pnpm typecheck` | install and typecheck pass on Node 24/pnpm 10; production audit 0 |
| T002 | verified | main | T001 | `packages/core/`, AWCP schemas | Versioned board, event, region, capsule, proposal, provenance, provider-error schemas validate and reject unknown unsafe fields | schema unit/property tests | 13 core tests pass |
| T003 | verified | main | T001 | `packages/core/`, Electron main/preload | Atomic JSON snapshot + backup + startup repair + safeStorage key vault work offline; no plaintext secret reaches renderer or export | crash/recovery fixtures, key-storage boundary tests | corrupt JSON and invalid-shape primary recovery tests pass |
| T004 | verified | main | T001,T002 | `apps/desktop/` canvas shell | Excalidraw MIT canvas supports drawing, text, image, connectors, grouping, undo/redo, keyboard focus, Japanese text, reduced motion | component tests, Windows/browser smoke | renderer tests and 1440x900 interaction smoke pass |
| T005 | verified | main | T002,T004 | region/context UI | Context Lens supports scoped selection, minimap, complexity/token estimate, privacy exclusions, payload preview, and global shortcut overlay | selection/payload exclusion tests, keyboard smoke | privacy/core tests and prompt smoke pass |
| T006 | verified | main | T002,T003,T005 | main adapters and AI UI | OpenAI/Anthropic/Gemini adapters consume identical AWCP capsules; defaults are gpt-5.6-luna, claude-sonnet-5, gemini-3.7-flash; failures are normalized and visible | validation/offline contract tests; SDK compile | offline no-key/redaction tests pass; live calls require local credentials |
| T007 | verified | main | T002,T004,T006 | semantic extraction/voice | Notes, entities, relations, code, equations, questions, assumptions, evidence and confidence link to source IDs; voice has explicit recording state and Web Speech fallback | extraction fixtures, locale/UI smoke | semantic fixtures pass; Japanese voice controls render |
| T008 | verified | main | T003,T004,T006,T007 | proposals/history | AI patches show diff, provenance/provider/model/capsule hash; accept/reject/undo, history replay and restore are reliable | malformed patch/replay tests and interaction smoke | core tests pass; proposal accepted and replay restored in smoke |
| T009 | verified | main | T003,T004,T005,T008 | export/import | Portable board + Context Capsule export/import and SVG/PNG/PDF/Markdown/JSON outputs work without secrets; imports are schema-checked | build, round-trip and export UI smoke | session round-trip boundary and all export choices verified |
| T010 | verified | main | T001–T009 | integration/release | Complete Windows desktop flow: capture → scoped send → proposal → review → accept/reject → replay → export → crash recovery; account/backend/telemetry remain absent | full smoke, package build, CI | local flow and prior 4-process packaged smoke pass; final 151.7 MB NSIS installer generated (unsigned final EXE is blocked by this host's application-control policy) |
| T011 | verified | main | T010 | docs/handoff | README/operator docs, `docs/state.md`, this ledger and Japanese handoff record commands, evidence and residual risks | `git diff --check`, `pnpm verify`, gitleaks if available | fresh Luna/max review completed; all 7 findings fixed; 26 tests, production audit 0, diff check and staged-secret scan pass |
| T012 | verified | main | T011 | pm-zero v12.1 operating layer | UI検出セットアップ、プロジェクト限定 DevTools MCP、トークン登録簿と差分 lint、最小化したグローバル Codex 構成を適用する | `node scripts/setup.mjs`, `pnpm verify`, `git diff --check`, `gitleaks git --no-banner` | setup、26 tests、build、diff check、secret scan pass |

## Execution rule

Do not mark a phase done because the UI exists. Record the command, fixture, screenshot or
test evidence that proves the acceptance row. A surprising failure becomes a verifier check
when machine-detectable; only a last-resort contextual rule belongs in `.claude/rules/`.

## Current pointer

Implementation, independent review and local release verification are complete. The pull
request CI remains the merge gate.
