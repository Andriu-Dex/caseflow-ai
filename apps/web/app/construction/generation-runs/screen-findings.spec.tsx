import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRunResponse } from '@caseflow-ai/contracts';
import { TestProviders } from '../../../lib/test-utils';
import { ScreenFindings } from './screen-findings';

const mocks = vi.hoisted(() => ({ findings: vi.fn(), accept: vi.fn() }));
vi.mock('../../../lib/api', () => ({
  api: {
    designBaselines: {
      screenFindings: (...args: unknown[]) => mocks.findings(...args),
      acceptScreenFindings: (...args: unknown[]) => mocks.accept(...args),
    },
  },
  restoreSession: vi.fn(),
}));

const projectId = '44444444-4444-4444-8444-444444444444';
const baselineId = '22222222-2222-4222-8222-222222222222';
const run = {
  id: '33333333-3333-4333-8333-333333333333',
  projectId,
  implementationPlanVersionId: '11111111-1111-4111-8111-111111111111',
  designBaselineId: baselineId,
  status: 'FAILED',
} as GenerationRunResponse;
const finding = {
  routePath: '/checkout/new',
  findings: 'MISSING_FORM_BINDING: Faltan proteínas y extras por línea.',
  findingsSha256: 'a'.repeat(64),
  evaluator: 'gemini:gemini-3.5-flash-lite',
  exception: null,
};

describe('ScreenFindings', () => {
  beforeEach(() => {
    mocks.findings.mockReset();
    mocks.accept.mockReset();
  });

  it('accepts the exact findings of a screen only with a justification', async () => {
    mocks.findings.mockResolvedValue({ items: [finding] });
    mocks.accept.mockResolvedValue({});
    render(
      <TestProviders>
        <ScreenFindings projectId={projectId} run={run} />
      </TestProviders>,
    );
    expect(await screen.findByText('/checkout/new')).toBeTruthy();
    const accept = screen.getByRole('button', { name: 'Aceptar con justificación' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(
      screen.getByLabelText('Justificación'),
      'Demostración: la caja se simplifica.',
    );
    await userEvent.click(accept);
    await waitFor(() =>
      expect(mocks.accept).toHaveBeenCalledWith(projectId, baselineId, {
        routePath: '/checkout/new',
        findingsSha256: 'a'.repeat(64),
        justification: 'Demostración: la caja se simplifica.',
      }),
    );
  });

  it('shows an accepted exception instead of the form', async () => {
    mocks.findings.mockResolvedValue({
      items: [
        { ...finding, exception: { justification: 'Fuera del alcance de la demostración.' } },
      ],
    });
    render(
      <TestProviders>
        <ScreenFindings projectId={projectId} run={run} />
      </TestProviders>,
    );
    expect(await screen.findByText(/Fuera del alcance de la demostración/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aceptar con justificación' })).toBeNull();
  });
});
