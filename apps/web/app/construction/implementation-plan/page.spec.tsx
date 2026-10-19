import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImplementationPlanPage from './page';
import { TestProviders } from '../../../lib/test-utils';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  generate: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
  implementationPlanArtifacts: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: {
      list: (...args: unknown[]) => mocks.list(...args),
      generate: (...args: unknown[]) => mocks.generate(...args),
      transition: (...args: unknown[]) => mocks.transition(...args),
      implementationPlanArtifacts: (...args: unknown[]) =>
        mocks.implementationPlanArtifacts(...args),
    },
    artifacts: {
      archive: (...args: unknown[]) => mocks.archive(...args),
    },
    requirements: {
      list: vi.fn(async () => ({ items: [] })),
    },
    useCases: {
      list: vi.fn(async () => ({ items: [] })),
    },
    dataModels: {
      list: vi.fn(async () => ({ items: [] })),
    },
    readiness: {
      get: vi.fn(async () => ({ stages: [] })),
    },
    designBaselines: {
      list: vi.fn(async () => ({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000000',
            label: 'Diseño congelado v1',
          },
        ],
      })),
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const planContent: ImplementationPlanContent = {
  designBaselineId: '00000000-0000-4000-8000-000000000000',
  authentication: {
    required: true,
    roles: ['ADMIN'],
  },
  modules: [
    { localId: 'mod-core', name: 'Core', description: 'Módulo núcleo' },
    { localId: 'mod-billing', name: 'Billing', description: 'Módulo de facturación' },
  ],
  entities: [
    {
      localId: 'ent-invoice',
      name: 'Invoice',
      moduleLocalId: 'mod-billing',
      fields: [
        { name: 'number', type: 'STRING', required: true, unique: true, enumValues: [] },
        { name: 'amount', type: 'DECIMAL', required: true, unique: false, enumValues: [] },
      ],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE'],
      readRoles: [],
      writeRoles: [],
    },
    {
      localId: 'ent-item',
      name: 'InvoiceItem',
      moduleLocalId: 'mod-billing',
      fields: [{ name: 'qty', type: 'INT', required: true, unique: false, enumValues: [] }],
      relations: [],
      operations: ['LIST', 'CREATE'],
      readRoles: [],
      writeRoles: [],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'mod-billing',
      method: 'POST',
      path: '/invoices/:id/pay',
      summary: 'Procesa el pago de una factura',
      roles: [],
    },
    {
      moduleLocalId: 'mod-billing',
      method: 'GET',
      path: '/invoices/:id/pdf',
      summary: 'Descarga factura en PDF',
      roles: [],
    },
  ],
  routes: [
    {
      path: '/invoices',
      screenName: 'Facturas',
      moduleLocalId: 'mod-billing',
      kind: 'LIST',
      entityLocalId: 'ent-invoice',
      actions: [{ label: 'Pagar', endpoint: 'POST /invoices/:id/pay' }],
    },
  ],
  envVars: [
    { name: 'DATABASE_URL', description: 'Postgres connection', required: true },
    { name: 'API_KEY', description: 'Internal API Key', required: false },
  ],
  tests: [
    { moduleLocalId: 'mod-billing', kind: 'UNIT', description: 'Calcula totales de items' },
    { moduleLocalId: 'mod-billing', kind: 'INTEGRATION', description: 'Emisión de comprobante' },
  ],
};

const planArtifact = {
  id: 'ip-1',
  code: 'PI-001',
  title: 'Plan de implementación del sistema',
  kind: 'IMPLEMENTATION_PLAN',
  content: planContent,
  version: {
    id: 'ip-v1',
    versionNumber: 1,
    status: 'APPROVED',
  },
};

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockImplementation(async (_: string, kind: string) => {
    if (kind === 'IMPLEMENTATION_PLAN') {
      return { items: [planArtifact] };
    }
    // The earlier steps are approved, so the next one is open.
    if (kind === 'GENERATION_PLAN' || kind === 'CONCEPTUAL_DOMAIN_MODEL') {
      return { items: [{ version: { status: 'APPROVED' } }] };
    }
    return { items: [] };
  });
});

describe('ImplementationPlanPage', () => {
  it('renders the page heading', async () => {
    render(
      <TestProviders>
        <ImplementationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Plan de implementación', level: 1 }),
      ).toBeInTheDocument();
    });
  });

  it('renders KPI metric badges in the version card', async () => {
    render(
      <TestProviders>
        <ImplementationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('PI-001')).toBeInTheDocument();
    });

    expect(screen.getByText('2 módulos NestJS')).toBeInTheDocument();
    expect(screen.getByText('2 entidades físicas')).toBeInTheDocument();
    expect(screen.getByText('2 endpoints de negocio')).toBeInTheDocument();
    expect(screen.getByText('1 ruta frontend')).toBeInTheDocument();
    expect(screen.getByText('2 pruebas planificadas')).toBeInTheDocument();
    expect(screen.getByText('2 variables de entorno')).toBeInTheDocument();
  });

  it('toggles detail and renders ImplementationPlanDetail and ImplementationPlanArtifacts', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ImplementationPlanPage />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByText('PI-001')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /Ver detalle/i });
    await user.click(toggleBtn);

    // Detail header banner
    await waitFor(() => {
      expect(screen.getByText('Plan de Implementación y Arquitectura Física')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Billing', level: 5 })).toBeInTheDocument();
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('/invoices/:id/pay')).toBeInTheDocument();
    expect(screen.getByText('Facturas')).toBeInTheDocument();

    // Derived artifacts preview section
    expect(screen.getByText('Vista Previa de Esquemas Derivados')).toBeInTheDocument();
  });
});
