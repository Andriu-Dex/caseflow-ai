import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../lib/test-utils';
import { StageOutdatedBanner } from './stage-outdated-banner';
import { computeStepState } from '../lib/stage-links';
import { ApiError } from '../lib/api';

const confirm = vi.fn().mockResolvedValue({});
vi.mock('../lib/api', () => ({
  restoreSession: async () => true,
  api: {
    readiness: {
      get: async () => ({
        stages: [
          {
            key: 'CONTEXT',
            label: 'Contexto',
            currency: 'OUTDATED',
            outdatedSince: { stage: 'SOURCES', approvedAt: '2026-10-13T10:00:00Z' },
          },
          { key: 'SOURCES', label: 'Fuentes' },
        ],
      }),
      confirm: (...args: unknown[]) => confirm(...args),
    },
  },
  ApiError: class ApiError extends Error {},
}));

describe('stage review experience', () => {
  it('keeps a shared route actionable for its first outdated substage', () => {
    const stages = [
      { key: 'USE_CASES', satisfied: false, currency: 'OUTDATED' as const },
      { key: 'USE_CASE_DIAGRAM', satisfied: false, currency: 'BLOCKED' as const },
      { key: 'DATA_MODEL', satisfied: false, currency: 'BLOCKED' as const },
    ];
    expect(computeStepState('/use-cases', stages)).toBe('outdated');
    expect(computeStepState('/data-model', stages)).toBe('blocked');
  });
  it('asks for an optional note and confirms the current project stage', async () => {
    render(
      <TestProviders>
        <StageOutdatedBanner projectId="p1" stage="CONTEXT" />
      </TestProviders>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Confirmar que sigue vigente' }));
    await user.type(screen.getByLabelText('Nota de revisión (opcional)'), 'Revisado');
    await user.click(screen.getByRole('button', { name: 'Confirmar vigencia' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('p1', 'CONTEXT', 'Revisado'));
  });
  it('keeps the dialog open and shows why the server refused to confirm', async () => {
    confirm.mockRejectedValueOnce(
      new ApiError('Se necesitan al menos 4 casos de uso aprobados (hay 1).', 422),
    );
    render(
      <TestProviders>
        <StageOutdatedBanner projectId="p1" stage="CONTEXT" />
      </TestProviders>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Confirmar que sigue vigente' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar vigencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 4 casos de uso');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
