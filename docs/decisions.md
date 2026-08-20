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

## D-008 — complete v1 before companion surfaces (2026-08-20)

Finish Windows desktop core, all three providers, history replay, semantic extraction, voice,
proposed edits, exports, and recovery as one complete v1. Do not call a reduced subset “MVP”
and ship it as complete. Browser/mobile clients and real-time collaboration are explicitly
deferred.
