import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ChatGPTConnection,
  startBroker,
  type ConnectionStore,
  type State,
} from './chatgpt-connection.js';

// Development-only ChatGPT broker (DEC-128): lets the API started by
// `pnpm dev` use the developer's ChatGPT plan, which OpenAI allows for
// personal projects running locally. It runs as its own process so the API
// restarting on every file change keeps the session.

// Credentials stay in this process's memory and are gone when it stops.
// Only what identifies this machine to OpenAI is kept on disk (nothing
// secret), so each sign-in reuses the app already registered for the user.
export function developmentStore(file: string): ConnectionStore {
  let memory: State | null = null;
  return {
    async read() {
      if (memory) return memory;
      if (!existsSync(file)) return null;
      const saved = JSON.parse(await readFile(file, 'utf8')) as Pick<
        State,
        'hostId' | 'clientId' | 'model'
      >;
      return { ...saved, email: null, tokens: null, paused: false, preferred: true };
    },
    async write(state) {
      memory = state;
      await mkdir(dirname(file), { recursive: true });
      const { hostId, clientId, model } = state;
      await writeFile(file, JSON.stringify({ hostId, clientId, model }), { mode: 0o600 });
    },
    async remove() {
      memory = null;
      await rm(file, { force: true });
    },
  };
}

// The broker must never serve a hosted deployment (ADR-002) or listen
// beyond this machine.
export function developmentBrokerSettings(
  environment: NodeJS.ProcessEnv,
): { port: number; secret: string } | { skip: string } | { error: string } {
  if (environment.AI_PROVIDER !== 'chatgpt')
    return { skip: 'AI_PROVIDER no es "chatgpt": el intermediario de ChatGPT no se inicia.' };
  if (environment.NODE_ENV === 'production')
    return { error: 'El intermediario de desarrollo de ChatGPT no se ejecuta en producción.' };
  const url = new URL(environment.CHATGPT_BROKER_URL ?? 'http://invalid');
  if (url.hostname !== '127.0.0.1' || !url.port)
    return { error: 'CHATGPT_BROKER_URL debe ser http://127.0.0.1:<puerto>.' };
  const secret = environment.CHATGPT_BROKER_SECRET ?? '';
  if (secret.length < 32)
    return { error: 'CHATGPT_BROKER_SECRET debe tener al menos 32 caracteres.' };
  return { port: Number(url.port), secret };
}

function openBrowser(url: string): Promise<void> {
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  return Promise.resolve();
}

async function main() {
  const settings = developmentBrokerSettings(process.env);
  if ('skip' in settings) {
    console.log(settings.skip);
    return;
  }
  if ('error' in settings) {
    console.error(settings.error);
    process.exitCode = 1;
    return;
  }
  const connection = new ChatGPTConnection(
    developmentStore(join(homedir(), '.caseflow', 'chatgpt-dev.json')),
    openBrowser,
    async () => {},
  );
  await startBroker(connection, settings.port, settings.secret);
  console.log('Abriendo el navegador para conectar su cuenta de ChatGPT…');
  const status = await connection.connect();
  const models = await connection.models();
  console.log(`Conectado como ${status.email ?? 'usuario de ChatGPT'}.`);
  console.log(`Modelos de su plan: ${models.map((m) => m.slug).join(', ') || 'ninguno'}.`);
  if (!models.some((m) => m.slug === process.env.AI_MODEL))
    console.warn(
      `AI_MODEL=${process.env.AI_MODEL ?? ''} no está entre los modelos de su plan; cámbielo en .env.`,
    );
}

if (process.argv[1]?.endsWith('dev-broker.js'))
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
