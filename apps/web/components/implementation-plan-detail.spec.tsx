import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ImplementationPlanDetail,
  ImplementationPlanArtifacts,
} from './implementation-plan-detail';
import { TestProviders } from '../lib/test-utils';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';

const mocks = vi.hoisted(() => ({
  implementationPlanArtifacts: vi.fn(),
}));

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

const mockContent: ImplementationPlanContent = {
  designBaselineId: '00000000-0000-4000-8000-000000000000',
  authentication: {
    required: true,
    roles: ['ADMIN', 'SELLER'],
  },
  modules: [
    { localId: 'mod-sales', name: 'Sales', description: 'Módulo de ventas y pedidos' },
    { localId: 'mod-inventory', name: 'Inventory', description: 'Módulo de catálogo y stock' },
  ],
  entities: [
    {
      localId: 'ent-order',
      name: 'Order',
      moduleLocalId: 'mod-sales',
      description: 'Orden de compra del cliente',
      fields: [
        { name: 'orderNumber', type: 'STRING', required: true, unique: true, enumValues: [] },
        { name: 'totalAmount', type: 'DECIMAL', required: true, unique: false, enumValues: [] },
        {
          name: 'status',
          type: 'ENUM',
          required: true,
          unique: false,
          enumValues: ['PENDING', 'PAID', 'CANCELLED'],
        },
      ],
      relations: [
        {
          name: 'customer',
          targetEntityLocalId: 'ent-customer',
          kind: 'MANY_TO_ONE',
          required: true,
        },
      ],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE'],
      readRoles: [],
      writeRoles: ['SELLER'],
    },
    {
      localId: 'ent-customer',
      name: 'Customer',
      moduleLocalId: 'mod-sales',
      description: 'Cliente registrado',
      fields: [
        { name: 'email', type: 'STRING', required: true, unique: true, enumValues: [] },
        { name: 'name', type: 'STRING', required: true, unique: false, enumValues: [] },
      ],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE'],
      readRoles: [],
      writeRoles: [],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'mod-sales',
      method: 'POST',
      path: '/orders/:orderId/confirm',
      summary: 'Confirma y aprueba un pedido pendiente',
      entityLocalId: 'ent-order',
      roles: ['SELLER'],
    },
    {
      moduleLocalId: 'mod-inventory',
      method: 'GET',
      path: '/inventory/check-stock',
      summary: 'Consulta disponibilidad en tiempo real',
      roles: [],
    },
  ],
  routes: [
    {
      path: '/orders',
      screenName: 'Listado de Pedidos',
      screenLocalId: 'scr-orders',
      moduleLocalId: 'mod-sales',
      kind: 'LIST',
      entityLocalId: 'ent-order',
      actions: [
        { label: 'Nuevo Pedido', operation: 'CREATE' },
        { label: 'Confirmar Pedido', endpoint: 'POST /orders/:orderId/confirm' },
      ],
    },
  ],
  envVars: [
    {
      name: 'DATABASE_URL',
      description: 'Cadena de conexión a PostgreSQL',
      required: true,
    },
    {
      name: 'STRIPE_API_KEY',
      description: 'Clave para pasarela de pagos',
      required: false,
    },
  ],
  tests: [
    {
      moduleLocalId: 'mod-sales',
      kind: 'UNIT',
      description: 'Validación de cálculos de montos y totales',
    },
    {
      moduleLocalId: 'mod-sales',
      kind: 'INTEGRATION',
      description: 'Flujo completo de creación de pedido y persistencia',
    },
  ],
};

