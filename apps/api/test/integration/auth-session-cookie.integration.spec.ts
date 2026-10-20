import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './support/test-app';

type Headers = Record<string, string[] | string | undefined>;

function setCookies(response: { headers: Headers }): string[] {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header : header ? [header] : [];
}

// The browser decides whether a Set-Cookie replaces an existing cookie by its
// name, Domain and Path. Everything else only has to describe the same cookie.
function parse(cookie: string) {
  const [pair = '', ...attributes] = cookie.split(';').map((part) => part.trim());
  const separator = pair.indexOf('=');
  const flags = new Map(
    attributes.map((attribute) => {
      const [key = '', ...value] = attribute.split('=');
      return [key.toLowerCase(), value.join('=')] as const;
    }),
  );
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1), flags };
}

// H4 (APE4): signing out must delete the cookie that sign-in created.
describe('Refresh cookie lifecycle', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const server = () => ctx.app.getHttpServer();

  async function register() {
    const body = {
      email: `cookie-${randomUUID()}@example.com`,
      password: 'valid-password-123',
      displayName: 'Cookie Prueba',
    };
    const response = await request(server()).post('/auth/register').send(body).expect(201);
    return { body, response };
  }

  it('creates the refresh cookie with the expected attributes at sign-in', async () => {
    const { body } = await register();
    const response = await request(server())
      .post('/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(200);
    const [cookie] = setCookies(response);
    const parsed = parse(cookie ?? '');
    expect(parsed.name).toBe('refresh_token');
    expect(parsed.value).not.toBe('');
    expect(parsed.flags.get('path')).toBe('/auth');
    expect(parsed.flags.has('httponly')).toBe(true);
    expect(parsed.flags.get('samesite')).toBe('Lax');
  });

  it('rotates the token when the session is refreshed', async () => {
    const { response } = await register();
    const first = parse(setCookies(response)[0] ?? '');
    const refreshed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${first.value}`)
      .expect(200);
    const second = parse(setCookies(refreshed)[0] ?? '');
    expect(second.value).not.toBe(first.value);
    expect(second.flags.get('path')).toBe('/auth');
    // The token that was just spent no longer works.
    await request(server())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${first.value}`)
      .expect(401);
  });

  it('removes the original cookie at sign-out and revokes the session', async () => {
    const { response } = await register();
    const created = parse(setCookies(response)[0] ?? '');

    const loggedOut = await request(server())
      .post('/auth/logout')
      .set('Cookie', `refresh_token=${created.value}`)
      .expect(200);
    const [cleared] = setCookies(loggedOut);
    const parsed = parse(cleared ?? '');

    // Same name and same Path as the cookie that sign-in created: otherwise the
    // browser keeps the original one.
    expect(parsed.name).toBe(created.name);
    expect(parsed.flags.get('path')).toBe(created.flags.get('path'));
    expect(parsed.value).toBe('');
    expect(new Date(parsed.flags.get('expires') ?? '').getTime()).toBeLessThan(Date.now());
    expect(parsed.flags.has('httponly')).toBe(true);
    expect(parsed.flags.get('samesite')).toBe('Lax');

    // The server side still revokes the token.
    const refreshed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${created.value}`)
      .expect(401);
    expect(refreshed.body.message).toBe('Invalid or expired refresh token');
  });

  it('answers the sign-out of a request that has no cookie without error', async () => {
    const response = await request(server()).post('/auth/logout').expect(200);
    expect(response.body).toEqual({ success: true });
  });
});
