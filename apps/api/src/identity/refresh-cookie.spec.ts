import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  refreshCookieOptions,
  setRefreshCookie,
} from './refresh-cookie';

describe('refresh cookie', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const response = () =>
    ({ cookie: vi.fn(), clearCookie: vi.fn() }) as unknown as Response & {
      cookie: ReturnType<typeof vi.fn>;
      clearCookie: ReturnType<typeof vi.fn>;
    };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('is HttpOnly, SameSite=Lax and scoped to /auth', () => {
    process.env.NODE_ENV = 'development';
    expect(refreshCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth',
    });
  });

  it('is Secure only in production', () => {
    process.env.NODE_ENV = 'production';
    expect(refreshCookieOptions().secure).toBe(true);
  });

  it('is cleared with the same name and the same identifying attributes it is set with', () => {
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      const res = response();
      setRefreshCookie(res, 'token');
      clearRefreshCookie(res);

      expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'token', refreshCookieOptions());
      const [name, options] = res.clearCookie.mock.calls[0] as [string, Record<string, unknown>];
      expect(name).toBe(REFRESH_COOKIE_NAME);
      // Path (and Domain, when there is one) are what a browser matches on.
      expect(options.path).toBe('/auth');
      expect(options).toEqual(refreshCookieOptions());
    }
  });
});
