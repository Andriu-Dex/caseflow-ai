import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import {
  ChatGPTSignInError,
  listModels,
  refresh,
  revoke,
  signIn,
  type Tokens,
} from './chatgpt-oauth.js';

// The user's ChatGPT connection in the desktop edition (DEC-117). Credentials
// are encrypted with the operating system's secure storage and never leave
// this process: the API gets short-lived access tokens from the broker.

export interface Encryption {
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

interface State {
  // Persistent per machine: identifies this installation to OpenAI.
  hostId: string;
  // Issued at the first sign-in, reused afterwards (no new registration).
  clientId: string | null;
  email: string | null;
  tokens: Tokens | null;
  model: string | null;
  // Usage limit reached: plan requests stop until the user resumes.
  paused: boolean;
  // false when the user chose the provider from caseflow.env instead.
  preferred: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  email: string | null;
  model: string | null;
  paused: boolean;
  active: boolean;
}

export class ChatGPTConnection {
  private state: State | null = null;

  constructor(
    private readonly file: string,
    private readonly encryption: Encryption,
    private readonly openBrowser: (url: string) => Promise<void>,
    // Called when the API must restart with another AI provider.
    private readonly onProviderChange: () => Promise<void>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async load(): Promise<State> {
    if (this.state) return this.state;
    this.state = existsSync(this.file)
      ? (JSON.parse(this.encryption.decrypt(await readFile(this.file))) as State)
      : {
          hostId: randomUUID(),
          clientId: null,
          email: null,
          tokens: null,
          model: null,
          paused: false,
          preferred: true,
        };
    return this.state;
  }

  private async save(): Promise<void> {
    await writeFile(this.file, this.encryption.encrypt(JSON.stringify(this.state)), {
      mode: 0o600,
    });
  }

  async status(): Promise<ConnectionStatus> {
    const state = await this.load();
    return {
      connected: Boolean(state.tokens),
      email: state.email,
      model: state.model,
      paused: state.paused,
      active: await this.isActive(),
    };
  }

  // Whether the API should run on the ChatGPT plan.
  async isActive(): Promise<boolean> {
    const state = await this.load();
    return Boolean(state.tokens && state.model && state.preferred);
  }

  async model(): Promise<string | null> {
    return (await this.load()).model;
  }

  async connect(): Promise<ConnectionStatus> {
    const state = await this.load();
    const result = await signIn({
      clientId: state.clientId,
      hostId: state.hostId,
      openBrowser: this.openBrowser,
      fetchImpl: this.fetchImpl,
    });
    state.clientId = result.clientId;
    state.tokens = result.tokens;
    state.email = result.email;
    state.paused = false;
    state.preferred = true;
    state.model ??= (await listModels(result.tokens.accessToken, this.fetchImpl))[0]?.slug ?? null;
    await this.save();
    await this.onProviderChange();
    return this.status();
  }

  // Revokes the refresh token first; local credentials go either way.
  async disconnect(): Promise<{ revoked: boolean }> {
    const state = await this.load();
    const revoked =
      state.tokens && state.clientId
        ? await revoke(state.clientId, state.tokens.refreshToken, this.fetchImpl)
        : true;
    state.tokens = null;
    state.email = null;
    state.paused = false;
    await this.save();
    await this.onProviderChange();
    return { revoked };
  }

  async models(): Promise<{ slug: string; displayName: string }[]> {
    return listModels(await this.accessToken(), this.fetchImpl);
  }

  async selectModel(slug: string): Promise<void> {
    const state = await this.load();
    state.model = slug;
    await this.save();
    await this.onProviderChange();
  }

  // After checking the usage in ChatGPT, the user decides to try again.
  async resume(): Promise<void> {
    (await this.load()).paused = false;
    await this.save();
  }

  // Only with the user's explicit confirmation (never automatic): run the
  // API on the provider from caseflow.env, or back on the plan.
  async prefer(chatgpt: boolean): Promise<void> {
    (await this.load()).preferred = chatgpt;
    await this.save();
    await this.onProviderChange();
  }

  async accessToken(): Promise<string> {
    const state = await this.load();
    if (!state.tokens || !state.clientId) throw new BrokerRefusal(401);
    if (state.paused) throw new BrokerRefusal(409);
    if (state.tokens.expiresAt - Date.now() < 60_000) {
      try {
        state.tokens = await refresh(state.clientId, state.tokens, this.fetchImpl);
      } catch (error) {
        // A refused refresh means the user disconnected the app in ChatGPT.
        if (error instanceof ChatGPTSignInError) await this.markRevoked();
        throw new BrokerRefusal(error instanceof ChatGPTSignInError ? 401 : 503);
      }
      await this.save();
    }
    return state.tokens.accessToken;
  }

  async markUsageLimit(): Promise<void> {
    (await this.load()).paused = true;
    await this.save();
  }

  async markRevoked(): Promise<void> {
    const state = await this.load();
    state.tokens = null;
    state.email = null;
    await this.save();
  }

  async forget(): Promise<void> {
    this.state = null;
    await rm(this.file, { force: true });
  }
}

export class BrokerRefusal extends Error {
  constructor(readonly status: 401 | 409 | 503) {
    super(`broker refused with ${status}`);
  }
}

// Loopback broker for the API process, authenticated with a secret that
// changes every launch.
export async function startBroker(
  connection: ChatGPTConnection,
  port: number,
): Promise<{ url: string; secret: string; server: Server }> {
  const secret = randomBytes(32).toString('base64url');
  const expected = Buffer.from(secret);
  const server = createServer((request, response) => {
    const given = Buffer.from(String(request.headers['x-caseflow-broker-secret'] ?? ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      response.writeHead(403).end();
      return;
    }
    const reply = (status: number, body: object = {}) =>
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    const route = `${request.method} ${request.url}`;
    const handle = async () => {
      if (route === 'GET /token')
        return reply(200, { accessToken: await connection.accessToken() });
      if (route === 'POST /usage-limit') {
        await connection.markUsageLimit();
        return reply(204);
      }
      if (route === 'POST /revoked') {
        await connection.markRevoked();
        return reply(204);
      }
      return reply(404);
    };
    handle().catch((error: unknown) => reply(error instanceof BrokerRefusal ? error.status : 503));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${port}`, secret, server };
}