describe('ImplementationPlanDetail', () => {
  it('renders the header banner with construction step info and metric summaries', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByText('Plan de Implementación y Arquitectura Física')).toBeInTheDocument();
    expect(screen.getByText('Fase de Construcción · Paso 4 de 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entidades \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Endpoints API \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Frontend \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Variables y Tests \(4\)/i })).toBeInTheDocument();
  });

  it('renders security and authentication status card with roles', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByText('Autenticación y Seguridad')).toBeInTheDocument();
    expect(screen.getByText('Requerida')).toBeInTheDocument();
    expect(screen.getByText(/ADMIN/)).toBeInTheDocument();
    expect(screen.getAllByText(/SELLER/).length).toBeGreaterThan(0);
  });

  it('renders modules and physical entities with fields and operations', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: 'Sales', level: 5 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventory', level: 5 })).toBeInTheDocument();

    // Check entity names
    expect(screen.getByText('Order')).toBeInTheDocument();
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);

    // Check field names and types
    expect(screen.getByText('orderNumber')).toBeInTheDocument();
    expect(screen.getAllByText('(texto)').length).toBeGreaterThan(0);
    expect(screen.getByText('totalAmount')).toBeInTheDocument();
    expect(screen.getByText('(decimal)')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText(/PENDING, PAID, CANCELLED/)).toBeInTheDocument();

    // Check attributes
    expect(screen.getAllByText('REQ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ÚNICO').length).toBeGreaterThan(0);

    // Check CRUD operations
    expect(screen.getAllByText('LIST').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CREATE').length).toBeGreaterThan(0);
  });

  it('renders REST OpenAPI endpoints directory with method color badges', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByText('/orders/:orderId/confirm')).toBeInTheDocument();
    expect(screen.getByText('Confirma y aprueba un pedido pendiente')).toBeInTheDocument();
    expect(screen.getByText('/inventory/check-stock')).toBeInTheDocument();
    expect(screen.getByText('Consulta disponibilidad en tiempo real')).toBeInTheDocument();

    // Check method badges
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getAllByText('GET').length).toBeGreaterThan(0);
  });

  it('renders frontend routes and actions', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByText('Listado de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('/orders')).toBeInTheDocument();
    expect(screen.getByText('(scr-orders)')).toBeInTheDocument();
    expect(screen.getByText('Listado')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Pedido')).toBeInTheDocument();
    expect(screen.getByText('Confirmar Pedido')).toBeInTheDocument();
  });

  it('renders environment variables and test suites', () => {
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('Cadena de conexión a PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Obligatoria')).toBeInTheDocument();

    expect(screen.getByText('STRIPE_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('Clave para pasarela de pagos')).toBeInTheDocument();
    expect(screen.getByText('Opcional')).toBeInTheDocument();

    expect(screen.getByText('Validación de cálculos de montos y totales')).toBeInTheDocument();
    expect(
      screen.getByText('Flujo completo de creación de pedido y persistencia'),
    ).toBeInTheDocument();
  });

  it('filters content in real-time via search input', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    const searchInput = screen.getByLabelText('Buscar en el plan de implementación');
    await user.type(searchInput, 'Inventory');

    expect(screen.getByRole('heading', { name: 'Inventory', level: 5 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sales', level: 5 })).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByLabelText('Limpiar búsqueda');
    await user.click(clearBtn);

    expect(screen.getByRole('heading', { name: 'Sales', level: 5 })).toBeInTheDocument();
  });

  it('filters by category tabs', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <ImplementationPlanDetail content={mockContent} />
      </TestProviders>,
    );

    // Switch to Endpoints tab
    const endpointsTab = screen.getByRole('button', { name: /Endpoints API \(2\)/i });
    await user.click(endpointsTab);

    expect(screen.getByText('/orders/:orderId/confirm')).toBeInTheDocument();
    expect(screen.queryByText('Listado de Pedidos')).not.toBeInTheDocument();

    // Switch to Frontend tab
    const routesTab = screen.getByRole('button', { name: /Frontend \(1\)/i });
    await user.click(routesTab);

    expect(screen.getByText('Listado de Pedidos')).toBeInTheDocument();
    expect(screen.queryByText('/inventory/check-stock')).not.toBeInTheDocument();
  });
});

describe('ImplementationPlanArtifacts', () => {
  it('loads and displays Prisma schema and OpenAPI contracts when toggled', async () => {
    const user = userEvent.setup();
    mocks.implementationPlanArtifacts.mockResolvedValueOnce({
      databaseSchema:
        'datasource db {\n  provider = "postgresql"\n}\n\nmodel Order {\n  id String @id\n}',
      openApi: { openapi: '3.0.0', info: { title: 'Order API', version: '1.0.0' } },
    });

    render(
      <TestProviders>
        <ImplementationPlanArtifacts projectId="p1" planId="plan-1" />
      </TestProviders>,
    );

    expect(screen.getByText('Vista Previa de Esquemas Derivados')).toBeInTheDocument();

    const prismaBtn = screen.getByRole('button', { name: /Esquema Prisma/i });
    await user.click(prismaBtn);

    await waitFor(() => {
      expect(screen.getByText(/model Order/i)).toBeInTheDocument();
    });

    // Toggle OpenAPI
    mocks.implementationPlanArtifacts.mockResolvedValueOnce({
      databaseSchema: '...',
      openApi: { openapi: '3.0.0', info: { title: 'Order API' } },
    });

    const openApiBtn = screen.getByRole('button', { name: /Contrato OpenAPI/i });
    await user.click(openApiBtn);

    await waitFor(() => {
      expect(screen.getByText(/"title": "Order API"/i)).toBeInTheDocument();
    });
  });
});
