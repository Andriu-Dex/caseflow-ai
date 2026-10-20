import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { trustProxySetting } from '../../common/trust-proxy';
import { AUTH_RATE_LIMIT_DEFAULTS, loadAuthRateLimitConfig } from './auth-rate-limit.config';
import { AuthRateLimiter } from './auth-rate-limiter';
import { accountKey, clientAddressKey } from './client-key';
import { MemoryRateLimitStore, type RateLimitStore } from './rate-limit-store';

function clock() {
  let now = 1_000_000;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const config = {
  ...AUTH_RATE_LIMIT_DEFAULTS,
  loginPerAccount: { max: 3, windowSeconds: 60 },
  loginPerAddress: { max: 8, windowSeconds: 60 },
  registerPerAddress: { max: 2, windowSeconds: 3600 },
  refreshPerAddress: { max: 2, windowSeconds: 60 },
};

const request = (ip: string) => ({ ip }) as unknown as Request;
function response() {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: {
      setHeader: (name: string, value: string) => (headers[name] = value),
    } as unknown as Response,
  };
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

describe('AuthRateLimiter', () => {
  function build(overrides: Partial<typeof config> = {}, store?: RateLimitStore) {
    const time = clock();
    const limiter = new AuthRateLimiter(
      { ...config, ...overrides },
      store ?? new MemoryRateLimitStore(time.now),
    );
    return { limiter, time };
  }

  it('lets sign-ins through until the limit for that address and account, then answers 429', async () => {
    const { limiter } = build();
    const { res, headers } = response();
    for (let i = 0; i < 3; i++)
      expect(
        await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
      ).toBe(200);
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
    ).toBe(429);
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(60);
  });

  it('says how long to wait, in Spanish, without the email or any secret', async () => {
    const { limiter } = build();
    const { res } = response();
    for (let i = 0; i < 3; i++)
      await limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com');
    const error = await limiter
      .consume('login', request('203.0.113.1'), res, 'ana@example.com')
      .catch((e: HttpException) => e);
    const body = (error as HttpException).getResponse() as { message: string; statusCode: number };
    expect(body.statusCode).toBe(429);
    expect(body.message).toMatch(
      /^Demasiados intentos\. Vuelva a intentarlo en \d+ (segundos?|minutos?)\.$/,
    );
    expect(JSON.stringify(body)).not.toContain('ana@example.com');
  });

  it('starts over after the window, so nobody stays blocked', async () => {
    const { limiter, time } = build();
    const { res } = response();
    for (let i = 0; i < 4; i++)
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com'));
    time.advance(60_000);
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
    ).toBe(200);
  });

  it('forgets the account count when the sign-in succeeds, so a typo does not add up', async () => {
    // The address limit is not what this is about: raise it out of the way.
    const { limiter } = build({ loginPerAddress: { max: 100, windowSeconds: 60 } });
    const { res } = response();
    for (let round = 0; round < 5; round++) {
      await limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com');
      await limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com');
      const attempt = await limiter.consume(
        'login',
        request('203.0.113.1'),
        res,
        'ana@example.com',
      );
      await attempt.succeeded();
    }
    // 15 attempts in 5 rounds, never more than 3 in a row without a success.
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
    ).toBe(200);
  });

  it('keeps accounts and addresses apart: one failing does not block another', async () => {
    const { limiter } = build();
    const { res } = response();
    for (let i = 0; i < 4; i++)
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com'));
    // Another account from the same address, and the same account from another address.
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'beto@example.com')),
    ).toBe(200);
    expect(
      await status(limiter.consume('login', request('203.0.113.2'), res, 'ana@example.com')),
    ).toBe(200);
  });

  it('treats the same email in another case as the same account', async () => {
    const { limiter } = build();
    const { res } = response();
    for (const email of ['Ana@Example.com', 'ana@example.com', 'ANA@EXAMPLE.COM'])
      await limiter.consume('login', request('203.0.113.1'), res, email);
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
    ).toBe(429);
  });

  it('limits every sign-in from one address whatever the account', async () => {
    const { limiter } = build();
    const { res } = response();
    for (let i = 0; i < 8; i++)
      expect(
        await status(limiter.consume('login', request('203.0.113.9'), res, `user${i}@example.com`)),
      ).toBe(200);
    expect(
      await status(limiter.consume('login', request('203.0.113.9'), res, 'user9@example.com')),
    ).toBe(429);
    expect(
      await status(limiter.consume('login', request('203.0.113.10'), res, 'user9@example.com')),
    ).toBe(200);
  });

  it('limits registration and refresh per address, each on its own counter', async () => {
    const { limiter } = build();
    const { res } = response();
    for (let i = 0; i < 2; i++) await limiter.consume('register', request('203.0.113.1'), res);
    expect(await status(limiter.consume('register', request('203.0.113.1'), res))).toBe(429);
    expect(await status(limiter.consume('refresh', request('203.0.113.1'), res))).toBe(200);
    await limiter.consume('refresh', request('203.0.113.1'), res);
    expect(await status(limiter.consume('refresh', request('203.0.113.1'), res))).toBe(429);
  });

  it('lets exactly the allowed number of concurrent attempts through', async () => {
    const { limiter } = build({ loginPerAccount: { max: 5, windowSeconds: 60 } });
    const { res } = response();
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
      ),
    );
    expect(results.filter((code) => code === 200)).toHaveLength(5);
    expect(results.filter((code) => code === 429)).toHaveLength(35);
  });

  it('counts the addresses of one IPv6 /64 together and an IPv4-mapped one as its IPv4', async () => {
    const { limiter } = build({ registerPerAddress: { max: 2, windowSeconds: 3600 } });
    const { res } = response();
    await limiter.consume('register', request('2001:db8:1:2::1'), res);
    await limiter.consume('register', request('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), res);
    expect(await status(limiter.consume('register', request('2001:db8:1:2::99'), res))).toBe(429);
    expect(await status(limiter.consume('register', request('2001:db8:1:3::1'), res))).toBe(200);

    await limiter.consume('register', request('198.51.100.4'), res);
    await limiter.consume('register', request('::ffff:198.51.100.4'), res);
    expect(await status(limiter.consume('register', request('198.51.100.4'), res))).toBe(429);
  });

  it('does nothing when it is switched off', async () => {
    const { limiter } = build({ enabled: false });
    const { res } = response();
    for (let i = 0; i < 50; i++)
      expect(
        await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
      ).toBe(200);
  });

  it('lets people in when the store fails rather than stopping sign-in', async () => {
    const broken: RateLimitStore = {
      hit: vi.fn().mockRejectedValue(new Error('boom')),
      reset: vi.fn(),
      close: vi.fn(),
    };
    const { limiter } = build({}, broken);
    const { res } = response();
    expect(
      await status(limiter.consume('login', request('203.0.113.1'), res, 'ana@example.com')),
    ).toBe(200);
  });

  it('does not use anything about the password or the email in the counter keys', async () => {
    const hits: string[] = [];
    const store: RateLimitStore = {
      hit: async (key) => {
        hits.push(key);
        return { count: 1, resetInMs: 1000 };
      },
      reset: async () => undefined,
      close: async () => undefined,
    };
    const { limiter } = build({}, store);
    await limiter.consume('login', request('203.0.113.1'), response().res, 'Ana@Example.com');
    expect(hits).toHaveLength(2);
    expect(hits.join(' ')).not.toMatch(/ana|example/i);
  });
});

