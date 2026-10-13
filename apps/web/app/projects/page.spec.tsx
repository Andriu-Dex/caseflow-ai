import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectsPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  unarchive: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    workspaces: { list: vi.fn(async () => ({ items: [{ id: 'ws' }] })) },
    projects: {
      list: (...args: unknown[]) => mocks.list(...args),
      unarchive: (...args: unknown[]) => mocks.unarchive(...args),
      update: (...args: unknown[]) => mocks.update(...args),
      delete: (...args: unknown[]) => mocks.remove(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const project = (n: number, archivedAt: string | null = null) => ({
  id: `p${n}`,
  workspaceId: 'ws',
  name: `Proyecto ${n}`,
  description: null,
  language: 'ES',
  workflowRoute: 'FULL',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt,
  hasApprovedArtifacts: true,
});

const renderPage = () =>
  render(
    <TestProviders>
      <ProjectsPage />
    </TestProviders>,
  );

describe('ProjectsPage', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.list.mockImplementation(async (_: string, filters: { offset: number }) => ({
      items: [project(filters.offset + 1)],
      total: 30,
      limit: 12,
      offset: filters.offset,
    }));
  });

  // DEC-134: approved history no longer prevents deleting a project.
  it('deletes a project with approved history once its exact name is typed', async () => {
    mocks.remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const confirm = screen.getByRole('button', { name: 'Eliminar definitivamente' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/escriba el nombre exacto/), 'Proyecto');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/escriba el nombre exacto/), ' 1');
    await user.click(confirm);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('p1', 'Proyecto 1'));
  });

  it('shows active projects first and pages through the rest', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Proyecto 1')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith('ws', {
      search: undefined,
      status: 'ACTIVE',
      workflowRoute: undefined,
      sort: 'RECENT',
      limit: 12,
      offset: 0,
    });
    expect(screen.getByText(/Mostrando 1–12 de 30 proyectos/)).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(await screen.findByText('Proyecto 13')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenLastCalledWith('ws', expect.objectContaining({ offset: 12 }));
  });

  it('filters archived projects, searches after a pause and restores one', async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async () => ({
      items: [project(1, '2026-02-01T00:00:00.000Z')],
      total: 1,
      limit: 12,
      offset: 0,
    }));
    mocks.unarchive.mockResolvedValue(project(1));
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Estado'), 'ARCHIVED');
    await user.type(screen.getByLabelText('Buscar proyectos'), 'tienda');
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(
        'ws',
        expect.objectContaining({ status: 'ARCHIVED', search: 'tienda', offset: 0 }),
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    expect(mocks.unarchive).toHaveBeenCalledWith('p1');
  });

  it('renames a project from the icon button on its card', async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue({ ...project(1), name: 'Tienda Norte' });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar el proyecto Proyecto 1' }));
    const name = screen.getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, '  Tienda Norte ');
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Ventas');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('p1', {
        name: 'Tienda Norte',
        description: 'Ventas',
      }),
    );
  });
});
