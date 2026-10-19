import { describe, expect, it, vi } from 'vitest';
import {
  DockerSandboxExecutionProvider,
  SandboxExecutionError,
  dockerRunArgs,
  sanitizeSandboxOutput,
  type SandboxExecutionRequest,
} from './sandbox-execution-provider';

const LIMITS = { timeoutMs: 60_000, memoryMb: 2048, cpus: 2, pids: 512 };
const ALLOWED = [
  ['pnpm', 'install'],
  ['pnpm', 'run', 'lint'],
];

const request = (overrides: Partial<SandboxExecutionRequest> = {}): SandboxExecutionRequest => ({
  files: [{ path: 'package.json', content: '{}' }],
  commands: [
    { stage: 'INSTALL', argv: ['pnpm', 'install'], network: true },
    { stage: 'LINT', argv: ['pnpm', 'run', 'lint'], network: false },
  ],
  allowedCommands: ALLOWED,
  toolchain: { nodeMajor: 24, packageManager: 'pnpm@11.27.0' },
  limits: LIMITS,
  collect: ['pnpm-lock.yaml'],
  ...overrides,
});

// Records every docker invocation; `fail` makes a stage exit non-zero.
function fakeDocker(fail?: string, timeoutStage?: string) {
  const calls: string[][] = [];
  const run = vi.fn(
    async (args: string[], options?: { timeoutMs?: number; onTimeout?: () => void }) => {
      calls.push(args);
      const name = args[args.indexOf('--name') + 1] ?? '';
      if (args[0] === 'run' && timeoutStage && name.endsWith(`-${timeoutStage}`)) {
        options?.onTimeout?.();
        return { exitCode: 137, output: '', timedOut: true };
      }
      if (args[0] === 'run' && fail && name.endsWith(`-${fail}`))
        return { exitCode: 1, output: 'error TS2304', timedOut: false };
      return {
        exitCode: 0,
        output: args.includes('cat') ? 'lockfileVersion: 9' : '',
        timedOut: false,
      };
    },
  );
  return { calls, run };
}

describe('DockerSandboxExecutionProvider', () => {
  it('refuses commands outside the template allowlist before touching Docker', async () => {
    const docker = fakeDocker();
    const provider = new DockerSandboxExecutionProvider(docker.run);
    await expect(
      provider.execute(
        request({ commands: [{ stage: 'X', argv: ['sh', '-c', 'curl evil'], network: true }] }),
      ),
    ).rejects.toMatchObject({ code: 'SANDBOX_COMMAND_NOT_ALLOWED' });
    // A prefix of an allowed command with extra arguments is not allowed either.
    await expect(
      provider.execute(
        request({
          commands: [
            { stage: 'X', argv: ['pnpm', 'install', '--ignore-scripts=false'], network: true },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(SandboxExecutionError);
    expect(docker.run).not.toHaveBeenCalled();
  });

  it('refuses paths that escape the workspace', async () => {
    const docker = fakeDocker();
    for (const path of ['../etc/passwd', '/etc/passwd', 'a/../../b'])
      await expect(
        new DockerSandboxExecutionProvider(docker.run).execute(
          request({ files: [{ path, content: '' }] }),
        ),
      ).rejects.toMatchObject({ code: 'SANDBOX_INVALID_INPUT' });
    expect(docker.run).not.toHaveBeenCalled();
  });

  it('runs every stage, collects the lockfile and always removes the volume', async () => {
    const docker = fakeDocker();
    const result = await new DockerSandboxExecutionProvider(docker.run).execute(request());
    expect(result.stages.map((s) => [s.stage, s.exitCode])).toEqual([
      ['INSTALL', 0],
      ['LINT', 0],
    ]);
    expect(result.collected['pnpm-lock.yaml']).toBe('lockfileVersion: 9');
    expect(docker.calls.at(-1)?.slice(0, 2)).toEqual(['volume', 'rm']);
  });

  it('stops at the first failing stage and still cleans up', async () => {
    const docker = fakeDocker('install');
    const result = await new DockerSandboxExecutionProvider(docker.run).execute(request());
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]).toMatchObject({ stage: 'INSTALL', exitCode: 1 });
    expect(result.collected).toEqual({});
    expect(docker.calls.some((c) => c[0] === 'volume' && c[1] === 'rm')).toBe(true);
  });

  it('kills a stage that exceeds its timeout', async () => {
    const docker = fakeDocker(undefined, 'lint');
    const result = await new DockerSandboxExecutionProvider(docker.run).execute(request());
    expect(result.stages[1]).toMatchObject({ stage: 'LINT', timedOut: true });
    expect(docker.calls.some((c) => c[0] === 'kill')).toBe(true);
  });

  it('reports Docker being unavailable as a sandbox error, never as a validation result', async () => {
    const provider = new DockerSandboxExecutionProvider(async () => {
      throw new Error('spawn docker ENOENT');
    });
    await expect(provider.execute(request())).rejects.toMatchObject({
      code: 'SANDBOX_UNAVAILABLE',
    });
  });
});

describe('dockerRunArgs', () => {
  const args = (network: boolean) =>
    dockerRunArgs(
      'c',
      'vol',
      'img',
      { stage: 'S', argv: ['pnpm', 'run', 'test'], network },
      LIMITS,
    );

  it('hardens the container and passes no host environment', () => {
    const a = args(false);
    expect(a).toEqual(
      expect.arrayContaining(['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges']),
    );
    expect(a).not.toContain('--privileged');
    expect(a[a.indexOf('--user') + 1]).toBe('node');
    expect(a[a.indexOf('--pids-limit') + 1]).toBe('512');
    expect(a[a.indexOf('--memory') + 1]).toBe('2048m');
    // Only the run's own volume is mounted, never a host directory.
    expect(a.filter((x) => x === '--volume')).toHaveLength(1);
    expect(a[a.indexOf('--volume') + 1]).toBe('vol:/workspace');
    const envs = a.flatMap((x, i) => (x === '--env' ? [a[i + 1]] : []));
    expect(envs).toEqual(['NEXT_TELEMETRY_DISABLED=1']);
    expect(a.slice(-3)).toEqual(['pnpm', 'run', 'test']);
  });

  it('cuts the network for every stage except installation', () => {
    expect(args(false)[args(false).indexOf('--network') + 1]).toBe('none');
    expect(args(true)[args(true).indexOf('--network') + 1]).toBe('bridge');
  });
});

describe('sanitizeSandboxOutput', () => {
  it('redacts secret values, strips terminal codes and keeps the tail', () => {
    const output = sanitizeSandboxOutput(
      '\u001b[31merror\u001b[0m at C:/tmp/cfsbx-1 using supersecretvalue\r\n',
      { INTERNAL_JOBS_SECRET: 'supersecretvalue', PATH: '/usr/bin' },
      ['C:/tmp/cfsbx-1'],
    );
    expect(output).toBe('error at [redactado] using [redactado]\n');
    expect(sanitizeSandboxOutput('x'.repeat(30_000), {}).length).toBeLessThan(20_100);
  });
});
