import { z } from "zod";
import { BoundsSchema, CanvasSnapshot, projectCanvasSnapshot, snapshotFingerprint } from "./canvas.js";
import { ComplexityMetricsSchema, PayloadTierSchema, selectPayloadTier } from "./complexity.js";

export const AWCP_VERSION = "1" as const;
export const AWCPVersionSchema = z.union([z.literal("1"), z.literal(1)]);

export const RenderedImageMetadataSchema = z
  .object({
    mimeType: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    dataUrl: z.string().startsWith("data:").optional(),
    altText: z.string().optional(),
    source: z.enum(["canvas", "selection", "region", "user"]).optional()
  })
  .strict();
export type RenderedImageMetadata = z.infer<typeof RenderedImageMetadataSchema>;

export const CompactStructureSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    label: z.string().optional(),
    text: z.string().optional(),
    bounds: BoundsSchema.optional(),
    elementIds: z.array(z.string().min(1)).default([]),
    children: z.array(z.string().min(1)).default([]),
    attributes: z.record(z.unknown()).default({}),
    confidence: z.number().finite().min(0).max(1).optional()
  })
  .passthrough();
export type CompactStructure = z.infer<typeof CompactStructureSchema>;

export const TimelineItemSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    timestamp: z.number().finite(),
    kind: z.string().min(1),
    summary: z.string().optional(),
    elementIds: z.array(z.string().min(1)).default([]),
    actor: z.enum(["user", "ai", "system"]).optional()
  })
  .passthrough();
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const SelectionContextSchema = z
  .object({
    elementIds: z.array(z.string().min(1)).default([]),
    bounds: BoundsSchema.optional(),
    text: z.string().optional(),
    regionId: z.string().min(1).optional()
  })
  .strict();
export type SelectionContext = z.infer<typeof SelectionContextSchema>;

export const PrivacySwitchesSchema = z
  .object({
    includeRenderedImage: z.boolean().default(false),
    includeRawText: z.boolean().default(true),
    includeTimeline: z.boolean().default(true),
    includeSelection: z.boolean().default(true),
    includeSemanticInference: z.boolean().default(true),
    redactSensitiveText: z.boolean().default(false),
    localOnly: z.boolean().default(true)
  })
  .strict();
export type PrivacySwitches = z.infer<typeof PrivacySwitchesSchema>;

export const AWCPRequestSchema = z
  .object({
    protocol: z.literal("AWCP").default("AWCP"),
    version: AWCPVersionSchema.default(AWCP_VERSION),
    awcpVersion: AWCPVersionSchema.optional(),
    requestId: z.string().min(1).default("local-request"),
    userPrompt: z.string().min(1),
    payloadTier: PayloadTierSchema.default("compact"),
    renderedImage: RenderedImageMetadataSchema.optional(),
    structures: z.array(CompactStructureSchema).default([]),
    timeline: z.array(TimelineItemSchema).default([]),
    selection: SelectionContextSchema.optional(),
    privacySwitches: PrivacySwitchesSchema.default({}),
    complexity: ComplexityMetricsSchema.optional(),
    canvasFingerprint: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).default({})
  })
  .passthrough();
export type AWCPRequest = z.infer<typeof AWCPRequestSchema>;

export type BuildAWCPRequestInput = Omit<Partial<AWCPRequest>, "userPrompt" | "payloadTier" | "complexity" | "canvasFingerprint"> & {
  userPrompt: string;
  snapshot?: CanvasSnapshot;
  payloadRequest?: Parameters<typeof selectPayloadTier>[1];
};

export function createAWCPRequest(input: unknown): AWCPRequest {
  return AWCPRequestSchema.parse(input);
}

/** Builds a v1 request and derives tier/fingerprint without embedding raw canvas data. */
export function buildAWCPRequest(input: BuildAWCPRequestInput): AWCPRequest {
  const snapshot = input.snapshot ? projectCanvasSnapshot(input.snapshot) : undefined;
  const complexity = snapshot ? selectPayloadTier(snapshot, input.payloadRequest ?? {}).complexity : undefined;
  const decision = complexity ? selectPayloadTier(complexity, input.payloadRequest ?? {}) : undefined;
  const { snapshot: _snapshot, payloadRequest: _payloadRequest, ...rest } = input;
  return AWCPRequestSchema.parse({
    protocol: "AWCP",
    version: AWCP_VERSION,
    ...rest,
    ...(decision ? { payloadTier: decision.tier } : {}),
    ...(complexity ? { complexity } : {}),
    ...(snapshot ? { canvasFingerprint: snapshotFingerprint(snapshot) } : {})
  });
}

function redactText(value: string): string {
  return value.replace(/\S/g, "•");
}

/** Returns a privacy-filtered copy; it never mutates the request passed in. */
export function applyPrivacySwitches(input: AWCPRequest): AWCPRequest {
  const request = AWCPRequestSchema.parse(input);
  const privacy = request.privacySwitches;
  const structures = request.structures.map((structure) => {
    const next = { ...structure };
    if (!privacy.includeRawText) {
      delete next.text;
      delete next.label;
    } else if (privacy.redactSensitiveText) {
      if (next.text !== undefined) next.text = redactText(next.text);
      if (next.label !== undefined) next.label = redactText(next.label);
    }
    return next;
  });
  const timeline = privacy.includeTimeline ? request.timeline.map((item) => {
    if (!privacy.includeRawText && item.summary !== undefined) {
      const next = { ...item };
      delete next.summary;
      return next;
    }
    if (privacy.redactSensitiveText && item.summary !== undefined) return { ...item, summary: redactText(item.summary) };
    return item;
  }) : [];
  const selection = privacy.includeSelection ? request.selection : undefined;
  const renderedImage = privacy.includeRenderedImage ? request.renderedImage : request.renderedImage ? {
    ...request.renderedImage,
    dataUrl: undefined
  } : undefined;
  return AWCPRequestSchema.parse({
    ...request,
    structures,
    timeline,
    selection,
    renderedImage,
    ...(privacy.includeSemanticInference ? {} : { structures: structures.map((structure) => ({ ...structure, confidence: undefined })) })
  });
}

export const filterAWCPByPrivacy = applyPrivacySwitches;
