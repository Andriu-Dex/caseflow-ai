import { describe, expect, it } from 'vitest';
import { loadMockupConfig } from './mockup-config';

describe('loadMockupConfig', () => {
  it('defaults to the internal provider without a key', () => {
    expect(loadMockupConfig({})).toEqual({ provider: 'disabled' });
  });
  it('loads Stitch with a bounded timeout', () => {
    expect(loadMockupConfig({ MOCKUP_PROVIDER: 'stitch', STITCH_API_KEY: 'test' })).toEqual({
      provider: 'stitch',
      apiKey: 'test',
      timeoutMs: 30_000,
    });
    expect(
      loadMockupConfig({
        MOCKUP_PROVIDER: 'stitch',
        STITCH_API_KEY: 'test',
        STITCH_TIMEOUT_MS: '5000',
      }),
    ).toMatchObject({ timeoutMs: 5000 });
  });
  it('rejects an unknown provider or missing key', () => {
    expect(() => loadMockupConfig({ MOCKUP_PROVIDER: 'other' })).toThrow();
    expect(() => loadMockupConfig({ MOCKUP_PROVIDER: 'stitch' })).toThrow();
  });
});
