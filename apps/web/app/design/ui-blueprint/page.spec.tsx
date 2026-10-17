import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UiBlueprintPage from './page';
import { TestProviders } from '../../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  generate: vi.fn(),
  latestJob: vi.fn(),
  startJob: vi.fn(),
  generation: vi.fn(),
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
      latestGenerationJob: (...args: unknown[]) => mocks.latestJob(...args),
      startGenerationJob: (...args: unknown[]) => mocks.startJob(...args),
      generation: (...args: unknown[]) => mocks.generation(...args),
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

const mockUiBlueprint = {
  id: 'ui-1',
  projectId: 'p1',
  code: 'UI-001',
  title: 'Plano de interfaz de usuario',
  createdAt: '2026-10-17T00:00:00.000Z',
  version: {
    id: 'uiv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-17T00:00:00.000Z',
  },
  content: {
    screens: [
      {
        localId: 'screen-dashboard',
        name: 'Panel de Control Principal',
        purpose: 'Visualizar resumen de KPIs, métricas de ventas y accesos directos.',
        targetActors: ['Administrador', 'Gerente'],
        relatedUseCaseCodes: ['CU-001', 'CU-005'],
        relatedSourceCodes: ['RF-001'],
        navigationNodeLocalId: 'nav-dashboard',
        sections: [
          'Cabecera de bienvenida',
          'Tarjetas de métricas rápidas',
          'Gráfico de tendencias mensuales',
        ],
        primaryActions: ['Crear nuevo pedido', 'Descargar informe ejecutivo'],
        secondaryActions: ['Filtrar período', 'Recargar datos'],
        principalData: ['Total de ingresos', 'Margen neto', 'Pedidos pendientes'],
        forms: ['Selector de rango de fechas'],
        states: ['Cargando métricas', 'Sin transacciones en el período', 'Datos actualizados'],
      },
      {
        localId: 'screen-orders',
        name: 'Listado y Gestión de Pedidos',
        purpose: 'Administrar pedidos de clientes, filtrar por estado y procesar entregas.',
        targetActors: ['Cajero', 'Administrador'],
        relatedUseCaseCodes: ['CU-002'],
        relatedSourceCodes: ['RF-002'],
        navigationNodeLocalId: 'nav-orders',
        sections: ['Barra superior de filtros', 'Tabla de pedidos', 'Paginación inferior'],
        primaryActions: ['Registrar pedido'],
        secondaryActions: ['Exportar a Excel', 'Imprimir ticket'],
        principalData: ['Número de pedido', 'Cliente', 'Monto', 'Estado'],
        forms: ['Filtros avanzados de pedidos'],
        states: ['Lista vacía', 'Cargando pedidos', 'Error al cargar'],
      },
    ],
  },
};

