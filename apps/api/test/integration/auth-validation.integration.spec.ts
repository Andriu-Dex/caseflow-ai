import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './support/test-app';

// H1 (APE4): the bodies of POST /auth/register and POST /auth/login are checked
// against their shared contracts, and a rejected request stores nothing.
describe('Authentication input validation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const server = () => ctx.app.getHttpServer();
  const email = () => `auth-${randomUUID()}@example.com`;
  const valid = () => ({
    email: email(),
    password: 'valid-password-123',
    displayName: 'Ana Prueba',
  });

  const omit = (body: Record<string, unknown>, key: string) =>
    Object.fromEntries(Object.entries(body).filter(([name]) => name !== key));

  async function counts() {
    return {
      users: await ctx.prisma.user.count(),
      workspaces: await ctx.prisma.workspace.count(),
      sessions: await ctx.prisma.session.count(),
    };
  }

  it('registers a valid account', async () => {
    const body = valid();
    const response = await request(server()).post('/auth/register').send(body).expect(201);
    expect(response.body.user).toMatchObject({ email: body.email, displayName: body.displayName });
    expect(await ctx.prisma.user.count({ where: { email: body.email } })).toBe(1);
  });

  const invalid: Array<
    [string, (body: ReturnType<typeof valid>) => Record<string, unknown>, string]
  > = [
    ['an invalid email', (b) => ({ ...b, email: 'not-an-email' }), 'email'],
    ['a password shorter than the minimum', (b) => ({ ...b, password: 'short' }), 'password'],
    ['a name that is too short', (b) => ({ ...b, displayName: 'A' }), 'displayName'],
    ['a missing email', (b) => omit(b, 'email'), 'email'],
    ['a missing password', (b) => omit(b, 'password'), 'password'],
    ['a missing name', (b) => omit(b, 'displayName'), 'displayName'],
    ['a password that is not a string', (b) => ({ ...b, password: 12345678 }), 'password'],
  ];

  it.each(invalid)('rejects %s with 400 and stores nothing', async (_label, mutate, field) => {
    const before = await counts();
    const body = mutate(valid());
    const response = await request(server()).post('/auth/register').send(body).expect(400);
    expect(response.body.message).toBe('La solicitud no es válida.');
    expect(response.body.errors.map((issue: { path: string }) => issue.path)).toContain(field);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body.accessToken).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('rejects an empty body with 400', async () => {
    const before = await counts();
    await request(server()).post('/auth/register').send({}).expect(400);
    expect(await counts()).toEqual(before);
  });

  it('rejects a duplicate email with 409 and creates nothing', async () => {
    const body = valid();
    await request(server()).post('/auth/register').send(body).expect(201);
    const before = await counts();
    await request(server()).post('/auth/register').send(body).expect(409);
    expect(await counts()).toEqual(before);
  });

  describe('login', () => {
    it('signs in with valid credentials and refuses wrong ones', async () => {
      const body = valid();
      await request(server()).post('/auth/register').send(body).expect(201);

      const ok = await request(server())
        .post('/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);
      expect(ok.body.accessToken).toEqual(expect.any(String));

      const wrong = await request(server())
        .post('/auth/login')
        .send({ email: body.email, password: 'another-password-1' })
        .expect(401);
      expect(wrong.body.message).toBe('Invalid credentials');
      await request(server())
        .post('/auth/login')
        .send({ email: email(), password: 'valid-password-123' })
        .expect(401);
    });

    it.each([
      ['an invalid email', { email: 'not-an-email', password: 'whatever' }],
      ['a missing password', { email: 'someone@example.com' }],
      ['a missing email', { password: 'whatever' }],
      ['a password that is not a string', { email: 'someone@example.com', password: 1234 }],
    ])('rejects %s with 400 and creates no session', async (_label, body) => {
      const before = await counts();
      const response = await request(server()).post('/auth/login').send(body).expect(400);
      expect(response.body.message).toBe('La solicitud no es válida.');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await counts()).toEqual(before);
    });
  });
});
