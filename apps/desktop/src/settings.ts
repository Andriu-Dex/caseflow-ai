import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PORTS = { web: 4800, api: 4801, database: 4802 } as const;

// The window may only show the app itself: compared by exact origin, so
// 'http://127.0.0.1:4800.example.com' or 'http://127.0.0.1:48000' never pass.
export function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === `http://127.0.0.1:${PORTS.web}`;
  } catch {
    return false;
  }
}

// Only real https pages go to the system browser.
export function isExternalHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// Secrets generated on first start and kept in the user's data folder; never
// shipped with the installer, never shared between machines.
async function loadSecrets(dataDir: string): Promise<{ jwtSecret: string; jobsSecret: string }> {
  const path = join(dataDir, 'secrets.json');
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  const secrets = {
    jwtSecret: randomBytes(48).toString('base64url'),
    jobsSecret: randomBytes(32).toString('base64url'),
  };
  await writeFile(path, JSON.stringify(secrets), { mode: 0o600 });
  return secrets;
}

// KEY=VALUE lines from caseflow.env in the data folder: the user's own AI
// provider, diagram renderer or mockup settings. Comments and blanks ignored.
export function parseEnvFile(text: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) entries[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return entries;
}

// Environment of the API process in the desktop edition (DEC-120).
export async function apiEnvironment(
  dataDir: string,
  databaseUrl: string,
): Promise<Record<string, string>> {
  await mkdir(join(dataDir, 'objects'), { recursive: true });
  const secrets = await loadSecrets(dataDir);
  const userFile = join(dataDir, 'caseflow.env');
  const user = existsSync(userFile) ? parseEnvFile(await readFile(userFile, 'utf8')) : {};
  return {
    NODE_ENV: 'production',
    // Kroki runs in Docker on the web edition; without it, the public
    // service renders the diagram source. Overridable in caseflow.env.
    DIAGRAM_RENDERER: 'kroki',
    KROKI_BASE_URL: 'https://kroki.io',
    AI_PROVIDER: 'disabled',
    MOCKUP_PROVIDER: 'disabled',
    ...user,
    // Fixed by the desktop edition: the user file cannot override these.
    DATABASE_URL: databaseUrl,
    API_PORT: String(PORTS.api),
    // Loopback only: never reachable from the local network.
    API_HOST: '127.0.0.1',
    API_INTERNAL_URL: `http://127.0.0.1:${PORTS.api}`,
    WEB_ORIGIN: `http://127.0.0.1:${PORTS.web}`,
    JWT_SECRET: secrets.jwtSecret,
    INTERNAL_JOBS_SECRET: secrets.jobsSecret,
    CASEFLOW_QUEUE_MODE: 'in-process',
    STORAGE_DIR: join(dataDir, 'objects'),
  };
}
