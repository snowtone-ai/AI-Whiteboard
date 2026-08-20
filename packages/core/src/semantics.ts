import { z } from "zod";
import {
  BoundsSchema,
  CanvasElement,
  CanvasElementSchema,
  CanvasSnapshot,
  PointSchema,
  boundsForElements,
  canonicalizeElement,
  elementBounds,
  projectCanvasSnapshot
} from "./canvas.js";

export const SemanticSourceSchema = z.enum(["explicit", "text", "geometry", "mixed", "user", "ai", "system", "interaction-order"]);
export type SemanticSource = z.infer<typeof SemanticSourceSchema>;

export const ObservedGeometrySchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    angle: z.number().finite(),
    bounds: BoundsSchema,
    center: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    points: z.array(PointSchema).optional()
  })
  .strict();
export type ObservedGeometry = z.infer<typeof ObservedGeometrySchema>;

export const InferredSemanticSchema = z
  .object({
    role: z.string().min(1),
    label: z.string().optional(),
    concepts: z.array(z.string().min(1)).default([]),
    confidence: z.number().finite().min(0).max(1),
    source: SemanticSourceSchema,
    evidence: z.array(z.string().min(1)).default([]),
    attributes: z.record(z.unknown()).default({})
  })
  .strict();
export type InferredSemantic = z.infer<typeof InferredSemanticSchema>;

export const SemanticElementSchema = z
  .object({
    elementId: z.string().min(1),
    raw: CanvasElementSchema,
    observedGeometry: ObservedGeometrySchema,
    inferred: InferredSemanticSchema
  })
  .strict();
export type SemanticElement = z.infer<typeof SemanticElementSchema>;

export const SemanticRelationSchema = z
  .object({
    fromElementId: z.string().min(1),
    toElementId: z.string().min(1),
    relation: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
    source: SemanticSourceSchema,
    evidence: z.array(z.string().min(1)).default([])
  })
  .strict();
export type SemanticRelation = z.infer<typeof SemanticRelationSchema>;

export const SemanticExtractionSchema = z
  .object({
    version: z.literal(1),
    elements: z.array(SemanticElementSchema),
    relations: z.array(SemanticRelationSchema),
    bounds: BoundsSchema.nullable()
  })
  .strict();
export type SemanticExtraction = z.infer<typeof SemanticExtractionSchema>;

export type SemanticExtractionOptions = {
  includeDeleted?: boolean;
  inferRelations?: boolean;
};

const ROLE_BY_TYPE: Record<string, { role: string; confidence: number; source: SemanticSource }> = {
  text: { role: "text", confidence: 0.9, source: "text" },
  rectangle: { role: "container", confidence: 0.75, source: "geometry" },
  diamond: { role: "decision", confidence: 0.75, source: "geometry" },
  ellipse: { role: "node", confidence: 0.7, source: "geometry" },
  arrow: { role: "connector", confidence: 0.9, source: "explicit" },
  line: { role: "connector", confidence: 0.8, source: "geometry" },
  image: { role: "image", confidence: 0.95, source: "explicit" },
  frame: { role: "container", confidence: 0.8, source: "explicit" },
  embeddable: { role: "embedded-content", confidence: 0.7, source: "explicit" },
  iframe: { role: "embedded-content", confidence: 0.7, source: "explicit" }
};

function roleForElement(element: CanvasElement): { role: string; confidence: number; source: SemanticSource } {
  return ROLE_BY_TYPE[element.type.toLowerCase()] ?? { role: "shape", confidence: 0.5, source: "geometry" };
}

function tokensFromText(text: string): string[] {
  const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
  return [...new Set(tokens)].sort();
}

function explicitSemantics(element: CanvasElement): Record<string, unknown> | undefined {
  const semantic = element.customData?.semantic;
  return semantic && typeof semantic === "object" && !Array.isArray(semantic) ? semantic as Record<string, unknown> : undefined;
}

function observedGeometry(element: CanvasElement): ObservedGeometry {
  const bounds = elementBounds(element);
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    angle: element.angle,
    bounds,
    center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    ...(element.points ? { points: element.points.map((point) => ({ ...point })) } : {})
  };
}

/**
 * Extracts inference beside (never instead of) the source element. Consumers
 * can therefore discard a mistaken inference and still recover raw truth and
 * observed geometry exactly.
 */
export function extractSemantics(snapshotInput: CanvasSnapshot, options: SemanticExtractionOptions = {}): SemanticExtraction {
  const snapshot = projectCanvasSnapshot(snapshotInput);
  const elements = snapshot.elements.filter((element) => options.includeDeleted || !element.isDeleted).map((element) => {
    const raw = canonicalizeElement(element);
    const role = roleForElement(raw);
    const explicit = explicitSemantics(raw);
    const text = typeof raw.text === "string" ? raw.text : "";
    const label = typeof explicit?.label === "string" ? explicit.label : text.trim() || undefined;
    const roleValue = typeof explicit?.role === "string" && explicit.role.length ? explicit.role : role.role;
    const explicitConcepts = Array.isArray(explicit?.concepts) ? explicit.concepts.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
    const concepts = [...new Set([...tokensFromText(text), ...explicitConcepts])].sort();
    const explicitConfidence = typeof explicit?.confidence === "number" && Number.isFinite(explicit.confidence) ? Math.max(0, Math.min(1, explicit.confidence)) : undefined;
    const source: SemanticSource = explicit ? "explicit" : text ? "mixed" : role.source;
    const confidence = explicitConfidence ?? (explicit ? Math.max(role.confidence, 0.8) : text ? Math.min(0.95, role.confidence + 0.05) : role.confidence);
    return SemanticElementSchema.parse({
      elementId: raw.id,
      raw,
      observedGeometry: observedGeometry(raw),
      inferred: {
        role: roleValue,
        ...(label === undefined ? {} : { label }),
        concepts,
        confidence,
        source,
        evidence: [
          `element.type=${raw.type}`,
          ...(text ? ["element.text"] : []),
          ...(explicit ? ["element.customData.semantic"] : [])
        ],
        attributes: explicit?.attributes && typeof explicit.attributes === "object" && !Array.isArray(explicit.attributes) ? explicit.attributes : {}
      }
    });
  });
  const relations: SemanticRelation[] = [];
  if (options.inferRelations !== false) {
    const known = new Set(elements.map((element) => element.elementId));
    for (const item of elements) {
      const raw = item.raw;
      const bindings: Array<[string, string]> = [];
      const startId = raw.startBinding && typeof raw.startBinding.elementId === "string" ? raw.startBinding.elementId : undefined;
      const endId = raw.endBinding && typeof raw.endBinding.elementId === "string" ? raw.endBinding.elementId : undefined;
      if (startId && known.has(startId)) bindings.push([raw.id, startId]);
      if (endId && known.has(endId)) bindings.push([raw.id, endId]);
      for (const [from, to] of bindings) relations.push({
        fromElementId: from,
        toElementId: to,
        relation: "connects",
        confidence: 0.98,
        source: "explicit",
        evidence: ["element binding"]
      });
    }
  }
  relations.sort((a, b) => `${a.fromElementId}:${a.toElementId}:${a.relation}`.localeCompare(`${b.fromElementId}:${b.toElementId}:${b.relation}`));
  return SemanticExtractionSchema.parse({
    version: 1,
    elements,
    relations,
    bounds: boundsForElements(elements.map((element) => element.raw))
  });
}

export const extractSemanticElements = extractSemantics;
export const extractSemanticModel = extractSemantics;
