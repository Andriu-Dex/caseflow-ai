import { randomUUID } from 'crypto';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMIT_DEFAULTS } from '../../src/identity/rate-limit/auth-rate-limit.config';
import { AuthRateLimiter } from '../../src/identity/rate-limit/auth-rate-limiter';
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  ResilientRateLimitStore,
} from '../../src/identity/rate-limit/rate-limit-store';

// The Redis store against a real Redis (the one CI and `pnpm infra:up` provide).
// Keys carry a prefix unique to the run, so nothing here touches other data.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('RedisRateLimitStore', () => {
  const prefix = `caseflow:test:${randomUUID()}:`;
  let inspector: Redis;
  const stores: Array<{ close(): Promise<void> }> = [];
  const open = () => {
    const store = new RedisRateLimitStore(REDIS_URL, prefix);
    stores.push(store);
    return store;
  };

  beforeAll(async () => {
    inspector = new Redis(REDIS_URL);
    await inspector.ping();
  });

  afterAll(async () => {
    const keys = await inspector.keys(`${prefix}*`);
    if (keys.length) await inspector.del(...keys);
    inspector.disconnect();
    await Promise.all(stores.map((store) => store.close()));
  });

  it('counts hits and sets the expiry of the window', async () => {
    const store = open();
    const key = `count-${randomUUID()}`;
    const first = await store.hit(key, 60_000);
    const second = await store.hit(key, 60_000);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetInMs).toBeGreaterThan(0);
    expect(second.resetInMs).toBeLessThanOrEqual(60_000);
    expect(await inspector.pttl(prefix + key)).toBeGreaterThan(0);
  });

  it('gives every concurrent hit its own number', async () => {
    const store = open();
    const key = `concurrent-${randomUUID()}`;
    const hits = await Promise.all(Array.from({ length: 60 }, () => store.hit(key, 60_000)));
    expect(hits.map((hit) => hit.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 1),
    );
  });

  it('starts a new window when the old one expires', async () => {
    const store = open();
    const key = `expiry-${randomUUID()}`;
    await store.hit(key, 400);
    await store.hit(key, 400);
    // Redis removes the key on its own; poll instead of guessing a delay.
    const deadline = Date.now() + 5_000;
    let count = 2;
    while (count > 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      count = (await store.hit(key, 400)).count;
    }
    expect(count).toBe(1);
  });

  it('repairs a counter that was left without an expiry, so it can never block for good', async () => {
    const store = open();
    const key = `no-expiry-${randomUUID()}`;
    await inspector.set(prefix + key, '41');
    expect(await inspector.pttl(prefix + key)).toBe(-1);
    const hit = await store.hit(key, 30_000);
    expect(hit.count).toBe(42);
    expect(await inspector.pttl(prefix + key)).toBeGreaterThan(0);
  });

  it('forgets a key on reset and keeps other keys apart', async () => {
    const store = open();
    const [a, b] = [`a-${randomUUID()}`, `b-${randomUUID()}`];
    await store.hit(a, 60_000);
    await store.hit(a, 60_000);
    expect((await store.hit(b, 60_000)).count).toBe(1);
    await store.reset(a);
    expect((await store.hit(a, 60_000)).count).toBe(1);
  });

  it('is shared by several API instances: together they honour one limit', async () => {
    const config = { ...AUTH_RATE_LIMIT_DEFAULTS, loginPerAccount: { max: 6, windowSeconds: 60 } };
    const instances = [0, 1, 2].map(() => new AuthRateLimiter(config, open()));
    const res = { setHeader: () => undefined } as unknown as Response;
    const req = { ip: '203.0.113.50' } as unknown as Request;
    const email = `shared-${randomUUID()}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        instances[i % 3]!.consume('login', req, res, email).then(
          () => 200,
          (error: unknown) => (error instanceof HttpException ? error.getStatus() : 500),
        ),
      ),
    );
    expect(results.filter((code) => code === 200)).toHaveLength(6);
    expect(results.filter((code) => code === 429)).toHaveLength(24);
  });

  it('keeps counting in memory when Redis cannot be reached', async () => {
    const unreachable = new RedisRateLimitStore('redis://127.0.0.1:1', prefix);
    stores.push(unreachable);
    const store = new ResilientRateLimitStore(unreachable, new MemoryRateLimitStore());
    expect((await store.hit('x', 60_000)).count).toBe(1);
    expect((await store.hit('x', 60_000)).count).toBe(2);
  });
});
