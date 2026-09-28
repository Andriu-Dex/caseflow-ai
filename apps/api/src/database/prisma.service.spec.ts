import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const original = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it('fails fast with a clear message when no connection string is configured', () => {
    expect(() => new PrismaService({})).toThrow('DATABASE_URL is not set');
  });

  it('builds the client from an explicit connection string without connecting', () => {
    expect(
      () => new PrismaService({ connectionString: 'postgresql://user:pass@localhost:1/none' }),
    ).not.toThrow();
  });

  it('falls back to DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:1/none';

    expect(() => new PrismaService({})).not.toThrow();
  });
});
