# decisions.md — architecture and product decisions

## D-001 — desktop-first local product (2026-08-20)

Choose Electron + React + TypeScript + Vite/electron-vite for the Windows desktop core.
It gives one UI stack, native filesystem/shortcut/safeStorage access, and a route to a
portable renderer without committing the family to an account or hosted backend. Browser and
mobile companions are outside v1; portable files and Context Capsules are the interoperability
surface.

## D-002 — Excalidraw over tldraw (2026-08-20)

Use Excalidraw because its project is MIT-licensed and its open `.excalidraw` JSON format is a
useful escape hatch. tldraw is technically strong but its SDK requires a trial, commercial,
or discretionary hobby license key for production; hobby use carries a watermark. A future
change requires a written licensing decision and license fixture before adding tldraw.

## D-003 — local-first atomic persistence (2026-08-20)

Board state is versioned JSON written to a user-controlled local workspace by temp-file,
flush/close, then atomic rename. A small journal and startup repair path cover interrupted
writes. Cloud sync, accounts, and telemetry are not hidden dependencies. Recovery health is
visible and export/import is a first-class escape hatch.

## D-004 — secrets stay in Electron safeStorage (2026-08-20)

The main process stores provider API keys through Electron `safeStorage`; renderer and board
documents see only provider IDs/status. Requests cross a narrow preload API. No key appears in
`.env.example` values, JSON snapshots, logs, capsules, or exports. This is a local convenience,
not a claim that a compromised user profile is a secure vault.

## D-005 — provider-neutral AWCP (2026-08-20)

Define a versioned AI Whiteboard Context Protocol (AWCP) and portable Context Capsule before
provider integration. OpenAI, Anthropic and Gemini adapters normalize capabilities, streaming,
errors and citations into the contract. The canvas never branches on provider-specific payload
shapes. Model defaults are `gpt-5.6-luna`, `claude-sonnet-5`, and `gemini-3.7-flash`; a user
choice is recorded in provenance.

## D-006 — visible context and reversible edits (2026-08-20)

Context Lens is a pre-send gate: selected regions, exclusions, extraction, token estimate,
privacy flags and exact payload are inspectable. AI output is a typed proposal patch, never a
silent canvas mutation. Accept/reject, undo, source IDs, capsule hash, provider/model and
timestamp form provenance. Interaction order is evidence; hidden reasoning is not displayed or
stored.

## D-007 — graphite drafting instrument (2026-08-20)

Use a restrained graphite/blue/coral/chalk palette, Japanese-friendly system fonts, and a
distinctive Context Lens film-strip. The board remains visually dominant; complexity, minimap,
and privacy status are high-signal utilities rather than dashboard chrome.

## D-008 — complete v1 before companion surfaces (2026-08-20) — superseded by D-013

Finish Windows desktop core, all three providers, history replay, semantic extraction, voice,
proposed edits, exports, and recovery as one complete v1. Do not call a reduced subset “MVP”
and ship it as complete. Browser/mobile clients and real-time collaboration are explicitly
deferred.

## D-009 — browser-extension input method, not a desktop app (2026-08-21) — supersedes D-001

