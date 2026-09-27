import type { UiBlueprintContent } from '@caseflow-ai/contracts';

export const MOCKUP_PROVIDER_ERROR_CODES = [
  'MOCKUP_NOT_CONFIGURED',
  'MOCKUP_PROVIDER_TIMEOUT',
  'MOCKUP_PROVIDER_UNAVAILABLE',
  'MOCKUP_PROVIDER_ERROR',
] as const;
export type MockupProviderErrorCode = (typeof MOCKUP_PROVIDER_ERROR_CODES)[number];

export class MockupProviderError extends Error {
  constructor(
    public readonly code: MockupProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MockupProviderError';
  }
}

export interface GeneratedScreen {
  screenLocalId: string;
  screenName: string;
  image: { body: Buffer; contentType: string };
  html: string;
}
export type MockupGenerationResult =
  { kind: 'INTERNAL_WIREFRAME'; svg: string } | { kind: 'STITCH'; screens: GeneratedScreen[] };

export interface MockupProvider {
  readonly id: string;
  generate(content: UiBlueprintContent): Promise<MockupGenerationResult>;
}

export class FallbackMockupProvider implements MockupProvider {
  readonly id = 'fallback';
  constructor(private readonly providers: readonly MockupProvider[]) {
    if (!providers.length) throw new Error('FallbackMockupProvider requires a provider.');
  }
  async generate(content: UiBlueprintContent): Promise<MockupGenerationResult> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generate(content);
      } catch (cause) {
        lastError = cause;
      }
    }
    throw lastError instanceof MockupProviderError
      ? lastError
      : new MockupProviderError('MOCKUP_PROVIDER_ERROR', 'No se pudo generar el boceto.', {
          cause: lastError,
        });
  }
}

export class FakeMockupProvider implements MockupProvider {
  readonly id = 'fake';
  constructor(
    private readonly result: MockupGenerationResult | Error = {
      kind: 'INTERNAL_WIREFRAME',
      svg: '<svg/>',
    },
  ) {}
  async generate(): Promise<MockupGenerationResult> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}
