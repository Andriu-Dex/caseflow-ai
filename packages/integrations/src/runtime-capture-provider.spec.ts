import { describe, expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import {
  DockerRuntimeCaptureProvider,
  assertCapturePng,
  validateCaptureInput,
  createCaptureSessionToken,
  validateCaptureSessions,
  captureTimeouts,
} from './runtime-capture-provider';
import { capturePng } from './testing/runtime-capture-fixture';

const input = {
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({ packageManager: 'pnpm@11.27.0', engines: { node: '>=24 <25' } }),
    },
    { path: 'pnpm-lock.yaml', content: 'lockfileVersion: 9' },
    { path: 'apps/web/package.json', content: '{}' },
    { path: 'apps/web/app/page.tsx', content: 'export default function Page() {}' },
    { path: '.env', content: 'MUST_NOT_COPY=secret' },
    { path: '.npmrc', content: 'unsafe' },
  ],
  targets: [
    { routePath: '/items', role: 'Editor' },
    { routePath: '/items/[id]', role: 'Editor' },
    { routePath: '/', role: '' },
  ],
};

describe('Docker runtime capture boundary', () => {
  it('applies configured bounds to both the host and fixed container commands', async () => {
    const calls: { args: string[]; timeout: number }[] = [];
    const docker = vi.fn(async (args: string[], timeout: number) => {
      calls.push({ args, timeout });
      if (args[0] === 'cp' && args[1]?.includes(':/tmp/capture-output/'))
        await writeFile(join(args[2]!, '0.json'), JSON.stringify({ status: 'SKIPPED' }));
      return '';
    });
    vi.stubEnv('CASEFLOW_BUILD_TIMEOUT', '1501');
    vi.stubEnv('CASEFLOW_CAPTURE_TIMEOUT', '600');
    vi.stubEnv('CASEFLOW_BROWSER_TIMEOUT', '3000');
    try {
      await new DockerRuntimeCaptureProvider(docker).capture({
        ...input,
        targets: [input.targets[0]!],
      });
      const build = calls.find((call) =>
        call.args.includes(
          'pnpm --filter ./apps/api exec prisma generate; pnpm run build:packages; pnpm --filter ./apps/api run build; pnpm --filter ./apps/web run build',
        ),
      )!;
      expect(build.timeout).toBe(1501);
      expect(
        build.args.slice(build.args.indexOf('timeout'), build.args.indexOf('timeout') + 3),
      ).toEqual(['timeout', '--kill-after=5', '2']);
      const runtime = calls.find((call) =>
        call.args.some((arg) => arg.includes('prisma db push;')),
      )!;
      expect(
        runtime.args.slice(runtime.args.indexOf('timeout'), runtime.args.indexOf('timeout') + 3),
      ).toEqual(['timeout', '--kill-after=5', '600']);
      expect(
        calls.find((call) => call.args[0] === 'start' && call.args.at(-1)?.endsWith('-browser'))!
          .timeout,
      ).toBe(3000);
      expect(
        calls.find(
          (call) => call.args[0] === 'create' && call.args.includes('/tmp/controller/browser.cjs'),
        )!.args,
      ).toContain('CASEFLOW_BROWSER_TIMEOUT_MS=3000');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('runs the generated end-to-end tests in the browser container and reads their verdict', async () => {
    const calls: string[][] = [];
    const copied: Record<string, string> = {};
    const run = (exit: number) =>
      new DockerRuntimeCaptureProvider(async (args) => {
        calls.push(args);
        if (args[0] === 'cp' && args[2]?.endsWith(':/opt/capture/run')) {
          copied.spec = await readFile(join(args[1]!.slice(0, -2), 'e2e/screens.spec.ts'), 'utf8');
          copied.sessions = await readFile(join(args[1]!.slice(0, -2), 'sessions.json'), 'utf8');
        }
        return args[0] === 'start' ? `1 passed\nCASEFLOW_E2E_EXIT=${exit}\n` : '';
      }).runE2E({
        files: [...input.files, { path: 'apps/web/e2e/screens.spec.ts', content: '// screens' }],
        roles: ['Editor', '', 'Editor'],
      });
    const passed = await run(0);
    expect(passed).toMatchObject({ passed: true, output: '1 passed' });
    expect(copied.spec).toBe('// screens');
    expect(Object.keys(JSON.parse(copied.sessions!))).toEqual(['Editor']);
    const create = calls.find((args) => args[0] === 'create' && args.includes('sh'))!;
    expect(create).toContain('--network');
    expect(create).toContain('--cap-drop=ALL');
    expect(create.indexOf('E2E_SESSIONS=/opt/capture/run/sessions.json')).toBeLessThan(
      create.indexOf('sh'),
    );
    expect(calls.at(-3)![0]).toBe('rm');
    expect((await run(1)).passed).toBe(false);
  });
  it('refuses to run end-to-end tests when the project has none', async () => {
    const docker = vi.fn();
    await expect(
      new DockerRuntimeCaptureProvider(docker).runE2E({ files: input.files, roles: [] }),
    ).rejects.toThrow('no end-to-end tests');
    expect(docker).not.toHaveBeenCalled();
  });
  it('validates timeout units and refuses values that disable or overflow the capture boundary', async () => {
    expect(captureTimeouts({})).toEqual({
      buildMs: 600_000,
      runtimeSeconds: 240,
      browserMs: 180_000,
    });
    expect(
      captureTimeouts({
        CASEFLOW_BUILD_TIMEOUT: '1501',
        CASEFLOW_CAPTURE_TIMEOUT: '600',
        CASEFLOW_BROWSER_TIMEOUT: '300000',
      }),
    ).toEqual({ buildMs: 1501, runtimeSeconds: 600, browserMs: 300000 });
    for (const key of [
      'CASEFLOW_BUILD_TIMEOUT',
      'CASEFLOW_CAPTURE_TIMEOUT',
      'CASEFLOW_BROWSER_TIMEOUT',
    ]) {
      for (const value of [
        '',
        '0',
        '-1',
        'NaN',
        'Infinity',
        '1.5',
        '1e3',
        '9999999999999999999999',
      ])
        expect(() => captureTimeouts({ [key]: value })).toThrow(key);
    }
    expect(() => captureTimeouts({ CASEFLOW_BUILD_TIMEOUT: '600001' })).toThrow();
    expect(() => captureTimeouts({ CASEFLOW_CAPTURE_TIMEOUT: '721' })).toThrow();
    expect(() => captureTimeouts({ CASEFLOW_BROWSER_TIMEOUT: '600001' })).toThrow();
    const docker = vi.fn();
    vi.stubEnv('CASEFLOW_CAPTURE_TIMEOUT', '0');
    try {
      await expect(new DockerRuntimeCaptureProvider(docker).capture(input)).rejects.toThrow(
        'CASEFLOW_CAPTURE_TIMEOUT',
      );
      expect(docker).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('issues isolated HS256 sessions with the requested role and a valid subject without requiring a development endpoint', () => {
    const token = createCaptureSessionToken(
      'Encargado de sucursal',
      'sandbox-test-only',
      1_000_000,
    );
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({
      roles: ['Encargado de sucursal'],
      exp: 1600,
      sub: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(signature).toBe(
      createHmac('sha256', 'sandbox-test-only').update(`${header}.${payload}`).digest('base64url'),
    );
    expect(signature).not.toBe(
      createHmac('sha256', 'another-runtime-key')
        .update(`${header}.${payload}`)
        .digest('base64url'),
    );
  });
  it('accepts only the requested role with a real, signed, unexpired disposable session', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const sign = (extra = {}, secret = 'capture-only') => {
      const content = [
        Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
        Buffer.from(
          JSON.stringify({ sub: id, sessionId: id, roles: ['Editor'], exp: 100, ...extra }),
        ).toString('base64url'),
      ].join('.');
      return content + '.' + createHmac('sha256', secret).update(content).digest('base64url');
    };
    const target = [{ routePath: '/', role: 'Editor' }];
    const token = sign();
    expect(
      validateCaptureSessions({ Editor: token, unused: 'private' }, target, 'capture-only', 1),
    ).toEqual({ Editor: token });
    const scoped = sign({ scopeId: id });
    expect(validateCaptureSessions({ Editor: scoped }, target, 'capture-only', 1)).toEqual({
      Editor: scoped,
    });
    for (const bad of [
      sign({}, 'other-key'),
      sign({ sessionId: undefined }),
      sign({ roles: ['Editor', 'Administrator'] }),
      sign({ roles: ['Other'] }),
      sign({ exp: 0 }),
      sign({ scopeId: 'untrusted-scope' }),
      sign({ scopeId: { id } }),
    ])
      expect(() => validateCaptureSessions({ Editor: bad }, target, 'capture-only', 1)).toThrow();
  });
  it('accepts bounded relative inputs and rejects traversal, duplicate paths and external targets before Docker', async () => {
    validateCaptureInput(input);
    for (const files of [[{ path: '../escape', content: '' }], [...input.files, input.files[0]!]])
      expect(() => validateCaptureInput({ ...input, files })).toThrow();
    for (const routePath of ['//host', '/../../secret', 'http://localhost', '/a?script=1'])
      expect(() =>
        validateCaptureInput({ ...input, targets: [{ role: '', routePath }] }),
      ).toThrow();
    expect(() => validateCaptureInput({ ...input, targets: [] })).toThrow();
    expect(() =>
      validateCaptureInput({
        ...input,
        files: input.files.map((file) =>
          file.path === 'package.json'
            ? { ...file, content: JSON.stringify({ packageManager: 'pnpm@99.0.0' }) }
            : file,
        ),
      }),
    ).toThrow('toolchain');
    expect(() =>
      validateCaptureInput({
        ...input,
        targets: Array.from({ length: 41 }, () => input.targets[0]!),
      }),
    ).toThrow();
    expect(() => assertCapturePng(Buffer.from('wrong'))).toThrow();
    assertCapturePng(capturePng());
    const docker = vi.fn();
    await expect(
      new DockerRuntimeCaptureProvider(docker).capture({ ...input, targets: [] }),
    ).rejects.toThrow();
    expect(docker).not.toHaveBeenCalled();
  });

  it('isolates build and runtime, refuses host mounts and collects only the planned images', async () => {
    let plan: { role: string; token: string | null }[] = [];
    let failureCode = 'API_FAILURE';
    const docker = vi.fn(async (args: string[]) => {
      if (args[0] === 'cp' && args[2]?.endsWith(':/tmp/controller'))
        plan = JSON.parse(await readFile(join(args[1]!.slice(0, -2), 'plan.json'), 'utf8'));
      if (args[0] === 'cp' && args[1]?.includes(':/tmp/capture-output/')) {
        await writeFile(join(args[2]!, '0.json'), JSON.stringify({ status: 'CAPTURED' }));
        await writeFile(join(args[2]!, '0.png'), capturePng());
        await writeFile(join(args[2]!, '1.json'), JSON.stringify({ status: 'SKIPPED' }));
        await writeFile(
          join(args[2]!, '2.json'),
          JSON.stringify({ status: 'FAILED', reasonCode: failureCode }),
        );
      }
      return '';
    });
    const results = await new DockerRuntimeCaptureProvider(docker).capture(input);
    expect(results.map((item) => item.status)).toEqual(['CAPTURED', 'SKIPPED', 'FAILED']);
    expect(results[0]!.png).toEqual(capturePng());
    expect(results[2]!.reason).toContain('API de prueba');
    const commands = docker.mock.calls.map(([args]) => args);
    expect(commands.find((args) => args[0] === 'network' && args[1] === 'create')).toContain(
      'com.docker.network.bridge.gateway_mode_ipv4=isolated',
    );
    for (const args of commands.filter((args) => args[0] === 'run' || args[0] === 'create')) {
      expect(args).not.toContain('--privileged');
      expect(args).not.toContain('-p');
      expect(args.join(' ')).not.toContain('docker.sock');
    }
    expect(
      commands.find((args) => args.join(' ').includes('--frozen-lockfile'))!.join(' '),
    ).toContain('--ignore-scripts');
    expect(commands.find((args) => args.some((arg) => arg.includes('prisma generate')))).toContain(
      '--network=none',
    );
    expect(commands.find((args) => args.includes('--user=pwuser'))).toBeDefined();
    const signingKey = commands
      .flat()
      .find((arg) => arg.startsWith('JWT_SECRET='))!
      .slice('JWT_SECRET='.length);
    const [header, payload, signature] = plan[0]!.token!.split('.');
    expect(signature).toBe(
      createHmac('sha256', signingKey).update(`${header}.${payload}`).digest('base64url'),
    );
    expect(plan[2]!.token).toBeNull();
    expect(JSON.stringify(results)).not.toContain(plan[0]!.token!);
    expect(commands.flat()).toContain('DEV_LOGIN=false');
    expect(commands.slice(-3).map((args) => args[0])).toEqual(['rm', 'volume', 'network']);
    failureCode = 'API_FORBIDDEN';
    expect((await new DockerRuntimeCaptureProvider(docker).capture(input))[2]!.reason).toContain(
      'no tiene permiso',
    );
    failureCode = 'API_UNAUTHORIZED';
    expect((await new DockerRuntimeCaptureProvider(docker).capture(input))[2]!.reason).toContain(
      'no aceptó la sesión',
    );
    failureCode = 'private provider stack and secret';
    const retry = await new DockerRuntimeCaptureProvider(docker).capture(input);
    expect(retry[2]!.reason).toContain('No se pudo comprobar');
    expect(JSON.stringify(retry)).not.toContain(failureCode);
  });

  it('interrupts an active Docker command and cleans only its invocation resources without the aborted signal', async () => {
    const controller = new AbortController();
    const docker = vi.fn(async (args: string[], _timeout: number, signal?: AbortSignal) => {
      if (args[0] === 'image') throw new Error('Image not prepared.');
      if (args[0] === 'build') {
        controller.abort();
        signal!.throwIfAborted();
      }
      return '';
    });
    await expect(
      new DockerRuntimeCaptureProvider(docker).capture({ ...input, signal: controller.signal }),
    ).rejects.toThrow();
    const cleanup = docker.mock.calls.slice(-3);
    expect(cleanup.map(([args]) => args[0])).toEqual(['rm', 'volume', 'network']);
    expect(cleanup.every(([, , signal]) => signal === undefined)).toBe(true);
    expect(cleanup[0]![0].slice(2).every((name) => name.startsWith('caseflow-capture-'))).toBe(
      true,
    );
    const untouched = vi.fn();
    await expect(
      new DockerRuntimeCaptureProvider(untouched).capture({ ...input, signal: controller.signal }),
    ).rejects.toThrow();
    expect(untouched).not.toHaveBeenCalled();
  });
  it('cleans its own resources after Docker is unavailable or a stage times out', async () => {
    const docker = vi.fn().mockRejectedValue(new Error('Unavailable'));
    await expect(new DockerRuntimeCaptureProvider(docker).capture(input)).rejects.toThrow(
      'Unavailable',
    );
    expect(docker.mock.calls.map(([args]) => args[0])).toEqual(['info', 'rm', 'volume', 'network']);
  });
});
