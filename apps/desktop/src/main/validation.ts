import { z } from 'zod';

import type {
  AiRequestInput,
  AppSettingsPatch,
  ClipboardWriteInput,
  ProviderName,
  WindowMode,
} from './contracts';

/** Maximum sizes keep untrusted renderer payloads from becoming memory bombs. */
export const MAX_TEXT_LENGTH = 250_000;
export const MAX_IMAGE_LENGTH = 20_000_000;
export const MAX_DOCUMENT_BYTES = 20_000_000;
export const MAX_SESSION_IMPORT_BYTES = MAX_DOCUMENT_BYTES * 4;

export const windowModeSchema = z.enum(['quick', 'full', 'dock', 'inspect']);
export const providerSchema = z.enum(['openai', 'anthropic', 'google']);

const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const titleSchema = z.string().trim().min(1).max(200);
const dataUrlSchema = z
  .string()
  .max(MAX_IMAGE_LENGTH)
  .refine((value) => /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(value), {
    message: 'Only base64 image data URLs are accepted',
  });

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.string().max(MAX_TEXT_LENGTH),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValueSchema).max(100_000),
    z.record(z.string().max(200), jsonValueSchema),
  ]),
);

const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(MAX_TEXT_LENGTH),
});

const imagePartSchema = z.object({
  type: z.literal('image'),
  data: z.union([
    dataUrlSchema,
    z.string().max(MAX_IMAGE_LENGTH).regex(/^[a-zA-Z0-9+/=]+$/, 'Image data must be base64'),
  ]),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']),
  alt: z.string().max(1_000).optional(),
});

export const aiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([
    z.string().max(MAX_TEXT_LENGTH),
    z.array(z.union([textPartSchema, imagePartSchema])).max(100),
  ]),
});

export const aiRequestSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(128).optional(),
  messages: z.array(aiMessageSchema).min(1).max(200),
  context: jsonValueSchema.optional(),
  responseFormat: z
    .object({
      type: z.enum(['text', 'json']),
      schema: z.record(z.string().max(200), jsonValueSchema).optional(),
      name: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    })
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(1).max(128_000).optional(),
  sessionId: idSchema.optional(),
}) satisfies z.ZodType<AiRequestInput>;

export const sessionIdSchema = z.object({ id: idSchema });

export const createSessionSchema = z.object({
  title: titleSchema.optional(),
  document: jsonValueSchema.optional(),
});

export const renameSessionSchema = z.object({
  id: idSchema,
  title: titleSchema,
});

export const saveSessionSchema = z.object({
  id: idSchema,
  document: jsonValueSchema,
  metadata: z.record(z.string().max(200), jsonValueSchema).optional(),
});

export const autosaveSessionSchema = z.object({
  id: idSchema,
  document: jsonValueSchema,
});

export const updateSettingsSchema = z
  .object({
    windowMode: windowModeSchema.optional(),
    globalShortcut: z.string().trim().min(1).max(128).optional(),
    activeProvider: providerSchema.optional(),
    models: z
      .object({
        openai: z.string().trim().min(1).max(128).optional(),
        anthropic: z.string().trim().min(1).max(128).optional(),
        google: z.string().trim().min(1).max(128).optional(),
      })
      .optional(),
    launchAtLogin: z.boolean().optional(),
    alwaysOnTop: z.boolean().optional(),
    autosaveIntervalMs: z.number().int().min(500).max(86_400_000).optional(),
  })
  .strict() satisfies z.ZodType<AppSettingsPatch>;

export const secretProviderSchema = z.object({ provider: providerSchema });
export const setSecretSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().min(1).max(10_000),
});

export const clipboardWriteSchema = z
  .object({
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    imageDataUrl: dataUrlSchema.optional(),
  })
  .refine((value) => value.text !== undefined || value.imageDataUrl !== undefined, {
    message: 'Clipboard write requires text or an image',
  }) satisfies z.ZodType<ClipboardWriteInput>;

export const setWindowModeSchema = z.object({ mode: windowModeSchema });
export const aiCancelSchema = z.object({ requestId: idSchema });

export function isSafePrintableSvg(svg: string): boolean {
  if (!/^\s*<svg\b/i.test(svg)) return false;
  if (/<\s*!\s*(?:DOCTYPE|ENTITY)\b/i.test(svg)) return false;
  if (/<\s*(?:script|foreignObject|iframe|object|embed|audio|video|link|meta|base)\b/i.test(svg)) return false;
  if (/\bon[a-z]+\s*=/i.test(svg)) return false;
  if (/(?:href|xlink:href|src)\s*=\s*["']\s*(?:javascript:|https?:|file:|\/\/)/i.test(svg)) return false;
  if (/url\s*\(\s*["']?\s*(?:javascript:|https?:|file:|\/\/)/i.test(svg) || /@import\b/i.test(svg)) return false;
  return true;
}

/**
 * Electron's structured clone can carry values which JSON cannot represent.
 * The database only accepts JSON values, so validate again at the persistence
 * boundary instead of relying solely on IPC schemas.
 */
export function assertJsonSerializable(value: unknown, label = 'value'): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error(`${label} is too large`);
  }
}

export function parseIpcPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid request: ${result.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return result.data;
}

export function asProvider(value: string): ProviderName {
  return providerSchema.parse(value) as ProviderName;
}

export function asWindowMode(value: string): WindowMode {
  return windowModeSchema.parse(value) as WindowMode;
}
