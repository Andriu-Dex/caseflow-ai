import { describe, expect, it } from 'vitest';
import { loadAIConfig } from './index';

describe('loadAIConfig', () => {
  it('defaults safely to disabled without secrets', () =>
    expect(loadAIConfig({})).toEqual({ provider: 'disabled' }));
  it('validates openai-compatible settings', () =>
    expect(
      loadAIConfig({
        AI_PROVIDER: 'openai_compatible',
        AI_BASE_URL: 'https://example.test/v1',
        AI_API_KEY: 'secret',
        AI_MODEL: 'model',
      }),
    ).toMatchObject({ provider: 'openai_compatible', timeoutMs: 30000 }));
  it('rejects incomplete provider configuration', () =>
    expect(() => loadAIConfig({ AI_PROVIDER: 'openai_compatible' })).toThrow());
});
