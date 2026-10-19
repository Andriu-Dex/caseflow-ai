import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemArchitecturePage from './page';
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

const mockSystemArchitecture = {
  id: 'sys-1',
  projectId: 'p1',
  code: 'SYS-001',
  title: 'Arquitectura de infraestructura del sistema',
  createdAt: '2026-10-17T00:00:00.000Z',
  version: {
    id: 'sysv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-17T00:00:00.000Z',
  },
  content: {
    boundary: 'Red interna Docker / VPC de producción',
    nodes: [
      {
        localId: 'node-web',
        name: 'Frontend Next.js',
        kind: 'CLIENT',
        responsibilities: [
          'Servir la interfaz web SPA/SSR',
          'Gestionar estado de sesión en cliente',
        ],
        relatedSourceCodes: ['RF-001'],
      },
      {
        localId: 'node-api',
        name: 'Backend NestJS API',
        kind: 'RUNTIME',
        responsibilities: [
          'Exponer endpoints REST y OpenAPI',
          'Ejecutar validaciones y reglas de negocio',
        ],
        relatedSourceCodes: ['RF-001'],
      },
      {
        localId: 'node-db',
        name: 'PostgreSQL Database',
        kind: 'DATABASE',
        responsibilities: ['Persistencia relacional en 3NF', 'Garantizar integridad referencial'],
        relatedSourceCodes: ['RF-002'],
      },
    ],
    links: [
      {
        fromLocalId: 'node-web',
        toLocalId: 'node-api',
        protocol: 'HTTPS / REST',
        description: 'Peticiones de API autenticadas',
      },
      {
        fromLocalId: 'node-api',
        toLocalId: 'node-db',
        protocol: 'TCP 5432',
        description: 'Conexión ORM Prisma',
      },
    ],
  },
};

describe('SystemArchitecturePage', () => {
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
      return { items: [mockSystemArchitecture] };
    });
    mocks.getDiagram.mockResolvedValue({
      svg: '<svg data-testid="sys-svg"><text>Deployment Diagram</text></svg>',
      source: 'graph LR\nWeb --> API --> DB',
      sourceFormat: 'MERMAID',
    });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <SystemArchitecturePage />
      </TestProviders>,
    );
  }

  it('renders page header, approved inputs summary, and system architecture card with metrics', async () => {
    renderPage();

    // Page title
    expect(
      await screen.findByRole('heading', { name: 'Arquitectura de sistema' }),
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
    expect(screen.getByText('SYS-001')).toBeInTheDocument();
    expect(screen.getByText('Arquitectura de infraestructura del sistema')).toBeInTheDocument();
    expect(screen.getByText('3 nodos de sistema')).toBeInTheDocument();
    expect(screen.getByText('2 enlaces de red')).toBeInTheDocument();
  });

  it('expands detail to view boundary banner, system node cards, and resolved link flow', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    // Boundary banner
    expect(screen.getByText('Límite del sistema')).toBeInTheDocument();
    expect(screen.getByText('Red interna Docker / VPC de producción')).toBeInTheDocument();

    // Nodes section
    expect(screen.getByText('Nodos del sistema (3)')).toBeInTheDocument();
    expect(screen.getAllByText('Frontend Next.js')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Backend NestJS API')[0]).toBeInTheDocument();
    expect(screen.getAllByText('PostgreSQL Database')[0]).toBeInTheDocument();

    // Semantic node badges
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Servidor / Runtime')).toBeInTheDocument();
    expect(screen.getByText('Base de datos')).toBeInTheDocument();

    // Responsibilities
    expect(screen.getByText('Servir la interfaz web SPA/SSR')).toBeInTheDocument();
    expect(screen.getByText('Exponer endpoints REST y OpenAPI')).toBeInTheDocument();
    expect(screen.getByText('Persistencia relacional en 3NF')).toBeInTheDocument();

    // Links section (verifying human-readable node names and protocols)
    expect(screen.getByText('Enlaces y comunicación de red (2)')).toBeInTheDocument();
    expect(screen.getByText('HTTPS / REST')).toBeInTheDocument();
    expect(screen.getByText('Peticiones de API autenticadas')).toBeInTheDocument();
    expect(screen.getByText('TCP 5432')).toBeInTheDocument();
    expect(screen.getByText('Conexión ORM Prisma')).toBeInTheDocument();
    expect(screen.getAllByText('Frontend Next.js').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Backend NestJS API').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('PostgreSQL Database').length).toBeGreaterThanOrEqual(2);
  });

  it('filters nodes by search query in real time', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    const searchInput = screen.getByPlaceholderText(/buscar nodo, tipo o función/i);
    await user.type(searchInput, 'Database');

    expect(screen.getAllByText('PostgreSQL Database')[0]).toBeInTheDocument();
    expect(screen.queryByText('Servir la interfaz web SPA/SSR')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Servir la interfaz web SPA/SSR')).toBeInTheDocument();

    // Nonexistent filter
    await user.type(searchInput, 'inexistente');
    expect(screen.getByText(/no se encontraron nodos que coincidan/i)).toBeInTheDocument();
  });

  it('toggles system architecture diagram viewer', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver diagrama/i }));
    expect(mocks.getDiagram).toHaveBeenCalledWith('p1', 'SYSTEM_ARCHITECTURE', 'sys-1');
    expect(
      await screen.findByRole('button', { name: /ver en pantalla completa/i }),
    ).toBeInTheDocument();
  });

  it('approves a pending system architecture', async () => {
    mocks.transition.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'SYSTEM_ARCHITECTURE',
        'sys-1',
        'sysv-1',
        'APPROVED',
      ),
    );
  });
});
