import {
  DiagramProviderError,
  type DiagramFormat,
  type DiagramProvider,
  type DiagramProviderRequest,
  type DiagramProviderResponse,
} from './diagram-provider';

// Pinned local Kroki deployment (infra/docker/compose.yml uses the same tag).
// Carried in the provider id so DiagramDetail.generatorVersion records the
// exact rendering engine that produced a stored SVG.
export const KROKI_ENGINE_VERSION = '0.32.1';

// Kroki's local, self-hosted HTTP API (never a public kroki.io endpoint):
// POST /{diagramType}/svg with the raw diagram source as the request body.
const KROKI_DIAGRAM_TYPE: Record<DiagramFormat, string> = {
  MERMAID_ER: 'mermaid',
  MERMAID_FLOWCHART: 'mermaid',
  PLANTUML: 'plantuml',
  PLANTUML_COMPONENT: 'plantuml',
  PLANTUML_DEPLOYMENT: 'plantuml',
};

// Response bound applied while streaming, independent of any Content-Length
// header the renderer may or may not send.
const MAX_RESPONSE_BYTES = 5_000_000;

export interface KrokiDiagramProviderConfig {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export class KrokiDiagramProvider implements DiagramProvider {
  readonly id = `kroki@${KROKI_ENGINE_VERSION}`;
  private readonly fetchImplementation: typeof fetch;
  constructor(private readonly config: KrokiDiagramProviderConfig) {
    this.fetchImplementation = config.fetch ?? fetch;
  }

  async render(request: DiagramProviderRequest): Promise<DiagramProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImplementation(
        `${this.config.baseUrl.replace(/\/$/, '')}/${KROKI_DIAGRAM_TYPE[request.format]}/svg`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: request.source,
          signal: controller.signal,
        },
      );
      if (response.status === 400)
        throw new DiagramProviderError(
          'DIAGRAM_INVALID_SOURCE',
          'El motor de renderizado rechazó la fuente del diagrama.',
        );
      if (!response.ok) throw statusError(response.status);
      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES)
        throw new DiagramProviderError(
          'DIAGRAM_RESPONSE_TOO_LARGE',
          'La respuesta del renderizador excede el límite permitido.',
        );
      return { svg: await readBounded(response, MAX_RESPONSE_BYTES) };
    } catch (cause) {
      if (cause instanceof DiagramProviderError) throw cause;
      if (controller.signal.aborted)
        throw new DiagramProviderError(
          'DIAGRAM_PROVIDER_TIMEOUT',
          'El renderizador de diagramas excedió el tiempo límite.',
        );
      throw new DiagramProviderError(
        'DIAGRAM_PROVIDER_UNAVAILABLE',
        'El renderizador de diagramas no está disponible.',
        { cause },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function statusError(status: number): DiagramProviderError {
  if (status === 408 || status === 504)
    return new DiagramProviderError(
      'DIAGRAM_PROVIDER_TIMEOUT',
      'El renderizador de diagramas excedió el tiempo límite.',
    );
  if (status >= 500)
    return new DiagramProviderError(
      'DIAGRAM_PROVIDER_UNAVAILABLE',
      'El renderizador de diagramas no está disponible.',
    );
  return new DiagramProviderError(
    'DIAGRAM_PROVIDER_ERROR',
    'El renderizador de diagramas rechazó la solicitud.',
  );
}

// Streams the body with an explicit byte bound instead of trusting a
// Content-Length header, since a local renderer could omit or misreport it.
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DiagramProviderError(
        'DIAGRAM_RESPONSE_TOO_LARGE',
        'La respuesta del renderizador excede el límite permitido.',
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
}
