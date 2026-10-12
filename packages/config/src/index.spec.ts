import { describe, expect, it } from 'vitest';
import { loadAIConfig, loadDiagramRendererConfig, loadStorageConfig } from './index';

describe('loadAIConfig', () => {
  // DEC-117: the desktop edition's ChatGPT plan, through the loopback broker.
  it('reads the ChatGPT plan provider and requires its broker', () => {
    expect(
      loadAIConfig({
        AI_PROVIDER: 'chatgpt',
        AI_MODEL: 'gpt-x',
        CHATGPT_BROKER_URL: 'http://127.0.0.1:4803',
        CHATGPT_BROKER_SECRET: 'x'.repeat(43),
      }),
    ).toEqual({
      provider: 'chatgpt',
      model: 'gpt-x',
      timeoutMs: 120_000,
      brokerUrl: 'http://127.0.0.1:4803',
      brokerSecret: 'x'.repeat(43),
    });
    expect(() =>
      loadAIConfig({ AI_PROVIDER: 'chatgpt', AI_MODEL: 'gpt-x', CHATGPT_BROKER_SECRET: 'short' }),
    ).toThrow();
  });

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

  it('reads an ordered free-tier fallback chain from numbered provider slots', () =>
    expect(
      loadAIConfig({
        AI_PROVIDER: 'fallback',
        AI_PROVIDER_1_ID: 'groq',
        AI_PROVIDER_1_BASE_URL: 'https://api.groq.com/openai/v1',
        AI_PROVIDER_1_API_KEY: 'groq-secret',
        AI_PROVIDER_1_MODEL: 'llama-3.3-70b-versatile',
        AI_PROVIDER_2_ID: 'gemini',
        AI_PROVIDER_2_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        AI_PROVIDER_2_API_KEY: 'gemini-secret',
        AI_PROVIDER_2_MODEL: 'gemini-2.0-flash',
      }),
    ).toEqual({
      provider: 'fallback',
      chain: [
        {
          id: 'groq',
          baseUrl: 'https://api.groq.com/openai/v1',
          apiKey: 'groq-secret',
          model: 'llama-3.3-70b-versatile',
          timeoutMs: 30_000,
          schemaDialect: 'strict',
        },
        {
          id: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          apiKey: 'gemini-secret',
          model: 'gemini-2.0-flash',
          timeoutMs: 30_000,
          schemaDialect: 'strict',
        },
      ],
    }));

  it('reads an explicit narrow schema dialect for a slot that requires it', () =>
    expect(
      loadAIConfig({
        AI_PROVIDER: 'fallback',
        AI_PROVIDER_1_ID: 'gemini',
        AI_PROVIDER_1_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        AI_PROVIDER_1_API_KEY: 'gemini-secret',
        AI_PROVIDER_1_MODEL: 'gemini-3.8-flash',
        AI_PROVIDER_1_SCHEMA_DIALECT: 'narrow',
      }),
    ).toMatchObject({ chain: [{ id: 'gemini', schemaDialect: 'narrow' }] }));

  it('stops the fallback chain at the first slot missing a base URL', () =>
    expect(
      loadAIConfig({
        AI_PROVIDER: 'fallback',
        AI_PROVIDER_1_BASE_URL: 'https://api.groq.com/openai/v1',
        AI_PROVIDER_1_API_KEY: 'groq-secret',
        AI_PROVIDER_1_MODEL: 'llama-3.3-70b-versatile',
        AI_PROVIDER_3_BASE_URL: 'https://unreachable.test/v1',
      }),
    ).toMatchObject({ chain: [{ id: 'provider_1' }] }));

  it('reads what each provider plan accepts (DEC-127)', () => {
    const slot = {
      AI_PROVIDER: 'fallback',
      AI_PROVIDER_1_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      AI_PROVIDER_1_API_KEY: 'gemini-secret',
      AI_PROVIDER_1_MODEL: 'gemini-3.8-flash',
      AI_PROVIDER_1_MAX_INPUT_TOKENS: '1048576',
      AI_PROVIDER_1_TOKENS_PER_MINUTE: '250000',
      AI_PROVIDER_1_DAY_RESET_TIMEZONE: 'America/Los_Angeles',
    };
    expect(loadAIConfig(slot)).toMatchObject({
      chain: [
        {
          maxInputTokens: 1_048_576,
          tokensPerMinute: 250_000,
          dayResetTimeZone: 'America/Los_Angeles',
        },
      ],
    });
    expect(() =>
      loadAIConfig({ ...slot, AI_PROVIDER_1_DAY_RESET_TIMEZONE: 'Marte/Olimpo' }),
    ).toThrow('Zona horaria');
  });

  it('accepts the ChatGPT broker only on this machine (DEC-128)', () => {
    const chatgpt = {
      AI_PROVIDER: 'chatgpt',
      AI_MODEL: 'gpt-x',
      AI_MAX_INPUT_TOKENS: '200000',
      CHATGPT_BROKER_URL: 'http://127.0.0.1:47833',
      CHATGPT_BROKER_SECRET: 'x'.repeat(32),
    };
    expect(loadAIConfig(chatgpt)).toMatchObject({ provider: 'chatgpt', maxInputTokens: 200_000 });
    expect(() =>
      loadAIConfig({ ...chatgpt, CHATGPT_BROKER_URL: 'https://broker.example.com' }),
    ).toThrow('este equipo');
  });

  it('rejects an empty fallback chain', () =>
    expect(() => loadAIConfig({ AI_PROVIDER: 'fallback' })).toThrow());
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

describe('loadStorageConfig', () => {
  const env = {
    S3_ENDPOINT: 'http://localhost:8333',
    S3_BUCKET: 'caseflow',
    S3_ACCESS_KEY_ID: 'caseflow',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_REGION: 'us-east-1',
  };
  it('loads complete storage configuration', () =>
    expect(loadStorageConfig(env)).toEqual({
      configured: true,
      endpoint: 'http://localhost:8333',
      bucket: 'caseflow',
      accessKeyId: 'caseflow',
      secretAccessKey: 'secret',
      region: 'us-east-1',
    }));
  it('safely reports unconfigured storage instead of throwing', () =>
    expect(loadStorageConfig({ S3_ENDPOINT: env.S3_ENDPOINT })).toEqual({ configured: false }));
});
