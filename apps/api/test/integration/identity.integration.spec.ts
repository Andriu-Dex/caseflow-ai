import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, type TestContext } from './support/test-app';

function refreshCookie(response: {
  headers: Record<string, string[] | string | undefined>;
}): string {
  const cookie = response.headers['set-cookie'];
  const header = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!header) throw new Error('The auth response did not set a refresh cookie.');
  const value = header.split(';', 1)[0];
  if (!value) throw new Error('The refresh cookie header is empty.');
  return value;
}

describe('Identity and workspace onboarding', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates an owned workspace and rotates the HttpOnly refresh cookie', async () => {
    const email = `register-${randomUUID()}@example.com`;
    const registered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'valid-password-123', displayName: 'New user' })
      .expect(201);

    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');
    const initialCookie = refreshCookie(registered);
    const userId = registered.body.user.id as string;
    const membership = await ctx.prisma.workspaceMembership.findFirst({
      where: { userId, role: 'OWNER' },
      include: { workspace: true },
    });
    expect(membership?.workspace.name).toBe('New user - Espacio de trabajo');

    const refreshed = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', initialCookie)
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    const rotatedCookie = refreshCookie(refreshed);
    expect(rotatedCookie).not.toBe(initialCookie);

    const workspaces = await request(ctx.app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
    expect(workspaces.body.items).toHaveLength(1);
    expect(workspaces.body.items[0].id).toBe(membership?.workspaceId);

    await request(ctx.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', rotatedCookie)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });
});
