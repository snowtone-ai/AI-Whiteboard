import { z } from "zod";
import {
  CanvasElement,
  CanvasElementChangeSchema,
  CanvasElementSchema,
  CanvasSnapshot,
  CanvasSnapshotSchema,
  canonicalizeElement,
  projectCanvasSnapshot,
  stableStringify
} from "./canvas.js";

export const EventActorSchema = z.enum(["user", "ai", "system"]);
export type EventActor = z.infer<typeof EventActorSchema>;

const EventBaseShape = {
  eventId: z.string().min(1),
  seq: z.number().int().positive(),
  timestamp: z.number().finite(),
  actor: EventActorSchema.default("system"),
  metadata: z.record(z.unknown()).default({})
};

export const CreateCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("create"),
  element: CanvasElementSchema
}).strict();

export const UpdateCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("update"),
  elementId: z.string().min(1),
  changes: CanvasElementChangeSchema,
  unset: z.array(z.string().min(1)).default([])
}).strict();

export const DeleteCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("delete"),
  elementId: z.string().min(1),
  reason: z.string().optional()
}).strict();

export const MoveCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("move"),
  elementId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  dx: z.number().finite().optional(),
  dy: z.number().finite().optional()
}).strict();

export const ResizeCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("resize"),
  elementId: z.string().min(1),
  width: z.number().finite(),
  height: z.number().finite(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  anchor: z.string().optional()
}).strict();

export const TextCanvasEventSchema = z.object({
  ...EventBaseShape,
  kind: z.literal("text"),
  elementId: z.string().min(1),
  text: z.string(),
  originalText: z.string().optional()
}).strict();

export const OrderCanvasEventSchema = z
  .object({
    ...EventBaseShape,
    kind: z.literal("order"),
    elementId: z.string().min(1),
    index: z.number().int().nonnegative().optional(),
    beforeId: z.string().min(1).optional(),
    afterId: z.string().min(1).optional()
  })
  .strict();

const CanvasEventUnionSchema = z.discriminatedUnion("kind", [
  CreateCanvasEventSchema,
  UpdateCanvasEventSchema,
  DeleteCanvasEventSchema,
  MoveCanvasEventSchema,
  ResizeCanvasEventSchema,
  TextCanvasEventSchema,
  OrderCanvasEventSchema
]);
export const CanvasEventSchema = CanvasEventUnionSchema.superRefine((event, context) => {
  if (event.kind === "order" && event.index === undefined && event.beforeId === undefined && event.afterId === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "An order event needs index, beforeId, or afterId" });
  }
});
export type CreateCanvasEvent = z.infer<typeof CreateCanvasEventSchema>;
export type UpdateCanvasEvent = z.infer<typeof UpdateCanvasEventSchema>;
export type DeleteCanvasEvent = z.infer<typeof DeleteCanvasEventSchema>;
export type MoveCanvasEvent = z.infer<typeof MoveCanvasEventSchema>;
export type ResizeCanvasEvent = z.infer<typeof ResizeCanvasEventSchema>;
export type TextCanvasEvent = z.infer<typeof TextCanvasEventSchema>;
export type OrderCanvasEvent = z.infer<typeof OrderCanvasEventSchema>;
export type CanvasEvent = z.infer<typeof CanvasEventSchema>;

export type DiffOptions = {
  actor?: EventActor;
  timestamp?: number;
  eventIdPrefix?: string;
  startSeq?: number;
};

function eventId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

function withoutKeys(element: CanvasElement, keys: readonly string[]): Record<string, unknown> {
  const ignored = new Set(["id", ...keys]);
  return Object.fromEntries(Object.keys(element).filter((key) => !ignored.has(key)).sort().map((key) => [key, element[key]]));
}

function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function makeBase(seq: number, options: Required<Pick<DiffOptions, "actor" | "timestamp" | "eventIdPrefix">>): {
  eventId: string;
  seq: number;
  timestamp: number;
  actor: EventActor;
  metadata: Record<string, unknown>;
} {
  return { eventId: eventId(options.eventIdPrefix, seq), seq, timestamp: options.timestamp, actor: options.actor, metadata: {} };
}

