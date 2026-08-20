import { z } from "zod";
import {
  CanvasElement,
  CanvasElementChangeSchema,
  CanvasElementSchema,
  CanvasSnapshot,
  CanvasSnapshotSchema,
  canonicalizeElement,
  projectCanvasSnapshot,
  snapshotFingerprint
} from "./canvas.js";

const PatchVersionSchema = z.union([z.literal("1"), z.literal(1)]);

export const CreatePatchOperationSchema = z.object({
  op: z.literal("create"),
  element: CanvasElementSchema
}).strict();

export const UpdatePatchOperationSchema = z.object({
  op: z.literal("update"),
  elementId: z.string().min(1),
  changes: CanvasElementChangeSchema
}).strict();

export const DeletePatchOperationSchema = z.object({
  op: z.literal("delete"),
  elementId: z.string().min(1),
  reason: z.string().optional()
}).strict();

export const MovePatchOperationSchema = z
  .object({
    op: z.literal("move"),
    elementId: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    dx: z.number().finite().optional(),
    dy: z.number().finite().optional()
  })
  .strict();

export const AddTextPatchOperationSchema = z.object({
  op: z.literal("addText"),
  elementId: z.string().min(1).optional(),
  text: z.string(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
  style: CanvasElementChangeSchema.optional()
}).strict();

export const GroupPatchOperationSchema = z.object({
  op: z.literal("group"),
  elementIds: z.array(z.string().min(1)).min(1),
  groupId: z.string().min(1).optional()
}).strict();

export const ZoomPatchOperationSchema = z.object({
  op: z.literal("zoom"),
  zoom: z.number().finite().positive().optional(),
  scale: z.number().finite().positive().optional(),
  center: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional()
}).strict();

export const AskUserPatchOperationSchema = z.object({
  op: z.literal("askUser"),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).optional(),
  reason: z.string().optional()
}).strict();

const CanvasPatchOperationUnionSchema = z.discriminatedUnion("op", [
  CreatePatchOperationSchema,
  UpdatePatchOperationSchema,
  DeletePatchOperationSchema,
  MovePatchOperationSchema,
  AddTextPatchOperationSchema,
  GroupPatchOperationSchema,
  ZoomPatchOperationSchema,
  AskUserPatchOperationSchema
]);
export const CanvasPatchOperationSchema = CanvasPatchOperationUnionSchema.superRefine((operation, context) => {
  if (operation.op === "move" && operation.x === undefined && operation.y === undefined && operation.dx === undefined && operation.dy === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A move operation needs x/y or dx/dy" });
  }
  if (operation.op === "zoom" && operation.zoom === undefined && operation.scale === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A zoom operation needs zoom or scale" });
  }
});
export type CanvasPatchOperation = z.infer<typeof CanvasPatchOperationSchema>;

export const AICanvasPatchProposalSchema = z
  .object({
    protocol: z.literal("AI-CANVAS-PATCH").default("AI-CANVAS-PATCH"),
    version: PatchVersionSchema.default("1"),
    proposalId: z.string().min(1).default("proposal-local"),
    operations: z.array(CanvasPatchOperationSchema),
    rationale: z.string().optional(),
    confidence: z.number().finite().min(0).max(1).optional(),
    requiresConfirmation: z.boolean().default(true),
    generatedAt: z.number().finite().optional(),
    metadata: z.record(z.unknown()).default({})
  })
  .strict();
export type AICanvasPatchProposal = z.infer<typeof AICanvasPatchProposalSchema>;
export const CanvasPatchProposalSchema = AICanvasPatchProposalSchema;

export type PatchIssue = {
  operationIndex: number;
  code: string;
  message: string;
};

export type PatchPreview = {
  valid: boolean;
  autoApplied: false;
  requiresConfirmation: true;
  baseSnapshot: CanvasSnapshot;
  proposedSnapshot: CanvasSnapshot;
  proposal: AICanvasPatchProposal;
  errors: PatchIssue[];
  warnings: PatchIssue[];
  pendingQuestions: Array<Extract<CanvasPatchOperation, { op: "askUser" }>>;
  changedElementIds: string[];
  baseFingerprint: string;
  proposedFingerprint: string;
};

export function parsePatchProposal(input: unknown): AICanvasPatchProposal {
  // A few clients call the discriminant `type`; accept it at the boundary but
  // expose one canonical representation to the rest of the domain.
  if (input && typeof input === "object") {
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.operations)) {
      return AICanvasPatchProposalSchema.parse({
        ...value,
        operations: value.operations.map((operation) => {
          if (operation && typeof operation === "object" && !("op" in operation) && "type" in operation) {
            const candidate = operation as Record<string, unknown>;
            return { ...candidate, op: candidate.type };
          }
          return operation;
        })
      });
    }
  }
  return AICanvasPatchProposalSchema.parse(input);
}

function findElement(elements: CanvasElement[], id: string): number {
  return elements.findIndex((element) => element.id === id);
}

function issue(operationIndex: number, code: string, message: string): PatchIssue {
  return { operationIndex, code, message };
}

function generatedTextElement(operation: Extract<CanvasPatchOperation, { op: "addText" }>, id: string): CanvasElement {
  const style = operation.style ? { ...operation.style } : {};
  delete (style as Record<string, unknown>).id;
  return canonicalizeElement({
    id,
    type: "text",
    x: operation.x ?? 0,
    y: operation.y ?? 0,
    width: operation.width ?? Math.max(1, operation.text.length * 8),
    height: operation.height ?? 24,
    ...style,
    text: operation.text,
    originalText: operation.text
  });
}

