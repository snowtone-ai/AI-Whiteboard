import { describe, expect, it, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { text: 'ok' } };
          yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } };
          yield { type: 'message_stop' };
        },
      }),
    };
  },
}));

import { ProviderManager, redactError } from './providers';

describe('provider safety boundary', () => {
  it('does not attempt a network request without an explicit provider key', async () => {
    const manager = new ProviderManager(() => undefined);
    const stream = manager.stream({
      provider: 'openai',
      messages: [{ role: 'user', content: 'offline check' }],
    }, 'request-offline', new AbortController().signal);

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('No API key configured');
  });

  it('redacts credentials and provider endpoints from renderer-visible errors', () => {
    const error = redactError(new Error('Authorization: Bearer sk-exampleCredential123456 at https://api.example.test/v1'), 'openai');

    expect(error.message).not.toContain('exampleCredential');
    expect(error.message).not.toContain('api.example.test');
    expect(error.message).toContain('[redacted]');
  });

  it('emits exactly one terminal event for an Anthropic message', async () => {
    const manager = new ProviderManager(() => 'test-only-key');
    const events = [];

    for await (const event of manager.stream({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'terminal event check' }],
    }, 'request-anthropic', new AbortController().signal)) {
      events.push(event);
    }

    expect(events.filter((event) => event.type === 'done')).toEqual([
      expect.objectContaining({ type: 'done', stopReason: 'end_turn' }),
    ]);
  });
});
