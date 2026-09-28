import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = join(__dirname, '..', '..', 'scripts', 'migrate-test-database.mjs');

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    // A neutral cwd guarantees dotenv cannot load the developer's real .env.
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

// The guards run before any connection is opened, so these tests need no database.
describe('scripts/migrate-test-database.mjs guards', () => {
  const dev = 'postgresql://u:p@localhost:5432/caseflow?schema=public';

  it('refuses to run when the test URL is the development database', () => {
    const result = run({ DATABASE_URL: dev, DATABASE_TEST_URL: dev });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not point to the development database');
  });

  it('recognises the same server and database despite credentials, host case and options', () => {
    const result = run({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/caseflow_test',
      DATABASE_TEST_URL: 'postgresql://x:y@LOCALHOST:5432/caseflow_test?schema=public',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not point to the development database');
  });

  it('refuses a target database whose name does not end with _test', () => {
    const result = run({
      DATABASE_URL: dev,
      DATABASE_TEST_URL: 'postgresql://u:p@localhost:5432/production',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must end with "_test"');
  });

  it('refuses to run without DATABASE_TEST_URL', () => {
    const result = run({ DATABASE_URL: dev });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_TEST_URL is not set');
  });
});
