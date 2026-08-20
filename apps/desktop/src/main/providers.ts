import {
  DEFAULT_MODELS,
  type AiContentPart,
  type AiMessage,
  type AiRequestInput,
  type AiUsage,
  type NormalizedAiEvent,
  type ProviderName,
  type SafeError,
} from './contracts';

export interface ProviderStreamEvent {
  type: 'text-delta' | 'structured' | 'image' | 'usage' | 'done';
  delta?: string;
  value?: unknown;
  mimeType?: string;
  data?: string;
  usage?: AiUsage;
  stopReason?: string;
}

export interface ProviderAdapter {
  readonly provider: ProviderName;
  stream(request: AiRequestInput, apiKey: string, signal: AbortSignal): AsyncIterable<ProviderStreamEvent>;
}

export type ApiKeyResolver = (provider: ProviderName) => string | undefined;

function contextText(context: unknown): string | undefined {
  if (context === undefined) return undefined;
  try {
    const encoded = JSON.stringify(context);
    if (!encoded) return undefined;
    // Board context is useful to the model but should not be allowed to dwarf
    // the actual user prompt or exceed provider request limits.
    return `<whiteboard_context>\n${encoded.slice(0, 200_000)}\n</whiteboard_context>`;
  } catch {
    return undefined;
  }
}

