import { z } from "zod";

export const CANVAS_SNAPSHOT_VERSION = 1 as const;
export const CanvasElementTypeSchema = z.string().min(1);
export type CanvasElementType = z.infer<typeof CanvasElementTypeSchema>;

export const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export type Point = z.infer<typeof PointSchema>;

export const BoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative()
  })
  .strict();
export type Bounds = z.infer<typeof BoundsSchema>;

const BindingSchema = z
  .object({ elementId: z.string().min(1).optional(), focus: z.number().finite().optional(), gap: z.number().finite().optional() })
  .passthrough();

const BoundElementSchema = z.object({ id: z.string().min(1), type: z.string().min(1).optional() }).passthrough();

/**
 * The intentionally structural subset of an Excalidraw element used by the
 * domain. It is kept independent from Excalidraw's runtime types so the core
 * package can run in a desktop process, a worker, or a test environment.
 */
export const CanvasElementSchema = z
  .object({
    id: z.string().min(1),
    type: CanvasElementTypeSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    angle: z.number().finite().default(0),
    strokeColor: z.string().default("#1e1e1e"),
    backgroundColor: z.string().default("transparent"),
    fillStyle: z.enum(["solid", "hachure", "cross-hatch", "none"]).default("solid"),
    strokeWidth: z.number().finite().nonnegative().default(1),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).default("solid"),
    roughness: z.number().finite().nonnegative().default(1),
    opacity: z.number().finite().min(0).max(100).default(100),
    groupIds: z.array(z.string().min(1)).default([]),
    frameId: z.string().min(1).nullable().default(null),
    roundness: z.record(z.unknown()).nullable().optional(),
    seed: z.number().int().optional(),
    version: z.number().int().nonnegative().default(1),
    versionNonce: z.number().int().nonnegative().optional(),
    isDeleted: z.boolean().default(false),
    boundElements: z.array(BoundElementSchema).nullable().default(null),
    updated: z.number().finite().optional(),
    link: z.string().optional(),
    locked: z.boolean().optional(),
    customData: z.record(z.unknown()).optional(),
    points: z.array(PointSchema).optional(),
    lastCommittedPoint: PointSchema.nullable().optional(),
    startBinding: BindingSchema.nullable().optional(),
    endBinding: BindingSchema.nullable().optional(),
    startArrowhead: z.string().nullable().optional(),
    endArrowhead: z.string().nullable().optional(),
    text: z.string().optional(),
    originalText: z.string().optional(),
    autoResize: z.boolean().optional(),
    fontSize: z.number().finite().positive().optional(),
    fontFamily: z.union([z.number().int(), z.string()]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    containerId: z.string().min(1).nullable().optional()
  })
  .passthrough();
export type CanvasElement = z.infer<typeof CanvasElementSchema>;

export const CanvasElementChangeSchema = CanvasElementSchema.partial().omit({ id: true }).passthrough();
export type CanvasElementChange = z.infer<typeof CanvasElementChangeSchema>;

export const CanvasAppStateSchema = z
  .object({
    viewBackgroundColor: z.string().optional(),
    scrollX: z.number().finite().optional(),
    scrollY: z.number().finite().optional(),
    zoom: z.number().finite().positive().optional(),
    selectedElementIds: z.array(z.string().min(1)).default([]),
    activeTool: z.string().optional()
  })
  .passthrough();
export type CanvasAppState = z.infer<typeof CanvasAppStateSchema>;

export const CanvasFileSchema = z
  .object({
    id: z.string().min(1),
    mimeType: z.string().min(1),
    data: z.string().optional(),
    created: z.number().finite().optional()
  })
  .passthrough();
export type CanvasFile = z.infer<typeof CanvasFileSchema>;

export const CanvasSnapshotSchema = z
  .object({
    version: z.number().int().positive().default(CANVAS_SNAPSHOT_VERSION),
    elements: z.array(CanvasElementSchema).default([]),
    appState: CanvasAppStateSchema.default({}),
    files: z.record(CanvasFileSchema).default({}),
    metadata: z.record(z.unknown()).default({})
  })
  .passthrough();
