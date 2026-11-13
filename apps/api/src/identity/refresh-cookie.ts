import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

// One definition for setting and clearing the cookie. A browser matches a cookie
// to delete by name, Domain and Path, so clearing it with other values leaves the
// original in place. No Domain is set: the cookie belongs to the API host only.
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}
