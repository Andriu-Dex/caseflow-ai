import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ loading: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

// The access token lives in module state: load a fresh module per test.
async function freshApi() {
  vi.resetModules();
  return (await import('./api')).api;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('API client session restore', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // Already on the login page: a failed session must not navigate away.
    window.history.pushState({}, '', '/login');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores the session once before the first requests instead of sending them without a token', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? json(200, { accessToken: 'header.e30.signature' })
        : json(200, { items: [] }),
    );
    const api = await freshApi();

    await Promise.all([api.workspaces.list(), api.projects.get('p1')]);

    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.filter((url) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(calls[0]).toMatch(/\/auth\/refresh$/);
    for (const [url, init] of fetchMock.mock.calls.slice(1))
      expect((init as RequestInit).headers, String(url)).toMatchObject({
        Authorization: 'Bearer header.e30.signature',
      });
  });

  it('does not try to refresh again after the restore found no session', async () => {
    fetchMock.mockImplementation(async () => json(401, { message: 'No autenticado.' }));
    const api = await freshApi();

    await expect(api.workspaces.list()).rejects.toMatchObject({ status: 401 });

    const refreshes = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });

  it('says why the server rejected a payload, not only that it was rejected', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? json(200, { accessToken: 'header.e30.signature' })
        : json(400, {
            message: 'La solicitud no es válida.',
            errors: [
              {
                path: 'customEndpoints.3',
                message: 'El endpoint referencia un módulo inexistente.',
              },
            ],
          }),
    );
    const api = await freshApi();

    await expect(api.projects.get('p1')).rejects.toMatchObject({
      message: 'La solicitud no es válida. El endpoint referencia un módulo inexistente.',
    });
  });
});

describe('API client while the server restarts', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/login');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const down = () => Promise.reject(new TypeError('Failed to fetch'));

  it('waits for the API to come back, telling the user it is reconnecting', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'header.e30.signature' });
      attempts += 1;
      return attempts < 4 ? down() : json(200, { items: [] });
    });
    const api = await freshApi();
    const result = api.workspaces.list();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ items: [] });
    expect(toast.loading).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('never repeats a write the server may not have received', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json(200, { accessToken: 'header.e30.signature' }) : down(),
    );
    const api = await freshApi();
    const err = await api.requirements.create('p1', {} as never).catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 0,
      message: expect.stringContaining('No se pudo conectar'),
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/projects/p1/requirements')),
    ).toHaveLength(1);
  });

  it('gives up after about 15 seconds', async () => {
    fetchMock.mockImplementation(down);
    const api = await freshApi();
    const result = api.workspaces.list().catch((e: Error) => e);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: expect.stringContaining('No se pudo conectar') });
  });
});