function messageText(message: AiMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((part): part is Extract<AiContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function withContext(message: AiMessage, context: string | undefined): AiMessage {
  if (!context || message.role !== 'user') return message;
  if (typeof message.content === 'string') return { ...message, content: `${message.content}\n\n${context}` };
  return { ...message, content: [...message.content, { type: 'text', text: context }] };
}

function dataUrlToBase64(data: string): string {
  const comma = data.indexOf(',');
  return data.startsWith('data:') && comma >= 0 ? data.slice(comma + 1) : data;
}

function dataUrlForImage(data: string, mimeType: string): string {
  return data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('The AI request was cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

/**
 * Adds cancellation to SDK async iterators. Some provider SDK releases expose
 * AbortSignal directly and some do not; calling return() on the iterator gives
 * both paths deterministic cleanup.
 */
async function* iterateWithAbort<T>(stream: AsyncIterable<T>, signal: AbortSignal): AsyncIterable<T> {
  const iterator = stream[Symbol.asyncIterator]();
  let abortListener: (() => void) | undefined;
  let aborted = false;
  try {
    const abortPromise = new Promise<never>((_, reject) => {
      abortListener = () => {
        aborted = true;
        const error = new Error('The AI request was cancelled');
        error.name = 'AbortError';
        reject(error);
      };
      signal.addEventListener('abort', abortListener, { once: true });
    });
    while (!aborted) {
      const result = await Promise.race([iterator.next(), abortPromise]);
      if (result.done) return;
      yield result.value;
    }
  } finally {
    if (abortListener) signal.removeEventListener('abort', abortListener);
    if (signal.aborted || aborted) {
      try {
        await iterator.return?.();
      } catch {
        // The request is already being cancelled; cleanup errors are ignored.
      }
    }
  }
}

function extractJson(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function providerUsage(raw: unknown): AiUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const input = numberFrom(value.input_tokens ?? value.prompt_tokens ?? value.inputTokens);
  const output = numberFrom(value.output_tokens ?? value.completion_tokens ?? value.outputTokens);
  const total = numberFrom(value.total_tokens ?? value.totalTokens);
  if (input === undefined && output === undefined && total === undefined) return undefined;
  return { inputTokens: input, outputTokens: output, totalTokens: total ?? (input ?? 0) + (output ?? 0) };
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

class OpenAiAdapter implements ProviderAdapter {
  readonly provider = 'openai' as const;

  async *stream(request: AiRequestInput, apiKey: string, signal: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    // Dynamic loading keeps providers optional at runtime while still using
    // the official OpenAI SDK when an OpenAI request is made.
    const module = await import('openai');
    const OpenAI = (module as any).default ?? (module as any).OpenAI;
    const client = new OpenAI({ apiKey });
    const context = contextText(request.context);
    const messages = request.messages.map((message) => withContext(message, context));
    const input = messages.map((message) => ({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? [{ type: 'input_text', text: message.content }]
          : message.content.map((part) =>
              part.type === 'text'
                ? { type: 'input_text', text: part.text }
                : { type: 'input_image', image_url: dataUrlForImage(part.data, part.mimeType) },
            ),
    }));
    const responseFormat = request.responseFormat?.type === 'json'
      ? request.responseFormat.schema
        ? {
            type: 'json_schema',
            name: request.responseFormat.name ?? 'whiteboard_response',
            schema: request.responseFormat.schema,
            strict: true,
          }
        : { type: 'json_object' }
      : undefined;
    const payload: Record<string, unknown> = {
      model: request.model ?? DEFAULT_MODELS.openai,
      input,
      stream: true,
      max_output_tokens: request.maxOutputTokens,
      temperature: request.temperature,
    };
    if (responseFormat) payload.text = { format: responseFormat };

    throwIfAborted(signal);
    const stream = await client.responses.create(payload, { signal });
    let accumulated = '';
    for await (const event of iterateWithAbort(stream as AsyncIterable<unknown>, signal)) {
      throwIfAborted(signal);
      const item = (event ?? {}) as Record<string, unknown>;
      const eventType = stringFrom(item.type) ?? '';
      if (eventType === 'response.output_text.delta') {
        const delta = stringFrom(item.delta);
        if (delta) {
          accumulated += delta;
          yield { type: 'text-delta', delta };
        }
      } else if (eventType === 'response.completed') {
        const response = item.response as Record<string, unknown> | undefined;
        const usage = response && providerUsage(response.usage);
        if (usage) yield { type: 'usage', usage };
        if (request.responseFormat?.type === 'json') {
          const value = extractJson(accumulated);
          if (value !== undefined) yield { type: 'structured', value };
        }
        yield {
          type: 'done',
          stopReason: stringFrom(response?.status) ?? 'completed',
        };
      } else if (eventType === 'response.failed' || eventType === 'error') {
        throw new Error(stringFrom((item.error as Record<string, unknown> | undefined)?.message) ?? 'OpenAI request failed');
      }
    }
  }
}

class AnthropicAdapter implements ProviderAdapter {
  readonly provider = 'anthropic' as const;

  async *stream(request: AiRequestInput, apiKey: string, signal: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    const module = await import('@anthropic-ai/sdk');
    const Anthropic = (module as any).default ?? (module as any).Anthropic;
    const client = new Anthropic({ apiKey });
    const context = contextText(request.context);
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => messageText(message))
      .concat(context ? [context] : [])
      .join('\n\n');
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content.map((part) =>
                part.type === 'text'
                  ? { type: 'text', text: part.text }
                  : {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: part.mimeType,
                        data: dataUrlToBase64(part.data),
                      },
                    },
              ),
      }));

    const stream = client.messages.stream(
      {
        model: request.model ?? DEFAULT_MODELS.anthropic,
        max_tokens: request.maxOutputTokens ?? 8_192,
        temperature: request.temperature,
        system: system || undefined,
        messages,
      },
      { signal },
    );
    let accumulated = '';
    let stopReason = 'completed';
    for await (const event of iterateWithAbort(stream as AsyncIterable<unknown>, signal)) {
      throwIfAborted(signal);
      const item = (event ?? {}) as Record<string, unknown>;
      const eventType = stringFrom(item.type) ?? '';
      if (eventType === 'content_block_delta') {
        const delta = item.delta as Record<string, unknown> | undefined;
        const text = stringFrom(delta?.text);
        if (text) {
          accumulated += text;
          yield { type: 'text-delta', delta: text };
        }
      } else if (eventType === 'message_delta') {
        const usage = providerUsage(item.usage);
        if (usage) yield { type: 'usage', usage };
        stopReason = stringFrom(item.delta && (item.delta as Record<string, unknown>).stop_reason) ?? stopReason;
      } else if (eventType === 'message_stop') {
        if (request.responseFormat?.type === 'json') {
          const value = extractJson(accumulated);
          if (value !== undefined) yield { type: 'structured', value };
        }
        yield { type: 'done', stopReason };
      }
    }
  }
}

class GoogleAdapter implements ProviderAdapter {
  readonly provider = 'google' as const;

