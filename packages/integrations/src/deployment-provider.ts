import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { validateCaptureInput } from './runtime-capture-provider';

// ADR-019: a READY generated project runs in Docker on this machine and is
// published through Cloudflare Tunnel. Commands are fixed here; nothing comes
// from the generated project or a model. No CASEFlow secret enters it.
export interface DeploymentRequest {
  deploymentId: string;
  files: readonly { path: string; content: string }[];
  // Password of every initial account; passed once, never returned or stored.
  initialPassword: string;
  // Named tunnel token (a URL fixed in the person's Cloudflare account);
  // without it a quick tunnel gives a random trycloudflare.com URL.
  tunnelToken?: string;
}
export interface DeploymentResult {
  publicUrl: string | null;
  accounts: { role: string; identifier: string }[];
}
export interface DeploymentProvider {
  deploy(request: DeploymentRequest): Promise<DeploymentResult>;
  stop(deploymentId: string): Promise<void>;
  // Starts a stopped deployment again; a quick tunnel gets a new URL.
  start(deploymentId: string, tunnelToken?: string): Promise<{ publicUrl: string | null }>;
}
export const DEPLOYMENT_PROVIDER = Symbol('DEPLOYMENT_PROVIDER');

export const CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:2026.10.7';
const NODE_IMAGE = 'caseflow-runtime-capture-node:24-pnpm11.27.0-v1';
const POSTGRES_IMAGE = 'postgres:17';
const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

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
      reject(new Error('Deployment command timed out.'));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error('Deployment container command failed.'));
    });
  });

export const deploymentNames = (deploymentId: string) => {
  if (!/^[0-9a-f-]{36}$/.test(deploymentId)) throw new Error('Invalid deployment id.');
  const prefix = `caseflow-deploy-${deploymentId.slice(0, 8)}`;
  return {
    network: `${prefix}-net`,
    appVolume: `${prefix}-app`,
    dataVolume: `${prefix}-data`,
    database: `${prefix}-db`,
    app: `${prefix}-app`,
    tunnel: `${prefix}-tunnel`,
    install: `${prefix}-install`,
    build: `${prefix}-build`,
    copy: `${prefix}-copy`,
    accounts: `${prefix}-accounts`,
  };
};

