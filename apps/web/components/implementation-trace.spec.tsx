import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImplementationTraceResponse } from '@caseflow-ai/contracts';
import { TestProviders } from '../lib/test-utils';
import { ImplementationTrace } from './implementation-trace';

const mocks = vi.hoisted(() => ({ trace: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: { implementationTrace: (...args: unknown[]) => mocks.trace(...args) },
  restoreSession: vi.fn(),
}));

const base: ImplementationTraceResponse = {
  code: 'RF-010',
  title: 'Registrar ventas',
  type: 'REQUIREMENT',
  useCases: [],
  run: null,
  screens: [],
  actions: [],
  files: [],
  design: [],
  acceptance: [],
};

describe('ImplementationTrace', () => {
  beforeEach(() => {
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.trace.mockReset();
  });

  it('asks only when opened and shows the whole chain', async () => {
    mocks.trace.mockResolvedValue({
      ...base,
      useCases: [{ code: 'CU-002', name: 'Registrar venta' }],
      run: { id: 'r1', createdAt: new Date().toISOString(), deliveryId: null, validation: 'READY' },
      screens: [{ path: '/sales', screenName: 'Ventas' }],
      actions: [{ key: 'POST /sales', summary: 'Registrar venta' }],
      files: [{ path: 'apps/web/app/sales/page.tsx', kind: 'SOURCE', origin: 'AI_ASSISTED' }],
      acceptance: [
        {
          key: 'CA-CU-002',
          useCaseName: 'Registrar venta',
          result: { passed: true, message: null },
        },
      ],
    } satisfies ImplementationTraceResponse);
    render(<ImplementationTrace code="RF-010" />, { wrapper: TestProviders });
    expect(mocks.trace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('¿Dónde está implementado?'));
    expect(await screen.findByText(/validada, lista para desplegar/)).toBeInTheDocument();
    expect(mocks.trace).toHaveBeenCalledWith('p1', 'RF-010');
    expect(screen.getByText('CU-002')).toBeInTheDocument();
    expect(screen.getByText('/sales')).toBeInTheDocument();
    expect(screen.getByText('POST /sales')).toBeInTheDocument();
    expect(screen.getByText('pasó')).toBeInTheDocument();
    expect(screen.getByText('Archivos (1)')).toBeInTheDocument();
  });

  it('says when nothing implements it yet', async () => {
    mocks.trace.mockResolvedValue(base);
    render(<ImplementationTrace code="RF-010" />, { wrapper: TestProviders });
    await userEvent.click(screen.getByText('¿Dónde está implementado?'));
    expect(await screen.findByText(/Todavía nada lo implementa/)).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay una construcción/)).toBeInTheDocument();
  });
});
