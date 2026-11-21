import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseNotesResponse } from '@caseflow-ai/contracts';
import { TestProviders } from '../../../lib/test-utils';
import { ReleaseNotes } from './release-notes';

const mocks = vi.hoisted(() => ({ notes: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
vi.mock('../../../lib/api', () => ({
  api: { generationRuns: { releaseNotes: (...args: unknown[]) => mocks.notes(...args) } },
  restoreSession: vi.fn(),
}));

const notes: ReleaseNotesResponse = {
  title: 'Mateos: entrega 2, Ventas',
  delivery: { position: 2, name: 'Ventas' },
  canDo: [{ role: 'Cajero', useCases: ['Registrar venta'] }],
  requirements: {
    passed: [{ code: 'RF-010', title: 'Registrar ventas' }],
    failed: 0,
    notRun: 1,
    withoutCriteria: 2,
  },
  demo: {
    url: 'https://demo.example.com',
    accounts: [{ role: 'Cajero', identifier: 'carlos.mena', name: 'Carlos Mena' }],
  },
  changes: { since: 'la entrega 1', newScreens: ['Ventas'], newUseCases: ['Registrar venta'] },
  markdown: '# Mateos: entrega 2, Ventas\n',
};

describe('ReleaseNotes', () => {
  it('shows what the delivery brings and copies it as Markdown', async () => {
    mocks.notes.mockResolvedValue(notes);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReleaseNotes projectId="p1" runId="r1" />, { wrapper: TestProviders });

    expect(await screen.findByText('Mateos: entrega 2, Ventas')).toBeInTheDocument();
    expect(screen.getByText('Cajero')).toBeInTheDocument();
    expect(
      screen.getByText(/1 cumplidos · 0 fallidos · 1 sin probar · 2 sin criterio/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://demo.example.com' })).toBeInTheDocument();
    expect(screen.getByText('carlos.mena')).toBeInTheDocument();
    expect(screen.getByText('Novedades respecto de la entrega 1')).toBeInTheDocument();
    expect(screen.getByText('Pantalla nueva: Ventas')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith(notes.markdown);
    expect(mocks.success).toHaveBeenCalledWith('Notas copiadas.');
  });
});