describe('UiBlueprintPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.list.mockImplementation(async (_projectId: string, kind: string) => {
      if (kind === 'UI_BLUEPRINT') {
        return {
          items: [mockUiBlueprint],
        };
      }
      return { items: [] };
    });
    mocks.latestJob.mockResolvedValue({ job: null });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <UiBlueprintPage />
      </TestProviders>,
    );
  }

  it('renders UI blueprint card with enriched metrics and screen details on expand', async () => {
    const user = userEvent.setup();
    renderPage();

    // Title and heading
    expect(await screen.findByRole('heading', { name: /Plano de interfaz/i })).toBeInTheDocument();

    // Enriched Metrics on the card
    expect(screen.getByText('2 pantallas')).toBeInTheDocument();
    expect(screen.getByText('6 secciones de interfaz')).toBeInTheDocument();
    expect(screen.getByText('7 acciones interactivas')).toBeInTheDocument();
    expect(screen.getByText('2 formularios')).toBeInTheDocument();

    // Click "Ver detalle" to expand UI Blueprint screens
    await user.click(screen.getByRole('button', { name: /Ver detalle/i }));

    // Screen names
    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();

    // Purpose descriptions
    expect(
      screen.getByText('Visualizar resumen de KPIs, métricas de ventas y accesos directos.'),
    ).toBeInTheDocument();

    // Target actors and use case badges
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gerente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CU-001').length).toBeGreaterThan(0);
    expect(screen.getByText('CU-005')).toBeInTheDocument();
    expect(screen.getByText('CU-002')).toBeInTheDocument();

    // Sections
    expect(screen.getByText('Cabecera de bienvenida')).toBeInTheDocument();
    expect(screen.getByText('Tabla de pedidos')).toBeInTheDocument();

    // Primary and secondary actions
    expect(screen.getByText('Crear nuevo pedido')).toBeInTheDocument();
    expect(screen.getByText('Exportar a Excel')).toBeInTheDocument();

    // Forms and data
    expect(screen.getByText('Selector de rango de fechas')).toBeInTheDocument();
    expect(screen.getByText('Total de ingresos')).toBeInTheDocument();

    // Navigation node link
    expect(screen.getByText('Nodo: nav-dashboard')).toBeInTheDocument();
  });

  it('filters screens by search query in real time', async () => {
    const user = userEvent.setup();
    renderPage();

    // Expand details
    await user.click(await screen.findByRole('button', { name: /Ver detalle/i }));

    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Buscar por pantalla, sección, actor o CU/i);
    fireEvent.change(searchInput, { target: { value: 'Gestión de Pedidos' } });

    // Orders is shown, Dashboard is filtered out
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.queryByText('Panel de Control Principal')).not.toBeInTheDocument();

    // Search by use case code CU-005
    fireEvent.change(searchInput, { target: { value: 'CU-005' } });
    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.queryByText('Listado y Gestión de Pedidos')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();
  });

  it('filters screens by target actor', async () => {
    const user = userEvent.setup();
    renderPage();

    // Expand details
    await user.click(await screen.findByRole('button', { name: /Ver detalle/i }));

    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();

    // Filter by Gerente
    const gerenteFilter = screen.getByRole('button', { name: /^Gerente/i });
    fireEvent.click(gerenteFilter);

    // Only Dashboard screen has Gerente
    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.queryByText('Listado y Gestión de Pedidos')).not.toBeInTheDocument();

    // Filter by Todos
    const todosFilter = screen.getByRole('button', { name: /^Todos/i });
    fireEvent.click(todosFilter);

    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();
    expect(screen.getByText('Listado y Gestión de Pedidos')).toBeInTheDocument();
  });

  it('expands and collapses screen details', async () => {
    const user = userEvent.setup();
    renderPage();

    // Expand details
    await user.click(await screen.findByRole('button', { name: /Ver detalle/i }));

    expect(screen.getByText('Panel de Control Principal')).toBeInTheDocument();

    // Initially expanded - sections are visible
    expect(screen.getByText('Cabecera de bienvenida')).toBeInTheDocument();

    // Click "Contraer todas"
    const collapseAllBtn = screen.getByRole('button', { name: /Contraer todas/i });
    fireEvent.click(collapseAllBtn);

    // Sections should be hidden
    expect(screen.queryByText('Cabecera de bienvenida')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expandir todas/i })).toBeInTheDocument();

    // Click "Expandir todas"
    fireEvent.click(screen.getByRole('button', { name: /Expandir todas/i }));
    expect(screen.getByText('Cabecera de bienvenida')).toBeInTheDocument();
  });

  it('allows approving candidate UI blueprint', async () => {
    mocks.transition.mockResolvedValueOnce({
      ...mockUiBlueprint,
      version: { ...mockUiBlueprint.version, status: 'APPROVED' },
    });

    renderPage();

    expect(await screen.findByText('UI-001')).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: /Aprobar/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'UI_BLUEPRINT',
        'ui-1',
        'uiv-1',
        'APPROVED',
      );
    });
  });
});
