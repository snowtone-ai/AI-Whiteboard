# repo-map.md — repository navigation

## Foundation

| Path | Role |
|---|---|
| `CLAUDE.md` | Canonical shared rules and architecture invariants |
| `AGENTS.md` | Codex-only mechanics; points to `CLAUDE.md` |
| `README.md` | Japanese setup, operation, privacy and release guide |
| `.claude/settings.json` | Project Claude permission baseline |
| `.codex/config.toml` | Intentionally empty project override |
| `HANDOFF-JA.md` | Japanese continuity checkpoint |
| `tasks.md` | Complete-product execution ledger |
| `.env.example` | Safe variable-name template only |
| `.gitignore` | Local files/secrets/build output exclusion |

## Ledgers and design

| Path | Role |
|---|---|
| `docs/vision.md` | Intent, audience, finished-v1 contract, non-goals |
| `docs/state.md` | Current implementation state, next pointer, verification status |
| `docs/decisions.md` | Numbered architecture/product decisions |
| `docs/issues.md` | Current blockers only |
| `docs/product-research.md` | Competitor facts, negative-review themes, source URLs |
| `docs/design-system.md` | Palette, type, layout, interaction and a11y tokens |

## Workspace and execution

| Path | Role |
|---|---|
| `apps/desktop/` | Electron main/preload + React renderer application |
| `packages/core/` | Versioned board/AWCP/proposal schemas and provider-neutral domain operations |
| `apps/desktop/src/main/storage.ts` | Atomic JSON, snapshots/events, backup recovery and encrypted secret storage |
| `apps/desktop/src/main/providers.ts` | OpenAI/Anthropic/Gemini adapters and normalized errors |
| `scripts/setup.mjs` | Cross-platform workspace bootstrap checks |
| `scripts/verify.mjs` | Required-path and lint/typecheck/test/build runner |
| `.github/workflows/ci.yml` | External CI merge gate |

## Dependency direction

```text
apps/desktop renderer ── @ai-whiteboard/core
apps/desktop preload  ── typed IPC contracts
apps/desktop main     ── storage + providers + native window services
```

Contracts contain no Electron, React, provider SDK, or filesystem imports. Renderer imports
only browser-safe APIs and the typed preload surface.
