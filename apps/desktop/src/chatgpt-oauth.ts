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

// Waits for the single redirect back to 127.0.0.1, validating state. A new
// registration returns the issued client id; a returning sign-in may omit it
// and then keeps the one it was started with, never a different one.
export function localWebUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error('CASEFLOW_WEB_URL debe ser una URL HTTP de localhost o 127.0.0.1.');
  return url.toString();
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function callbackListener(
  state: string,
  expectedClientId: string | null,
  webUrl?: string,
) {
  const returnUrl = localWebUrl(webUrl);
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
    const page = ({ ok, title, message }: { ok: boolean; title: string; message: string }) =>
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
      })
        .end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CASEFlow AI</title><style>
          :root{color-scheme:light dark;--bg:#ffffff;--card:#f8fafc;--text:#0f172a;--muted:#475569;--primary:#4f6bff;--status:${ok ? '#10b981' : '#ef4444'}}
          @media(prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#1e293b;--text:#f8fafc;--muted:#cbd5e1}}
          *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}
          main{width:min(100%,480px);padding:36px;border-radius:20px;background:var(--card);text-align:center;box-shadow:0 12px 40px #0001}svg{width:64px;height:64px;color:var(--status)}h1{font-size:24px;line-height:1.3}p{color:var(--muted);line-height:1.6}a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:10px;background:var(--primary);color:white;text-decoration:none;font-weight:600}a:focus-visible{outline:3px solid var(--text);outline-offset:4px}
          </style></head><body><main><svg viewBox="0 0 64 64" role="img" aria-label="${ok ? 'Éxito' : 'Error'}"><circle cx="32" cy="32" r="30" fill="currentColor"/>${ok ? '<path d="m18 32 9 9 19-19" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' : '<path d="M32 17v19m0 9v1" stroke="white" stroke-width="5" stroke-linecap="round"/>'}</svg><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p>${ok ? 'Ya puede volver a CASEFlow AI. Esta pestaña se puede cerrar.' : 'Vuelva a CASEFlow AI e inténtelo de nuevo.'}</p>${returnUrl ? `<a href="${escapeHtml(returnUrl)}">Volver a CASEFlow</a>` : ''}</main>${ok ? '<script>setTimeout(() => window.close(), 3000)</script>' : ''}</body></html>`);
    if (returned.length !== expected.length || !timingSafeEqual(returned, expected)) {
      page({
        ok: false,
        title: 'No se completó la conexión',
        message: 'La respuesta de inicio de sesión no es válida.',
      });
      rejectResult(new ChatGPTSignInError('La respuesta de inicio de sesión no es válida.'));
      return;
    }
    const code = url.searchParams.get('code');
    const returnedClientId = url.searchParams.get('client_id');
    const clientId = returnedClientId ?? expectedClientId;
    if (
      url.searchParams.has('error') ||
      !code ||
      !clientId ||
      (expectedClientId !== null && clientId !== expectedClientId)
    ) {
      page({
        ok: false,
        title: 'No se completó la conexión',
        message: 'No se completó el inicio de sesión.',
      });
      rejectResult(new ChatGPTSignInError('No se completó el inicio de sesión con ChatGPT.'));
      return;
    }
    page({ ok: true, title: 'Cuenta de ChatGPT conectada', message: 'Conexión completada.' });
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
  webUrl?: string;
}): Promise<{ clientId: string; tokens: Tokens; email: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const discovery = await discover(fetchImpl);
  const state = random();
  const nonce = random();
  const verifier = random();
  const listener = await callbackListener(state, options.clientId, options.webUrl);
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
