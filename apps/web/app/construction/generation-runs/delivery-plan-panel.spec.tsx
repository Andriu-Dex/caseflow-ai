import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeliveryPlanResponse,
  DeliveryResponse,
  GenerationRunResponse,
} from '@caseflow-ai/contracts';
import { TestProviders } from '../../../lib/test-utils';
import { DeliveryPlanPanel } from './delivery-plan-panel';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  approve: vi.fn(),
  start: vi.fn(),
  estimate: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/api', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      deliveries: {
        get: (...args: unknown[]) => mocks.get(...args),
        create: (...args: unknown[]) => mocks.create(...args),
        save: (...args: unknown[]) => mocks.save(...args),
        approve: (...args: unknown[]) => mocks.approve(...args),
      },
      generationRuns: {
        start: (...args: unknown[]) => mocks.start(...args),
        estimate: (...args: unknown[]) => mocks.estimate(...args),
      },
    },
    restoreSession: vi.fn(),
  };
});

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const delivery = (n: number, patch: Partial<DeliveryResponse> = {}): DeliveryResponse => ({
  id: id(n),
  position: n,
  name: `Entrega número ${n}`,
  status: 'PENDING',
  locked: false,
  modules: [{ localId: `m${n}`, name: `Módulo ${n}`, description: `Descripción ${n}` }],
  approval: null,
  ...patch,
});
const plan = (deliveries: DeliveryResponse[]): DeliveryPlanResponse => ({
  id: id(9),
  implementationPlanVersionId: id(8),
  createdAt: new Date().toISOString(),
  deliveries,
  dependencies: [{ module: 'm2', needs: 'm1', reason: 'la pantalla «Ventas» usa la acción X' }],
});
const run = (deliveryId: string, at: string): GenerationRunResponse =>
  ({ id: `run-${deliveryId}-${at}`, deliveryId, status: 'GENERATED', createdAt: at }) as never;
const approved = {
  status: 'APPROVED' as const,
  locked: true,
  approval: {
    generationRunId: 'run-0',
    approvedByUserId: id(7),
    approvedAt: new Date().toISOString(),
    note: null,
  },
};

function renderPanel(runs: GenerationRunResponse[] = []) {
  return render(
    <DeliveryPlanPanel projectId="p1" planVersionId={id(8)} runs={runs} hasActiveRun={false} />,
    { wrapper: TestProviders },
  );
}

describe('DeliveryPlanPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estimate.mockResolvedValue({
      implementationPlanVersionId: id(8),
      businessActions: { total: 2, reused: 1 },
      demoData: 'REUSED',
      screens: { atMost: 0 },
      requests: { atLeast: 1, atMost: 1 },
    });
  });

  it('proposes a plan of deliveries when the plan has none', async () => {
    const { ApiError } = await import('../../../lib/api');
    mocks.get.mockRejectedValue(new ApiError('No hay', 404));
    mocks.create.mockResolvedValue(plan([delivery(0)]));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Proponer plan de entregas/ }));
    expect(mocks.create).toHaveBeenCalledWith('p1', id(8));
  });

  it('shows each delivery and builds and approves the first one not approved', async () => {
    mocks.get.mockResolvedValue(
      plan([
        delivery(0, approved),
        delivery(1, { status: 'GENERATED', locked: true }),
        delivery(2),
      ]),
    );
    renderPanel([run(id(1), '2026-11-18T01:00:00Z'), run(id(1), '2026-11-18T02:00:00Z')]);

    expect(await screen.findByText('Entrega 1: Entrega número 1')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByText('Construida')).toBeInTheDocument();
    expect(await screen.findByText(/Uso de IA previsto: 1 solicitud/)).toBeInTheDocument();
    expect(mocks.estimate).toHaveBeenCalledWith('p1', id(8), id(1));

    await userEvent.click(screen.getByRole('button', { name: 'Construir la entrega 1' }));
    expect(mocks.start).toHaveBeenCalledWith('p1', id(8), id(1));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar la entrega 1' }));
    // The newest built run of the delivery is the one approved.
    expect(mocks.approve).toHaveBeenCalledWith(
      'p1',
      id(8),
      id(1),
      `run-${id(1)}-2026-11-18T02:00:00Z`,
    );
    expect(
      screen.getByText(/«Módulo 2» necesita «Módulo 1»/, { exact: false }),
    ).toBeInTheDocument();
  });

  it('asks to approve an affected delivery again with a run that includes it', async () => {
    mocks.get.mockResolvedValue(
      plan([
        delivery(0, approved),
        delivery(1, { ...approved, status: 'AFFECTED' }),
        delivery(2, approved),
      ]),
    );
    renderPanel([run(id(2), '2026-11-18T03:00:00Z')]);
    expect(
      await screen.findByText(/Una construcción posterior cambió esta entrega/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Construir la entrega 1/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar de nuevo' }));
    expect(mocks.approve).toHaveBeenCalledWith(
      'p1',
      id(8),
      id(1),
      `run-${id(2)}-2026-11-18T03:00:00Z`,
    );
  });

  it('reorders the deliveries not built yet', async () => {
    mocks.get.mockResolvedValue(plan([delivery(0, approved), delivery(1), delivery(2)]));
    mocks.save.mockResolvedValue(plan([]));
    renderPanel();
    await screen.findByText('Entrega 2: Entrega número 2');
    expect(screen.getByRole('button', { name: 'Adelantar la entrega 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Adelantar la entrega 2' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith('p1', id(8), [
        { modules: ['m0'] },
        { modules: ['m2'] },
        { modules: ['m1'] },
      ]),
    );
  });
});
