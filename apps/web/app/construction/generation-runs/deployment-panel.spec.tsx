import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../../lib/test-utils';
import { DeploymentPanel } from './deployment-panel';

const mocks = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), stop: vi.fn(), resume: vi.fn() }));
vi.mock('../../../lib/api', () => ({
  api: {
    deployments: {
      list: (...args: unknown[]) => mocks.list(...args),
      start: (...args: unknown[]) => mocks.start(...args),
      stop: (...args: unknown[]) => mocks.stop(...args),
      resume: (...args: unknown[]) => mocks.resume(...args),
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
});
