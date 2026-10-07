import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
