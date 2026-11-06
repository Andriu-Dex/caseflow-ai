import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CAPTURE_BROWSER_SCRIPT } from './runtime-capture-scripts';
import captureSeccomp from './runtime-capture-seccomp.json';

export interface RuntimeCaptureTarget {
  routePath: string;
  role: string;
}
export interface RuntimeCaptureResult extends RuntimeCaptureTarget {
  status: 'CAPTURED' | 'FAILED' | 'SKIPPED';
  reason: string | null;
  png?: Buffer;
  width?: number;
  height?: number;
}
export interface RuntimeCaptureRequest {
  signal?: AbortSignal;
  files: readonly { path: string; content: string }[];
  targets: readonly RuntimeCaptureTarget[];
}
export interface RuntimeCaptureProvider {
  capture(request: RuntimeCaptureRequest): Promise<RuntimeCaptureResult[]>;
}
export const RUNTIME_CAPTURE_PROVIDER = Symbol('RUNTIME_CAPTURE_PROVIDER');
export const CAPTURE_PROFILE = 'EMPTY_DATABASE_DESKTOP_V1';

// Test sessions use only the disposable application's signing key.
export function createCaptureSessionToken(role: string, secret: string, now = Date.now()) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: randomUUID(), roles: [role], exp: Math.floor(now / 1000) + 600 })}`;
  return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
}

type Runner = (args: string[], timeoutMs: number, signal?: AbortSignal) => Promise<string>;
const runDocker: Runner = (args, timeoutMs, signal) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });
    let output = '';
    const append = (data: Buffer) => {
      output = (output + data.toString()).slice(-16_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Capture command timed out.'));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error('Capture container command failed.'));
    });
  });

// No model-supplied Dockerfile, Compose file, command, environment or bind mount is used.
export class DockerRuntimeCaptureProvider implements RuntimeCaptureProvider {
  constructor(private readonly docker: Runner = runDocker) {}

  async capture(request: RuntimeCaptureRequest): Promise<RuntimeCaptureResult[]> {
    request.signal?.throwIfAborted();
    validateCaptureInput(request);
    const localSessions = request.files.some(
      (file) =>
        file.path === 'docs/auth-profile.json' &&
        JSON.parse(file.content).profile === 'LOCAL_AUTH_SESSION_V1',
    );
    const prefix = `caseflow-capture-${randomUUID()}`;
    const jwtSecret = randomUUID();
    const network = `${prefix}-net`;
    const volume = `${prefix}-app`;
    const app = `${prefix}-web`;
    const database = `${prefix}-db`;
    const browser = `${prefix}-browser`;
    const copy = `${prefix}-copy`;
    const build = `${prefix}-build`;
    const install = `${prefix}-install`;
    const scratch = await mkdtemp(join(tmpdir(), 'caseflow-capture-'));
    const source = join(scratch, 'source');
    const dependencies = join(scratch, 'dependencies');
    const controller = join(scratch, 'controller');
    const output = join(scratch, 'output');
    const deadline = Date.now() + 12 * 60_000;
    const command = (args: string[], timeout = 60_000) => {
      request.signal?.throwIfAborted();
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Capture deadline exceeded.');
      return this.docker(args, Math.min(timeout, remaining), request.signal);
    };
    const hardened = [
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--pids-limit=256',
      '--memory=3g',
      '--cpus=2',
    ];
    const nodeImage = 'caseflow-runtime-capture-node:24-pnpm11.27.0-v1';
    const browserImage = 'caseflow-runtime-capture-browser:1.55.0-v1';
    try {
      await command(['info', '--format', '{{.ServerVersion}}'], 10_000);
      await Promise.all([mkdir(source), mkdir(dependencies), mkdir(controller), mkdir(output)]);
      const trustedWorkspace =
        "packages:\n  - 'apps/*'\n  - 'packages/*'\nverifyDepsBeforeRun: false\n";
      for (const file of request.files) {
        request.signal?.throwIfAborted();
        if (excludedSource(file.path)) continue;
        const path = join(source, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content);
        if (file.path.endsWith('package.json') || file.path === 'pnpm-lock.yaml') {
          const target = join(dependencies, file.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.content);
        }
      }
      await writeFile(join(dependencies, 'pnpm-workspace.yaml'), trustedWorkspace);
      await writeFile(join(source, 'pnpm-workspace.yaml'), trustedWorkspace);
      await writeFile(join(controller, 'browser.cjs'), CAPTURE_BROWSER_SCRIPT);
      await writeFile(join(controller, 'seccomp.json'), JSON.stringify(captureSeccomp));
      await writeFile(
        join(controller, 'Dockerfile.node'),
        'FROM node:24-bookworm\nRUN npm install --global pnpm@11.27.0\nWORKDIR /app\n',
      );
      await writeFile(
        join(controller, 'Dockerfile.browser'),
        'FROM mcr.microsoft.com/playwright:v1.55.0-noble\nWORKDIR /opt/capture\nRUN npm install --ignore-scripts --no-audit --no-fund playwright@1.55.0\n',
      );
      // Like sandbox validation, reuse the versioned controller toolchain.
      // No generated code is ever included in the image build context.
      for (const [tag, dockerfile, timeout] of [
        [nodeImage, 'Dockerfile.node', 180_000],
        [browserImage, 'Dockerfile.browser', 240_000],
      ] as const) {
        const prepared = await command(['image', 'inspect', tag]).then(
          () => true,
          () => false,
        );
        request.signal?.throwIfAborted();
        if (!prepared)
          await command(
            ['build', '-t', tag, '-f', join(controller, dockerfile), controller],
            timeout,
          );
      }
      await command(['volume', 'create', volume]);
      await command([
        'create',
        '--name',
        copy,
        '--network=none',
        '-v',
        `${volume}:/app`,
        nodeImage,
        'true',
      ]);
      await command(['cp', `${dependencies}/.`, `${copy}:/app`]);
      // Only manifests and the frozen lock are present while registry access is enabled.
      await command(
        [
          'run',
          '--name',
          install,
          ...hardened,
          '-v',
          `${volume}:/app`,
          nodeImage,
          'timeout',
          '--kill-after=5',
          '240',
          'sh',
          '-ec',
          "pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile; node -e \"require(require.resolve('@prisma/engines/scripts/postinstall.js', { paths: [require.resolve('prisma/package.json', { paths: ['/app/apps/api'] })] }))\"",
        ],
        240_000,
      );
      await command(['cp', `${source}/.`, `${copy}:/app`]);
      await command(
        [
          'run',
          '--name',
          build,
          '--network=none',
          ...hardened,
          '-v',
          `${volume}:/app`,
          '-e',
          'DATABASE_URL=postgresql://capture:capture-only@database:5432/capture',
          '-e',
          'NEXT_PUBLIC_API_URL=http://application:3001',
          '-e',
          'NEXT_TELEMETRY_DISABLED=1',
          nodeImage,
          'timeout',
          '--kill-after=5',
          '240',
          'sh',
          '-ec',
          'pnpm --filter ./apps/api exec prisma generate; pnpm run build:packages; pnpm --filter ./apps/api run build; pnpm --filter ./apps/web run build',
        ],
        240_000,
      );
      // An isolated internal bridge has no host gateway address and no route to the Internet.
      await command([
        'network',
        'create',
        '--internal',
        '-o',
        'com.docker.network.bridge.gateway_mode_ipv4=isolated',
        network,
      ]);
      await command([
        'run',
        '-d',
        '--name',
        database,
        '--network',
        network,
        '--network-alias',
        'database',
        '--memory=512m',
        '--cpus=1',
        '--pids-limit=128',
        '--security-opt=no-new-privileges',
        '-e',
        'POSTGRES_USER=capture',
        '-e',
        'POSTGRES_PASSWORD=capture-only',
        '-e',
        'POSTGRES_DB=capture',
        'postgres:17',
        'timeout',
        '600',
        'docker-entrypoint.sh',
        'postgres',
      ]);
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await command(['exec', database, 'pg_isready', '-U', 'capture', '-d', 'capture']);
          break;
        } catch {
          request.signal?.throwIfAborted();
          if (attempt === 29) throw new Error('Capture database unavailable.');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      await command([
        'run',
        '-d',
        '--name',
        app,
        '--network',
        network,
        '--network-alias',
        'application',
        ...hardened,
        '-v',
        `${volume}:/app`,
        '-e',
        'DATABASE_URL=postgresql://capture:capture-only@database:5432/capture',
        '-e',
        `JWT_SECRET=${jwtSecret}`,
        '-e',
        'DEV_LOGIN=false',
        '-e',
        'API_HOST=0.0.0.0',
        '-e',
        'API_PORT=3001',
        '-e',
        'WEB_ORIGIN=http://application:3000',
        '-e',
        'NEXT_TELEMETRY_DISABLED=1',
        nodeImage,
        'timeout',
        '240',
        'sh',
        '-ec',
        `pnpm --filter ./apps/api exec prisma db push; ${localSessions ? 'node apps/api/dist/auth/capture-fixtures.js > /app/.capture-sessions.json; ' : ''}node apps/api/dist/main.js & pnpm --filter ./apps/web start & wait`,
      ]);
      let sessionTokens: Record<string, string> = {};
      if (localSessions) {
        for (let attempt = 0; attempt < 40; attempt++) {
          try {
            const tokens = JSON.parse(
              await command([
                'exec',
                app,
                'node',
                '-e',
                "process.stdout.write(require('node:fs').readFileSync('/app/.capture-sessions.json','utf8'))",
              ]),
            );
            sessionTokens = validateCaptureSessions(tokens, request.targets, jwtSecret);
            break;
          } catch {
            request.signal?.throwIfAborted();
            if (attempt === 39) throw new Error('Capture sessions unavailable.');
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      await writeFile(
        join(controller, 'plan.json'),
        JSON.stringify(
          request.targets.map((target) => ({
            ...target,
            token: target.role
              ? localSessions
                ? sessionTokens[target.role]
                : createCaptureSessionToken(target.role, jwtSecret)
              : null,
            scopeId:
              localSessions && target.role
                ? (JSON.parse(
                    Buffer.from(sessionTokens[target.role]!.split('.')[1]!, 'base64url').toString(),
                  ).scopeId ?? null)
                : null,
          })),
        ),
      );
      await command([
        'create',
        '--name',
        browser,
        '--network',
        network,
        ...hardened,
        '--shm-size=256m',
        '--user=pwuser',
        '--security-opt',
        `seccomp=${join(controller, 'seccomp.json')}`,
        browserImage,
        'node',
        '/tmp/controller/browser.cjs',
      ]);
      await command(['cp', `${controller}/.`, `${browser}:/tmp/controller`]);
      await command(['start', '-a', browser], 180_000);
      await command(['cp', `${browser}:/tmp/capture-output/.`, output]);
      const results: RuntimeCaptureResult[] = [];
      for (let index = 0; index < request.targets.length; index++) {
        const metadata = JSON.parse(await readFile(join(output, `${index}.json`), 'utf8')) as {
          status: string;
          reasonCode?: string;
        };
        const target = request.targets[index]!;
        if (metadata.status === 'CAPTURED') {
          const png = await readFile(join(output, `${index}.png`));
          assertCapturePng(png);
          results.push({
            ...target,
            status: 'CAPTURED',
            reason: null,
            png,
            width: 1440,
            height: 900,
          });
        } else
          results.push({
            ...target,
            status: metadata.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
            reason:
              metadata.status === 'SKIPPED'
                ? 'Esta ruta necesita un registro de prueba. Revísela manualmente con datos adecuados.'
                : captureFailureMessage(metadata.reasonCode),
          });
      }
      request.signal?.throwIfAborted();
      return results;
    } finally {
      // Cleanup is restricted to names generated for this invocation, including timeout paths.
      await this.docker(['rm', '-f', browser, app, database, copy, build, install], 20_000).catch(
        () => undefined,
      );
      await this.docker(['volume', 'rm', '-f', volume], 20_000).catch(() => undefined);
      await this.docker(['network', 'rm', network], 20_000).catch(() => undefined);
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

function captureFailureMessage(code?: string) {
  const messages: Record<string, string> = {
    APPLICATION_UNAVAILABLE: 'La aplicación de prueba no estuvo disponible a tiempo.',
    WRONG_SCREEN: 'La ruta devolvió un error o redirigió a otra pantalla.',
    SCREEN_HEADING_MISSING: 'No se encontró el encabezado esperado de la pantalla.',
    API_FAILURE:
      'La API de prueba rechazó una petición o devolvió un error al abrir esta pantalla.',
    API_FORBIDDEN: 'Este rol no tiene permiso para consultar datos requeridos por la pantalla.',
    API_UNAUTHORIZED: 'La aplicación no aceptó la sesión de prueba de esta pantalla.',
    BROWSER_ERROR: 'La pantalla produjo un error en el navegador de prueba.',
    IMAGE_FAILURE: 'Una imagen de la pantalla no terminó de cargar correctamente.',
  };
  return (
    messages[code ?? ''] ??
    'No se pudo comprobar esta pantalla; conserve el esquema y revísela manualmente.'
  );
}

function excludedSource(path: string) {
  return (
    path
      .split('/')
      .some(
        (part) =>
          /^\.env(?:\.|$)/.test(part) ||
          ['.npmrc', '.pnpmfile.cjs', 'pnpmfile.cjs', 'node_modules', '.git'].includes(part),
      ) || path === 'pnpm-workspace.yaml'
  );
}
export function validateCaptureInput(request: RuntimeCaptureRequest) {
  if (
    !request.targets.length ||
    request.targets.length > 40 ||
    request.files.length > 4000 ||
    request.files.reduce((size, file) => size + Buffer.byteLength(file.content), 0) > 30_000_000
  )
    throw new Error('Capture input exceeds limits.');
  const paths = new Set<string>();
  for (const file of request.files) {
    if (
      !/^[a-zA-Z0-9_.@/()[\]-]+$/.test(file.path) ||
      file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      paths.has(file.path)
    )
      throw new Error('Invalid capture file path.');
    paths.add(file.path);
  }
  if (!paths.has('pnpm-lock.yaml') || !paths.has('package.json'))
    throw new Error('Capture requires a frozen software archive.');
  const manifest = JSON.parse(
    request.files.find((file) => file.path === 'package.json')!.content,
  ) as { packageManager?: string; engines?: { node?: string } };
  if (manifest?.packageManager !== 'pnpm@11.27.0' || manifest.engines?.node !== '>=24 <25')
    throw new Error('Capture toolchain is not supported by this profile.');
  for (const target of request.targets) {
    if (
      !/^\/(?:[a-zA-Z0-9_\-/[\]]*)$/.test(target.routePath) ||
      target.routePath.includes('//') ||
      target.routePath.includes('..') ||
      target.role.length > 100
    )
      throw new Error('Invalid capture target.');
  }
}
export function assertCapturePng(png: Buffer) {
  if (
    png.length < 24 ||
    png.length > 8_000_000 ||
    png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== 1440 ||
    png.readUInt32BE(20) !== 900
  )
    throw new Error('Invalid runtime screenshot.');
}

export function validateCaptureSessions(
  value: unknown,
  targets: readonly RuntimeCaptureTarget[],
  secret: string,
  now = Date.now(),
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid capture sessions.');
  const tokens = value as Record<string, unknown>;
  const selected: Record<string, string> = {};
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  for (const role of new Set(targets.map((target) => target.role).filter(Boolean))) {
    const token = tokens[role];
    if (typeof token !== 'string' || token.length > 4000)
      throw new Error('Invalid capture session.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid capture session.');
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    const signature = createHmac('sha256', secret)
      .update(parts.slice(0, 2).join('.'))
      .digest('base64url');
    if (
      header.alg !== 'HS256' ||
      signature !== parts[2] ||
      !Array.isArray(claims.roles) ||
      claims.roles.length !== 1 ||
      claims.roles[0] !== role ||
      !uuid.test(claims.sessionId ?? '') ||
      !uuid.test(claims.sub ?? '') ||
      (claims.scopeId !== undefined && !uuid.test(claims.scopeId)) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now
    )
      throw new Error('Invalid capture session.');
    selected[role] = token;
  }
  return selected;
}
