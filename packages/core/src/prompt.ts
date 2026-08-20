import { z } from "zod";
import { TimelineItemSchema } from "./awcp.js";

export const INTERACTION_ORDER_EVIDENCE_DISCLAIMER =
  "Interaction order is evidence of sequence, not proof of user intent; treat it as a heuristic and preserve uncertainty." as const;

export const PromptContractSchema = z
  .object({
    protocol: z.literal("AI-WHITEBOARD-PROMPT").default("AI-WHITEBOARD-PROMPT"),
    version: z.union([z.literal("1"), z.literal(1)]).default("1"),
    userPrompt: z.string().min(1),
    systemInstructions: z.array(z.string().min(1)).default([]),
    interactionOrderEvidenceDisclaimer: z.string().min(1).default(INTERACTION_ORDER_EVIDENCE_DISCLAIMER),
    interactionTimeline: z.array(TimelineItemSchema).default([]),
    evidenceNotes: z.array(z.string().min(1)).default([]),
    responseFormat: z.string().optional(),
    metadata: z.record(z.unknown()).default({})
  })
  .strict();
export type PromptContract = z.infer<typeof PromptContractSchema>;

export type PromptContractInput = Partial<Omit<PromptContract, "userPrompt">> & { userPrompt: string };

export function buildPromptContract(input: PromptContractInput): PromptContract {
  const parsed = PromptContractSchema.parse({
    protocol: "AI-WHITEBOARD-PROMPT",
    version: "1",
    ...input,
    interactionOrderEvidenceDisclaimer: INTERACTION_ORDER_EVIDENCE_DISCLAIMER
  });
  return parsed;
}

export function promptContractText(contractInput: PromptContract | PromptContractInput): string {
  const contract = buildPromptContract(contractInput);
  const lines = [
    ...contract.systemInstructions,
    `User request: ${contract.userPrompt}`,
    `Evidence disclaimer: ${contract.interactionOrderEvidenceDisclaimer}`
  ];
  if (contract.interactionTimeline.length) {
    lines.push("Interaction timeline:");
    for (const item of contract.interactionTimeline) {
      lines.push(`- ${item.seq}: ${item.kind}${item.summary ? ` — ${item.summary}` : ""}`);
    }
  }
  lines.push(...contract.evidenceNotes);
  if (contract.responseFormat) lines.push(`Response format: ${contract.responseFormat}`);
  return lines.join("\n");
}

export const createPromptContract = buildPromptContract;
