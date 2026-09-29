import { afterEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  vi.resetModules();
});

describe('JWT signing secret configuration', () => {
  it('fails closed in production when the secret is missing or a template placeholder', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    await expect(import('./jwt-secret')).rejects.toThrow('JWT_SECRET must be configured');

    vi.resetModules();
    process.env.JWT_SECRET = 'replace-with-at-least-32-random-characters';
    await expect(import('./jwt-secret')).rejects.toThrow('JWT_SECRET must be configured');
  });

  it('accepts a configured production secret of sufficient length', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'secure-production-secret-with-32-characters';
    const module = await import('./jwt-secret');
    expect(module.JWT_SECRET).toBe(process.env.JWT_SECRET);
  });

  it('uses a random process-local key in non-production when configuration is absent', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const module = await import('./jwt-secret');
    expect(module.JWT_SECRET).toMatch(/^[a-f0-9]{96}$/);
  });
});