type CanvasEventPayload =
  | Omit<CreateCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<UpdateCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<DeleteCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<MoveCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<ResizeCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<TextCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">
  | Omit<OrderCanvasEvent, "eventId" | "seq" | "timestamp" | "actor" | "metadata">;

/**
 * Produces a stable event stream. The stream is intentionally absolute for
 * geometry events, which makes replay idempotent and easy to inspect.
 */
export function diffSnapshots(beforeInput: CanvasSnapshot, afterInput: CanvasSnapshot, options: DiffOptions = {}): CanvasEvent[] {
  const before = projectCanvasSnapshot(beforeInput);
  const after = projectCanvasSnapshot(afterInput);
  const settings = {
    actor: options.actor ?? ("system" as const),
    timestamp: options.timestamp ?? 0,
    eventIdPrefix: options.eventIdPrefix ?? "diff"
  };
  let seq = options.startSeq ?? 1;
  if (!Number.isInteger(seq) || seq < 1) throw new Error("startSeq must be a positive integer");
  const result: CanvasEvent[] = [];
  const add = (event: CanvasEventPayload) => {
    const base = makeBase(seq++, settings);
    result.push(CanvasEventSchema.parse({ ...base, ...event }));
  };
  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const afterById = new Map(after.elements.map((element) => [element.id, element]));
  const beforeIds = before.elements.map((element) => element.id);
  const afterIds = after.elements.map((element) => element.id);

  for (const id of [...beforeById.keys()].sort()) if (!afterById.has(id)) {
    add({ kind: "delete", elementId: id });
  }
  for (const id of [...afterById.keys()].sort()) if (!beforeById.has(id)) {
    add({ kind: "create", element: afterById.get(id)! });
  }

  const sharedIds = [...afterById.keys()].filter((id) => beforeById.has(id)).sort();
  for (const id of sharedIds) {
    const oldElement = beforeById.get(id)!;
    const newElement = afterById.get(id)!;
    if (oldElement.x !== newElement.x || oldElement.y !== newElement.y) {
      add({ kind: "move", elementId: id, x: newElement.x, y: newElement.y, dx: newElement.x - oldElement.x, dy: newElement.y - oldElement.y });
    }
    if (oldElement.width !== newElement.width || oldElement.height !== newElement.height) {
      add({ kind: "resize", elementId: id, width: newElement.width, height: newElement.height });
    }
    if (oldElement.text !== newElement.text || oldElement.originalText !== newElement.originalText) {
      add({ kind: "text", elementId: id, text: newElement.text ?? "", ...(newElement.originalText === undefined ? {} : { originalText: newElement.originalText }) });
    }
    const changes = withoutKeys(newElement, ["x", "y", "width", "height", "text", "originalText", "index"]);
    const oldRest = withoutKeys(oldElement, ["x", "y", "width", "height", "text", "originalText", "index"]);
    const changed: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const key of [...new Set([...Object.keys(changes), ...Object.keys(oldRest)])].sort()) {
      if (!(key in changes)) unset.push(key);
      else if (!sameValue(changes[key], oldRest[key])) changed[key] = changes[key];
    }
    if (!sameValue(oldElement.index, newElement.index)) {
      if (newElement.index === undefined) unset.push("index");
      else changed.index = newElement.index;
    }
    if (Object.keys(changed).length || unset.length) add({ kind: "update", elementId: id, changes: changed, unset });
  }

  const orderChanged = beforeIds.length !== afterIds.length || beforeIds.some((id, index) => id !== afterIds[index]);
  if (orderChanged) {
    for (let index = 0; index < afterIds.length; index += 1) {
      const id = afterIds[index];
      add({ kind: "order", elementId: id, index });
    }
  }
  return result;
}

export type ReplayOptions = { strict?: boolean };

function failOrSkip(strict: boolean, message: string): void {
  if (strict) throw new Error(message);
}

function indexOfElement(elements: CanvasElement[], id: string): number {
  return elements.findIndex((element) => element.id === id);
}

