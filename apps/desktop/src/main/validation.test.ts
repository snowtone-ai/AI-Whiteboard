import { describe, expect, it } from 'vitest';

import {
  MAX_DOCUMENT_BYTES,
  aiRequestSchema,
  assertJsonSerializable,
  isSafePrintableSvg,
  parseIpcPayload,
  updateSettingsSchema,
} from './validation';

describe('IPC validation', () => {
  it('rejects unsupported providers and unknown settings fields', () => {
    expect(() => parseIpcPayload(aiRequestSchema, {
      provider: 'untrusted-provider',
      messages: [{ role: 'user', content: 'hello' }],
    })).toThrow('Invalid request');

    expect(() => parseIpcPayload(updateSettingsSchema, {
      activeProvider: 'openai',
      secretValue: 'must-not-cross-ipc',
    })).toThrow('Invalid request');
  });

  it('rejects documents larger than the persistence boundary', () => {
    expect(() => assertJsonSerializable('x'.repeat(MAX_DOCUMENT_BYTES + 1), 'board')).toThrow('too large');
  });

  it('accepts inert SVG and rejects active or remotely loaded SVG', () => {
    expect(isSafePrintableSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>')).toBe(true);
    expect(isSafePrintableSvg('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(isSafePrintableSvg('<svg><image href="https://example.test/private"/></svg>')).toBe(false);
    expect(isSafePrintableSvg('<svg><path onload="alert(1)"/></svg>')).toBe(false);
  });
});
