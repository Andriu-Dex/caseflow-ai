import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../lib/test-utils';
import { StartingPointsDialog } from './starting-points-dialog';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  apply: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
vi.mock('../lib/api', () => ({
  api: {
    startingPoints: {
      list: (...args: unknown[]) => mocks.list(...args),
      apply: (...args: unknown[]) => mocks.apply(...args),
      save: (...args: unknown[]) => mocks.save(...args),
      remove: (...args: unknown[]) => mocks.remove(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const counts = { requirements: 7, useCases: 6, entities: 3 };

describe('StartingPointsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [
        {
          id: 'builtin-acceso',
          name: 'Acceso',
          description: 'Base',
          builtIn: true,
          counts,
          createdAt: null,
        },
        {
          id: 'p-1',
          name: 'Ventas',
          description: '',
          builtIn: false,
          counts,
          createdAt: '2026-11-18T00:00:00Z',
        },
      ],
    });
  });

  it('copies a starting point into the project and says what was copied', async () => {
    mocks.apply.mockResolvedValue(counts);
    render(<StartingPointsDialog projectId="p1" />, { wrapper: TestProviders });
    await userEvent.click(screen.getByRole('button', { name: /Partir de un proyecto parecido/ }));
    expect(await screen.findByText('Acceso')).toBeInTheDocument();
    expect(screen.getByText('Incluido')).toBeInTheDocument();
    // Only a saved one can be deleted.
    expect(screen.queryByRole('button', { name: 'Eliminar Acceso' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar Ventas' })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Usar en este proyecto' })[0]!);
    expect(mocks.apply).toHaveBeenCalledWith('p1', 'builtin-acceso');
    expect(mocks.success).toHaveBeenCalledWith(
      'Se copiaron 7 requisitos, 6 casos de uso y 3 entidades como borradores.',
    );
  });

  it('saves this project as a starting point', async () => {
    mocks.save.mockResolvedValue({});
    render(<StartingPointsDialog projectId="p1" />, { wrapper: TestProviders });
    await userEvent.click(screen.getByRole('button', { name: /Partir de un proyecto parecido/ }));
    const save = await screen.findByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nombre del punto de partida'), 'Mi base');
    await userEvent.click(save);
    expect(mocks.save).toHaveBeenCalledWith('p1', { name: 'Mi base', description: '' });
    expect(mocks.success).toHaveBeenCalledWith('Punto de partida guardado.');
  });
});
