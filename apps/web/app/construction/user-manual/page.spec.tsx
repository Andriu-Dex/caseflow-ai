import { fireEvent, render, screen } from '@testing-library/react';
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
});