export class DockerTunnelDeploymentProvider implements DeploymentProvider {
  constructor(
    private readonly docker: Runner = runDocker,
    private readonly wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async deploy(request: DeploymentRequest): Promise<DeploymentResult> {
    validateCaptureInput({ files: request.files, targets: [{ routePath: '/', role: '' }] });
    if (request.initialPassword.length < 12)
      throw new Error('The initial password must have at least 12 characters.');
    const names = deploymentNames(request.deploymentId);
    const hardened = ['--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=256'];
    const databasePassword = randomBytes(18).toString('base64url');
    const databaseUrl = `postgresql://app:${databasePassword}@database:5432/app`;
    const jwtSecret = randomBytes(32).toString('base64url');
    const scratch = await mkdtemp(join(tmpdir(), 'caseflow-deploy-'));
    const source = join(scratch, 'source');
    const dependencies = join(scratch, 'dependencies');
    try {
      await this.docker(['info', '--format', '{{.ServerVersion}}'], 10_000);
      await Promise.all([mkdir(source), mkdir(dependencies)]);
      const workspace = "packages:\n  - 'apps/*'\n  - 'packages/*'\nverifyDepsBeforeRun: false\n";
      for (const file of request.files) {
        if (excluded(file.path)) continue;
        const path = join(source, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content);
        if (file.path.endsWith('package.json') || file.path === 'pnpm-lock.yaml') {
          const target = join(dependencies, file.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.content);
        }
      }
      await writeFile(join(dependencies, 'pnpm-workspace.yaml'), workspace);
      await writeFile(join(source, 'pnpm-workspace.yaml'), workspace);
      await this.ensureNodeImage(scratch);
      await this.docker(['volume', 'create', names.appVolume], 60_000);
      await this.docker(['volume', 'create', names.dataVolume], 60_000);
      await this.docker(
        [
          'create',
          '--name',
          names.copy,
          '--network=none',
          '-v',
          `${names.appVolume}:/app`,
          NODE_IMAGE,
          'true',
        ],
        60_000,
      );
      await this.docker(['cp', `${dependencies}/.`, `${names.copy}:/app`], 120_000);
      // Only manifests and the frozen lock are present while the registry is reachable.
      await this.docker(
        [
          'run',
          '--rm',
          '--name',
          names.install,
          ...hardened,
          '--memory=3g',
          '--cpus=2',
          '-v',
          `${names.appVolume}:/app`,
          NODE_IMAGE,
          'sh',
          '-ec',
          "pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile; node -e \"require(require.resolve('@prisma/engines/scripts/postinstall.js', { paths: [require.resolve('prisma/package.json', { paths: ['/app/apps/api'] })] }))\"",
        ],
        600_000,
      );
      await this.docker(['cp', `${source}/.`, `${names.copy}:/app`], 120_000);
      await this.docker(['rm', '-f', names.copy], 30_000);
      await this.docker(
        [
          'run',
          '--rm',
          '--name',
          names.build,
          '--network=none',
          ...hardened,
          '--memory=3g',
          '--cpus=2',
          '-v',
          `${names.appVolume}:/app`,
          '-e',
          `DATABASE_URL=${databaseUrl}`,
          '-e',
          'NEXT_PUBLIC_API_URL=/api',
          '-e',
          'API_INTERNAL_URL=http://127.0.0.1:3001',
          '-e',
          'NEXT_TELEMETRY_DISABLED=1',
          NODE_IMAGE,
          'sh',
          '-ec',
          'pnpm --filter ./apps/api exec prisma generate; pnpm run build:packages; pnpm --filter ./apps/api run build; pnpm --filter ./apps/web run build',
        ],
        900_000,
      );
      await this.docker(['network', 'create', names.network], 60_000);
      await this.docker(
        [
          'run',
          '-d',
          '--name',
          names.database,
          '--network',
          names.network,
          '--network-alias',
          'database',
          '--restart',
          'unless-stopped',
          '--memory=512m',
          '--cpus=1',
          '--security-opt=no-new-privileges',
          '-v',
          `${names.dataVolume}:/var/lib/postgresql/data`,
          '-e',
          'POSTGRES_USER=app',
          '-e',
          `POSTGRES_PASSWORD=${databasePassword}`,
          '-e',
          'POSTGRES_DB=app',
          POSTGRES_IMAGE,
        ],
        120_000,
      );
      await this.waitFor(
        () => this.docker(['exec', names.database, 'pg_isready', '-U', 'app', '-d', 'app'], 10_000),
        60,
      );
      await this.docker(
        [
          'run',
          '-d',
          '--name',
          names.app,
          '--network',
          names.network,
          '--network-alias',
          'application',
          '--restart',
          'unless-stopped',
          ...hardened,
          '--memory=2g',
          '--cpus=2',
          '-v',
          `${names.appVolume}:/app`,
          '-e',
          `DATABASE_URL=${databaseUrl}`,
          '-e',
          `JWT_SECRET=${jwtSecret}`,
          '-e',
          'DEV_LOGIN=false',
          '-e',
          'API_HOST=127.0.0.1',
          '-e',
          'API_PORT=3001',
          '-e',
          'API_INTERNAL_URL=http://127.0.0.1:3001',
          '-e',
          'NEXT_TELEMETRY_DISABLED=1',
          NODE_IMAGE,
          'sh',
          '-ec',
          'pnpm --filter ./apps/api exec prisma db push; node apps/api/dist/main.js & pnpm --filter ./apps/web exec next start -H 0.0.0.0 -p 3000 & wait',
        ],
        120_000,
      );
      await this.waitFor(
        () =>
          this.docker(
            [
              'exec',
              names.app,
              'node',
              '-e',
              "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
            ],
            15_000,
          ),
        120,
      );
      const accounts = request.files.some(
        (file) => file.path === 'apps/api/src/auth/deploy-accounts.ts',
      )
        ? (JSON.parse(
            (
              await this.docker(
                [
                  'exec',
                  '-e',
                  `INITIAL_PASSWORD=${request.initialPassword}`,
                  names.app,
                  'node',
                  'apps/api/dist/auth/deploy-accounts.js',
                ],
                120_000,
              )
            )
              .trim()
              .split('\n')
              .at(-1) ?? '[]',
          ) as { role: string; identifier: string }[])
        : [];
      const { publicUrl } = await this.startTunnel(names, request.tunnelToken);
      return { publicUrl, accounts };
    } finally {
      await this.docker(['rm', '-f', names.copy, names.install, names.build], 30_000).catch(
        () => undefined,
      );
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async stop(deploymentId: string): Promise<void> {
    const names = deploymentNames(deploymentId);
    await this.docker(['rm', '-f', names.tunnel], 60_000).catch(() => undefined);
    await this.docker(['stop', names.app, names.database], 120_000).catch(() => undefined);
  }

  async start(deploymentId: string, tunnelToken?: string): Promise<{ publicUrl: string | null }> {
    const names = deploymentNames(deploymentId);
    await this.docker(['start', names.database, names.app], 120_000);
    await this.waitFor(
      () =>
        this.docker(
          [
            'exec',
            names.app,
            'node',
            '-e',
            "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
          ],
          15_000,
        ),
      120,
    );
    return this.startTunnel(names, tunnelToken);
  }

  private async startTunnel(
    names: ReturnType<typeof deploymentNames>,
    tunnelToken?: string,
  ): Promise<{ publicUrl: string | null }> {
    await this.docker(['rm', '-f', names.tunnel], 30_000).catch(() => undefined);
    await this.docker(
      [
        'run',
        '-d',
        '--name',
        names.tunnel,
        '--network',
        names.network,
        '--restart',
        'unless-stopped',
        ...['--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=256m'],
        ...(tunnelToken ? ['-e', `TUNNEL_TOKEN=${tunnelToken}`] : []),
        CLOUDFLARED_IMAGE,
        'tunnel',
        '--no-autoupdate',
        ...(tunnelToken ? ['run'] : ['--url', 'http://application:3000']),
      ],
      180_000,
    );
    // A named tunnel's URL is the hostname set in the person's Cloudflare account.
    if (tunnelToken) return { publicUrl: null };
    for (let attempt = 0; attempt < 60; attempt++) {
      const logs = await this.docker(['logs', names.tunnel], 15_000).catch(() => '');
      const url = QUICK_TUNNEL_URL.exec(logs)?.[0];
      if (url) return { publicUrl: url };
      await this.wait(2000);
    }
    throw new Error('The quick tunnel did not report its URL.');
  }

  private async ensureNodeImage(scratch: string) {
    const prepared = await this.docker(['image', 'inspect', NODE_IMAGE], 30_000).then(
      () => true,
      () => false,
    );
    if (prepared) return;
    const context = join(scratch, 'image');
    await mkdir(context);
    await writeFile(
      join(context, 'Dockerfile'),
      'FROM node:24-bookworm\nRUN npm install --global pnpm@11.27.0\nWORKDIR /app\n',
    );
    await this.docker(['build', '-t', NODE_IMAGE, context], 300_000);
  }

  private async waitFor(check: () => Promise<unknown>, attempts: number) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        await check();
        return;
      } catch {
        await this.wait(1000);
      }
    }
    throw new Error('The deployed service did not become ready.');
  }
}

function excluded(path: string) {
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
