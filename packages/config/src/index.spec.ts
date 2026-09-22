import { describe, expect, it } from 'vitest';
import { loadAIConfig, loadDiagramRendererConfig } from './index';

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

describe('loadDiagramRendererConfig', () => {
  it('defaults safely to disabled without a base URL', () =>
    expect(loadDiagramRendererConfig({})).toEqual({ renderer: 'disabled' }));
  it('validates kroki settings and applies the default timeout', () =>
    expect(
      loadDiagramRendererConfig({
        DIAGRAM_RENDERER: 'kroki',
        KROKI_BASE_URL: 'http://localhost:8000',
      }),
    ).toEqual({ renderer: 'kroki', baseUrl: 'http://localhost:8000', timeoutMs: 10_000 }));
  it('honors an explicit render timeout', () =>
    expect(
      loadDiagramRendererConfig({
        DIAGRAM_RENDERER: 'kroki',
        KROKI_BASE_URL: 'http://localhost:8000',
        DIAGRAM_RENDER_TIMEOUT_MS: '5000',
      }),
    ).toMatchObject({ timeoutMs: 5000 }));
  it('rejects kroki configuration without a base URL', () =>
    expect(() => loadDiagramRendererConfig({ DIAGRAM_RENDERER: 'kroki' })).toThrow());
});
