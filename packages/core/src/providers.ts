import { z } from "zod";

export const PROVIDER_IDS = ["openai", "anthropic", "gemini"] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const DEFAULT_PROVIDER_MODELS: Readonly<Record<ProviderId, string>> = {
  openai: "gpt-5.6-luna",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-3.7-flash"
};

const providerDefaults: Record<ProviderId, Omit<ProviderConfig, "id" | "model">> = {
  openai: { displayName: "OpenAI", enabled: true, supportsVision: true, metadata: {} },
  anthropic: { displayName: "Anthropic", enabled: true, supportsVision: true, metadata: {} },
  gemini: { displayName: "Google Gemini", enabled: true, supportsVision: true, metadata: {} }
};

export const ProviderConfigSchema = z
  .object({
    id: ProviderIdSchema,
    model: z.string().min(1),
    displayName: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
    supportsVision: z.boolean().default(false),
    /** A reference to a secret in the host app; this package deliberately never stores a key. */
    apiKeyRef: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    metadata: z.record(z.string()).default({})
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export type ProviderConfigOverrides = Partial<Omit<ProviderConfig, "id" | "model">> & {
  model?: string;
};

export function createDefaultProviderConfig(
  id: ProviderId,
  overrides: ProviderConfigOverrides = {}
): ProviderConfig {
  return ProviderConfigSchema.parse({
    id,
    model: DEFAULT_PROVIDER_MODELS[id],
    ...providerDefaults[id],
    ...overrides
  });
}

export function createDefaultProviderConfigs(): ProviderConfig[] {
  return PROVIDER_IDS.map((id) => createDefaultProviderConfig(id));
}

export function parseProviderConfig(value: unknown): ProviderConfig {
  return ProviderConfigSchema.parse(value);
}
