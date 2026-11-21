import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../lib/test-utils';
import { ProjectCardProgress } from './project-card-progress';

const mocks = vi.hoisted(() => ({ readiness: vi.fn(), deployments: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: {
    readiness: { get: (...args: unknown[]) => mocks.readiness(...args) },
    deployments: { list: (...args: unknown[]) => mocks.deployments(...args) },
  },
  restoreSession: vi.fn(),
}));

describe('ProjectCardProgress', () => {
  it('shows the planning stages done and an online demonstration', async () => {
    mocks.readiness.mockResolvedValue({
      stages: [
        { key: 'SOURCES', satisfied: true },
        { key: 'CONTEXT', satisfied: true },
        { key: 'REQUIREMENTS', satisfied: false },
        { key: 'USE_CASES', satisfied: false },
      ],
    });
    mocks.deployments.mockResolvedValue({ items: [{ id: 'd1', status: 'RUNNING' }] });
    render(<ProjectCardProgress projectId="p1" />, { wrapper: TestProviders });
    expect(await screen.findByText('2 / 4 etapas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de la planificación' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(await screen.findByText('Demostración en línea')).toBeInTheDocument();
  });
});
