# state.md — current project state

Updated: 2026-08-20

## Current

The complete personal/family Windows v1 is implemented on `feat/complete-ai-whiteboard`.
It includes the Excalidraw canvas, provider-neutral AWCP Context Lens, OpenAI/Anthropic/Gemini
streaming adapters, semantic capsules, reviewable AI proposals, local history/replay,
voice input, import/export, atomic persistence and encrypted API-key storage. The application
does not require an account, backend or telemetry service.

## Product contract to preserve

Windows desktop first; Excalidraw MIT canvas; local-first atomic JSON plus recovery journal;
Electron `safeStorage` for API keys; OpenAI, Anthropic and Gemini adapters; AWCP Context Lens
and portable Context Capsule; region/minimap/complexity; semantic extraction; explicit voice;
proposal diff with accept/reject/provenance; history replay; exports; fast global shortcut.
No accounts, backend, cloud collaboration or always-on telemetry by default. Defaults:
`gpt-5.6-luna`, `claude-sonnet-5`, `gemini-3.7-flash`.

## Next

1. Merge the pull request after external CI passes.
2. Configure any provider API key locally and make one live request before family use.
3. Sign future public installers if distribution expands beyond personal/family devices.

## Verification status

- `pnpm test`: 26 tests across core, renderer, validation, persistence recovery and provider
  offline behavior pass.
- Browser interaction: prompt streaming fallback, proposal accept, provider switch and export
  chooser pass at 1440x900 with no console errors.
- `pnpm verify`, `pnpm audit --prod`, packaged Electron smoke and NSIS installer generation
  pass locally. External CI remains the final merge gate.
- Live provider requests remain credential-dependent and were not sent from the repository.

## Known assumptions

- Node.js 22.12+ and pnpm 10.12 are the supported development baseline on Windows 11.
- Electron main/preload are the only native boundary; renderer remains browser-safe.
- Browser/mobile portability is provided by exports and Context Capsules, not a second client.