  async *stream(request: AiRequestInput, apiKey: string, signal: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    const module = await import('@google/genai');
    const GoogleGenAI = (module as any).GoogleGenAI ?? (module as any).default;
    const client = new GoogleGenAI({ apiKey });
    const context = contextText(request.context);
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => messageText(message))
      .concat(context ? [context] : [])
      .join('\n\n');
    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts:
          typeof message.content === 'string'
            ? [{ text: message.content }]
            : message.content.map((part) =>
                part.type === 'text'
                  ? { text: part.text }
                  : { inlineData: { mimeType: part.mimeType, data: dataUrlToBase64(part.data) } },
              ),
      }));
    const config: Record<string, unknown> = {
      systemInstruction: system || undefined,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      responseMimeType: request.responseFormat?.type === 'json' ? 'application/json' : undefined,
      responseSchema: request.responseFormat?.schema,
    };

    throwIfAborted(signal);
    const stream = await client.models.generateContentStream({
      model: request.model ?? DEFAULT_MODELS.google,
      contents,
      config,
    });
    let accumulated = '';
    const pendingImages: Array<{ mimeType: string; data: string }> = [];
    for await (const chunk of iterateWithAbort(stream as AsyncIterable<unknown>, signal)) {
      throwIfAborted(signal);
      const item = (chunk ?? {}) as Record<string, unknown>;
      const text = stringFrom(item.text) ?? extractGoogleText(item);
      if (text) {
        accumulated += text;
        yield { type: 'text-delta', delta: text };
      }
      const usage = providerUsage(item.usageMetadata);
      if (usage) yield { type: 'usage', usage };
      extractGoogleImages(item, (mimeType, data) => {
        // The callback only records the latest image; it is emitted below to
        // keep generator control flow synchronous.
        pendingImages.push({ mimeType, data });
      });
      while (pendingImages.length > 0) yield { type: 'image', ...pendingImages.shift()! };
    }
    if (request.responseFormat?.type === 'json') {
      const value = extractJson(accumulated);
      if (value !== undefined) yield { type: 'structured', value };
    }
    yield { type: 'done', stopReason: 'completed' };

  }
}

function extractGoogleText(item: Record<string, unknown>): string | undefined {
  const candidates = Array.isArray(item.candidates) ? item.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map((part) => (part && typeof part === 'object' ? stringFrom((part as Record<string, unknown>).text) : undefined))
      .filter((part): part is string => Boolean(part))
      .join('');
    if (text) return text;
  }
  return undefined;
}

function extractGoogleImages(item: Record<string, unknown>, emit: (mimeType: string, data: string) => void): void {
  const candidates = Array.isArray(item.candidates) ? item.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const content = (candidate as Record<string, unknown>).content;
    const parts = content && typeof content === 'object' ? (content as Record<string, unknown>).parts : undefined;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      const inline = (part as Record<string, unknown>).inlineData;
      if (!inline || typeof inline !== 'object') continue;
      const data = stringFrom((inline as Record<string, unknown>).data);
      const mimeType = stringFrom((inline as Record<string, unknown>).mimeType);
      if (data && mimeType?.startsWith('image/')) emit(mimeType, data);
    }
  }
}

export function redactError(error: unknown, provider?: ProviderName): SafeError {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:sk|key|AIza)[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, '[provider endpoint]')
    .slice(0, 1_000);
  const status = error && typeof error === 'object' ? (error as Record<string, unknown>).status : undefined;
  const code = typeof status === 'number' ? `PROVIDER_${status}` : 'PROVIDER_ERROR';
  return {
    code,
    message: safeMessage || 'The provider request failed',
    retryable: typeof status === 'number' ? status === 408 || status === 409 || status === 429 || status >= 500 : true,
    provider,
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class ProviderManager {
  private readonly adapters: Record<ProviderName, ProviderAdapter> = {
    openai: new OpenAiAdapter(),
    anthropic: new AnthropicAdapter(),
    google: new GoogleAdapter(),
  };

  constructor(private readonly resolveApiKey: ApiKeyResolver) {}

  async *stream(
    request: AiRequestInput,
    requestId: string,
    signal: AbortSignal,
  ): AsyncIterable<NormalizedAiEvent> {
    const key = this.resolveApiKey(request.provider);
    if (!key) {
      throw Object.assign(new Error(`No API key configured for ${request.provider}`), { code: 'MISSING_API_KEY' });
    }
    const adapter = this.adapters[request.provider];
    for await (const event of adapter.stream(request, key, signal)) {
      if (event.type === 'text-delta' && event.delta) {
        yield { type: 'text-delta', requestId, provider: request.provider, delta: event.delta };
      } else if (event.type === 'structured') {
        yield { type: 'structured', requestId, provider: request.provider, value: event.value };
      } else if (event.type === 'image' && event.data && event.mimeType) {
        yield { type: 'image', requestId, provider: request.provider, mimeType: event.mimeType, data: event.data };
      } else if (event.type === 'usage' && event.usage) {
        yield { type: 'usage', requestId, provider: request.provider, usage: event.usage };
      } else if (event.type === 'done') {
        yield { type: 'done', requestId, provider: request.provider, stopReason: event.stopReason };
      }
    }
  }
}
