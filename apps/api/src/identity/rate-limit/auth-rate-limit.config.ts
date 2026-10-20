export interface AuthRateLimit {
  max: number;
  windowSeconds: number;
}

export interface AuthRateLimitConfig {
  enabled: boolean;
  // Attempts by one address at one account before the next one is refused. A
  // successful sign-in starts the account's count again.
  loginPerAccount: AuthRateLimit;
  // Every sign-in attempt from one address, whatever the account.
  loginPerAddress: AuthRateLimit;
  registerPerAddress: AuthRateLimit;
  refreshPerAddress: AuthRateLimit;
}

// Defaults (docs/decisions/ADR-011-limitacion-de-intentos-de-autenticacion.md).
// The address limits are high on purpose: a class or a lab shares one public
// address, and forty people signing in at the start of a session, some of them
// mistyping, must not lock each other out.
export const AUTH_RATE_LIMIT_DEFAULTS: AuthRateLimitConfig = {
  enabled: true,
  loginPerAccount: { max: 10, windowSeconds: 15 * 60 },
  loginPerAddress: { max: 300, windowSeconds: 15 * 60 },
  registerPerAddress: { max: 50, windowSeconds: 60 * 60 },
  refreshPerAddress: { max: 120, windowSeconds: 60 },
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  // A typo must not switch the protection off (0) or make it absurd: ignore it.
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : fallback;
}

function limit(env: NodeJS.ProcessEnv, prefix: string, fallback: AuthRateLimit): AuthRateLimit {
  return {
    max: positiveInteger(env[`${prefix}_MAX`], fallback.max),
    windowSeconds: positiveInteger(env[`${prefix}_WINDOW_SECONDS`], fallback.windowSeconds),
  };
}

// AUTH_RATE_LIMIT_ENABLED=false is the only way to turn it off.
export function loadAuthRateLimitConfig(env: NodeJS.ProcessEnv = process.env): AuthRateLimitConfig {
  const defaults = AUTH_RATE_LIMIT_DEFAULTS;
  return {
    enabled: env.AUTH_RATE_LIMIT_ENABLED?.trim().toLowerCase() !== 'false',
    loginPerAccount: limit(env, 'AUTH_LOGIN_ACCOUNT', defaults.loginPerAccount),
    loginPerAddress: limit(env, 'AUTH_LOGIN_ADDRESS', defaults.loginPerAddress),
    registerPerAddress: limit(env, 'AUTH_REGISTER_ADDRESS', defaults.registerPerAddress),
    refreshPerAddress: limit(env, 'AUTH_REFRESH_ADDRESS', defaults.refreshPerAddress),
  };
}
