import type { MockupDeviceType, UiBlueprintContent } from '@caseflow-ai/contracts';

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

// Where the screen lives in the external provider, so it can be edited later.
export interface ProviderScreenRef {
  projectId: string;
  screenId: string;
}

export interface GeneratedScreen {
  screenLocalId: string;
  screenName: string;
  image: { body: Buffer; contentType: string };
  html: string;
  providerRef?: ProviderScreenRef;
}
export type MockupGenerationResult =
  { kind: 'INTERNAL_WIREFRAME'; svg: string } | { kind: 'STITCH'; screens: GeneratedScreen[] };

export interface EditedScreen {
  image: { body: Buffer; contentType: string };
  html: string;
  providerRef: ProviderScreenRef;
}

export interface MockupProvider {
  readonly id: string;
  // `refinement` is an extra user instruction layered on the blueprint; a
  // deterministic provider may ignore it (callers check the result kind).
  generate(
    content: UiBlueprintContent,
    deviceType?: MockupDeviceType,
    refinement?: string,
  ): Promise<MockupGenerationResult>;
  // Optional: edit one previously generated screen in place at the provider.
  // Only providers that keep editable screens (Stitch) implement it.
  editScreen?(
    ref: ProviderScreenRef,
    prompt: string,
    deviceType?: MockupDeviceType,
  ): Promise<EditedScreen>;
}

export type MockupProviderFailureHandler = (providerId: string, error: unknown) => void;

export class FallbackMockupProvider implements MockupProvider {
  readonly id = 'fallback';
  constructor(
    private readonly providers: readonly MockupProvider[],
    private readonly onProviderFailure?: MockupProviderFailureHandler,
  ) {
    if (!providers.length) throw new Error('FallbackMockupProvider requires a provider.');
  }
  async generate(
    content: UiBlueprintContent,
    deviceType?: MockupDeviceType,
    refinement?: string,
  ): Promise<MockupGenerationResult> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generate(content, deviceType, refinement);
      } catch (cause) {
        this.onProviderFailure?.(provider.id, cause);
        lastError = cause;
      }
    }
    throw lastError instanceof MockupProviderError
      ? lastError
      : new MockupProviderError('MOCKUP_PROVIDER_ERROR', 'No se pudo generar el boceto.', {
          cause: lastError,
        });
  }
  // No fallback for edits: a screen can only be edited by the provider that
  // owns it, and a deterministic wireframe cannot apply an instruction.
  async editScreen(
    ref: ProviderScreenRef,
    prompt: string,
    deviceType?: MockupDeviceType,
  ): Promise<EditedScreen> {
    const editor = this.providers.find((provider) => provider.editScreen);
    if (!editor)
      throw new MockupProviderError(
        'MOCKUP_NOT_CONFIGURED',
        'No hay un proveedor de bocetos que permita editar pantallas.',
      );
    try {
      return await editor.editScreen!(ref, prompt, deviceType);
    } catch (cause) {
      this.onProviderFailure?.(editor.id, cause);
      throw cause instanceof MockupProviderError
        ? cause
        : new MockupProviderError('MOCKUP_PROVIDER_ERROR', 'No se pudo editar la pantalla.', {
            cause,
          });
    }
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
