import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const SANDBOX_ERROR_CODES = [
  'SANDBOX_UNAVAILABLE',
  'SANDBOX_COMMAND_NOT_ALLOWED',
  'SANDBOX_INVALID_INPUT',
  'SANDBOX_ERROR',
] as const;
export type SandboxErrorCode = (typeof SANDBOX_ERROR_CODES)[number];

export class SandboxExecutionError extends Error {
  constructor(
    public readonly code: SandboxErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SandboxExecutionError';
  }
}

export interface SandboxCommand {
  stage: string;
  argv: readonly string[];
  // Only dependency installation may reach the (approved) registry.
  network: boolean;
}

export interface SandboxLimits {
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  pids: number;
}

export interface SandboxExecutionRequest {
  files: readonly { path: string; content: string }[];
  commands: readonly SandboxCommand[];
  // The TargetTemplate's validation commands: anything else is refused, so a
  // command can never come from model output (AGENTS.md §26).
  allowedCommands: readonly (readonly string[])[];
  toolchain: { nodeMajor: number; packageManager: string };
  limits: SandboxLimits;
  // Workspace files read back after the commands (e.g. the lockfile).
  collect: readonly string[];
  onStageStart?: (stage: string) => Promise<void> | void;
}

export interface SandboxStageOutcome {
  stage: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  output: string;
}

export interface SandboxExecutionResult {
  // In order; stops at the first failing stage.
  stages: SandboxStageOutcome[];
  collected: Record<string, string>;
}

export interface SandboxExecutionProvider {
  readonly id: string;
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult>;
}

export const stagePassed = (s: SandboxStageOutcome) => s.exitCode === 0 && !s.timedOut;

const MAX_OUTPUT_CHARS = 20_000;
const SECRET_ENV = /SECRET|TOKEN|PASSWORD|PASSWD|KEY|CREDENTIAL|DATABASE_URL|REDIS_URL/i;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

// Logs are shown to users and stored: strip terminal codes, redact any value
// of a secret-looking variable of this process and keep only the tail.
export function sanitizeSandboxOutput(
  output: string,
  env: NodeJS.ProcessEnv = process.env,
  extraRedactions: readonly string[] = [],
): string {
  let clean = output.replace(ANSI, '').replace(/\r\n?/g, '\n');
  const secrets = [
    ...Object.entries(env)
      .filter(([name, value]) => SECRET_ENV.test(name) && value && value.length >= 8)
      .map(([, value]) => value!),
    ...extraRedactions.filter((v) => v.length >= 4),
  ];
  for (const secret of secrets) clean = clean.split(secret).join('[redactado]');
  return clean.length > MAX_OUTPUT_CHARS
    ? `[…]\n${clean.slice(clean.length - MAX_OUTPUT_CHARS)}`
    : clean;
}

export const isAllowedCommand = (
  argv: readonly string[],
  allowed: readonly (readonly string[])[],
) => allowed.some((a) => a.length === argv.length && a.every((part, i) => part === argv[i]));

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()[\]\-/]+$/;
const PACKAGE_MANAGER = /^pnpm@\d+\.\d+\.\d+$/;

export const sandboxImageTag = (toolchain: SandboxExecutionRequest['toolchain']) =>
  `caseflow-sandbox:node${toolchain.nodeMajor}-${toolchain.packageManager.replace('@', '')}`;

// Hardened, disposable container for one stage: no host mounts (only the
// run's own volume), no inherited environment, no privileges, bounded
// resources, and no network unless the stage installs dependencies.
export function dockerRunArgs(
  container: string,
  volume: string,
  image: string,
  command: SandboxCommand,
  limits: SandboxLimits,
): string[] {
  return [
    'run',
    '--rm',
    '--name',
    container,
    '--user',
    'node',
    '--workdir',
    '/workspace',
    '--volume',
    `${volume}:/workspace`,
    '--network',
    command.network ? 'bridge' : 'none',
    '--memory',
    `${limits.memoryMb}m`,
    '--memory-swap',
    `${limits.memoryMb}m`,
    '--cpus',
    String(limits.cpus),
    '--pids-limit',
    String(limits.pids),
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--env',
    'NEXT_TELEMETRY_DISABLED=1',
    image,
    ...command.argv,
  ];
}

interface ProcessResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

type Runner = (
  args: string[],
  options?: {
    input?: string;
    timeoutMs?: number;
    onTimeout?: () => void;
    // Read a file back: whole stdout, no log tail truncation, no stderr.
    stdoutOnly?: boolean;
  },
) => Promise<ProcessResult>;

const runDocker: Runner = (args, options = {}) =>
  new Promise((resolve, reject) => {
    // argv only, never a shell: nothing here is interpreted by /bin/sh.
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    let timedOut = false;
    const append = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (!options.stdoutOnly && output.length > MAX_OUTPUT_CHARS * 4)
        output = output.slice(-MAX_OUTPUT_CHARS * 2);
    };
    child.stdout.on('data', append);
    if (!options.stdoutOnly) child.stderr.on('data', append);
    else child.stderr.resume();
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          options.onTimeout?.();
        }, options.timeoutMs)
      : undefined;
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output, timedOut });
    });
    child.stdin.end(options.input ?? '');
  });

// V1 sandbox (DEC-101): generated code only ever runs in these containers.
export class DockerSandboxExecutionProvider implements SandboxExecutionProvider {
  readonly id = 'docker';

