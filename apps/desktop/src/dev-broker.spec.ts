import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { developmentBrokerSettings, developmentStore } from './dev-broker.js';

const valid = {
  AI_PROVIDER: 'chatgpt',
  CHATGPT_BROKER_URL: 'http://127.0.0.1:47833',
  CHATGPT_BROKER_SECRET: 'x'.repeat(32),
};

describe('development ChatGPT broker (DEC-128)', () => {
  it('keeps credentials in memory and only what identifies the machine on disk', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'caseflow-dev-broker-')), 'chatgpt-dev.json');
    const store = developmentStore(file);
    await store.write({
      hostId: 'host-1',
      clientId: 'client-1',
      email: 'ana@example.com',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: 0, scopes: [] },
      model: 'gpt-x',
      paused: false,
      preferred: true,
    });
    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain('access-1');
    expect(onDisk).not.toContain('refresh-1');
    expect(onDisk).not.toContain('ana@example.com');
    expect(await store.read()).toMatchObject({ tokens: { accessToken: 'access-1' } });

    // A new process remembers the machine and the app, not the session.
    expect(await developmentStore(file).read()).toEqual({
      hostId: 'host-1',
      clientId: 'client-1',
      model: 'gpt-x',
      email: null,
      tokens: null,
      paused: false,
      preferred: true,
    });
  });

  it('starts only for the ChatGPT provider, outside production, on this machine', () => {
    expect(developmentBrokerSettings(valid)).toEqual({ port: 47833, secret: 'x'.repeat(32) });
    expect(developmentBrokerSettings({ ...valid, AI_PROVIDER: 'fallback' })).toHaveProperty('skip');
    expect(developmentBrokerSettings({ ...valid, NODE_ENV: 'production' })).toHaveProperty('error');
    expect(
      developmentBrokerSettings({ ...valid, CHATGPT_BROKER_URL: 'http://0.0.0.0:47833' }),
    ).toHaveProperty('error');
    expect(developmentBrokerSettings({ ...valid, CHATGPT_BROKER_SECRET: 'short' })).toHaveProperty(
      'error',
    );
  });
});
