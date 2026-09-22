export type DiagramFormat = 'MERMAID_ER' | 'PLANTUML';

export const DIAGRAM_PROVIDER_ERROR_CODES = [
  'DIAGRAM_NOT_CONFIGURED',
  'DIAGRAM_INVALID_SOURCE',
  'DIAGRAM_PROVIDER_TIMEOUT',
  'DIAGRAM_PROVIDER_UNAVAILABLE',
  'DIAGRAM_PROVIDER_ERROR',
  'DIAGRAM_RESPONSE_TOO_LARGE',
  'DIAGRAM_UNSAFE_OUTPUT',
] as const;
export type DiagramProviderErrorCode = (typeof DIAGRAM_PROVIDER_ERROR_CODES)[number];

export class DiagramProviderError extends Error {
  constructor(
    public readonly code: DiagramProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DiagramProviderError';
  }
  toJSON(): { code: DiagramProviderErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export interface DiagramProviderRequest {
  format: DiagramFormat;
  source: string;
}
export interface DiagramProviderResponse {
  svg: string;
}
export interface DiagramProvider {
  readonly id: string;
  render(request: DiagramProviderRequest): Promise<DiagramProviderResponse>;
}

// The default when DIAGRAM_RENDERER is unset: booting without local Kroki
// never attempts an outbound call; only an actual render request fails.
export class DisabledDiagramProvider implements DiagramProvider {
  readonly id = 'disabled';
  async render(): Promise<never> {
    throw new DiagramProviderError(
      'DIAGRAM_NOT_CONFIGURED',
      'El renderizado de diagramas no está configurado.',
    );
  }
}

// For unit/integration tests that must not depend on a live renderer.
export class FakeDiagramProvider implements DiagramProvider {
  readonly id = 'fake';
  lastRequest?: DiagramProviderRequest;
  constructor(private readonly result: DiagramProviderResponse | DiagramProviderError) {}
  async render(request: DiagramProviderRequest): Promise<DiagramProviderResponse> {
    this.lastRequest = request;
    if (this.result instanceof DiagramProviderError) throw this.result;
    return this.result;
  }
}
