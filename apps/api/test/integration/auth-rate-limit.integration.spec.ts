import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../../src/database/database.module';
import { IdentityModule } from '../../src/identity/identity.module';
import { AUTH_RATE_LIMIT_DEFAULTS } from '../../src/identity/rate-limit/auth-rate-limit.config';
import {
  AUTH_RATE_LIMIT_CONFIG,
  RATE_LIMIT_STORE,
} from '../../src/identity/rate-limit/auth-rate-limiter';
import { MemoryRateLimitStore } from '../../src/identity/rate-limit/rate-limit-store';
import { getTestConnectionString } from './support/test-database';

// H2 (APE4): repeated authentication attempts are limited per address and
// account, answer 429 with Retry-After, recover when the window ends, and cannot
// be sidestepped by writing an X-Forwarded-For header.
const LIMITS = {
  ...AUTH_RATE_LIMIT_DEFAULTS,
  loginPerAccount: { max: 3, windowSeconds: 60 },
  loginPerAddress: { max: 12, windowSeconds: 60 },
  registerPerAddress: { max: 4, windowSeconds: 3600 },
  refreshPerAddress: { max: 3, windowSeconds: 60 },
};
const PASSWORD = 'valid-password-123';

async function createApp(trustProxy?: string) {
  let now = 1_000_000;
  const store = new MemoryRateLimitStore(() => now);
  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule.forRoot({ connectionString: getTestConnectionString() }),
      IdentityModule,
    ],
  })
    .overrideProvider(AUTH_RATE_LIMIT_CONFIG)
    .useValue(LIMITS)
    .overrideProvider(RATE_LIMIT_STORE)
    .useValue(store)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use(cookieParser());
  await app.init();
  return { app, advance: (ms: number) => (now += ms) };
}

describe('Authentication rate limiting', () => {
  let app: INestApplication;
  let advance: (ms: number) => number;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, advance } = await createApp());
  });
  afterAll(async () => {
    await app?.close();
  });

  const email = () => `rate-${randomUUID()}@example.com`;
  async function account() {
    const credentials = { email: email(), password: PASSWORD, displayName: 'Rate Prueba' };
    // Registration has its own limit: a fresh time slot for every account created here.
    advance(3_600_000);
    await request(server()).post('/auth/register').send(credentials).expect(201);
    return credentials;
  }
  const wrong = (credentials: { email: string }) =>
    request(server())
      .post('/auth/login')
      .send({ email: credentials.email, password: 'wrong-password-1' });
  const right = (credentials: { email: string; password: string }) =>
    request(server())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password });

  it('signs in normally when the limit has not been reached', async () => {
    const credentials = await account();
    const response = await right(credentials).expect(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('answers 401 for wrong credentials while under the limit, then 429 with Retry-After', async () => {
    const credentials = await account();
    for (let i = 0; i < 3; i++) await wrong(credentials).expect(401);

    const limited = await wrong(credentials).expect(429);
    expect(limited.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
    expect(limited.body.message).toMatch(/^Demasiados intentos\. Vuelva a intentarlo en /);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(limited.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(limited.body)).not.toContain(credentials.email);
    // While it lasts, even the right password waits: the answer must not tell a guess from the truth.
    await right(credentials).expect(429);
  });

  it('lets requests through again once the window has passed', async () => {
    const credentials = await account();
    for (let i = 0; i < 4; i++) await wrong(credentials);
    await right(credentials).expect(429);

    advance(60_000);
    await right(credentials).expect(200);
  });

  it('does not add up typos that were followed by a successful sign-in', async () => {
    const credentials = await account();
    for (let round = 0; round < 3; round++) {
      await wrong(credentials).expect(401);
      await wrong(credentials).expect(401);
      await right(credentials).expect(200);
    }
    await wrong(credentials).expect(401);
  });

  it('keeps accounts apart: failing on one does not block another from the same address', async () => {
    const [victim, other] = [await account(), await account()];
    for (let i = 0; i < 4; i++) await wrong(victim);
    await right(victim).expect(429);
    await right(other).expect(200);
  });

  it('lets exactly the allowed number of concurrent attempts through', async () => {
    const credentials = await account();
    const statuses = await Promise.all(
      Array.from({ length: 24 }, () => wrong(credentials).then((response) => response.status)),
    );
    expect(statuses.filter((code) => code === 401)).toHaveLength(3);
    expect(statuses.filter((code) => code === 429)).toHaveLength(21);
  });

  it('limits registrations and refreshes per address', async () => {
    advance(3_600_000);
    for (let i = 0; i < 4; i++)
      await request(server())
        .post('/auth/register')
        .send({ email: email(), password: PASSWORD, displayName: 'Rate Prueba' })
        .expect(201);
    const limited = await request(server())
      .post('/auth/register')
      .send({ email: email(), password: PASSWORD, displayName: 'Rate Prueba' })
      .expect(429);
    expect(limited.headers['retry-after']).toBeDefined();

    advance(60_000);
    for (let i = 0; i < 3; i++) await request(server()).post('/auth/refresh').expect(401);
    await request(server()).post('/auth/refresh').expect(429);
  });

  it('does not let a client escape the limit by writing X-Forwarded-For', async () => {
    const credentials = await account();
    const forged = (n: number) =>
      request(server())
        .post('/auth/login')
        .set('X-Forwarded-For', `198.51.100.${n}`)
        .send({ email: credentials.email, password: 'wrong-password-1' });
    for (let i = 0; i < 3; i++) await forged(i + 1).expect(401);
    // Every attempt names another address, and the limit still applies.
    await forged(50).expect(429);
    await forged(51).expect(429);
  });
});

describe('Authentication rate limiting behind a trusted proxy', () => {
  const credentials = () => ({
    email: `rate-${randomUUID()}@example.com`,
    password: PASSWORD,
    displayName: 'Rate Prueba',
  });
  const attempt = (app: INestApplication, email: string, client: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', client)
      .send({ email, password: 'wrong-password-1' });

  it('counts the client the proxy reports, so users behind one proxy do not share a limit', async () => {
    const { app } = await createApp('loopback');
    try {
      const user = credentials();
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('X-Forwarded-For', '198.51.100.1')
        .send(user)
        .expect(201);
      for (let i = 0; i < 3; i++) await attempt(app, user.email, '198.51.100.10').expect(401);
      await attempt(app, user.email, '198.51.100.10').expect(429);
      // The same account from another client behind the same proxy is counted on its own.
      await attempt(app, user.email, '198.51.100.11').expect(401);
    } finally {
      await app.close();
    }
  });

  it('ignores X-Forwarded-For from a connection that is not a trusted proxy', async () => {
    const { app } = await createApp('10.0.0.0/8');
    try {
      const user = credentials();
      await request(app.getHttpServer()).post('/auth/register').send(user).expect(201);
      for (let i = 0; i < 3; i++)
        await attempt(app, user.email, `198.51.100.${20 + i}`).expect(401);
      await attempt(app, user.email, '198.51.100.99').expect(429);
    } finally {
      await app.close();
    }
  });
});
