import { describe, expect, it, vi } from 'vitest';
import { KrokiDiagramProvider, KROKI_ENGINE_VERSION } from './index';

function provider(fetchMock: typeof fetch, timeoutMs = 100) {
  return new KrokiDiagramProvider({
    baseUrl: 'http://localhost:8000/',
    timeoutMs,
    fetch: fetchMock,
  });
}

describe('KrokiDiagramProvider', () => {
  it('exposes the pinned engine version in its id', () => {
    expect(new KrokiDiagramProvider({ baseUrl: 'x', timeoutMs: 1 }).id).toBe(
      `kroki@${KROKI_ENGINE_VERSION}`,
    );
  });

  it('posts the raw source as plain text to the mermaid diagram-type path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<svg>ok</svg>', { status: 200 }));
    const result = await provider(fetchMock).render({
      format: 'MERMAID_ER',
      source: 'erDiagram\n  a ||--o{ b : has',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/mermaid/svg');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'text/plain; charset=utf-8' });
    expect(init.body).toBe('erDiagram\n  a ||--o{ b : has');
    expect(result).toEqual({ svg: '<svg>ok</svg>' });
  });

  it('posts to the plantuml diagram-type path for PLANTUML sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<svg>uc</svg>', { status: 200 }));
    await provider(fetchMock).render({ format: 'PLANTUML', source: '@startuml\n@enduml' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:8000/plantuml/svg');
  });

  it('normalizes a 400 rejection as an invalid source, without leaking the renderer body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Error 400: Syntax Error internal-detail', { status: 400 }));
    const operation = provider(fetchMock).render({ format: 'MERMAID_ER', source: 'bad' });
    await expect(operation).rejects.toMatchObject({ code: 'DIAGRAM_INVALID_SOURCE' });
    await expect(operation).rejects.not.toThrow(/internal-detail/);
  });

  it.each([
    [404, 'DIAGRAM_PROVIDER_ERROR'],
    [500, 'DIAGRAM_PROVIDER_UNAVAILABLE'],
    [503, 'DIAGRAM_PROVIDER_UNAVAILABLE'],
    [504, 'DIAGRAM_PROVIDER_TIMEOUT'],
  ])('normalizes HTTP %s as %s', async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('detail', { status }));
    await expect(
      provider(fetchMock).render({ format: 'MERMAID_ER', source: 'erDiagram' }),
    ).rejects.toMatchObject({ code });
  });

  it('normalizes an oversized response via Content-Length', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<svg/>', {
        status: 200,
        headers: { 'Content-Length': String(10_000_000) },
      }),
    );
    await expect(
      provider(fetchMock).render({ format: 'MERMAID_ER', source: 'erDiagram' }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_RESPONSE_TOO_LARGE' });
  });

  it('normalizes a timeout without retries', async () => {
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          (init as RequestInit)?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    ) as unknown as typeof fetch;
    await expect(
      provider(fetchMock, 1).render({ format: 'MERMAID_ER', source: 'erDiagram' }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_PROVIDER_TIMEOUT' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('normalizes a network failure as unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      provider(fetchMock).render({ format: 'MERMAID_ER', source: 'erDiagram' }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_PROVIDER_UNAVAILABLE' });
  });
});
