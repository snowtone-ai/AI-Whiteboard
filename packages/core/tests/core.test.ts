import { describe, expect, it } from "vitest";
import {
  AWCPRequestSchema,
  INTERACTION_ORDER_EVIDENCE_DISCLAIMER,
  ProviderIdSchema,
  RenderedImageMetadataSchema,
  applyPrivacySwitches,
  buildAWCPRequest,
  buildPromptContract,
  canonicalizeSnapshot,
  computeComplexityMetrics,
  createDefaultProviderConfigs,
  diffSnapshots,
  exportContextCapsule,
  extractSemantics,
  importContextCapsule,
  previewCanvasPatch,
  projectCanvasSnapshot,
  promptContractText,
  reconstructSnapshot,
  selectPayloadTier,
  selectRegions,
  snapshotFingerprint
} from "../src/index.js";

function element(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    ...overrides
  };
}

function snapshot(elements: unknown[]) {
  return projectCanvasSnapshot({ version: 1, elements, appState: {}, files: {}, metadata: {} });
}

describe("providers and canonical canvas projection", () => {
  it("exposes the three supported providers and current defaults", () => {
    expect(ProviderIdSchema.options).toEqual(["openai", "anthropic", "gemini"]);
    expect(createDefaultProviderConfigs().map((config) => [config.id, config.model])).toEqual([
      ["openai", "gpt-5.6-luna"],
      ["anthropic", "claude-sonnet-5"],
      ["gemini", "gemini-3.7-flash"]
    ]);
  });

  it("normalizes defaults without importing Excalidraw runtime types", () => {
    const result = canonicalizeSnapshot({ elements: [element("b"), element("a", { x: -0 })] });
    expect(result.version).toBe(1);
    expect(result.elements[1].x).toBe(0);
    expect(result.appState.selectedElementIds).toEqual([]);
  });
});

describe("canvas event diff and replay", () => {
  it("round-trips deterministic create/update/move/resize/text/order/delete events", () => {
    const before = snapshot([element("a", { text: "old" }), element("b", { x: 10 })]);
    const after = snapshot([
      element("b", { x: 20, width: 120 }),
      element("a", { text: "new", backgroundColor: "#fff" }),
      element("c", { type: "text", text: "created" })
    ]);
    const first = diffSnapshots(before, after, { timestamp: 42 });
    const second = diffSnapshots(before, after, { timestamp: 42 });
    expect(first).toEqual(second);
    expect(first.map((event) => event.seq)).toEqual(first.map((_, index) => index + 1));
    expect(first.map((event) => event.eventId)).toEqual(first.map((_, index) => `diff-${String(index + 1).padStart(6, "0")}`));
    expect(snapshotFingerprint(reconstructSnapshot(first, before))).toBe(snapshotFingerprint(after));
  });

  it("does not mutate snapshots while replaying", () => {
    const before = snapshot([element("a")]);
    const events = diffSnapshots(before, snapshot([element("a", { x: 30 })]));
    const beforeFingerprint = snapshotFingerprint(before);
    const result = reconstructSnapshot(events, before);
    expect(result.elements[0].x).toBe(30);
    expect(snapshotFingerprint(before)).toBe(beforeFingerprint);
  });
});

describe("semantic extraction", () => {
  it("keeps raw element and observed geometry beside confidence-scored inference", () => {
    const input = snapshot([element("note", { type: "text", x: 10, y: 20, width: 80, height: 20, text: "F = ma" })]);
    const extracted = extractSemantics(input);
    expect(extracted.elements[0].raw).toMatchObject({ id: "note", text: "F = ma", x: 10, y: 20 });
    expect(extracted.elements[0].observedGeometry.bounds).toEqual({ x: 10, y: 20, width: 80, height: 20 });
    expect(extracted.elements[0].inferred).toMatchObject({ role: "text", label: "F = ma", source: "mixed" });
    expect(extracted.elements[0].inferred.confidence).toBeGreaterThan(0);
  });

  it("uses explicit bindings for high-confidence relations", () => {
    const input = snapshot([
      element("arrow", { type: "arrow", endBinding: { elementId: "target" } }),
      element("target", { type: "ellipse" })
    ]);
    expect(extractSemantics(input).relations).toEqual([expect.objectContaining({ fromElementId: "arrow", toElementId: "target", confidence: 0.98 })]);
  });
});

