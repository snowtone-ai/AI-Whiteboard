# AI Whiteboard — vision and complete v1 contract

## North star

AI Whiteboard is a calm, local-first drafting instrument for thinking with a family: the
same surface can hold a system diagram, a half-finished proof, a child's science question,
or a lesson plan without turning any of those into a cloud account or a chat transcript.
The canvas is the primary record. AI is a visible, reversible collaborator that helps make
the board more legible and more useful, never an invisible author.

## Who it serves

1. A technical builder mapping architecture, debugging a flow, planning a feature, or
   extracting implementation context for an AI provider.
2. A parent/teacher preparing a lesson, explaining a STEM concept, or turning a sketch into
   a worked example.
3. A learner asking questions by drawing, typing, or speaking, then checking the answer
   against the selected evidence and the order of the interaction.
4. A family sharing one Windows machine where private local files and simple recovery matter
   more than accounts, team administration, or a permanent online workspace.

## Finished v1 (definition of complete, not an MVP)

### Desktop canvas

- Windows desktop shell built with Electron + React + TypeScript + Vite/electron-vite.
- Excalidraw as the MIT-licensed canvas base, with freehand, shapes, connectors, text,
  images, grouping, selection, undo/redo, zoom, keyboard shortcuts, and accessible focus.
- Graphite drafting instrument visual language, Japanese-friendly font fallback, reduced
  motion, and a compact layout that keeps the board dominant.
- Scoped regions with labels, color, minimap, complexity/size signal, and jump-to navigation.

### Local-first continuity

- Versioned board documents stored as JSON in Electron's local user-data workspace.
- Atomic temp-write + rename, versioned snapshots/events, recoverable backup, startup repair, and explicit
  storage-health UI. A crash must not silently discard the last accepted board state.
- Import/export of the portable board format and SVG/PNG/PDF/Markdown/JSON outputs where the
  format supports the content. Exports never contain provider secrets.
- Local history timeline with replay, diff-aware snapshots, and restore to a prior accepted
  state. History is useful offline and has no server dependency.

### AI as evidence-preserving collaboration

- Context Lens appears before send: selected objects/regions, text/image extraction, token
  estimate, privacy flags, provider/model, and the exact payload preview are visible.
- AWCP (AI Whiteboard Context Protocol) produces a versioned Context Capsule containing board
  metadata, region summaries, semantic objects, interaction order, user request, and explicit
  exclusions. It is portable as JSON/Markdown and can be attached to a bug report or lesson.
- Provider adapters for OpenAI, Anthropic, and Gemini. Defaults are configurable and recorded
  as `gpt-5.6-luna`, `claude-sonnet-5`, and `gemini-3.7-flash` respectively; users may select
  another available model without changing the AWCP contract.
- Semantic extraction can identify notes, entities, relations, code blocks, equations,
  hypotheses, questions, assumptions, and evidence links. Every extracted item links back to
  source element IDs and confidence.
- Voice input uses a native-capable path and a Web Speech API fallback, with a visible
  recording/transcription state and no always-on microphone.
- AI can propose board mutations (create/move/label/connect/summarize) as a typed patch. The
  user sees a diff, provider/model, timestamp, capsule hash, source references, and rationale
  label; accept/reject is per proposal and undo remains available. AI never mutates silently.
- Interaction order is shown as evidence (events and selected inputs), not claimed as hidden
  reasoning or chain-of-thought. Store concise provenance, not private model deliberation.
- Fast global shortcut opens a focused overlay for capture/search/ask, then returns to the
  current board without losing drawing focus.

### Privacy and family safety

- No account, backend, cloud collaboration, or telemetry by default. Network activity occurs
  only after a user action that sends a capsule to a selected provider.
- API keys are held by the Electron main process and encrypted with `safeStorage`; renderer
  code receives opaque provider status, never raw key material. `.env.example` documents names
  only; actual `.env*` files remain untracked.
- Clear export/send warnings for images, personal notes, children's data, or code marked
  sensitive. A user can exclude any object or region before sending.

## Product principles

1. **The board is the memory.** A week later, the local file and ledger explain what happened.
2. **Selection is consent.** Context is scoped, previewed, and reversible before network use.
3. **Proposals, not magic.** AI edits are typed, reviewable, attributable, and undoable.
4. **Sketches are evidence.** A rough line, equation, or sequence can be meaningful without
   being forced into a polished diagram first.
5. **Family-safe defaults.** Offline and local work should be the happy path; network and
   microphone use should be explicit.
6. **Technical and educational parity.** A code architecture and a science experiment use
   the same primitives: regions, relationships, evidence, history, and explanation.

## Success signals (executable where possible)

- A new board opens and accepts drawing, text, image, region, undo/redo, save, reload, and
  export without an account.
- A crash-recovery fixture proves the last complete atomic snapshot is restored and a partial
  write is never presented as valid.
- A Context Lens test proves an excluded region is absent from all provider payloads.
- Provider contract tests run the same AWCP capsule against all three adapters and normalize
  errors without provider-specific UI branches.
- Proposal tests prove malformed or stale patches are rejected, accepted patches are logged,
  and every accepted edit can be undone.
- Keyboard/a11y and Japanese text fixtures pass on the supported Windows viewport matrix.
- `pnpm verify` and the GitHub CI check pass; no telemetry/account/network call occurs during
  offline smoke tests.

## Explicit non-goals for v1

- Multi-user real-time collaboration, hosted sync, public sharing links, account systems,
  billing, social graphs, or always-on analytics.
- Browser/mobile companion apps (portable Context Capsule and export formats are the bridge).
- Autonomous agents that edit without review, hidden chain-of-thought display, or a claim that
  AI output is authoritative for medical, legal, or safety-critical decisions.
