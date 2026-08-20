# AGENTS.md — Codex adaptation

Read `CLAUDE.md` first; it is the canonical shared ruleset. Then read
`docs/state.md`, `docs/issues.md`, `docs/decisions.md`, and `docs/repo-map.md`. Read
`docs/vision.md` and `tasks.md` for scope or implementation planning, and `HANDOFF-JA.md`
when resuming work. Before editing a governed path, explicitly open every matching
`.claude/rules/*.md`; Codex does not auto-load Claude path rules.

This file records Codex mechanics only. Do not copy shared product, ledger, security, or git
rules from `CLAUDE.md` here.

## Codex mechanics

- Use the configured Codex model and effort; Claude cache/model routing does not apply.
- Use worker agents only for disjoint write scopes. A fresh-context reviewer is appropriate
  for a large, behavioural, or hard-to-undo diff.
- Use PowerShell, `rg`, `git`, and `apply_patch` directly. Do not assume an RTK wrapper.
- The project `.codex/config.toml` is intentionally empty. Machine-wide approvals, sandbox,
  hooks, and model settings belong to the operator's global Codex configuration.
- Verify with `pnpm verify`; do not make a missing scaffold look green with a fake check.
- Report progress and completion in concise Japanese when handing work to the owner.
