import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  files: readonly { path: string; content: string }[];
  targets: readonly RuntimeCaptureTarget[];
}
export interface RuntimeCaptureProvider {
  capture(request: RuntimeCaptureRequest): Promise<RuntimeCaptureResult[]>;
}
export const RUNTIME_CAPTURE_PROVIDER = Symbol('RUNTIME_CAPTURE_PROVIDER');
export const CAPTURE_PROFILE = 'EMPTY_DATABASE_DESKTOP_V1';

type Runner = (args: string[], timeoutMs: number) => Promise<string>;
const runDocker: Runner = (args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    validateCaptureInput(request);
    const prefix = `caseflow-capture-${randomUUID()}`;
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
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Capture deadline exceeded.');
      return this.docker(args, Math.min(timeout, remaining));
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
      await writeFile(join(controller, 'plan.json'), JSON.stringify(request.targets));
      await writeFile(
        join(controller, 'Dockerfile.node'),
        'FROM node:24-bookworm\nRUN npm install --global pnpm@11.27.0\nWORKDIR /app\n',
      );
      await writeFile(
        join(controller, 'Dockerfile.browser'),
        'FROM mcr.microsoft.com/playwright:v1.55.0-noble\nWORKDIR /opt/capture\nRUN npm install --ignore-scripts --no-audit --no-fund playwright@1.55.0\n',
      );
      // Image construction contains trusted files only; generated code is never in this context.
      await command(
        ['build', '-t', nodeImage, '-f', join(controller, 'Dockerfile.node'), controller],
        180_000,
      );
      await command(
        ['build', '-t', browserImage, '-f', join(controller, 'Dockerfile.browser'), controller],
        240_000,
      );
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
        'JWT_SECRET=disposable-capture-only-secret',
        '-e',
        'DEV_LOGIN=true',
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
        'pnpm --filter ./apps/api exec prisma db push; node apps/api/dist/main.js & pnpm --filter ./apps/web start & wait',
      ]);
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
          reason: string | null;
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
                : 'No se pudo comprobar esta pantalla; conserve el esquema y revísela manualmente.',
          });
      }
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
