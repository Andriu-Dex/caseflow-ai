import { API_BASE_URL, expect, test } from './auth';

// H4 (APE4): the refresh cookie that sign-in creates is really deleted by a real
// browser at sign-out. The web app has no sign-out button, so the call is made
// from the page itself, with its cookies, exactly as the app would.
test('sign-out deletes the refresh cookie that sign-in created', async ({ page, context }) => {
  const refreshCookie = async () =>
    (await context.cookies()).find((cookie) => cookie.name === 'refresh_token');

  const created = await refreshCookie();
  expect(created).toBeDefined();
  expect(created).toMatchObject({ path: '/auth', httpOnly: true, sameSite: 'Lax' });

  const status = (path: string) =>
    page.evaluate(
      async (url) => (await fetch(url, { method: 'POST', credentials: 'include' })).status,
      `${API_BASE_URL}${path}`,
    );

  expect(await status('/auth/logout')).toBe(200);
  expect(await refreshCookie()).toBeUndefined();

  // Without the cookie, and with the session revoked, a refresh is refused.
  expect(await status('/auth/refresh')).toBe(401);
});