function reorder(elements: CanvasElement[], id: string, event: OrderCanvasEvent): boolean {
  const current = indexOfElement(elements, id);
  if (current < 0) return false;
  const [element] = elements.splice(current, 1);
  let target = event.index;
  if (target === undefined && event.beforeId !== undefined) {
    const before = indexOfElement(elements, event.beforeId);
    target = before < 0 ? elements.length : before;
  }
  if (target === undefined && event.afterId !== undefined) {
    const after = indexOfElement(elements, event.afterId);
    target = after < 0 ? elements.length : after + 1;
  }
  elements.splice(Math.max(0, Math.min(target ?? elements.length, elements.length)), 0, element);
  return true;
}

/** Applies a validated event stream without mutating its input snapshot. */
export function replayEvents(initialInput: CanvasSnapshot, eventsInput: readonly CanvasEvent[], options: ReplayOptions = {}): CanvasSnapshot {
  const strict = options.strict ?? true;
  let snapshot = projectCanvasSnapshot(initialInput);
  const events = eventsInput.map((event) => CanvasEventSchema.parse(event)).sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
  const seenSeq = new Set<number>();
  for (const event of events) {
    if (seenSeq.has(event.seq)) failOrSkip(strict, `Duplicate event sequence ${event.seq}`);
    seenSeq.add(event.seq);
    const elements = snapshot.elements.map((element) => canonicalizeElement(element));
    switch (event.kind) {
      case "create": {
        if (indexOfElement(elements, event.element.id) >= 0) {
          failOrSkip(strict, `Cannot create existing element ${event.element.id}`);
          break;
        }
        elements.push(canonicalizeElement(event.element));
        break;
      }
      case "delete": {
        const index = indexOfElement(elements, event.elementId);
        if (index < 0) {
          failOrSkip(strict, `Cannot delete missing element ${event.elementId}`);
          break;
        }
        elements.splice(index, 1);
        break;
      }
      case "update": {
        const index = indexOfElement(elements, event.elementId);
        if (index < 0) {
          failOrSkip(strict, `Cannot update missing element ${event.elementId}`);
          break;
        }
        const next: Record<string, unknown> = { ...elements[index], ...event.changes, id: event.elementId };
        for (const key of event.unset) delete next[key];
        elements[index] = canonicalizeElement(CanvasElementSchema.parse(next));
        break;
      }
      case "move": {
        const index = indexOfElement(elements, event.elementId);
        if (index < 0) {
          failOrSkip(strict, `Cannot move missing element ${event.elementId}`);
          break;
        }
        elements[index] = canonicalizeElement({ ...elements[index], x: event.x, y: event.y });
        break;
      }
      case "resize": {
        const index = indexOfElement(elements, event.elementId);
        if (index < 0) {
          failOrSkip(strict, `Cannot resize missing element ${event.elementId}`);
          break;
        }
        elements[index] = canonicalizeElement({
          ...elements[index],
          width: event.width,
          height: event.height,
          ...(event.x === undefined ? {} : { x: event.x }),
          ...(event.y === undefined ? {} : { y: event.y })
        });
        break;
      }
      case "text": {
        const index = indexOfElement(elements, event.elementId);
        if (index < 0) {
          failOrSkip(strict, `Cannot edit text on missing element ${event.elementId}`);
          break;
        }
        const next: Record<string, unknown> = { ...elements[index], text: event.text };
        if (event.originalText !== undefined) next.originalText = event.originalText;
        else delete next.originalText;
        elements[index] = canonicalizeElement(next);
        break;
      }
      case "order":
        if (!reorder(elements, event.elementId, event)) failOrSkip(strict, `Cannot order missing element ${event.elementId}`);
        break;
    }
    snapshot = CanvasSnapshotSchema.parse({ ...snapshot, elements });
  }
  return projectCanvasSnapshot(snapshot);
}

export function reconstructSnapshot(events: readonly CanvasEvent[], initial: CanvasSnapshot = { version: 1, elements: [], appState: { selectedElementIds: [] }, files: {}, metadata: {} }): CanvasSnapshot {
  return replayEvents(initial, events);
}

export const replayEventStream = replayEvents;