describe("AWCP, privacy, complexity, and prompt contracts", () => {
  it("builds an AWCP v1 request with image metadata and adaptive tier", () => {
    expect(RenderedImageMetadataSchema.parse({ mimeType: "image/png", width: 320, height: 200, dataUrl: "data:image/png;base64,AA==" }).mimeType).toBe("image/png");
    const request = buildAWCPRequest({
      requestId: "r1",
      userPrompt: "Explain this diagram",
      snapshot: snapshot([element("a", { text: "a small note" })]),
      renderedImage: { mimeType: "image/png", width: 320, height: 200, dataUrl: "data:image/png;base64,AA==" },
      privacySwitches: { includeRenderedImage: false }
    });
    expect(request.protocol).toBe("AWCP");
    expect(request.version).toBe("1");
    expect(request.canvasFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(AWCPRequestSchema.parse(request)).toEqual(request);
    expect(applyPrivacySwitches(request).renderedImage?.dataUrl).toBeUndefined();
  });

  it("selects tiers from complexity and budget", () => {
    const small = computeComplexityMetrics(snapshot([element("a")]));
    expect(selectPayloadTier(small, { maxTokens: 600 }).tier).toBe("minimal");
    expect(selectPayloadTier(small, { preferDetailed: true }).tier).toBe("full");
  });

  it("always carries the interaction-order disclaimer", () => {
    const contract = buildPromptContract({ userPrompt: "What happened?", interactionTimeline: [{ seq: 1, timestamp: 0, kind: "move" }] });
    expect(contract.interactionOrderEvidenceDisclaimer).toBe(INTERACTION_ORDER_EVIDENCE_DISCLAIMER);
    expect(promptContractText(contract)).toContain(INTERACTION_ORDER_EVIDENCE_DISCLAIMER);
  });
});

describe("context capsules, patches, and regions", () => {
  it("exports/imports a checksummed portable capsule", () => {
    const capsule = exportContextCapsule({ capsuleId: "capsule-1", createdAt: 123, canvas: snapshot([element("a")]) });
    expect(capsule.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(importContextCapsule(JSON.stringify(capsule))).toEqual(capsule);
    expect(() => importContextCapsule({ ...capsule, checksum: "00000000" })).toThrow(/checksum/i);
  });

  it("returns a non-mutating patch preview and requires confirmation", () => {
    const base = snapshot([element("a", { text: "before" })]);
    const preview = previewCanvasPatch(base, {
      proposalId: "p1",
      operations: [
        { op: "move", elementId: "a", dx: 10, dy: 5 },
        { op: "addText", text: "new", x: 20, y: 30 },
        { op: "askUser", question: "Use SI units?" }
      ]
    });
    expect(preview.valid).toBe(true);
    expect(preview.autoApplied).toBe(false);
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.baseSnapshot.elements[0].x).toBe(0);
    expect(preview.proposedSnapshot.elements.find((item) => item.id === "a")?.x).toBe(10);
    expect(preview.pendingQuestions[0].question).toBe("Use SI units?");
  });

  it("ranks selection regions deterministically", () => {
    const input = snapshot([
      element("g1", { groupIds: ["group-a"], text: "force" }),
      element("g2", { groupIds: ["group-a"], x: 100 }),
      element("u1", { x: 300, text: "energy" })
    ]);
    const regions = selectRegions(input, { query: "force", selectedElementIds: ["u1"] });
    expect(regions.map((region) => region.id)).toContain("group:group-a");
    expect(regions[0].elementIds).toContain("u1");
  });
});

describe("property-style event invariant", () => {
  it("replays arbitrary deterministic translations", () => {
    for (let count = 0; count < 12; count += 1) {
      const before = snapshot(Array.from({ length: count }, (_, index) => element(`e${index}`, { x: index * 4 })));
      const after = snapshot(Array.from({ length: count + 1 }, (_, index) => element(`e${index}`, { x: index * 4 + 1, y: index })));
      expect(snapshotFingerprint(reconstructSnapshot(diffSnapshots(before, after), before))).toBe(snapshotFingerprint(after));
    }
  });
});
