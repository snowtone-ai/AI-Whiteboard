# Product research — visual whiteboards and AI context (2026-08-20)

This is a dated directional scan, not a claim that review sites represent every user. Product
facts are taken from official pages; pain points are recurring themes in public G2/Capterra,
Microsoft Q&A, or community discussions. Prices, feature gates, and AI models change, so
re-check links before making a release or pricing decision.

## Competitor scan

| Product | What it does well / current fact | Negative-review or limitation signal | Consequence for AI Whiteboard | Sources |
|---|---|---|---|---|
| Miro | Canvas 26 makes the board readable/writeable by AI and adds Sidekicks, Flows, MCP and connectors across a broad collaboration surface. | G2 themes include slow loading/lag on dense boards, cluttered navigation, learning curve, expense, and AI that can feel clunky. | Keep the single-user canvas fast; add scoped regions, minimap, complexity signal and history instead of an infinitely undifferentiated board. | [Canvas 26 highlights](https://miro.com/blog/canvas-26-product-highlights/), [Miro AI direction](https://miro.com/newsroom/miro-takes-aim-at-the-gap-between-ai-potential-and-organizational-reality/), [May 2026 releases](https://miro.com/blog/whats-new-may-2026/), [G2 reviews](https://www.g2.com/products/miro/reviews) |
| FigJam | Tight Figma integration, real-time collaboration, diagramming, templates, and AI generate/sort/summarize. Current pricing uses seats and AI credits; FigJam AI is paid-plan gated. | G2 reviewers repeatedly mention large-board performance, limited advanced architecture controls, difficult navigation, and AI templates that feel generic. | Design for technical diagrams and STEM evidence with region semantics, source links, and proposed edits; do not hide complexity behind generic generation. | [FigJam](https://www.figma.com/figjam/), [Figma pricing](https://www.figma.com/pricing/), [FigJam AI help](https://help.figma.com/hc/en-us/articles/16822138920343-Use-AI-tools-in-FigJam), [G2 reviews](https://www.g2.com/products/fig-jam/reviews) |
| Whimsical | Fast flowcharts, mind maps and wireframes with AI generation; current releases also expose an MCP server for agent workflows. | G2 themes include limited customization/color options, limited free documents, insufficient learning resources and perceived expense; larger work can feel restrictive. | Use a distinctive restrained token system, portable local files and a provider-neutral capsule rather than coupling the board to one agent. | [AI](https://whimsical.com/ai), [releases](https://whimsical.com/releases), [G2 reviews](https://www.g2.com/products/whimsical/reviews) |
| Napkin | Converts pasted/imported text into editable diagrams, mind maps, charts and infographics; supports PNG/PDF and paid PPT/SVG paths. | G2 themes mention vague inputs producing inaccurate visuals and confusing credit limits; the flow is optimized for text-to-visual output rather than a persistent, hand-drawn board. | Preserve rough board evidence and source IDs; make extraction inspectable, editable and reversible rather than replacing a board with a generated graphic. | [Napkin](https://www.napkin.ai/), [Napkin pricing](https://www.napkin.ai/pricing/), [Napkin help](https://help.napkin.ai/en/collections/3741376-getting-started), [G2 reviews](https://www.g2.com/products/napkin-ai/reviews) |
| Microsoft Whiteboard | Microsoft 365/Teams integration and education workflows remain useful, but Microsoft is migrating Azure boards to OneDrive and retiring the standalone Windows/iOS/Android apps on 2026-09-14. | G2 feedback includes sync/reliability friction, sign-in dependence, limited customization and weaker advanced diagramming. | A dependable account-free Windows desktop board with portable files is now a stronger opportunity; migration and recovery must be first-class. | [migration and retirement](https://support.microsoft.com/en-US/whiteboard/migration-of-whiteboards-from-azure-to-onedrive), [G2 reviews](https://www.g2.com/products/microsoft-whiteboard/reviews) |
| Excalidraw | MIT-licensed open source canvas, open `.excalidraw` JSON format and local-friendly use; the current published package checked on 2026-08-20 is 0.18.1. | Its core canvas is intentionally sketch-oriented; a product still needs durable desktop files, semantic context, provider controls, history and education workflows. | Adopt it as the canvas base, then add the local-first AI/evidence layer without creating a license or account dependency. | [README](https://github.com/excalidraw/excalidraw/blob/master/README.md?plain=1), [npm](https://www.npmjs.com/package/%40excalidraw/excalidraw), [changelog](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/CHANGELOG.md) |
| tldraw | SDK 4.0 is technically strong and production-oriented. | Production SDK use requires an eligible license; hobby use is discretionary and watermarked. | Do not choose tldraw for this personal MIT project unless licensing, watermark and network implications are explicitly accepted. | [pricing](https://tldraw.dev/pricing), [license](https://tldraw.dev/community/license), [SDK 4.0](https://tldraw.dev/blog/tldraw-sdk-4-0) |

## Current provider and platform check

The model defaults were verified against the vendors' current official catalogues on
2026-08-20: OpenAI `gpt-5.6-luna` (with Terra/Sol choices), Anthropic `claude-sonnet-5`, and
Google `gemini-3.7-flash`. Electron's official security guidance informed the isolated preload,
sandbox, sender validation, restrictive CSP and `safeStorage` boundary. Package majors are
pinned to the tested React 18/Excalidraw/electron-vite compatibility set rather than upgraded
independently during release hardening.

Sources: [OpenAI models](https://developers.openai.com/api/docs/models),
[Anthropic deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations),
[Gemini models](https://ai.google.dev/gemini-api/docs/models),
[Electron security](https://www.electronjs.org/docs/latest/tutorial/security),
[context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation),
[`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage),
[`globalShortcut`](https://www.electronjs.org/docs/latest/api/global-shortcut).

## Cross-product signals

1. **The canvas is rarely the core complaint.** Users value easy drawing and collaboration;
   pain clusters around large-board navigation, performance, paywalls, account/cloud reliance,
   weak customization, and opaque AI output.
2. **AI actions are increasingly available but context boundaries are weak.** Competitors
   summarize or generate from selected notes, yet users still need to know what was sent, how
   a claim was grounded, and how to undo a mutation.
3. **Education and technical work need more than sticky-note clustering.** A STEM learner
   needs equations, hypotheses, evidence, uncertainty and sequence; an engineer needs code,
   relations, scope and provenance. Those should be first-class semantic objects.
4. **Offline is a trust feature.** Microsoft and cloud competitors assume identity/sync, while
   Excalidraw demonstrates that local/open formats can be approachable. A family tool should
   open, save, export, and recover without an account.
5. **The standalone Windows gap is newly concrete.** Microsoft Whiteboard's 2026 desktop-app
   retirement makes portable session files, crash recovery and provider independence more than
   implementation preferences; they are product-level continuity features.

## Product responses / testable bets

| Observed gap | AI Whiteboard response | Test |
|---|---|---|
| Dense boards become slow or impossible to orient | scoped regions, minimap, complexity badge, jump/search, local history | 10k-element fixture remains interactive and region search remains bounded |
| AI context is implicit | Context Lens film-strip with selected/excluded objects, token/privacy preview, exact capsule | exclusion test proves omitted objects never reach mock transport |
| Generated output is hard to trust | typed proposal patch, per-item accept/reject, source IDs, capsule hash, provider/model/timestamp | stale/malformed patch is refused; accepted patch is undoable |
| Cloud/seat limits interrupt family use | local JSON + atomic recovery, no account/backend/telemetry by default | offline open/edit/save/restart/export test |
| Generic visuals lose the original thinking | preserve interaction order and rough evidence; semantic extraction links to source IDs | replay/capsule round-trip shows original board and evidence order |

## Research caveat

Review aggregates are useful for discovering recurring complaints, not for estimating defect
rates. The implementation should measure its own budgets (startup, draw latency, payload size,
recovery success, accessibility) with executable tests rather than treating competitor reports
as acceptance criteria.
