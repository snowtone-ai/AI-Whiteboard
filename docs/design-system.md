# Design system — graphite drafting instrument

## Direction

AI Whiteboard should feel like a well-used graphite drafting instrument: quiet paper, precise
blue marks, occasional coral warnings, and a film-strip of context that makes the boundary
between board and AI tangible. The canvas is not a dashboard. Controls recede until needed;
evidence and privacy status remain legible.

## Tokens

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#182027` | app shell, deep chrome, primary dark surface |
| `drafting-blue` | `#295BFF` | focus, links, selected region, primary action |
| `signal-coral` | `#FF6B4A` | warning, unsaved/recovery state, proposed-change marker |
| `chalk` | `#F7F8F4` | canvas paper and high-contrast light surface |
| `grid` | `#DDE3EA` | grid, hairlines, separators, neutral field |
| `ink` | `#11181D` | body text and canvas annotation |

Suggested derived values: graphite at 88% for panels, grid at 60% for lines, drafting-blue at
12%/20% for selection fills, and signal-coral at 12% for warning fills. Never use coral as
the only error signal; pair it with icon/text and an accessible border.

## Typography

- UI/body: `BIZ UDPGothic`, `Yu Gothic UI`, `Yu Gothic`, `Meiryo`, system sans-serif.
- Technical/code: `Cascadia Code`, `Consolas`, monospace.
- Use `font-size` 13–14px for utility labels, 15–16px body, 20–28px section titles. Keep
  Japanese line-height at 1.55–1.75 and avoid forced Latin-only word breaks.
- Canvas text remains user-controlled; do not rewrite a user's Japanese punctuation or
  full-width characters during semantic extraction.

## Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ thin title/shortcut bar                         save + provider │
├──────┬──────────────────────────────────────────┬───────────────┤
│ tool │                                                  board   │
│ rail │               Excalidraw canvas                         │
│      │                                                          │
│      │  minimap / regions / complexity        Context Lens     │
│      │                                      ┌───────────────┐   │
│      │                                      │ film-strip     │   │
│      │                                      │ selected       │   │
│      │                                      │ excluded       │   │
│      │                                      │ preview/send   │   │
│      │                                      └───────────────┘   │
└──────┴──────────────────────────────────────────────────────────┘
```

- Keep a 48px title bar and a narrow tool rail; reserve the majority of the window for the
  canvas. The Context Lens is a right-side film-strip or bottom sheet at narrow widths, never
  a modal that hides the selected board content.
- Regions use a subtle drafting-blue outline, name tab, and complexity dot. Minimap markers
  inherit region color but remain distinguishable at low contrast.
- Proposed edits use a dashed coral/blue overlay and numbered chips. Accepted state returns to
  normal ink; rejected state remains in history but not on the board.

## Interaction rules

- Global shortcut opens a compact overlay with capture, board search, and ask; `Esc` restores
  the prior focus and never drops unsaved strokes.
- `Ctrl/Cmd+S` forces an atomic snapshot; show a short “saved locally” acknowledgement.
- Sending AI requires visible selection and an explicit action. The Context Lens can be opened
  with keyboard focus and its payload preview is copyable as text/JSON.
- Every mutation has undo. A proposal must expose accept all, reject all, per-change review,
  and provenance before applying.
- Voice is push-to-talk; recording/transcription state is visible, cancellable and keyboard
  reachable. A denied microphone falls back to text/Web Speech guidance.

## Accessibility and quality

- WCAG AA contrast for shell/UI, visible 2px focus ring in drafting blue, target size >= 32px.
- Keyboard order: title bar → tool rail → board → regions/minimap → Context Lens → status.
- Every icon has a label or tooltip; color is never the only status encoding.
- Respect `prefers-reduced-motion`; keep transitions under 160ms when motion is enabled.
- Test at 1280×800 and 1536×864 desktop sizes plus a 1024px constrained window; verify IME
  composition, copy/paste, high-DPI scaling, and screen-reader names on Windows.
