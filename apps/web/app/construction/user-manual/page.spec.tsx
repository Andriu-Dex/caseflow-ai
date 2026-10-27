import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserManualResponse } from '@caseflow-ai/contracts';
import UserManualPage, { ManualEditor } from './page';
import { api } from '../../../lib/api';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('snapshotId=00000000-0000-4000-8000-000000000001'),
}));
vi.mock('../../../components/query-state', () => ({
  RequireActiveProject: ({ children }: { children: (projectId: string) => React.ReactNode }) =>
    children('00000000-0000-4000-8000-000000000001'),
}));
afterEach(() => vi.restoreAllMocks());

const id = '00000000-0000-4000-8000-000000000001';
const manual: UserManualResponse = {
  id,
  code: 'MAN-001',
  snapshotId: id,
  isCurrent: true,
  version: { id, versionNumber: 1, status: 'GENERATED' },
  history: [],
  introduction: 'Guía breve',
  tasks: [
    {
      id,
      generatedFileId: id,
      title: 'Consultar',
      routePath: '/items',
      roles: ['Lector'],
      verified: true,
      steps: [{ instruction: 'Abra la pantalla.', expectedResult: 'Vea sus datos.' }],
    },
  ],
};

describe('manual review editor', () => {
  it('requests cancellation and disables the button while cleanup is pending', async () => {
    const job = { id, status: 'RUNNING' as const, errorMessage: null, captureRequested: true };
    const state = vi.spyOn(api.userManuals, 'state').mockResolvedValue({ manual, job });
    const cancel = vi.spyOn(api.userManuals, 'cancelCapture').mockImplementation(async () => {
      const next = { manual, job: { ...job, status: 'CANCELLING' as const } };
      state.mockResolvedValue(next);
      return next;
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserManualPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar captura' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(id, id));
    expect(
      await screen.findByRole('button', { name: 'Cancelando y liberando recursos…' }),
    ).toBeDisabled();
  });
  it('shows explicit capture failures and allows a new isolated capture request', async () => {
    vi.spyOn(api.userManuals, 'state').mockResolvedValue({
      job: null,
      manual: {
        ...manual,
        tasks: manual.tasks.map((task) => ({
          ...task,
          captures: [
            {
              id,
              bundleId: id,
              role: 'Lector',
              status: 'FAILED',
              reason: 'Docker no está disponible.',
              sha256: null,
              width: null,
              height: null,
              profile: 'EMPTY_DATABASE_DESKTOP_V1',
            },
          ],
        })),
      },
    });
    const capture = vi.spyOn(api.userManuals, 'capture').mockResolvedValue({ manual, job: null });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserManualPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Docker no está disponible.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a generar capturas' }));
    await waitFor(() => expect(capture).toHaveBeenCalledWith(id, id));
  });
  it('blocks duplicate capture, editing and review while runtime capture is active', async () => {
    vi.spyOn(api.userManuals, 'state').mockResolvedValue({
      job: { id, status: 'RUNNING', errorMessage: null },
      manual: { ...manual, version: { ...manual.version, status: 'IN_REVIEW' } },
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserManualPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Aprobar manual' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Preparando manual o capturando pantallas…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Instrucción 1')).toBeDisabled();
    expect(
      screen.getByRole('progressbar', { name: 'Progreso de generación y capturas' }),
    ).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Sin porcentaje confirmado')).toBeInTheDocument();
  });
  it('blocks approval, export and history navigation while the editor has unsaved instructions', async () => {
    vi.spyOn(api.userManuals, 'state').mockResolvedValue({
      job: null,
      manual: { ...manual, version: { ...manual.version, status: 'IN_REVIEW' } },
    });
    const transition = vi.spyOn(api.userManuals, 'transition');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <UserManualPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Aprobar manual' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Instrucción 1'), {
      target: { value: 'Instrucción todavía sin guardar' },
    });
    expect(screen.getByRole('button', { name: 'Aprobar manual' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descargar PDF (borrador)' })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(transition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios sin guardar' }));
    expect(screen.getByLabelText('Instrucción 1')).toHaveValue('Abra la pantalla.');
    expect(screen.getByRole('button', { name: 'Aprobar manual' })).toBeEnabled();
  });
  it('invalidates a task verification when its instructions change and saves a new version request', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const dirty = vi.fn();
    render(<ManualEditor manual={manual} busy={false} save={save} onDirtyChange={dirty} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Instrucción 1'), {
      target: { value: 'Abra Artículos.' },
    });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(dirty).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersionId: id,
        tasks: [
          expect.objectContaining({
            verified: true,
            steps: [{ instruction: 'Abra Artículos.', expectedResult: 'Vea sus datos.' }],
          }),
        ],
      }),
    );
    expect(screen.getByText(/No es una captura/)).toBeInTheDocument();
  });
  it('requires at least one step and resets all verification when the introduction changes', () => {
    render(<ManualEditor manual={manual} busy={true} save={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Quitar paso' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Introducción'), {
      target: { value: 'Nueva introducción' },
    });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir paso' }));
    expect(screen.getByLabelText('Instrucción 2')).toHaveValue('');
  });
  it('updates the original task after filtering and preserves tasks on other pages when saving', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      ...manual.tasks[0]!,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title: `Tarea de prueba ${index + 1}`,
      routePath: `/items/${index + 1}`,
    }));
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ManualEditor manual={{ ...manual, tasks }} busy={false} save={save} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar tareas en el manual' }), {
      target: { value: 'Tarea de prueba 12' },
    });
    fireEvent.change(screen.getByLabelText('Instrucción 1'), {
      target: { value: 'Revise la última tarea.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ id: tasks[0]!.id, verified: true }),
          expect.objectContaining({
            id: tasks[11]!.id,
            verified: false,
            steps: [{ instruction: 'Revise la última tarea.', expectedResult: 'Vea sus datos.' }],
          }),
        ]),
      }),
    );
    expect(save.mock.calls[0]![0].tasks).toHaveLength(12);
  });
  it('reveals an invalid task on another page instead of submitting hidden invalid fields', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      ...manual.tasks[0]!,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title: `Tarea de prueba ${index + 1}`,
      routePath: `/items/${index + 1}`,
      steps: [
        { instruction: index === 11 ? '' : 'Abra la pantalla.', expectedResult: 'Vea sus datos.' },
      ],
    }));
    const save = vi.fn();
    render(<ManualEditor manual={{ ...manual, tasks }} busy={false} save={save} />);
    expect(screen.queryByLabelText('Tarea 12')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tarea 12')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Instrucción 1')[1]).toHaveValue('');
  });
});
