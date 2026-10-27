import { describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DockerRuntimeCaptureProvider,
  assertCapturePng,
  validateCaptureInput,
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
    const docker = vi.fn(async (args: string[]) => {
      if (args[0] === 'cp' && args[1]?.includes(':/tmp/capture-output/')) {
        await writeFile(join(args[2]!, '0.json'), JSON.stringify({ status: 'CAPTURED' }));
        await writeFile(join(args[2]!, '0.png'), capturePng());
        await writeFile(join(args[2]!, '1.json'), JSON.stringify({ status: 'SKIPPED' }));
        await writeFile(join(args[2]!, '2.json'), JSON.stringify({ status: 'FAILED' }));
      }
      return '';
    });
    const results = await new DockerRuntimeCaptureProvider(docker).capture(input);
    expect(results.map((item) => item.status)).toEqual(['CAPTURED', 'SKIPPED', 'FAILED']);
    expect(results[0]!.png).toEqual(capturePng());
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
    expect(commands.slice(-3).map((args) => args[0])).toEqual(['rm', 'volume', 'network']);
  });

  it('cleans its own resources after Docker is unavailable or a stage times out', async () => {
    const docker = vi.fn().mockRejectedValue(new Error('Unavailable'));
    await expect(new DockerRuntimeCaptureProvider(docker).capture(input)).rejects.toThrow(
      'Unavailable',
    );
    expect(docker.mock.calls.map(([args]) => args[0])).toEqual(['info', 'rm', 'volume', 'network']);
  });
});