export type CanvasSnapshot = z.infer<typeof CanvasSnapshotSchema>;
export const CanonicalCanvasSnapshotSchema = CanvasSnapshotSchema;
export type CanonicalCanvasSnapshot = CanvasSnapshot;

function normalizeNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneUnknown(entry)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      output[key] = cloneUnknown((value as Record<string, unknown>)[key]);
    }
    return output as T;
  }
  return value;
}

export function canonicalizeElement(input: unknown): CanvasElement {
  const parsed = CanvasElementSchema.parse(input);
  const normalized: CanvasElement = {
    ...parsed,
    x: normalizeNumber(parsed.x),
    y: normalizeNumber(parsed.y),
    width: normalizeNumber(parsed.width),
    height: normalizeNumber(parsed.height),
    angle: normalizeNumber(parsed.angle),
    groupIds: [...parsed.groupIds],
    boundElements: parsed.boundElements ? parsed.boundElements.map((binding) => ({ ...binding })) : null
  };
  if (parsed.points) normalized.points = parsed.points.map((point) => ({ x: normalizeNumber(point.x), y: normalizeNumber(point.y) }));
  return cloneUnknown(normalized);
}

function elementSort(a: CanvasElement, b: CanvasElement): number {
  const ai = typeof a.index === "string" ? a.index : "";
  const bi = typeof b.index === "string" ? b.index : "";
  return ai.localeCompare(bi) || a.id.localeCompare(b.id);
}

/** Canonical, deterministic projection of an Excalidraw-shaped snapshot. */
export function projectCanvasSnapshot(input: unknown): CanonicalCanvasSnapshot {
  const parsed = CanvasSnapshotSchema.parse(input);
  const canonicalElements = parsed.elements.map(canonicalizeElement);
  // The array itself is the z-order when elements have no Excalidraw `index`.
  // If indexes are present, use them as the canonical order so equivalent
  // snapshots from different adapters compare deterministically.
  const elements = canonicalElements.some((element) => typeof element.index === "string")
    ? canonicalElements.sort(elementSort)
    : canonicalElements;
  const files: Record<string, CanvasFile> = {};
  for (const id of Object.keys(parsed.files).sort()) files[id] = cloneUnknown(parsed.files[id]);
  const appState = cloneUnknown({ ...parsed.appState, selectedElementIds: [...parsed.appState.selectedElementIds].sort() });
  return CanvasSnapshotSchema.parse({
    ...cloneUnknown(parsed),
    version: parsed.version,
    elements,
    appState,
    files,
    metadata: cloneUnknown(parsed.metadata)
  });
}

export const canonicalizeSnapshot = projectCanvasSnapshot;
export const toCanonicalSnapshot = projectCanvasSnapshot;
export const projectExcalidrawSnapshot = projectCanvasSnapshot;

export function elementBounds(element: Pick<CanvasElement, "x" | "y" | "width" | "height">): Bounds {
  const x1 = Math.min(element.x, element.x + element.width);
  const y1 = Math.min(element.y, element.y + element.height);
  const x2 = Math.max(element.x, element.x + element.width);
  const y2 = Math.max(element.y, element.y + element.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function boundsForElements(elements: readonly CanvasElement[]): Bounds | null {
  if (!elements.length) return null;
  const bounds = elements.map(elementBounds);
  const x = Math.min(...bounds.map((value) => value.x));
  const y = Math.min(...bounds.map((value) => value.y));
  const right = Math.max(...bounds.map((value) => value.x + value.width));
  const bottom = Math.max(...bounds.map((value) => value.y + value.height));
  return { x, y, width: right - x, height: bottom - y };
}

export function boundsIntersect(a: Bounds, b: Bounds, padding = 0): boolean {
  return a.x <= b.x + b.width + padding &&
    a.x + a.width + padding >= b.x &&
    a.y <= b.y + b.height + padding &&
    a.y + a.height + padding >= b.y;
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function snapshotFingerprint(snapshot: CanvasSnapshot): string {
  let hash = 2166136261;
  for (const character of stableStringify(projectCanvasSnapshot(snapshot))) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function emptyCanvasSnapshot(): CanonicalCanvasSnapshot {
  return projectCanvasSnapshot({ version: CANVAS_SNAPSHOT_VERSION, elements: [], appState: {}, files: {}, metadata: {} });
}
