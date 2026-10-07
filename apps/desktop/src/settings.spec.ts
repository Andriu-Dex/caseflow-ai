import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTS, apiEnvironment, isAppUrl, isExternalHttpsUrl, parseEnvFile } from './settings.js';

describe('desktop settings (DEC-120)', () => {
  it('keeps the window on the app origin only', () => {
    expect(isAppUrl('http://127.0.0.1:4800/requirements')).toBe(true);
    for (const url of [
      'http://127.0.0.1:4800.evil.example/login',
      'http://127.0.0.1:48000/',
      'http://localhost:4800/',
      'https://127.0.0.1:4800/',
      'not a url',
    ])
      expect(isAppUrl(url)).toBe(false);
    expect(isExternalHttpsUrl('https://docs.docker.com/')).toBe(true);
    expect(isExternalHttpsUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
  });

  it('reads the user settings file, ignoring comments and quotes', () => {
    expect(
      parseEnvFile('# IA\nAI_PROVIDER=openai_compatible\nAI_MODEL="gpt-x"\n\ninvalid line\n'),
    ).toEqual({ AI_PROVIDER: 'openai_compatible', AI_MODEL: 'gpt-x' });
  });

  it('lets the user configure providers, never the database, queue or secrets', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'caseflow-settings-'));
    writeFileSync(
      join(dataDir, 'caseflow.env'),
      'AI_PROVIDER=openai_compatible\nKROKI_BASE_URL=http://localhost:8000\nDATABASE_URL=postgresql://elsewhere\nJWT_SECRET=weak\nCASEFLOW_QUEUE_MODE=redis\n',
    );
    const env = await apiEnvironment(
      dataDir,
      'postgresql://postgres:postgres@127.0.0.1:4802/postgres',
    );
    expect(env).toMatchObject({
      AI_PROVIDER: 'openai_compatible',
      KROKI_BASE_URL: 'http://localhost:8000',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:4802/postgres',
      CASEFLOW_QUEUE_MODE: 'in-process',
      API_PORT: String(PORTS.api),
      STORAGE_DIR: join(dataDir, 'objects'),
    });
    expect(env.JWT_SECRET).not.toBe('weak');
    expect(env.JWT_SECRET!.length).toBeGreaterThanOrEqual(32);
    // Generated once per machine and kept.
    expect((await apiEnvironment(dataDir, 'x')).JWT_SECRET).toBe(env.JWT_SECRET);
  });
});
