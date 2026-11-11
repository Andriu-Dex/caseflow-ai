import { describe, expect, it, vi } from 'vitest';
import { DockerTunnelDeploymentProvider, deploymentNames } from './deployment-provider';

const deploymentId = 'd43bf111-87c8-4838-9277-109541d28f9d';
const files = [
  {
    path: 'package.json',
    content: JSON.stringify({ packageManager: 'pnpm@11.27.0', engines: { node: '>=24 <25' } }),
  },
  { path: 'pnpm-lock.yaml', content: 'lockfileVersion: 9' },
  { path: 'apps/api/src/auth/deploy-accounts.ts', content: '' },
];

function docker(fail?: string) {
  const calls: string[][] = [];
  const run = vi.fn(async (args: string[]) => {
    calls.push(args);
    if (fail && args.join(' ').includes(fail)) throw new Error('failed');
    if (args[0] === 'logs') return 'Visit https://demo-tunnel.trycloudflare.com now';
    if (args.includes('apps/api/dist/auth/deploy-accounts.js'))
      return '[{"role":"Administrador","identifier":"demo-1-abc"}]';
    return '';
  });
  return { calls, run };
}

describe('DockerTunnelDeploymentProvider', () => {
  it('publishes through the tunnel only, with secrets kept out of process arguments', async () => {
    const { calls, run } = docker();
    const result = await new DockerTunnelDeploymentProvider(run, async () => undefined).deploy({
      deploymentId,
      files,
      initialPassword: 'Demostracion-2026!',
      tunnelToken: 'token-de-tunel-con-longitud-suficiente',
    });
    expect(result).toEqual({
      publicUrl: null,
      accounts: [{ role: 'Administrador', identifier: 'demo-1-abc' }],
    });
    const all = calls.map((args) => args.join(' ')).join('\n');
    expect(all).not.toContain('Demostracion-2026!');
    expect(all).not.toContain('token-de-tunel-con-longitud-suficiente');
    expect(all).not.toMatch(/POSTGRES_PASSWORD=|JWT_SECRET=|DATABASE_URL=/);
    const names = deploymentNames(deploymentId);
    // The application network has no route out; only the tunnel joins an egress network.
    expect(calls).toContainEqual(
      expect.arrayContaining(['network', 'create', '--internal', names.network]),
    );
    expect(calls).toContainEqual(['network', 'connect', names.network, names.tunnel]);
    expect(all).not.toMatch(/ -p \d+:\d+| --publish /);
  });

  it('removes everything it created when the deployment fails', async () => {
    const { calls, run } = docker('exec --env-file');
    await expect(
      new DockerTunnelDeploymentProvider(run, async () => undefined).deploy({
        deploymentId,
        files,
        initialPassword: 'Demostracion-2026!',
      }),
    ).rejects.toThrow();
    const names = deploymentNames(deploymentId);
    expect(calls).toContainEqual(
      expect.arrayContaining(['rm', '-f', names.tunnel, names.app, names.database]),
    );
    expect(calls).toContainEqual(['volume', 'rm', '-f', names.appVolume, names.dataVolume]);
    expect(calls).toContainEqual(['network', 'rm', names.network]);
  });

  it('fails removal when a resource of the deployment is still present', async () => {
    const run = vi.fn(async (args: string[]) => (args[0] === 'ps' ? 'abc123' : ''));
    await expect(new DockerTunnelDeploymentProvider(run).remove(deploymentId)).rejects.toThrow(
      'could not be removed',
    );
    const clean = vi.fn(async () => '');
    await expect(
      new DockerTunnelDeploymentProvider(clean).remove(deploymentId),
    ).resolves.toBeUndefined();
  });

  it('rejects a short initial password before touching Docker', async () => {
    const { run } = docker();
    await expect(
      new DockerTunnelDeploymentProvider(run).deploy({
        deploymentId,
        files,
        initialPassword: 'corta',
      }),
    ).rejects.toThrow('12 characters');
    expect(run).not.toHaveBeenCalled();
  });
});
