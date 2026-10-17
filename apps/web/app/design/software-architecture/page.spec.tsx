import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SoftwareArchitecturePage from './page';
import { TestProviders } from '../../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  generate: vi.fn(),
  getDiagram: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: {
      list: (...args: unknown[]) => mocks.list(...args),
      generate: (...args: unknown[]) => mocks.generate(...args),
      getDiagram: (...args: unknown[]) => mocks.getDiagram(...args),
      transition: (...args: unknown[]) => mocks.transition(...args),
      diagramPngUrl: () => '/api/diagram.png',
    },
    artifacts: {
      archive: (...args: unknown[]) => mocks.archive(...args),
    },
    requirements: {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'r1',
            code: 'RF-001',
            version: { id: 'rv1', status: 'APPROVED' },
            requirement: { requirementType: 'FUNCTIONAL', name: 'Gestión de Pedidos' },
          },
        ],
      })),
    },
    useCases: {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'u1',
            code: 'CU-001',
            version: { id: 'uv1', status: 'APPROVED' },
            useCase: { name: 'Registrar pedido' },
          },
        ],
      })),
    },
    dataModels: {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'dm1',
            code: 'MD-001',
            version: { id: 'dmv1', status: 'APPROVED' },
            dataModel: { title: 'Modelo relacional' },
          },
        ],
      })),
    },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  downloadFile: vi.fn(),
  approveDirectly: async (transition: (status: string) => Promise<unknown>) =>
    transition('APPROVED'),
  isPendingApproval: (status: string) => status === 'GENERATED' || status === 'DRAFT',
  restoreSession: vi.fn(),
}));

const mockSoftwareArchitecture = {
  id: 'sa-1',
  projectId: 'p1',
  code: 'SA-001',
  title: 'Arquitectura del backend modular',
  createdAt: '2026-10-17T00:00:00.000Z',
  version: {
    id: 'sav-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-17T00:00:00.000Z',
  },
  content: {
    style: 'Modular Monolith con capas limpias',
    components: [
      {
        localId: 'cmp-ctrl',
        name: 'OrdersController',
        layerLocalId: 'Presentación',
        responsibilities: [
          'Gestionar endpoints REST de órdenes',
          'Validar esquemas de entrada con Zod',
        ],
        relatedSourceCodes: ['RF-001'],
      },
      {
        localId: 'cmp-srv',
        name: 'OrdersService',
        layerLocalId: 'Aplicación',
        responsibilities: [
          'Orquestar casos de uso de pedidos',
          'Gestionar transacciones de negocio',
        ],
        relatedSourceCodes: ['CU-001'],
      },
    ],
    dependencies: [
      {
        fromLocalId: 'cmp-ctrl',
        toLocalId: 'cmp-srv',
        description: 'Invoca servicio de aplicación',
      },
    ],
    decisions: [
      'Separación estricta entre capas: los controladores nunca acceden al ORM directamente.',
      'Uso de NestJS con módulos orientados a capacidades de negocio.',
    ],
  },
};

