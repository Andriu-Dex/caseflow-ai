import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowStagesFor } from '@caseflow-ai/contracts';
import BuildPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  retry: vi.fn(),
  review: vi.fn(),
  approve: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    workflowRuns: {
      list: (...args: unknown[]) => mocks.list(...args),
      retry: (...args: unknown[]) => mocks.retry(...args),
      review: (...args: unknown[]) => mocks.review(...args),
      approve: (...args: unknown[]) => mocks.approve(...args),
      start: vi.fn(),
    },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const run = {
  id: 'r1',
  projectId: 'p1',
  prompt: 'Una app de pedidos',
  status: 'FAILED',
  currentStage: 'USE_CASES',
  stages: workflowStagesFor('BUILD_ONLY'),
  completedStages: ['SOURCE', 'CONTEXT', 'REQUIREMENTS'],
  errorMessage: 'La etapa «casos de uso» no se completó: el proveedor no respondió.',
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
});

describe('BuildPage (DEC-116)', () => {
  it('shows the prompt, the progress and resumes a failed build from its stage', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({ items: [run] });
    mocks.retry.mockResolvedValue({ ...run, status: 'QUEUED' });
    render(
      <TestProviders>
        <BuildPage />
      </TestProviders>,
    );
    expect(await screen.findByText('Una app de pedidos')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('«casos de uso»');
    expect(screen.getAllByLabelText('Completada')).toHaveLength(3);
    expect(screen.getByLabelText('Falló')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar desde esta etapa/ }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('p1', 'r1'));
  });

  // EXPRESS (DEC-119): the run waits for a person, who approves in bulk.
  it('shows what the bulk review covers and approves it', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({
      items: [
        {
          ...run,
          status: 'AWAITING_REVIEW',
          currentStage: 'PLANNING_REVIEW',
          stages: workflowStagesFor('EXPRESS'),
          errorMessage: null,
        },
      ],
    });
    mocks.review.mockResolvedValue({
      items: [
        {
          stage: 'REQUIREMENTS',
          artifactType: 'REQUIREMENT',
          artifactId: 'a1',
          versionId: 'v1',
          code: 'RF-001',
          title: 'Registrar pedido',
          versionNumber: 1,
          status: 'GENERATED',
        },
      ],
    });
    mocks.approve.mockResolvedValue({});
    render(
      <TestProviders>
        <BuildPage />
      </TestProviders>,
    );
    expect(await screen.findByText('Registrar pedido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Revisar/ })).toHaveAttribute('href', '/requirements');
    expect(screen.getByLabelText('Esperando su revisión')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aprobar todo y congelar el diseño' }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('p1', 'r1'));
  });

  it('offers to start the build when the project has none yet', async () => {
    mocks.list.mockResolvedValue({ items: [] });
    render(
      <TestProviders>
        <BuildPage />
      </TestProviders>,
    );
    expect(await screen.findByRole('button', { name: 'Comenzar' })).toBeDisabled();
  });
});
