import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NavigationPage from './page';
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

const mockNavigationTree = {
  id: 'nt-1',
  projectId: 'p1',
  code: 'NV-001',
  title: 'Árbol de navegación principal',
  createdAt: '2026-10-17T00:00:00.000Z',
  version: {
    id: 'ntv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-17T00:00:00.000Z',
  },
  content: {
    nodes: [
      {
        localId: 'nav-home',
        label: 'Inicio',
        kind: 'HOME',
        viewName: 'HomeView',
        route: '/',
        description: 'Pantalla principal del sistema',
        relatedUseCaseCodes: ['CU-001'],
        relatedSourceCodes: ['RF-001'],
      },
      {
        localId: 'nav-sec-orders',
        label: 'Módulo de Pedidos',
        kind: 'SECTION',
        viewName: 'OrderSectionView',
        route: '/pedidos',
        description: 'Sección que agrupa la gestión de pedidos',
        relatedUseCaseCodes: ['CU-001'],
        relatedSourceCodes: ['RF-001'],
      },
      {
        localId: 'nav-orders-list',
        label: 'Listado de Pedidos',
        kind: 'LIST',
        viewName: 'OrderListView',
        route: '/pedidos',
        parentLocalId: 'nav-sec-orders',
        description: 'Tabla con pedidos activos',
        relatedUseCaseCodes: ['CU-001'],
        relatedSourceCodes: [],
      },
      {
        localId: 'nav-orders-new',
        label: 'Nuevo Pedido',
        kind: 'FORM',
        viewName: 'CreateOrderView',
        route: '/pedidos/nuevo',
        parentLocalId: 'nav-sec-orders',
        description: 'Formulario de registro de orden',
        relatedUseCaseCodes: ['CU-002'],
        relatedSourceCodes: ['RF-001'],
      },
    ],
  },
};

describe('NavigationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.list.mockResolvedValue({ items: [mockNavigationTree] });
    mocks.getDiagram.mockResolvedValue({
      svg: '<svg data-testid="nav-tree-svg"><text>Navigation Mindmap</text></svg>',
      source: 'graph TD\nInicio --> Pedidos',
      sourceFormat: 'MERMAID',
    });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <NavigationPage />
      </TestProviders>,
    );
  }

  it('renders page header, approved inputs summary, and navigation tree card with metrics', async () => {
    renderPage();

    // Page title
    expect(await screen.findByRole('heading', { name: 'Navegación' })).toBeInTheDocument();

    // Approved sources checkboxes in top card
    expect(await screen.findByText('RF-001')).toBeInTheDocument();
    expect(screen.getByText('Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('Registrar pedido')).toBeInTheDocument();
    expect(screen.getByText('MD-001')).toBeInTheDocument();
    expect(screen.getByText('Modelo relacional')).toBeInTheDocument();

    // Navigation Tree Card
    expect(screen.getByText('NV-001')).toBeInTheDocument();
    expect(screen.getByText('Árbol de navegación principal')).toBeInTheDocument();
    expect(screen.getByText('4 pantallas y nodos')).toBeInTheDocument();
    expect(screen.getByText('4 rutas web')).toBeInTheDocument();
  });

  it('expands detail to view structured tree with semantic badges and hierarchy', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    // Tree header
    expect(screen.getByText('Estructura de navegación (4 nodos)')).toBeInTheDocument();

    // Node labels
    expect(screen.getAllByText('Inicio')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Módulo de Pedidos')[0]).toBeInTheDocument();
    expect(screen.getByText('Listado de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Pedido')).toBeInTheDocument();

    // Semantic kind badges
    expect(screen.getAllByText('Inicio')[1]).toBeInTheDocument();
    expect(screen.getByText('Sección')).toBeInTheDocument();
    expect(screen.getByText('Listado')).toBeInTheDocument();
    expect(screen.getByText('Formulario')).toBeInTheDocument();

    // Routes
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getAllByText('/pedidos')[0]).toBeInTheDocument();
    expect(screen.getByText('/pedidos/nuevo')).toBeInTheDocument();

    // Views
    expect(screen.getByText('HomeView')).toBeInTheDocument();
    expect(screen.getByText('OrderSectionView')).toBeInTheDocument();
    expect(screen.getByText('OrderListView')).toBeInTheDocument();
    expect(screen.getByText('CreateOrderView')).toBeInTheDocument();

    // Parent relationship indicator for child
    expect(screen.getAllByText('Módulo de Pedidos').length).toBeGreaterThanOrEqual(2);

    // Use cases
    expect(screen.getAllByText('CU-001').length).toBeGreaterThan(0);
    expect(screen.getByText('CU-002')).toBeInTheDocument();
  });

  it('filters navigation nodes by search query in real time', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    const searchInput = screen.getByPlaceholderText(/buscar por nombre, ruta, vista o cu/i);
    await user.type(searchInput, 'nuevo');

    expect(screen.getByText('1 coincidencia')).toBeInTheDocument();
    expect(screen.getByText('Nuevo Pedido')).toBeInTheDocument();
    expect(screen.queryByText('HomeView')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('HomeView')).toBeInTheDocument();

    // Nonexistent filter
    await user.type(searchInput, 'inexistente');
    expect(
      screen.getByText(/no se encontraron nodos ni pantallas que coincidan/i),
    ).toBeInTheDocument();
  });

  it('toggles navigation tree diagram viewer', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver diagrama/i }));
    expect(mocks.getDiagram).toHaveBeenCalledWith('p1', 'NAVIGATION_TREE', 'nt-1');
    expect(
      await screen.findByRole('button', { name: /ver en pantalla completa/i }),
    ).toBeInTheDocument();
  });

  it('approves a pending navigation tree', async () => {
    mocks.transition.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'NAVIGATION_TREE',
        'nt-1',
        'ntv-1',
        'APPROVED',
      ),
    );
  });
});
