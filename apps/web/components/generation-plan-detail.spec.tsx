import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GenerationPlanDetail } from './generation-plan-detail';
import type { GenerationPlanContent } from '@caseflow-ai/contracts';

const mockContent: GenerationPlanContent = {
  summary: 'Sistema integral de gestión de pedidos y control de inventario en tiempo real.',
  modules: [
    {
      localId: 'mod-orders',
      name: 'Gestión de Pedidos',
      purpose: 'Administrar el ciclo de vida completo de las órdenes de compra.',
      entityNames: ['Order', 'OrderItem', 'Payment'],
      relatedRequirementCodes: ['RF-001', 'RF-002'],
      relatedUseCaseCodes: ['CU-001'],
      relatedSourceCodes: ['SRC-01'],
    },
    {
      localId: 'mod-inventory',
      name: 'Control de Inventario',
      purpose: 'Supervisar el stock de productos en almacén.',
      entityNames: ['Product', 'StockMovement'],
      relatedRequirementCodes: ['RF-003'],
      relatedUseCaseCodes: ['CU-002'],
    },
  ],
  actors: [
    {
      name: 'Administrador',
      description: 'Acceso total a la configuración y reportes.',
      permissions: ['orders:manage', 'inventory:full', 'users:admin'],
    },
    {
      name: 'Cajero',
      description: 'Responsable de registrar pagos.',
      permissions: ['orders:read', 'payments:create'],
    },
  ],
  workflows: [
    {
      localId: 'wf-checkout',
      name: 'Proceso de Checkout',
      steps: [
        'Seleccionar productos',
        'Ingresar datos de entrega',
        'Procesar pago',
        'Emitir factura',
      ],
      relatedUseCaseCodes: ['CU-001'],
    },
  ],
  screens: [
    {
      name: 'Panel de Pedidos',
      moduleLocalId: 'mod-orders',
      purpose: 'Visualizar lista y detalle de pedidos.',
    },
    {
      name: 'Gestión de Stock',
      moduleLocalId: 'mod-inventory',
      purpose: 'Modificar existencias.',
    },
  ],
  integrations: [
    {
      name: 'Stripe API',
      purpose: 'Procesamiento de pagos en línea con tarjeta.',
    },
  ],
  authentication: {
    required: true,
    strategy: 'JWT con Refresh Token',
    roles: ['ADMIN', 'CASHIER'],
  },
  technicalConstraints: ['PostgreSQL 16 con Prisma ORM', 'Next.js 15 App Router con shadcn/ui'],
  risks: [
    {
      description: 'Alta concurrencia en horas pico de ventas.',
      mitigation: 'Implementar caché Redis y colas BullMQ.',
    },
  ],
};

describe('GenerationPlanDetail', () => {
  it('renders the executive summary and step badge', () => {
    render(<GenerationPlanDetail content={mockContent} />);

    expect(screen.getByText('Resumen del Sistema a Construir')).toBeInTheDocument();
    expect(screen.getByText(/Sistema integral de gestión de pedidos/i)).toBeInTheDocument();
    expect(screen.getByText('Fase de Construcción · Paso 1 de 5')).toBeInTheDocument();
  });

  it('renders software modules with entities, screens, and traceability', () => {
    render(<GenerationPlanDetail content={mockContent} />);

    expect(screen.getByText('Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
    expect(screen.getByText('OrderItem')).toBeInTheDocument();
    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Panel de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('RF-001')).toBeInTheDocument();
    expect(screen.getAllByText('CU-001').length).toBeGreaterThan(0);
  });

  it('renders workflows with numbered sequence of steps', () => {
    render(<GenerationPlanDetail content={mockContent} />);

    expect(screen.getByText('Proceso de Checkout')).toBeInTheDocument();
    expect(screen.getByText('Seleccionar productos')).toBeInTheDocument();
    expect(screen.getByText('Ingresar datos de entrega')).toBeInTheDocument();
    expect(screen.getByText('Procesar pago')).toBeInTheDocument();
    expect(screen.getByText('Emitir factura')).toBeInTheDocument();
  });

  it('renders authentication and actor roles with permissions', () => {
    render(<GenerationPlanDetail content={mockContent} />);

    expect(screen.getByText('Autenticación del Sistema')).toBeInTheDocument();
    expect(screen.getByText('JWT con Refresh Token')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('orders:manage')).toBeInTheDocument();
    expect(screen.getByText('Cajero')).toBeInTheDocument();
  });

  it('renders risks with mitigations and technical constraints', () => {
    render(<GenerationPlanDetail content={mockContent} />);

    expect(screen.getByText('Alta concurrencia en horas pico de ventas.')).toBeInTheDocument();
    expect(screen.getByText(/Implementar caché Redis/i)).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL 16 con Prisma ORM')).toBeInTheDocument();
    expect(screen.getByText('Stripe API')).toBeInTheDocument();
  });

  it('filters content in real-time when typing in search input', async () => {
    const user = userEvent.setup();
    render(<GenerationPlanDetail content={mockContent} />);

    const searchInput = screen.getByLabelText('Buscar en el plan de generación');
    await user.type(searchInput, 'Inventario');

    expect(screen.getByText('Control de Inventario')).toBeInTheDocument();
    expect(screen.queryByText('Gestión de Pedidos')).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByLabelText('Limpiar búsqueda');
    await user.click(clearBtn);

    expect(screen.getByText('Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Control de Inventario')).toBeInTheDocument();
  });

  it('filters by category tabs', async () => {
    const user = userEvent.setup();
    render(<GenerationPlanDetail content={mockContent} />);

    // Click on Workflows tab
    const workflowsBtn = screen.getByRole('button', { name: /Flujos/i });
    await user.click(workflowsBtn);

    expect(screen.getByText('Proceso de Checkout')).toBeInTheDocument();
    expect(screen.queryByText('Gestión de Pedidos')).not.toBeInTheDocument();
    expect(screen.queryByText('Stripe API')).not.toBeInTheDocument();

    // Click on Risks tab
    const risksBtn = screen.getByRole('button', { name: /Riesgos/i });
    await user.click(risksBtn);

    expect(screen.getByText('Alta concurrencia en horas pico de ventas.')).toBeInTheDocument();
    expect(screen.queryByText('Proceso de Checkout')).not.toBeInTheDocument();
  });
});
