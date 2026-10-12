import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizationUrl, parseTokens, PLAN_SCOPE, type Discovery } from './chatgpt-oauth.js';
import {
  ChatGPTConnection,
  encryptedFileStore,
  startBroker,
  type Encryption,
} from './chatgpt-connection.js';

// Stands in for the OS secure storage: reversible, but never plain text.
const encryption: Encryption = {
  encrypt: (plain) => Buffer.from(plain).reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString(),
};

const discovery: Discovery = {
  authorization_endpoint: 'https://auth.openai.com/oauth/authorize',
  token_endpoint: 'https://auth.openai.com/oauth/token',
  revocation_endpoint: 'https://auth.openai.com/oauth/revoke',
  jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
};

const discoveryResponse = () =>
  new Response(JSON.stringify({ issuer: 'https://auth.openai.com', ...discovery }));

function connectionWith(state: object, fetchMock = vi.fn()) {
  const file = join(mkdtempSync(join(tmpdir(), 'caseflow-chatgpt-')), 'chatgpt.bin');
  writeFileSync(file, encryption.encrypt(JSON.stringify(state)));
  const onProviderChange = vi.fn().mockResolvedValue(undefined);
  const connection = new ChatGPTConnection(
    encryptedFileStore(file, encryption),
    vi.fn(),
    onProviderChange,
    fetchMock as unknown as typeof fetch,
  );
  return { connection, file, onProviderChange, fetchMock };
}

const connected = (overrides: object = {}) => ({
  hostId: 'host-1',
  clientId: 'client-1',
  email: 'ana@example.com',
  tokens: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    scopes: [PLAN_SCOPE],
  },
  model: 'gpt-x',
  paused: false,
  preferred: true,
  ...overrides,
});

describe('ChatGPT sign-in (DEC-117)', () => {
  it('registers on the first sign-in and reuses the client afterwards', () => {
    const base = {
      discovery,
      hostId: 'host-1',
      redirectUri: 'http://127.0.0.1:50000/auth/callback',
      state: 's',
      nonce: 'n',
      verifier: 'v',
    };
    const first = new URL(authorizationUrl({ ...base, clientId: null }));
    expect(Object.fromEntries(first.searchParams)).toMatchObject({
      client_id: 'dynamic_agent_client',
      response_type: 'code',
      scope: `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`,
      resource: 'https://api.openai.com/v1',
      code_challenge_method: 'S256',
      // A bare saved id is sent as the URI OpenAI requires.
      ext_agent_host_id: 'urn:uuid:host-1',
      agent_name_hint: 'CASEFlow AI',
    });
    expect(first.searchParams.get('code_challenge')).not.toBe('v');
    const again = new URL(authorizationUrl({ ...base, clientId: 'client-1' }));
    expect(again.searchParams.get('client_id')).toBe('client-1');
    expect(again.searchParams.has('agent_name_hint')).toBe(false);
  });

  it('requires the plan permission to have been granted', () => {
    expect(() =>
      parseTokens({ access_token: 'a', refresh_token: 'r', scope: 'openid offline_access' }),
    ).toThrow('No se concedió el permiso');
    expect(
      parseTokens({ access_token: 'a', scope: PLAN_SCOPE, expires_in: 60 }, 'old-refresh'),
    ).toMatchObject({ accessToken: 'a', refreshToken: 'old-refresh' });
  });
});

describe('ChatGPTConnection', () => {
  it('keeps credentials encrypted on disk and the host id across sign-outs', async () => {
    const { connection, file, fetchMock } = connectionWith(connected());
    expect(readFileSync(file).toString()).not.toContain('access-1');
    fetchMock.mockResolvedValueOnce(discoveryResponse()).mockResolvedValueOnce(new Response(''));
    await expect(connection.disconnect()).resolves.toEqual({ revoked: true });
    // The refresh token is revoked before the local copy goes.
    const [, revokeInit] = fetchMock.mock.calls[1]!;
    expect(String(revokeInit.body)).toContain('token=refresh-1');
    const saved = JSON.parse(encryption.decrypt(readFileSync(file)));
    expect(saved).toMatchObject({ hostId: 'host-1', clientId: 'client-1', tokens: null });
  });

  it('refuses tokens while paused or disconnected, until the user resumes', async () => {
    const { connection } = connectionWith(connected({ paused: true }));
    await expect(connection.accessToken()).rejects.toMatchObject({ status: 409 });
    await connection.resume();
    await expect(connection.accessToken()).resolves.toBe('access-1');
    await connection.markRevoked();
    await expect(connection.accessToken()).rejects.toMatchObject({ status: 401 });
  });

  it('refreshes an expiring token, and treats a refused refresh as a revocation', async () => {
    const expiring = connected({
      tokens: { ...connected().tokens, expiresAt: Date.now() + 1_000 },
    });
    const ok = connectionWith(expiring);
    ok.fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-2', expires_in: 3600 })),
      );
    await expect(ok.connection.accessToken()).resolves.toBe('access-2');

    const revoked = connectionWith(expiring);
    revoked.fetchMock
      .mockResolvedValueOnce(discoveryResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      );
    await expect(revoked.connection.accessToken()).rejects.toMatchObject({ status: 401 });
    expect((await revoked.connection.status()).connected).toBe(false);
  });

  it('switches providers only on an explicit choice', async () => {
    const { connection, onProviderChange } = connectionWith(connected());
    expect(await connection.isActive()).toBe(true);
    await connection.prefer(false);
    expect(await connection.isActive()).toBe(false);
    expect(onProviderChange).toHaveBeenCalledOnce();
  });
});

describe('ChatGPT broker', () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  it('serves tokens only with its secret and pauses on a usage limit', async () => {
    const { connection } = connectionWith(connected());
    const broker = await startBroker(connection, 0);
    close = () => broker.server.close();
    const port = (broker.server.address() as { port: number }).port;
    const call = (method: string, path: string, secret = broker.secret) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'x-caseflow-broker-secret': secret },
      });
    expect((await call('GET', '/token', 'wrong-secret-wrong-secret-wrong-secr')).status).toBe(403);
    expect(await (await call('GET', '/token')).json()).toEqual({ accessToken: 'access-1' });
    expect((await call('POST', '/usage-limit')).status).toBe(204);
    expect((await call('GET', '/token')).status).toBe(409);
  });
});
