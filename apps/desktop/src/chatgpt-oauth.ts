import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// "Sign in with ChatGPT" with plan usage (DEC-117), following OpenAI's
// open-source devkit: OIDC discovery, PKCE, dynamic client registration for
// a user-defined agent, and a loopback callback. No client secret exists.

export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const CALLBACK_PATH = '/auth/callback';
const APP_NAME = 'CASEFlow AI';

export interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  jwks_uri: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  // Epoch milliseconds.
  expiresAt: number;
  scopes: string[];
}

export class ChatGPTSignInError extends Error {}

const random = () => randomBytes(32).toString('base64url');

export async function discover(fetchImpl: typeof fetch = fetch): Promise<Discovery> {
  const response = await fetchImpl(`${ISSUER}/.well-known/openid-configuration`);
  const data = (await response.json()) as Record<string, unknown>;
  // Every endpoint must belong to OpenAI's issuer.
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'])
    if (typeof data[key] !== 'string' || new URL(data[key] as string).origin !== ISSUER)
      throw new ChatGPTSignInError('No se pudo verificar la configuración de inicio de sesión.');
  if (data.issuer !== ISSUER)
    throw new ChatGPTSignInError('No se pudo verificar la configuración de inicio de sesión.');
  return data as unknown as Discovery;
}

// OpenAI expects the host id as a URI: "urn:uuid:" + a UUIDv4. Hosts saved
// before this was known hold a bare UUID, so they are prefixed here.
export const hostIdUri = (hostId: string) =>
  hostId.startsWith('urn:') ? hostId : `urn:uuid:${hostId}`;

export function authorizationUrl(input: {
  discovery: Discovery;
  clientId: string | null;
  hostId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  verifier: string;
}): string {
  const url = new URL(input.discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    // First sign-in registers the app for this user; later ones reuse it.
    client_id: input.clientId ?? 'dynamic_agent_client',
    response_type: 'code',
    redirect_uri: input.redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state: input.state,
    nonce: input.nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(input.verifier).digest('base64url'),
    ext_agent_host_id: hostIdUri(input.hostId),
  }).toString();
  if (!input.clientId) url.searchParams.set('agent_name_hint', APP_NAME);
  return url.toString();
}

// Waits for the single redirect back to 127.0.0.1, validating state.
async function callbackListener(state: string) {
  let resolveResult!: (value: { code: string; clientId: string }) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<{ code: string; clientId: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== CALLBACK_PATH) {
      response.writeHead(404).end();
      return;
    }
    const returned = Buffer.from(url.searchParams.get('state') ?? '');
    const expected = Buffer.from(state);
    const page = (message: string) =>
      response
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(`<p style="font-family:sans-serif">${message} Puede volver a CASEFlow AI.</p>`);
    if (returned.length !== expected.length || !timingSafeEqual(returned, expected)) {
      page('La respuesta de inicio de sesión no es válida.');
      rejectResult(new ChatGPTSignInError('La respuesta de inicio de sesión no es válida.'));
      return;
    }
    const code = url.searchParams.get('code');
    const clientId = url.searchParams.get('client_id');
    if (url.searchParams.has('error') || !code || !clientId) {
      page('No se completó el inicio de sesión.');
      rejectResult(new ChatGPTSignInError('No se completó el inicio de sesión con ChatGPT.'));
      return;
    }
    page('Conexión completada.');
    resolveResult({ code, clientId });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    result,
    close: () => server.close(),
  };
}

export function parseTokens(data: Record<string, unknown>, previousRefresh?: string): Tokens {
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : [];
  const refreshToken =
    typeof data.refresh_token === 'string' ? data.refresh_token : previousRefresh;
  if (typeof data.access_token !== 'string' || !refreshToken)
    throw new ChatGPTSignInError('ChatGPT no entregó las credenciales esperadas.');
  if (!scopes.includes(PLAN_SCOPE))
    throw new ChatGPTSignInError(
      'No se concedió el permiso para usar su plan de ChatGPT. Vuelva a conectar y acéptelo.',
    );
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes,
  };
}

async function tokenRequest(discovery: Discovery, body: URLSearchParams, fetchImpl: typeof fetch) {
  const response = await fetchImpl(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = new ChatGPTSignInError('ChatGPT rechazó la solicitud de credenciales.');
    (error as ChatGPTSignInError & { code?: unknown }).code = data.error;
    throw error;
  }
  return data;
}

// Full sign-in: opens the system browser and waits for the user's consent.
export async function signIn(options: {
  clientId: string | null;
  hostId: string;
  openBrowser: (url: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<{ clientId: string; tokens: Tokens; email: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const discovery = await discover(fetchImpl);
  const state = random();
  const nonce = random();
  const verifier = random();
  const listener = await callbackListener(state);
  const timeout = setTimeout(() => listener.close(), 10 * 60_000);
  try {
    await options.openBrowser(
      authorizationUrl({
        discovery,
        clientId: options.clientId,
        hostId: options.hostId,
        redirectUri: listener.redirectUri,
        state,
        nonce,
        verifier,
      }),
    );
    const callback = await listener.result;
    const data = await tokenRequest(
      discovery,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: callback.clientId,
        code: callback.code,
        code_verifier: verifier,
        redirect_uri: listener.redirectUri,
        resource: RESOURCE,
      }),
      fetchImpl,
    );
    if (typeof data.id_token !== 'string')
      throw new ChatGPTSignInError('ChatGPT no entregó una identidad verificable.');
    const { payload } = await jwtVerify(
      data.id_token,
      createRemoteJWKSet(new URL(discovery.jwks_uri)),
      { issuer: ISSUER, audience: callback.clientId },
    );
    if (payload.nonce !== nonce)
      throw new ChatGPTSignInError(
        'La identidad de ChatGPT no corresponde a este inicio de sesión.',
      );
    return {
      clientId: callback.clientId,
      tokens: parseTokens(data),
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  } finally {
    clearTimeout(timeout);
    listener.close();
  }
}

export async function refresh(
  clientId: string,
  previous: Tokens,
  fetchImpl: typeof fetch = fetch,
): Promise<Tokens> {
  const data = await tokenRequest(
    await discover(fetchImpl),
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: previous.refreshToken,
      resource: RESOURCE,
    }),
    fetchImpl,
  );
  // OAuth may omit the scope on refresh when it did not change.
  return parseTokens({ scope: previous.scopes.join(' '), ...data }, previous.refreshToken);
}

// Signing out revokes the refresh token before the local copy is deleted.
export async function revoke(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const discovery = await discover(fetchImpl);
    if (!discovery.revocation_endpoint) return false;
    const response = await fetchImpl(discovery.revocation_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: clientId,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listModels(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ slug: string; displayName: string }[]> {
  const response = await fetchImpl(`${RESOURCE}/models`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!response.ok) throw new ChatGPTSignInError('No se pudieron obtener los modelos de su plan.');
  const body = (await response.json()) as { models?: unknown };
  if (!Array.isArray(body.models)) return [];
  return body.models.flatMap((model: Record<string, unknown>) =>
    model.visibility === 'list' && typeof model.slug === 'string'
      ? [{ slug: model.slug, displayName: String(model.display_name ?? model.slug) }]
      : [],
  );
}
