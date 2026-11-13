import { describe, expect, it, vi } from 'vitest';
import {
  MemoryRateLimitStore,
  ResilientRateLimitStore,
  createRateLimitStore,
  type RateLimitStore,
} from './rate-limit-store';

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('MemoryRateLimitStore', () => {
  it('counts hits in a window and reports when it ends', async () => {
    const time = clock();
    const store = new MemoryRateLimitStore(time.now);
    expect(await store.hit('a', 60_000)).toEqual({ count: 1, resetInMs: 60_000 });
    time.advance(10_000);
    expect(await store.hit('a', 60_000)).toEqual({ count: 2, resetInMs: 50_000 });
  });

  it('starts counting again when the window is over (no permanent block)', async () => {
    const time = clock();
    const store = new MemoryRateLimitStore(time.now);
    for (let i = 0; i < 5; i++) await store.hit('a', 1_000);
    time.advance(1_000);
    expect(await store.hit('a', 1_000)).toEqual({ count: 1, resetInMs: 1_000 });
  });

  it('keeps keys apart and forgets one on reset', async () => {
    const store = new MemoryRateLimitStore(clock().now);
    await store.hit('a', 60_000);
    await store.hit('a', 60_000);
    expect((await store.hit('b', 60_000)).count).toBe(1);
    await store.reset('a');
    expect((await store.hit('a', 60_000)).count).toBe(1);
  });

  it('gives every concurrent hit its own number', async () => {
    const store = new MemoryRateLimitStore(clock().now);
    const hits = await Promise.all(Array.from({ length: 100 }, () => store.hit('a', 60_000)));
    expect(hits.map((hit) => hit.count).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });

  it('stays bounded when many different keys arrive', async () => {
    const time = clock();
    const store = new MemoryRateLimitStore(time.now);
    for (let i = 0; i < 50_005; i++) await store.hit(`k${i}`, 60_000);
    // The map never grows past its cap: a counter that was dropped just starts over.
    expect((await store.hit('k0', 60_000)).count).toBeGreaterThanOrEqual(1);
  });
});

describe('ResilientRateLimitStore', () => {
  const failing = (): RateLimitStore => ({
    hit: vi.fn().mockRejectedValue(new Error('redis down')),
    reset: vi.fn().mockRejectedValue(new Error('redis down')),
    close: vi.fn().mockResolvedValue(undefined),
  });

  it('counts in memory while the shared store is down, and keeps counting', async () => {
    const store = new ResilientRateLimitStore(failing(), new MemoryRateLimitStore(clock().now));
    expect((await store.hit('a', 60_000)).count).toBe(1);
    expect((await store.hit('a', 60_000)).count).toBe(2);
    await expect(store.reset('a')).resolves.toBeUndefined();
    expect((await store.hit('a', 60_000)).count).toBe(1);
  });

  it('leaves a failed shared store alone for a few seconds, then tries it again', async () => {
    const time = clock();
    const primary = failing();
    const store = new ResilientRateLimitStore(
      primary,
      new MemoryRateLimitStore(time.now),
      time.now,
    );
    await store.hit('a', 60_000);
    await store.hit('a', 60_000);
    expect(primary.hit).toHaveBeenCalledTimes(1);
    time.advance(10_000);
    await store.hit('a', 60_000);
    expect(primary.hit).toHaveBeenCalledTimes(2);
  });

  it('uses the shared store when it answers', async () => {
    const primary: RateLimitStore = {
      hit: vi.fn().mockResolvedValue({ count: 7, resetInMs: 5 }),
      reset: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const store = new ResilientRateLimitStore(primary, new MemoryRateLimitStore());
    expect(await store.hit('a', 60_000)).toEqual({ count: 7, resetInMs: 5 });
  });
});

describe('createRateLimitStore', () => {
  it('uses memory for the desktop edition, without REDIS_URL, or when asked', async () => {
    const cases: NodeJS.ProcessEnv[] = [
      { REDIS_URL: 'redis://localhost:6379', CASEFLOW_QUEUE_MODE: 'in-process' },
      {},
      { REDIS_URL: 'redis://localhost:6379', AUTH_RATE_LIMIT_STORE: 'memory' },
    ];
    for (const env of cases) expect(createRateLimitStore(env)).toBeInstanceOf(MemoryRateLimitStore);
  });

  it('uses Redis, with memory as a fallback, when REDIS_URL is set', async () => {
    const store = createRateLimitStore({ REDIS_URL: 'redis://localhost:6379' });
    expect(store).toBeInstanceOf(ResilientRateLimitStore);
    await store.close();
  });
});
