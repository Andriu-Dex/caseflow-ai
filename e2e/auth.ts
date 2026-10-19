import { expect, request, test as base, type APIRequestContext } from '@playwright/test';

// The user both scenarios sign in as. It is created once by the global setup
// through the API (never seeded straight into the database).
export const E2E_USER = {
  email: 'e2e-profesor@ejemplo.com',
  password: 'e2e-clave-segura-1',
  displayName: 'Profesor E2E',
};
export const API_BASE_URL = 'http://localhost:3001';

// `test` whose `page` starts signed in through the real sign-in page. Each test
// signs in on its own: the refresh token rotates every time a session is
// restored, so a session saved once and shared would be spent by the first test.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/login');
    await page.locator('#email').fill(E2E_USER.email);
    await page.locator('#password').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await use(page);
  },
});
export { expect };

// An API client that acts as the E2E user, for the setup a scenario prepares
// directly through the real API (every assertion still happens in the browser).
export async function signedInApi(): Promise<APIRequestContext> {
  const anonymous = await request.newContext({ baseURL: API_BASE_URL });
  const response = await anonymous.post('/auth/login', {
    data: { email: E2E_USER.email, password: E2E_USER.password },
  });
  if (!response.ok()) throw new Error(`E2E sign-in failed (${response.status()}).`);
  const { accessToken } = (await response.json()) as { accessToken: string };
  await anonymous.dispose();
  // A refusal stops the setup right there, saying which call and why, instead of
  // surfacing later as a puzzling missing field.
  return request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    failOnStatusCode: true,
  });
}
