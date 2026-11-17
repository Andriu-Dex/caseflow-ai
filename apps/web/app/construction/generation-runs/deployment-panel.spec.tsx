import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../../lib/test-utils';
import { DeploymentPanel } from './deployment-panel';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  resume: vi.fn(),
  health: vi.fn(),
}));
vi.mock('../../../lib/api', () => ({
  api: {
    deployments: {
      list: (...args: unknown[]) => mocks.list(...args),
      start: (...args: unknown[]) => mocks.start(...args),
      stop: (...args: unknown[]) => mocks.stop(...args),
      resume: (...args: unknown[]) => mocks.resume(...args),
      health: (...args: unknown[]) => mocks.health(...args),
    },
  },
  restoreSession: vi.fn(),
}));

const projectId = '44444444-4444-4444-8444-444444444444';
const snapshotId = '22222222-2222-4222-8222-222222222222';
const running = {
  id: '33333333-3333-4333-8333-333333333333',
  snapshotId,
  status: 'RUNNING',
  tunnelMode: 'QUICK',
  publicUrl: 'https://demo.trycloudflare.com',
  accounts: [{ role: 'Administrador', identifier: 'demo-1-abc' }],
  errorMessage: null,
};

describe('DeploymentPanel', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it('deploys only with an initial password of at least 12 characters', async () => {
    mocks.list.mockResolvedValue({ items: [] });
    mocks.start.mockResolvedValue({});
    render(
      <TestProviders>
        <DeploymentPanel projectId={projectId} snapshotId={snapshotId} />
      </TestProviders>,
    );
    const deploy = await screen.findByRole('button', { name: 'Desplegar' });
    expect((deploy as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Contraseña inicial/), 'Demostracion-2026!');
    await userEvent.click(deploy);
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith(projectId, {
        snapshotId,
        initialPassword: 'Demostracion-2026!',
        tunnelToken: undefined,
      }),
    );
  });

  it('shows the public address and initial accounts of a running deployment', async () => {
    mocks.list.mockResolvedValue({ items: [running] });
    mocks.stop.mockResolvedValue({});
    render(
      <TestProviders>
        <DeploymentPanel projectId={projectId} snapshotId={snapshotId} />
      </TestProviders>,
    );
    expect(
      await screen.findByRole('link', { name: 'https://demo.trycloudflare.com' }),
    ).toBeTruthy();
    expect(screen.getByText('demo-1-abc')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(projectId, running.id));
  });

  it('names each account, shows the containers and warns when one stopped while online', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mocks.list.mockResolvedValue({
      items: [
        {
          ...running,
          accounts: [{ role: 'Cajero', identifier: 'carlos.mena', name: 'Carlos Mena Ortiz' }],
        },
      ],
    });
    mocks.health.mockResolvedValue({
      containers: [
        { role: 'APPLICATION', state: 'RUNNING' },
        { role: 'DATABASE', state: 'STOPPED' },
        { role: 'TUNNEL', state: 'RUNNING' },
      ],
      checkedAt: new Date().toISOString(),
    });
    render(
      <TestProviders>
        <DeploymentPanel projectId={projectId} snapshotId={snapshotId} />
      </TestProviders>,
    );
    expect(await screen.findByText('Carlos Mena Ortiz')).toBeTruthy();
    expect(await screen.findByText('Base de datos')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Algún contenedor no está en ejecución/);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar accesos' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain('Demostración: https://demo.trycloudflare.com');
    expect(copied).toContain('Cajero: carlos.mena (Carlos Mena Ortiz)');
  });

  it('sends the fixed address of an own Cloudflare tunnel with its token', async () => {
    mocks.list.mockResolvedValue({ items: [] });
    mocks.start.mockResolvedValue({});
    render(
      <TestProviders>
        <DeploymentPanel projectId={projectId} snapshotId={snapshotId} />
      </TestProviders>,
    );
    await userEvent.type(await screen.findByLabelText(/Contraseña inicial/), 'Demostracion-2026!');
    await userEvent.click(screen.getByText('Usar un túnel propio de Cloudflare (dirección fija)'));
    await userEvent.type(
      screen.getByLabelText('Token del túnel'),
      'token-de-tunel-con-longitud-suficiente',
    );
    await userEvent.type(
      screen.getByLabelText(/Dirección pública del túnel/),
      'https://demo.mateos.ec',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Desplegar' }));
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith(projectId, {
        snapshotId,
        initialPassword: 'Demostracion-2026!',
        tunnelToken: 'token-de-tunel-con-longitud-suficiente',
        tunnelUrl: 'https://demo.mateos.ec',
      }),
    );
  });
});