export function validatePatchProposal(input: unknown, snapshotInput: CanvasSnapshot): PatchIssue[] {
  const proposal = parsePatchProposal(input);
  const snapshot = projectCanvasSnapshot(snapshotInput);
  const ids = new Set(snapshot.elements.map((element) => element.id));
  const errors: PatchIssue[] = [];
  proposal.operations.forEach((operation, operationIndex) => {
    switch (operation.op) {
      case "create":
        if (ids.has(operation.element.id)) errors.push(issue(operationIndex, "duplicate-id", `Element ${operation.element.id} already exists`));
        ids.add(operation.element.id);
        break;
      case "update":
      case "move":
        if (!ids.has(operation.elementId)) errors.push(issue(operationIndex, "missing-element", `Element ${operation.elementId} does not exist`));
        break;
      case "delete":
        if (!ids.has(operation.elementId)) errors.push(issue(operationIndex, "missing-element", `Element ${operation.elementId} does not exist`));
        else ids.delete(operation.elementId);
        break;
      case "addText":
        if (operation.elementId && !ids.has(operation.elementId)) errors.push(issue(operationIndex, "missing-element", `Element ${operation.elementId} does not exist`));
        if (!operation.elementId) ids.add(`${proposal.proposalId}-text-${operationIndex + 1}`);
        break;
      case "group":
        for (const elementId of operation.elementIds) if (!ids.has(elementId)) errors.push(issue(operationIndex, "missing-element", `Element ${elementId} does not exist`));
        break;
      case "zoom": {
        const zoom = operation.zoom ?? operation.scale!;
        if (zoom < 0.1 || zoom > 10) errors.push(issue(operationIndex, "invalid-zoom", "Zoom must be between 0.1 and 10"));
        break;
      }
      case "askUser":
        break;
    }
  });
  return errors;
}

/**
 * Simulates a proposal on a cloned snapshot and returns a reviewable result.
 * The `autoApplied: false` marker is deliberate: callers must explicitly
 * confirm and persist the resulting snapshot themselves.
 */
export function previewCanvasPatch(snapshotInput: CanvasSnapshot, proposalInput: unknown): PatchPreview {
  const baseSnapshot = projectCanvasSnapshot(snapshotInput);
  const proposal = parsePatchProposal(proposalInput);
  const errors = validatePatchProposal(proposal, baseSnapshot);
  const warnings: PatchIssue[] = [];
  const pendingQuestions: Array<Extract<CanvasPatchOperation, { op: "askUser" }>> = [];
  const changedElementIds = new Set<string>();
  let working = projectCanvasSnapshot(baseSnapshot);

  proposal.operations.forEach((operation, operationIndex) => {
    if (errors.some((error) => error.operationIndex === operationIndex)) {
      return;
    }
    const elements = working.elements.map((element) => canonicalizeElement(element));
    switch (operation.op) {
      case "create":
        elements.push(canonicalizeElement(operation.element));
        changedElementIds.add(operation.element.id);
        break;
      case "update": {
        const index = findElement(elements, operation.elementId);
        if (index < 0) return;
        elements[index] = canonicalizeElement(CanvasElementSchema.parse({ ...elements[index], ...operation.changes, id: operation.elementId }));
        changedElementIds.add(operation.elementId);
        break;
      }
      case "delete": {
        const index = findElement(elements, operation.elementId);
        if (index < 0) return;
        elements.splice(index, 1);
        changedElementIds.add(operation.elementId);
        break;
      }
      case "move": {
        const index = findElement(elements, operation.elementId);
        if (index < 0) return;
        const old = elements[index];
        elements[index] = canonicalizeElement({
          ...old,
          x: operation.x ?? old.x + (operation.dx ?? 0),
          y: operation.y ?? old.y + (operation.dy ?? 0)
        });
        changedElementIds.add(operation.elementId);
        break;
      }
      case "addText": {
        if (operation.elementId) {
          const index = findElement(elements, operation.elementId);
          if (index < 0) return;
          elements[index] = canonicalizeElement({ ...elements[index], text: operation.text, originalText: operation.text });
          changedElementIds.add(operation.elementId);
        } else {
          const id = `${proposal.proposalId}-text-${operationIndex + 1}`;
          elements.push(generatedTextElement(operation, id));
          changedElementIds.add(id);
        }
        break;
      }
      case "group": {
        const groupId = operation.groupId ?? `${proposal.proposalId}-group-${operationIndex + 1}`;
        for (const elementId of operation.elementIds) {
          const index = findElement(elements, elementId);
          if (index >= 0) {
            elements[index] = canonicalizeElement({ ...elements[index], groupIds: [...new Set([...elements[index].groupIds, groupId])] });
            changedElementIds.add(elementId);
          }
        }
        break;
      }
      case "zoom": {
        const zoom = operation.zoom ?? operation.scale!;
        working = CanvasSnapshotSchema.parse({ ...working, appState: { ...working.appState, zoom } });
        break;
      }
      case "askUser":
        pendingQuestions.push(operation);
        break;
    }
    working = CanvasSnapshotSchema.parse({ ...working, elements });
  });
  const proposedSnapshot = projectCanvasSnapshot(working);
  return {
    valid: errors.length === 0,
    autoApplied: false,
    requiresConfirmation: true,
    baseSnapshot,
    proposedSnapshot,
    proposal,
    errors,
    warnings,
    pendingQuestions,
    changedElementIds: [...changedElementIds].sort(),
    baseFingerprint: snapshotFingerprint(baseSnapshot),
    proposedFingerprint: snapshotFingerprint(proposedSnapshot)
  };
}

export const safeApplyPatchPreview = previewCanvasPatch;
export const applyPatchPreview = previewCanvasPatch;