  constructor(private readonly run: Runner = runDocker) {}

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    for (const command of request.commands)
      if (!isAllowedCommand(command.argv, request.allowedCommands))
        throw new SandboxExecutionError(
          'SANDBOX_COMMAND_NOT_ALLOWED',
          `El comando "${command.argv.join(' ')}" no pertenece a la plantilla.`,
        );
    for (const { path } of [...request.files, ...request.collect.map((path) => ({ path }))])
      if (!SAFE_PATH.test(path))
        throw new SandboxExecutionError('SANDBOX_INVALID_INPUT', `Ruta no permitida: ${path}`);
    if (!PACKAGE_MANAGER.test(request.toolchain.packageManager))
      throw new SandboxExecutionError('SANDBOX_INVALID_INPUT', 'Gestor de paquetes no soportado.');

    const image = await this.ensureImage(request.toolchain);
    const id = randomUUID().slice(0, 12);
    const volume = `caseflow-sandbox-${id}`;
    const staging = await mkdtemp(join(tmpdir(), 'cfsbx-'));
    const containers: string[] = [];
    try {
      await this.docker(['volume', 'create', volume]);
      await this.copyIn(request.files, staging, volume, image, `${volume}-copy`, containers);
      const stages: SandboxStageOutcome[] = [];
      for (const command of request.commands) {
        await request.onStageStart?.(command.stage);
        const container = `${volume}-${command.stage.toLowerCase()}`;
        containers.push(container);
        const started = Date.now();
        const result = await this.run(
          dockerRunArgs(container, volume, image, command, request.limits),
          {
            timeoutMs: request.limits.timeoutMs,
            onTimeout: () => void this.run(['kill', container]).catch(() => undefined),
          },
        );
        const outcome: SandboxStageOutcome = {
          stage: command.stage,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          durationMs: Date.now() - started,
          output: sanitizeSandboxOutput(result.output, process.env, [staging, volume]),
        };
        stages.push(outcome);
        if (!stagePassed(outcome)) break;
      }
      const collected: Record<string, string> = {};
      if (stages.every(stagePassed))
        for (const path of request.collect) {
          const result = await this.run(
            [
              'run',
              '--rm',
              '--network',
              'none',
              '--volume',
              `${volume}:/workspace:ro`,
              image,
              'cat',
              `/workspace/${path}`,
            ],
            { stdoutOnly: true },
          );
          if (result.exitCode === 0) collected[path] = result.output;
        }
      return { stages, collected };
    } catch (error) {
      if (error instanceof SandboxExecutionError) throw error;
      throw new SandboxExecutionError('SANDBOX_UNAVAILABLE', 'El entorno aislado no respondió.', {
        cause: error,
      });
    } finally {
      // Disposable runtime: nothing of the run survives it.
      for (const container of containers)
        await this.run(['rm', '--force', container]).catch(() => undefined);
      await this.run(['volume', 'rm', '--force', volume]).catch(() => undefined);
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async docker(args: string[], input?: string): Promise<string> {
    let result: ProcessResult;
    try {
      result = await this.run(args, { input });
    } catch (error) {
      throw new SandboxExecutionError('SANDBOX_UNAVAILABLE', 'Docker no está disponible.', {
        cause: error,
      });
    }
    if (result.exitCode !== 0)
      throw new SandboxExecutionError(
        'SANDBOX_ERROR',
        `docker ${args[0]} falló: ${sanitizeSandboxOutput(result.output).slice(-500)}`,
      );
    return result.output;
  }

  private async ensureImage(toolchain: SandboxExecutionRequest['toolchain']): Promise<string> {
    const tag = sandboxImageTag(toolchain);
    const inspect = await this.run(['image', 'inspect', tag]).catch((error: unknown) => {
      throw new SandboxExecutionError('SANDBOX_UNAVAILABLE', 'Docker no está disponible.', {
        cause: error,
      });
    });
    if (inspect.exitCode === 0) return tag;
    const dockerfile = `FROM node:${toolchain.nodeMajor}-bookworm\nRUN npm install --global ${toolchain.packageManager}\n`;
    await this.docker(['build', '--tag', tag, '-'], dockerfile);
    return tag;
  }

  private async copyIn(
    files: SandboxExecutionRequest['files'],
    staging: string,
    volume: string,
    image: string,
    container: string,
    containers: string[],
  ) {
    for (const file of files) {
      const target = join(staging, ...file.path.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    containers.push(container);
    // The copy container only hands the workspace to the unprivileged user.
    await this.docker([
      'create',
      '--name',
      container,
      '--network',
      'none',
      '--volume',
      `${volume}:/workspace`,
      image,
      'chown',
      '-R',
      'node:node',
      '/workspace',
    ]);
    await this.docker(['cp', `${staging}/.`, `${container}:/workspace`]);
    await this.docker(['start', '--attach', container]);
  }
}

// Deterministic double for tests and environments without Docker.
export class FakeSandboxExecutionProvider implements SandboxExecutionProvider {
  readonly id = 'fake';
  readonly requests: SandboxExecutionRequest[] = [];

  constructor(
    private readonly behavior: (
      request: SandboxExecutionRequest,
    ) => SandboxExecutionResult | Promise<SandboxExecutionResult> = (request) => ({
      stages: request.commands.map((c) => ({
        stage: c.stage,
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
        output: 'ok',
      })),
      collected: Object.fromEntries(request.collect.map((path) => [path, `# ${path}\n`])),
    }),
  ) {}

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    for (const command of request.commands)
      if (!isAllowedCommand(command.argv, request.allowedCommands))
        throw new SandboxExecutionError('SANDBOX_COMMAND_NOT_ALLOWED', 'Comando no permitido.');
    this.requests.push(request);
    for (const command of request.commands) await request.onStageStart?.(command.stage);
    return this.behavior(request);
  }
}
