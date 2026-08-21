# repo-map.md — repository navigation

## Foundation

| Path | Role |
|---|---|
| `CLAUDE.md` | Canonical shared rules and architecture invariants |
| `AGENTS.md` | Codex-only mechanics; points to `CLAUDE.md` |
| `README.md` | Japanese install, usage, and privacy guide |
| `.claude/settings.json` | Project Claude permission baseline |
| `.codex/config.toml` | Intentionally empty project override |
| `.mcp.json` | UI検出時にセットアップが管理するプロジェクト限定 Chrome DevTools MCP |
| `DESIGN.md` | `verify` が参照する実行可能なデザイントークン登録簿 |
| `HANDOFF-JA.md` | Japanese continuity checkpoint |
| `tasks.md` | Execution ledger |
| `.env.example` | Safe variable-name template only (currently unused — no API keys) |
| `.gitignore` | Local files/secrets/build output exclusion |

## Ledgers and design

| Path | Role |
|---|---|
| `docs/vision.md` | Intent, audience, v1 contract, non-goals |
| `docs/state.md` | Current implementation state, next pointer, verification status |
| `docs/decisions.md` | Numbered architecture/product decisions (D-009+ record the pivot) |
| `docs/issues.md` | Current blockers only |
| `docs/adapter-smoke.md` | Manual per-site DOM-adapter verification checklist and log |
| `docs/product-research.md` | Competitor facts, negative-review themes, source URLs (desktop-era; being superseded) |
| `docs/design-system.md` | Palette, type, layout, interaction and a11y tokens |

## Workspace and execution

| Path | Role |
|---|---|
| `apps/extension/` | Chrome MV3 extension: content script, board page, build script |
| `apps/extension/manifest.json` | MV3 manifest — host permissions scoped to chatgpt.com only in v1 |
| `apps/extension/src/content/` | Runs on the host page: launcher mount, adapters, insertion ladder |
| `apps/extension/src/content/adapters/` | Per-site DOM lookups (`SiteAdapter`); highest-maintenance code in the repo |
| `apps/extension/src/content/insert/` | Site-independent insertion mechanics (file attach, text insert) |
| `apps/extension/src/board/` | The whiteboard itself — an isolated `chrome-extension://` page (Excalidraw) |
| `apps/extension/build.mjs` | esbuild bundling for content script (IIFE) and board page (ESM) |
| `packages/core/` | Dormant — provider-neutral domain schemas from the desktop build, unused by the extension today; see D-011/D-012 |
| `scripts/setup.mjs` | Cross-platform workspace bootstrap checks |
| `scripts/verify.mjs` | Required-path、デザイントークン、lint/typecheck/test/build runner |
| `.github/workflows/ci.yml` | External CI merge gate |

## Dependency direction

```text
apps/extension/board   ── @excalidraw/excalidraw (isolated chrome-extension:// page)
apps/extension/content ── DOM only; talks to board via postMessage, origin-validated both ways
packages/core           (dormant; no current import edge into apps/extension)
```

The content script never injects React or Excalidraw into the host page's own DOM — the board
runs in its own iframe/document specifically to avoid CSS and keyboard-handler collisions with
the host site. The only channel between the two is `postMessage`, always targeted at an
explicit origin and validated by both sides on receipt (see D-009, D-011).
