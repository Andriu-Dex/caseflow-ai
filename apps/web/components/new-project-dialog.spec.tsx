import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewProjectDialog } from './new-project-dialog';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'p9' }),
  start: vi.fn().mockResolvedValue({}),
  push: vi.fn(),
  aiAvailable: true,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../lib/api', () => ({
  api: {
    projects: { create: (...args: unknown[]) => mocks.create(...args) },
    workflowRuns: { start: (...args: unknown[]) => mocks.start(...args) },
    ai: { status: async () => ({ available: mocks.aiAvailable }) },
  },
  restoreSession: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe('NewProjectDialog (DEC-116)', () => {
  it('creates a FULL project by default, without a prompt', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(
      <TestProviders>
        <NewProjectDialog open onOpenChange={vi.fn()} workspaceId="w1" onCreated={onCreated} />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText('Nombre del nuevo proyecto'), 'Tienda');
    await user.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('p9'));
    expect(mocks.create).toHaveBeenCalledWith({
      workspaceId: 'w1',
      name: 'Tienda',
      workflowRoute: 'FULL',
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('requires the prompt for BUILD_ONLY and starts the automatic build', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <NewProjectDialog
          open
          onOpenChange={vi.fn()}
          workspaceId="w1"
          onCreated={vi.fn().mockResolvedValue(undefined)}
        />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText('Nombre del nuevo proyecto'), 'Prototipo');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Solo construcción/ })).toBeEnabled(),
    );
    await user.click(screen.getByRole('radio', { name: /Solo construcción/ }));
    const submit = screen.getByRole('button', { name: 'Crear y generar' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Qué aplicación quiere construir/), 'Una app de pedidos');
    await user.click(submit);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('p9', 'Una app de pedidos'));
    expect(mocks.push).toHaveBeenCalledWith('/build');
  });

  it('warns before choosing a prompt route when no AI is available', async () => {
    mocks.aiAvailable = false;
    render(
      <TestProviders>
        <NewProjectDialog open onOpenChange={vi.fn()} workspaceId="w1" onCreated={vi.fn()} />
      </TestProviders>,
    );
    expect(await screen.findByRole('link', { name: 'Ajustes de IA' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(screen.getByRole('radio', { name: /Exprés/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Solo construcción/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Completa/ })).toBeEnabled();
    expect(screen.getAllByText('Requiere IA')).toHaveLength(2);
    mocks.aiAvailable = true;
  });
});
