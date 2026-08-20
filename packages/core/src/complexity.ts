import { z } from "zod";
import { CanvasSnapshot, projectCanvasSnapshot } from "./canvas.js";

export const ComplexityMetricsSchema = z
  .object({
    elementCount: z.number().int().nonnegative(),
    visibleElementCount: z.number().int().nonnegative(),
    textElementCount: z.number().int().nonnegative(),
    textCharacterCount: z.number().int().nonnegative(),
    imageElementCount: z.number().int().nonnegative(),
    connectorCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    boundRelationCount: z.number().int().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
    score: z.number().finite().nonnegative()
  })
  .strict();
export type ComplexityMetrics = z.infer<typeof ComplexityMetricsSchema>;

export function computeComplexityMetrics(snapshotInput: CanvasSnapshot): ComplexityMetrics {
  const snapshot = projectCanvasSnapshot(snapshotInput);
  const visible = snapshot.elements.filter((element) => !element.isDeleted);
  const textElements = visible.filter((element) => typeof element.text === "string");
  const textCharacterCount = textElements.reduce((total, element) => total + (element.text?.length ?? 0), 0);
  const imageElementCount = visible.filter((element) => ["image", "iframe", "embeddable"].includes(element.type.toLowerCase())).length;
  const connectorCount = visible.filter((element) => ["arrow", "line"].includes(element.type.toLowerCase()) || element.startBinding || element.endBinding).length;
  const groupCount = new Set(visible.flatMap((element) => element.groupIds)).size;
  const boundRelationCount = visible.reduce((total, element) => total + (element.boundElements?.length ?? 0) + (element.startBinding ? 1 : 0) + (element.endBinding ? 1 : 0), 0);
  const estimatedTokens = Math.ceil(textCharacterCount / 4) + visible.length * 12 + connectorCount * 4 + imageElementCount * 16;
  const score = visible.length + textCharacterCount / 120 + imageElementCount * 5 + connectorCount * 2 + groupCount * 1.5 + boundRelationCount;
  return ComplexityMetricsSchema.parse({
    elementCount: snapshot.elements.length,
    visibleElementCount: visible.length,
    textElementCount: textElements.length,
    textCharacterCount,
    imageElementCount,
    connectorCount,
    groupCount,
    boundRelationCount,
    estimatedTokens,
    score
  });
}

export const PayloadTierSchema = z.enum(["minimal", "compact", "full"]);
export type PayloadTier = z.infer<typeof PayloadTierSchema>;

export const AdaptivePayloadRequestSchema = z
  .object({
    requestedTier: PayloadTierSchema.optional(),
    maxTokens: z.number().int().positive().optional(),
    task: z.enum(["summarize", "answer", "extract", "edit", "generate"]).optional(),
    includeRenderedImage: z.boolean().optional(),
    preferDetailed: z.boolean().optional()
  })
  .strict();
export type AdaptivePayloadRequest = z.infer<typeof AdaptivePayloadRequestSchema>;

export const PayloadTierDecisionSchema = z
  .object({
    tier: PayloadTierSchema,
    complexity: ComplexityMetricsSchema,
    reasons: z.array(z.string().min(1))
  })
  .strict();
export type PayloadTierDecision = z.infer<typeof PayloadTierDecisionSchema>;

function tierForBudget(maxTokens: number | undefined): PayloadTier | undefined {
  if (maxTokens === undefined) return undefined;
  if (maxTokens <= 800) return "minimal";
  if (maxTokens <= 2400) return "compact";
  return "full";
}

/** Selects a payload detail tier using explicit request intent first, then complexity and budget. */
export function selectPayloadTier(
  input: ComplexityMetrics | CanvasSnapshot,
  requestInput: AdaptivePayloadRequest = {}
): PayloadTierDecision {
  const request = AdaptivePayloadRequestSchema.parse(requestInput);
  const complexity = "score" in input ? ComplexityMetricsSchema.parse(input) : computeComplexityMetrics(input);
  const reasons: string[] = [];
  let tier = request.requestedTier;
  if (tier) reasons.push(`requested tier: ${tier}`);
  const budgetTier = tierForBudget(request.maxTokens);
  if (!tier && budgetTier) {
    tier = budgetTier;
    reasons.push(`token budget: ${request.maxTokens}`);
  }
  if (!tier) {
    if (request.preferDetailed || request.task === "generate") {
      tier = complexity.score > 300 ? "compact" : "full";
      reasons.push(request.preferDetailed ? "detailed preference" : "generation task");
    } else if (complexity.score > 300 || complexity.estimatedTokens > 12000) {
      tier = "minimal";
      reasons.push("high complexity requires a compact context");
    } else if (complexity.score > 80 || complexity.estimatedTokens > 3500 || request.task === "summarize") {
      tier = "compact";
      reasons.push("moderate complexity or summarization task");
    } else {
      tier = "full";
      reasons.push("small context can retain full detail");
    }
  }
  if (request.includeRenderedImage && tier === "minimal") reasons.push("image requested; keep metadata at minimum tier");
  return PayloadTierDecisionSchema.parse({ tier, complexity, reasons });
}

export const choosePayloadTier = selectPayloadTier;
