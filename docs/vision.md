# AI Whiteboard — vision and v1 contract

## North star

AI Whiteboard is a one-click whiteboard input method for AI chat sites. When typing isn't the
right way to explain something — a diagram, a flow, a half-formed idea — a button next to the
chat's own composer opens a whiteboard, and what gets drawn is sent into that same composer as
if the user had typed or attached it themselves. The AI conversation itself stays entirely on
the site: its account, its subscription, its history, its response. This tool's job ends the
moment the content lands in the composer.

## What changed from v0

The first build of this product was a standalone Electron desktop app that called AI provider
APIs directly and hosted its own chat loop. That solved a different problem than the one asked
for. See `docs/decisions.md` D-009 for the full reasoning; the short version is that a separate
app with its own AI integration is not an "input method" for ChatGPT — it's a second chat app.

## Who it serves

Anyone typing into ChatGPT (and, in later phases, Claude and Gemini) who occasionally wants to
draw instead of type: a diagram of a system, a rough flow, an annotated screenshot redrawn by
hand, a math sketch. One person, using their own account, on their own machine.

## v1 (ChatGPT only)

- A small launcher button appears next to ChatGPT's message composer.
- Clicking it opens a whiteboard overlay (Excalidraw canvas) on top of the page.
- Drawing, then pressing "送信" (send):
  - exports the board as a white-background PNG,
  - builds a short structured text description of what was drawn, **in drawing order**
    (element type, connections between shapes, any text written) — free to compute locally,
    since it's read directly from the canvas's own element list, not sent anywhere,
  - inserts the text into the composer and attaches the image, using the most reliable
    mechanism available (see `docs/decisions.md` D-011),
  - and stops. The user reviews what landed in the composer and presses ChatGPT's own send
    button. **This tool never presses send and never reads the AI's response** — see D-013.
- If the site's markup has changed and neither insertion mechanism works, the image is copied
  to the clipboard and the user is told to paste it manually. The feature degrades; it does not
  silently fail.

## Product principles

1. **The site owns the conversation.** This tool contributes one message's worth of input and
   then gets out of the way. It has no memory of past sessions and no view of the reply.
2. **Never automate submission.** A human always presses the site's own send button. This is a
   hard constraint, not a convenience — see D-013.
3. **Degrade visibly, never silently.** A broken selector shows as a broken feature (clipboard
   fallback + a visible message), never as a button that quietly does nothing.
4. **Minimal permissions.** Host permissions cover only the sites this extension actually acts
   on. Adding a new site is an explicit, reviewable change, not a broadened wildcard.
5. **Order is evidence.** The order things were drawn in carries meaning; where it can be
   captured for free (it's already in the canvas data), it's sent along with the image.

## Later phases (not v1)

- Claude (claude.ai) and Gemini (gemini.google.com) adapters, in that order — see
  `tasks.md`. Each site's DOM is different enough that this is real, separate work per site,
  not a config flag.
- Anything beyond the core "open, draw, send" loop — voice input, multiple export formats,
  board history/replay, a persistent side panel — is deliberately out of scope until the core
  loop has been used for real and a specific need shows up. The previous desktop build had all
  of these; none of them are assumed to carry forward as-is.

## Explicit non-goals

- A standalone chat interface, in any form. If a future request starts to look like "show the
  AI's reply in the panel too," that is the product this pivot moved away from — see D-013.
- Calling any AI provider's API directly. The site the user is already on does that.
- Multi-user collaboration, accounts, a backend, or telemetry — unchanged from v0.
- Auto-submitting messages or reading the AI's response — unchanged constraint, now load-bearing
  for the site Terms-of-Service posture (see D-013).