describe('SoftwareArchitecturePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.list.mockImplementation(async (_projectId: string, kind: string) => {
      if (kind === 'NAVIGATION_TREE') {
        return {
          items: [
            {
              id: 'nt1',
              code: 'NV-001',
              title: 'Árbol de navegación',
              version: { id: 'ntv1', status: 'APPROVED' },
            },
          ],
        };
      }
      return { items: [mockSoftwareArchitecture] };
    });
    mocks.getDiagram.mockResolvedValue({
      svg: '<svg data-testid="sa-svg"><text>Component Diagram</text></svg>',
      source: 'classDiagram\nOrdersController --> OrdersService',
      sourceFormat: 'MERMAID',
    });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <SoftwareArchitecturePage />
      </TestProviders>,
    );
  }

  it('renders page header, approved inputs summary, and software architecture card with metrics', async () => {
    renderPage();

    // Page title
    expect(
      await screen.findByRole('heading', { name: 'Arquitectura de software' }),
    ).toBeInTheDocument();

    // Approved sources checkboxes
    expect(await screen.findByText('RF-001')).toBeInTheDocument();
    expect(screen.getByText('Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('Registrar pedido')).toBeInTheDocument();
    expect(screen.getByText('MD-001')).toBeInTheDocument();
    expect(screen.getByText('Modelo relacional')).toBeInTheDocument();
    expect(screen.getByText('NV-001')).toBeInTheDocument();
    expect(screen.getByText('Árbol de navegación')).toBeInTheDocument();

    // Artifact card & metrics
    expect(screen.getByText('SA-001')).toBeInTheDocument();
    expect(screen.getByText('Arquitectura del backend modular')).toBeInTheDocument();
    expect(screen.getByText('2 componentes')).toBeInTheDocument();
    expect(screen.getByText('1 dependencia')).toBeInTheDocument();
    expect(screen.getByText('2 decisiones')).toBeInTheDocument();
  });

  it('expands detail to view architectural style banner, component cards, resolved dependency flow, and ADRs', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    // Architectural style banner
    expect(screen.getByText('Estilo arquitectónico')).toBeInTheDocument();
    expect(screen.getByText('Modular Monolith con capas limpias')).toBeInTheDocument();

    // Components section
    expect(screen.getByText('Componentes del software (2)')).toBeInTheDocument();
    expect(screen.getAllByText('OrdersController')[0]).toBeInTheDocument();
    expect(screen.getAllByText('OrdersService')[0]).toBeInTheDocument();
    expect(screen.getByText('Presentación')).toBeInTheDocument();
    expect(screen.getByText('Aplicación')).toBeInTheDocument();
    expect(screen.getByText('Gestionar endpoints REST de órdenes')).toBeInTheDocument();
    expect(screen.getByText('Validar esquemas de entrada con Zod')).toBeInTheDocument();
    expect(screen.getByText('Orquestar casos de uso de pedidos')).toBeInTheDocument();

    // Dependencies section (checking human-readable component names instead of raw IDs)
    expect(screen.getByText('Dependencias entre componentes (1)')).toBeInTheDocument();
    expect(screen.getByText('Invoca servicio de aplicación')).toBeInTheDocument();
    expect(screen.getAllByText('OrdersController').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('OrdersService').length).toBeGreaterThanOrEqual(2);

    // Decisions section (ADRs)
    expect(screen.getByText('Decisiones arquitectónicas (2)')).toBeInTheDocument();
    expect(screen.getByText('ADR-001')).toBeInTheDocument();
    expect(screen.getByText('ADR-002')).toBeInTheDocument();
    expect(
      screen.getByText(/los controladores nunca acceden al ORM directamente/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/módulos orientados a capacidades de negocio/i)).toBeInTheDocument();
  });

  it('filters components by search query in real time', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    const searchInput = screen.getByPlaceholderText(/buscar componente, capa o función/i);
    await user.type(searchInput, 'Controller');

    expect(screen.getAllByText('OrdersController')[0]).toBeInTheDocument();
    expect(screen.queryByText('Orquestar casos de uso de pedidos')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Orquestar casos de uso de pedidos')).toBeInTheDocument();

    // Nonexistent filter
    await user.type(searchInput, 'inexistente');
    expect(screen.getByText(/no se encontraron componentes que coincidan/i)).toBeInTheDocument();
  });

  it('toggles software architecture diagram viewer', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver diagrama/i }));
    expect(mocks.getDiagram).toHaveBeenCalledWith('p1', 'SOFTWARE_ARCHITECTURE', 'sa-1');
    expect(
      await screen.findByRole('button', { name: /ver en pantalla completa/i }),
    ).toBeInTheDocument();
  });

  it('approves a pending software architecture', async () => {
    mocks.transition.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'SOFTWARE_ARCHITECTURE',
        'sa-1',
        'sav-1',
        'APPROVED',
      ),
    );
  });
});
