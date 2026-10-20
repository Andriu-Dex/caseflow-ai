import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface RateLimitHit {
  // Hits counted in the current window, this one included.
  count: number;
  // Milliseconds until the window ends and the counter starts again.
  resetInMs: number;
}

// Counters in fixed windows. Every window ends by itself: nothing here can block
// a key for good.
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  reset(key: string): Promise<void>;
  close(): Promise<void>;
}

const MAX_MEMORY_KEYS = 50_000;
const COOL_OFF_MS = 10_000;

// One process only. The desktop edition (a single local API) and tests use it;
// a deployment with several API instances needs the Redis store to share counts.
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; endsAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.endsAt <= now) {
      this.evictExpired(now);
      window = { count: 0, endsAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return { count: window.count, resetInMs: window.endsAt - now };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }

  async close(): Promise<void> {
    this.windows.clear();
  }

  // Keeps the map bounded when many different keys arrive (an address scan).
  private evictExpired(now: number): void {
    if (this.windows.size < MAX_MEMORY_KEYS) return;
    for (const [key, window] of this.windows) if (window.endsAt <= now) this.windows.delete(key);
    // Still full of live windows: drop the oldest ones rather than grow without bound.
    for (const key of this.windows.keys()) {
      if (this.windows.size < MAX_MEMORY_KEYS) break;
      this.windows.delete(key);
    }
  }
}

// INCR and the expiry run in one script, so two API instances never see a counter
// without its expiry (that would be a permanent block), and a counter that was
// left without one is repaired the next time it is hit.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: Redis;

  constructor(
    url: string,
    private readonly prefix = 'caseflow:ratelimit:',
  ) {
    this.redis = new Redis(url, {
      // A slow or down Redis must not hold a sign-in request for long: a command gives
      // up quickly and the caller falls back.
      maxRetriesPerRequest: 1,
      commandTimeout: 1_500,
      connectTimeout: 2_000,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });
    // Without a listener an unreachable Redis would crash the process.
    this.redis.on('error', () => undefined);
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const [count, ttl] = (await this.redis.eval(HIT_SCRIPT, 1, this.prefix + key, windowMs)) as [
      number,
      number,
    ];
    return { count, resetInMs: ttl };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}

// Redis down must not take sign-in down with it. Until it answers again this
// instance counts on its own (weaker across instances, but still a limit).
export class ResilientRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger('RateLimit');
  private lastWarningAt = 0;
  private unhealthyUntil = 0;

  constructor(
    private readonly primary: RateLimitStore,
    private readonly fallback: RateLimitStore,
    private readonly now: () => number = Date.now,
  ) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    if (this.now() < this.unhealthyUntil) return this.fallback.hit(key, windowMs);
    try {
      return await this.primary.hit(key, windowMs);
    } catch (error) {
      this.failed(error);
      return this.fallback.hit(key, windowMs);
    }
  }

  async reset(key: string): Promise<void> {
    await this.fallback.reset(key);
    if (this.now() < this.unhealthyUntil) return;
    try {
      await this.primary.reset(key);
    } catch (error) {
      this.failed(error);
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.primary.close(), this.fallback.close()]);
  }

  // After a failure the shared store is left alone for a few seconds, so a Redis that is
  // down does not add its timeout to every sign-in. One log line a minute at most, and
  // never the key (it names an account).
  private failed(error: unknown): void {
    const now = this.now();
    this.unhealthyUntil = now + COOL_OFF_MS;
    if (now - this.lastWarningAt < 60_000) return;
    this.lastWarningAt = now;
    this.logger.warn(
      `The shared rate-limit store is unavailable; counting in memory on this instance (${
        error instanceof Error ? error.message : 'unknown error'
      }).`,
    );
  }
}

// AUTH_RATE_LIMIT_STORE: `memory`, `redis`, or `auto` (the default): Redis when
// REDIS_URL is set and this is not the desktop edition, memory otherwise.
export function createRateLimitStore(env: NodeJS.ProcessEnv = process.env): RateLimitStore {
  const mode = env.AUTH_RATE_LIMIT_STORE ?? 'auto';
  const url = env.REDIS_URL;
  const useRedis =
    mode === 'redis' || (mode === 'auto' && env.CASEFLOW_QUEUE_MODE !== 'in-process');
  if (!useRedis || !url) {
    if (mode === 'redis')
      new Logger('RateLimit').warn('AUTH_RATE_LIMIT_STORE=redis without REDIS_URL: using memory.');
    return new MemoryRateLimitStore();
  }
  return new ResilientRateLimitStore(new RedisRateLimitStore(url), new MemoryRateLimitStore());
}
