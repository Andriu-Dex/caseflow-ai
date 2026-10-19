import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowRunPanel } from './workflow-run-panel';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  review: vi.fn(),
  approve: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    workflowRuns: {
      list: (...args: unknown[]) => mocks.list(...args),
      start: (...args: unknown[]) => mocks.start(...args),
      review: (...args: unknown[]) => mocks.review(...args),
      approve: (...args: unknown[]) => mocks.approve(...args),
      retry: (...args: unknown[]) => mocks.retry(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

describe('WorkflowRunPanel', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.start.mockReset();
  });

  it('renders hero prompt studio when no runs exist and starts a run when prompt submitted', async () => {
    mocks.list.mockResolvedValue({ items: [] });
    mocks.start.mockResolvedValue({ id: 'run-1' });
    const user = userEvent.setup();

    render(
      <TestProviders>
        <WorkflowRunPanel projectId="p1" title="Asistente Exprés" />
      </TestProviders>,
    );

    expect(
      await screen.findByText('Diseñe y construya su aplicación a partir de una idea'),
    ).toBeInTheDocument();
    expect(screen.getByText('¿Qué aplicación quiere construir?')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Comenzar/i });
    expect(startBtn).toBeDisabled();

    // Clicking a prompt suggestion populates the textarea
    const chip = screen.getByRole('button', {
      name: /Sistema de gestión de inventario y pedidos con control de stock y proveedores/i,
    });
    await user.click(chip);

    expect(startBtn).not.toBeDisabled();
    await user.click(startBtn);

    await waitFor(() => {
      expect(mocks.start).toHaveBeenCalledWith(
        'p1',
        'Sistema de gestión de inventario y pedidos con control de stock y proveedores',
      );
    });
  });

  it('renders timeline stepper and initial idea when run exists', async () => {
    mocks.list.mockResolvedValue({
      items: [
        {
          id: 'run-1',
          projectId: 'p1',
          status: 'RUNNING',
          prompt: 'Mi app de prueba',
          stages: ['SOURCE', 'CONTEXT', 'REQUIREMENTS'],
          completedStages: ['SOURCE'],
          currentStage: 'CONTEXT',
        },
      ],
    });

    render(
      <TestProviders>
        <WorkflowRunPanel projectId="p1" title="Asistente Exprés" />
      </TestProviders>,
    );

    expect(await screen.findByText('Idea inicial del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Mi app de prueba')).toBeInTheDocument();
    expect(screen.getByText('Progreso por etapas del pipeline')).toBeInTheDocument();
    expect(screen.getByText('En ejecución')).toBeInTheDocument();
    expect(screen.getByText('✓ Completada')).toBeInTheDocument();
  });
});