describe('client address and account keys', () => {
  it('uses IPv4 as it is and unknown addresses together', () => {
    expect(clientAddressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddressKey(undefined)).toBe('unknown');
    expect(clientAddressKey('not an address')).toBe('unknown');
  });

  it('reduces IPv6 to its /64 and ignores a zone', () => {
    expect(clientAddressKey('2001:db8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
    expect(clientAddressKey('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:0db8:0001:0002::/64');
    expect(clientAddressKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
    expect(clientAddressKey('::1')).toBe('0000:0000:0000:0000::/64');
  });

  it('hashes accounts with a secret, ignoring case and spaces', () => {
    const key = accountKey('Ana@Example.com ', 'secret-one');
    expect(key).toBe(accountKey('ana@example.com', 'secret-one'));
    expect(key).not.toBe(accountKey('ana@example.com', 'secret-two'));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('configuration', () => {
  it('has documented defaults', () => {
    expect(loadAuthRateLimitConfig({})).toEqual(AUTH_RATE_LIMIT_DEFAULTS);
    expect(AUTH_RATE_LIMIT_DEFAULTS.loginPerAccount).toEqual({ max: 10, windowSeconds: 900 });
  });

  it('reads the limits from the environment and ignores values that make no sense', () => {
    const loaded = loadAuthRateLimitConfig({
      AUTH_LOGIN_ACCOUNT_MAX: '5',
      AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS: '120',
      AUTH_REGISTER_ADDRESS_MAX: '0',
      AUTH_REFRESH_ADDRESS_MAX: 'many',
      AUTH_LOGIN_ADDRESS_MAX: '-3',
    });
    expect(loaded.loginPerAccount).toEqual({ max: 5, windowSeconds: 120 });
    expect(loaded.registerPerAddress).toEqual(AUTH_RATE_LIMIT_DEFAULTS.registerPerAddress);
    expect(loaded.refreshPerAddress).toEqual(AUTH_RATE_LIMIT_DEFAULTS.refreshPerAddress);
    expect(loaded.loginPerAddress).toEqual(AUTH_RATE_LIMIT_DEFAULTS.loginPerAddress);
  });

  it('is switched off only by an explicit false', () => {
    expect(loadAuthRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: 'false' }).enabled).toBe(false);
    expect(loadAuthRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: '0' }).enabled).toBe(true);
    expect(loadAuthRateLimitConfig({}).enabled).toBe(true);
  });
});

describe('trustProxySetting', () => {
  it('trusts no proxy unless some are named', () => {
    expect(trustProxySetting(undefined)).toBeUndefined();
    expect(trustProxySetting('')).toBeUndefined();
    expect(trustProxySetting('false')).toBeUndefined();
  });

  it('accepts hops, presets and address lists, and refuses to trust everyone', () => {
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('loopback')).toBe('loopback');
    expect(trustProxySetting(' 10.0.0.0/8, 172.16.0.1 ')).toBe('10.0.0.0/8, 172.16.0.1');
    expect(() => trustProxySetting('true')).toThrow(/every X-Forwarded-For/);
  });
});
