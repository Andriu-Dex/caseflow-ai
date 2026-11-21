import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import {
  ImplementationPlanArtifacts,
  ImplementationPlanDetail,
} from './implementation-plan-detail';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({ implementationPlanArtifacts: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: {
    structuredAnalysis: {
      implementationPlanArtifacts: (...args: unknown[]) =>
        mocks.implementationPlanArtifacts(...args),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const content: ImplementationPlanContent = {
  designBaselineId: '00000000-0000-4000-8000-000000000000',
  authentication: { required: true, roles: ['ADMIN'] },
  modules: [
    {
      localId: 'sales',
      name: 'Ventas',
      description: 'Gestiona las ventas y los pedidos del negocio.',
    },
  ],
  entities: [
    {
      localId: 'order',
      name: 'Pedido',
      moduleLocalId: 'sales',
      description: 'Pedido registrado.',
      fields: [{ name: 'total', type: 'DECIMAL', required: true, unique: false, enumValues: [] }],
      relations: [],
      operations: ['CREATE'],
      readRoles: [],
      writeRoles: [],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'sales',
      method: 'POST',
      path: '/orders',
      summary: 'Crea un pedido',
      roles: [],
    },
  ],
  routes: [
    {
      path: '/orders',
      screenName: 'Pedidos',
      screenLocalId: 'orders',
      moduleLocalId: 'sales',
      kind: 'LIST',
      actions: [],
    },
  ],
  envVars: [{ name: 'DATABASE_URL', description: 'Conexión a la base de datos', required: true }],
  tests: [{ moduleLocalId: 'sales', kind: 'UNIT', description: 'Valida los totales' }],
};

describe('ImplementationPlanDetail', () => {
  it('shows summary module cards and moves details into accessible tabs', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ImplementationPlanDetail content={content} />
      </TestProviders>,
    );
    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('1 entidades')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Detalle técnico' }));
    expect(screen.getByText(/Endpoints \(1\)/)).toBeInTheDocument();
  });

  it('keeps module data collapsed until selected', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ImplementationPlanDetail content={content} />
      </TestProviders>,
    );
    await user.click(screen.getByRole('button', { name: /Pedido/ }));
    expect(screen.getByText('total')).toBeInTheDocument();
  });
});

describe('ImplementationPlanArtifacts', () => {
  it('loads the selected derived artifact', async () => {
    const user = userEvent.setup();
    mocks.implementationPlanArtifacts.mockResolvedValueOnce({
      databaseSchema: 'model Order {}',
      openApi: {},
    });
    render(
      <TestProviders>
        <ImplementationPlanArtifacts projectId="p1" planId="plan-1" />
      </TestProviders>,
    );
    await user.click(screen.getByRole('button', { name: /Esquema Prisma/ }));
    await waitFor(() => expect(screen.getByText(/model Order/)).toBeInTheDocument());
  });
});
