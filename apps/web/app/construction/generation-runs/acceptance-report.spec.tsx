import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AcceptanceReportResponse } from '@caseflow-ai/contracts';
import { TestProviders } from '../../../lib/test-utils';
import { AcceptanceReport } from './acceptance-report';

const mocks = vi.hoisted(() => ({ acceptance: vi.fn() }));
vi.mock('../../../lib/api', () => ({
  api: { generationRuns: { acceptance: (...args: unknown[]) => mocks.acceptance(...args) } },
  restoreSession: vi.fn(),
}));

const criterion = (
  key: string,
  result: AcceptanceReportResponse['criteria'][number]['result'],
) => ({
  key,
  useCaseCode: key.slice(3),
  useCaseName: 'Registrar venta',
  given: 'Hay una caja abierta; y Cajero inició sesión',
  when: 'Cajero confirma la venta',
  then: 'La venta queda confirmada',
  alternativeFlows: ['Producto agotado'],
  requirementCodes: ['RF-010'],
  role: 'Cajero',
  screens: [{ path: '/sales', screenName: 'Ventas' }],
  result,
});

describe('AcceptanceReport', () => {
  it('summarizes the requirements and shows each criterion with its result', async () => {
    mocks.acceptance.mockResolvedValue({
      generationRunId: 'r1',
      sandboxRunId: 's1',
      criteria: [
        criterion('CA-CU-001', { passed: true, message: 'Se completó «Registrar venta».' }),
        criterion('CA-CU-002', { passed: false, message: 'La prueba de aceptación falló.' }),
      ],
      requirements: [
        { code: 'RF-010', title: 'Registrar ventas', status: 'FAILED' },
        { code: 'RF-011', title: 'Anular ventas', status: 'NO_CRITERIA' },
      ],
    } satisfies AcceptanceReportResponse);
    render(<AcceptanceReport projectId="p1" runId="r1" refreshKey="s1-READY" />, {
      wrapper: TestProviders,
    });
    expect(
      await screen.findByText(/0 cumplidos · 1 fallidos · 0 sin ejecutar · 1 sin criterio/),
    ).toBeInTheDocument();
    expect(screen.getByText(/realiza su operación principal/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Criterios de aceptación (2)'));
    expect(screen.getByText('CA-CU-002 · Registrar venta')).toBeInTheDocument();
    expect(screen.getAllByText('Falló')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('La prueba de aceptación falló.');
    // What a passed criterion's operation did is information, not an alert.
    expect(screen.getByText('Se completó «Registrar venta».')).not.toHaveAttribute('role');
    expect(screen.getAllByText(/También cubre: Producto agotado/)).toHaveLength(2);
  });

  it('says when no screen realizes an approved use case yet', async () => {
    mocks.acceptance.mockResolvedValue({
      generationRunId: 'r1',
      sandboxRunId: null,
      criteria: [],
      requirements: [{ code: 'RF-010', title: 'Registrar ventas', status: 'NO_CRITERIA' }],
    });
    render(<AcceptanceReport projectId="p1" runId="r1" refreshKey="none-" />, {
      wrapper: TestProviders,
    });
    expect(await screen.findByText(/no hay criterios de aceptación/)).toBeInTheDocument();
  });
});
