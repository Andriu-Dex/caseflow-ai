import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewProjectDialog } from './new-project-dialog';

const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'p9' }),
  start: vi.fn().mockResolvedValue({}),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../lib/api', () => ({
  api: {
    projects: { create: (...args: unknown[]) => mocks.create(...args) },
    workflowRuns: { start: (...args: unknown[]) => mocks.start(...args) },
  },
  ApiError: class ApiError extends Error {},
}));

describe('NewProjectDialog (DEC-116)', () => {
  it('creates a FULL project by default, without a prompt', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<NewProjectDialog open onOpenChange={vi.fn()} workspaceId="w1" onCreated={onCreated} />);
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
      <NewProjectDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="w1"
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await user.type(screen.getByLabelText('Nombre del nuevo proyecto'), 'Prototipo');
    await user.click(screen.getByRole('radio', { name: /Solo construcción/ }));
    const submit = screen.getByRole('button', { name: 'Crear y construir' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Qué aplicación quiere construir/), 'Una app de pedidos');
    await user.click(submit);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('p9', 'Una app de pedidos'));
    expect(mocks.push).toHaveBeenCalledWith('/build');
  });
});