The desktop build (tag `archive/desktop-v1`) solved the wrong problem: a standalone app that
calls AI provider APIs itself is a second chat app, not an input method for the chat sites the
user already uses. The actual request was for a whiteboard selectable *inside* ChatGPT's own
web UI, under the user's own account, with the AI call staying on that site. Electron, its
main/preload boundary, and its packaging pipeline are dropped entirely — there is no process
to be. The product is now a Manifest V3 Chrome extension: a content script that injects a
launcher into the host page, and a whiteboard that runs as an isolated `chrome-extension://`
page inside an iframe (not injected directly into the page's own DOM/React tree), because
Excalidraw's global CSS and keyboard handling would otherwise collide with the host site's.
Old desktop build preserved at git tag `archive/desktop-v1`, not deleted.

## D-010 — no stored API keys (2026-08-21) — supersedes D-004

D-004's `safeStorage` key vault existed to hold provider API keys for this app's own direct
provider calls. Under D-009 there are no such calls — the AI request happens through the
website the user is already signed into. The key vault, and the entire class of risk it
existed to contain, is deleted rather than weakened. This is the strongest security outcome of
the pivot: the product's largest attack surface no longer exists.

## D-011 — AWCP survives as a site-adapter contract, not a provider contract (2026-08-21) — amends D-005

The original AWCP normalized *provider* differences (OpenAI/Anthropic/Gemini APIs) behind one
contract. That half is gone with D-010. What remains valuable is the shape of the idea: a
`SiteAdapter` interface (`apps/extension/src/content/adapters/types.ts`) normalizes *site DOM*
differences (ChatGPT/Claude/Gemini composer markup) behind one contract, so the insertion logic
in `apps/extension/src/content/insert/` stays identical across sites. Only the adapter's
`findComposer`/`findFileInput`/`findAnchor` lookups are site-specific and expected to need
maintenance as each site's markup changes; they must fail by returning `null`, never by
throwing, so a broken selector degrades a feature instead of breaking the page. Every insertion
path also falls back to copying the image to the clipboard with a visible instruction — the one
tier that depends on no selector at all.

## D-012 — Context Lens narrows to pre-insert review (2026-08-21) — amends D-006

The proposal/accept/reject loop from D-006 assumed the tool receives an AI response to review.
Under D-009 it never does — there is no response to review, only a drawing about to be sent.
What survives is the underlying principle: nothing leaves the whiteboard without the user
having seen exactly what will be sent. In v1 this is deliberately minimal (see the board's
single "送信" action and its status line in `apps/extension/src/board/Board.tsx`), not the full
region/privacy-switch UI from the desktop build — that UI can come back if a real need for it
shows up, per `docs/vision.md`.

## D-013 — never auto-submit, never read the response (2026-08-21) — supersedes D-008

This is the hard constraint the whole design sits on top of, and it is a deliberate risk
decision, not just a UX choice. Anthropic's and OpenAI's terms of use restrict automated access
to their consumer products, and Anthropic has taken technical enforcement action on this in
2026. A tool that fills the composer and stops — the user always presses the site's own send
button, and this extension never reads or acts on the reply — sits in the same category as an
IME or a tool like Grammarly: it augments human input into a page the human is actively using.
A tool that also clicks send and reads the response would cross into automated access to the
service, which is explicitly out of scope here. If a future change proposes auto-submitting a
message or surfacing the AI's reply inside this extension, that proposal must come back to this
decision first — it is not an incremental feature, it is reopening a boundary that was drawn on
purpose. "Complete v1" for this product is redefined around the open/draw/send loop in
`docs/vision.md`, not around feature parity with the archived desktop build.

## D-014 — send the PNG only, no auto-generated text summary (2026-08-21)

`summarize.ts` turned a board's elements into an ordered text list (`四角形1`, `矢印3（四角形1 →
四角形2）`, `手書きの絵（N画）`) inserted into the composer alongside the PNG. Investigation
(prompted by the user questioning whether this had any real value) found it added ~zero verified
information across both major usage patterns: for shape diagrams beyond a trivial handful of
elements the labels are unverifiable by a model reading the image (no spatial correlation between
a label and its mark — established separately), so "connects A to B" is noise dressed as signal;
for freedraw-heavy boards — the realistic common case for a *whiteboard* — the summary could only
ever report a stroke count, never what was actually drawn, since this extension deliberately never
calls an AI vision model itself to describe it (see D-010). The one external-research finding that
could have justified structured metadata (VLMs benefit from diagram topology info) specifically
requires that metadata be *grounded* to the image (e.g. an ID visible at that element's position)
— ours never was. Given the choice between trimming the summary to only literal typed-text content
or removing it outright, removing it outright was chosen: simpler, and it fully closes the
original "could balloon into chat clutter" concern at the root instead of capping it.
`summarize.ts`, its test, and the now-unused `insertText.ts` insertion tier are deleted; `SendPayload`
no longer carries a `summary` field. The board now sends the PNG alone. This does not reopen
D-013 — the user still always presses the site's own send button; only the auto-generated text
payload is gone, not the manual-send boundary.
