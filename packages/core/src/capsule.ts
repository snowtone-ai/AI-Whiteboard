import { z } from "zod";
import { AWCPRequest, AWCPRequestSchema, PrivacySwitches, PrivacySwitchesSchema } from "./awcp.js";
import { CanvasSnapshot, CanvasSnapshotSchema, projectCanvasSnapshot, snapshotFingerprint, stableStringify } from "./canvas.js";
import { CanvasEvent, CanvasEventSchema } from "./events.js";
import { SemanticExtraction, SemanticExtractionSchema } from "./semantics.js";

export const CONTEXT_CAPSULE_PROTOCOL = "AWCP-CAPSULE" as const;
export const ContextCapsuleSchema = z
  .object({
    protocol: z.literal(CONTEXT_CAPSULE_PROTOCOL).default(CONTEXT_CAPSULE_PROTOCOL),
    version: z.union([z.literal("1"), z.literal(1)]).default("1"),
    capsuleId: z.string().min(1),
    createdAt: z.number().finite(),
    source: z.enum(["canvas", "selection", "workspace", "import"]).default("canvas"),
    canvas: CanvasSnapshotSchema,
    events: z.array(CanvasEventSchema).default([]),
    semantics: SemanticExtractionSchema.optional(),
    request: AWCPRequestSchema.optional(),
    privacySwitches: PrivacySwitchesSchema.default({}),
    checksum: z.string().regex(/^[0-9a-f]{8}$/).optional(),
    metadata: z.record(z.unknown()).default({})
  })
  .strict();
export type ContextCapsule = z.infer<typeof ContextCapsuleSchema>;

export type ContextCapsuleInput = {
  capsuleId?: string;
  createdAt?: number;
  source?: ContextCapsule["source"];
  canvas: CanvasSnapshot;
  events?: readonly CanvasEvent[];
  semantics?: SemanticExtraction;
  request?: AWCPRequest;
  privacySwitches?: PrivacySwitches;
  metadata?: Record<string, unknown>;
};

function checksumFor(capsule: Omit<ContextCapsule, "checksum"> | Record<string, unknown>): string {
  let hash = 2166136261;
  for (const character of stableStringify(capsule)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function contextCapsuleChecksum(capsule: ContextCapsule): string {
  const { checksum: _checksum, ...withoutChecksum } = capsule;
  return checksumFor(withoutChecksum);
}

export function exportContextCapsule(input: ContextCapsuleInput | CanvasSnapshot): ContextCapsule {
  const candidate: ContextCapsuleInput = (input as ContextCapsuleInput).canvas !== undefined
    ? input as ContextCapsuleInput
    : { canvas: input as CanvasSnapshot };
  const canvas = projectCanvasSnapshot(candidate.canvas);
  const capsule = ContextCapsuleSchema.parse({
    protocol: CONTEXT_CAPSULE_PROTOCOL,
    version: "1",
    capsuleId: candidate.capsuleId ?? `capsule-${snapshotFingerprint(canvas)}`,
    createdAt: candidate.createdAt ?? 0,
    source: candidate.source ?? "canvas",
    canvas,
    events: candidate.events ?? [],
    ...(candidate.semantics ? { semantics: candidate.semantics } : {}),
    ...(candidate.request ? { request: candidate.request } : {}),
    privacySwitches: candidate.privacySwitches ?? {},
    metadata: candidate.metadata ?? {}
  });
  return ContextCapsuleSchema.parse({ ...capsule, checksum: contextCapsuleChecksum(capsule) });
}

export type ImportCapsuleOptions = { verifyChecksum?: boolean };

export function importContextCapsule(input: unknown, options: ImportCapsuleOptions = {}): ContextCapsule {
  const parsedInput = typeof input === "string" ? JSON.parse(input) as unknown : input;
  const capsule = ContextCapsuleSchema.parse(parsedInput);
  if (options.verifyChecksum !== false && capsule.checksum && contextCapsuleChecksum(capsule) !== capsule.checksum) {
    throw new Error("Context capsule checksum mismatch");
  }
  return capsule;
}

export function serializeContextCapsule(capsule: ContextCapsule): string {
  return stableStringify(importContextCapsule(capsule));
}

export const createContextCapsule = exportContextCapsule;
export const parseContextCapsule = importContextCapsule;
