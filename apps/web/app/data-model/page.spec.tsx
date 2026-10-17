import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataModelPage from './page';
import { TestProviders } from '../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  startGeneration: vi.fn(),
  getDiagram: vi.fn(),
  transition: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/api', () => ({
  api: {
    dataModels: {
      list: (...args: unknown[]) => mocks.list(...args),
      startGeneration: (...args: unknown[]) => mocks.startGeneration(...args),
      latestGeneration: vi.fn(async () => ({ job: null })),
      generation: vi.fn(),
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
            version: { id: 'rv1', status: 'APPROVED' },
            requirement: { requirementType: 'FUNCTIONAL', name: 'Pedido' },
          },
        ],
      })),
    },
    useCases: {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'u1',
            version: { id: 'uv1', status: 'APPROVED' },
            useCase: { name: 'Registrar pedido' },
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

const mockDataModel = {
  id: 'dm-1',
  projectId: 'p1',
  code: 'MD-001',
  createdAt: '2026-10-16T00:00:00.000Z',
  version: {
    id: 'dmv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  dataModel: {
    title: 'Modelo de datos de Restaurante',
    modelKind: 'ER',
    entities: [
      {
        localId: 'e1',
        name: 'Pedido',
        description: 'Orden de compra realizada por el cliente',
        attributes: [
          {
            name: 'id',
            type: 'UUID',
            required: true,
            primaryKey: true,
            unique: true,
            description: 'Identificador único',
          },
          {
            name: 'total',
            type: 'DECIMAL',
            required: true,
            primaryKey: false,
            unique: false,
            description: 'Monto total',
          },
        ],
      },
      {
        localId: 'e2',
        name: 'Cliente',
        description: 'Persona que realiza pedidos',
        attributes: [
          {
            name: 'id',
            type: 'UUID',
            required: true,
            primaryKey: true,
            unique: true,
            description: 'Identificador',
          },
        ],
      },
    ],
    relationships: [
      {
        sourceEntityId: 'e2',
        targetEntityId: 'e1',
        sourceCardinality: 'ONE',
        targetCardinality: 'ZERO_OR_MORE',
        name: 'realiza',
        description: 'Un cliente puede tener varios pedidos',
      },
    ],
  },
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.list.mockResolvedValue({ items: [mockDataModel] });
  mocks.getDiagram.mockResolvedValue({
    svg: '<svg><circle/></svg>',
    source: 'erDiagram',
    sourceFormat: 'MERMAID_ER',
    code: 'MD-001',
  });
});

const renderPage = () =>
  render(
    <TestProviders>
      <DataModelPage />
    </TestProviders>,
  );

describe('DataModelPage', () => {
  it('renders input summary and data model card with badges', async () => {
    renderPage();

    // Top section inputs
    expect(await screen.findByText('1 requisito aprobado')).toBeInTheDocument();
    expect(screen.getByText('1 caso de uso aprobado')).toBeInTheDocument();

    // Data model card
    expect(screen.getByText('MD-001')).toBeInTheDocument();
    expect(screen.getByText('Modelo de datos de Restaurante')).toBeInTheDocument();
    expect(screen.getByText('2 entidades')).toBeInTheDocument();
    expect(screen.getByText('1 relación')).toBeInTheDocument();
  });

  it('starts the background generation with the approved requirements and use cases', async () => {
    const user = userEvent.setup();
    mocks.startGeneration.mockResolvedValue({
      id: 'job-1',
      status: 'QUEUED',
      generationId: null,
      errorMessage: null,
      completedBatches: 0,
      totalBatches: 0,
      outputChars: 0,
      sourceVersionIds: ['rv1', 'uv1'],
      createdAt: '2026-10-17T00:00:00.000Z',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /generar con ia/i }));
    expect(mocks.startGeneration).toHaveBeenCalledWith('p1', ['rv1'], ['uv1']);
  });

  it('expands entities and relationships with structured attribute details', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver entidades y relaciones/i }));

    // Tab triggers
    expect(screen.getByRole('tab', { name: /entidades/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /relaciones/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /diagrama er/i })).toBeInTheDocument();

    // Entities section
    expect(screen.getAllByText('Entidades (2)')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Pedido')[0]).toBeInTheDocument();
    expect(screen.getByText('Orden de compra realizada por el cliente')).toBeInTheDocument();

    // Attribute properties & badges
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.getByText('DECIMAL')).toBeInTheDocument();
    expect(screen.getAllByTitle('Clave primaria')[0]).toBeInTheDocument();
    expect(screen.getAllByTitle('Requerido (NOT NULL)')[0]).toBeInTheDocument();
    expect(screen.getAllByTitle('Único')[0]).toBeInTheDocument();

    // Switch to Relationships tab
    await user.click(screen.getByRole('tab', { name: /relaciones/i }));
    expect(screen.getAllByText('Relaciones (1)')[0]).toBeInTheDocument();
    expect(screen.getByText('realiza')).toBeInTheDocument();
    expect(screen.getByText('Un cliente puede tener varios pedidos')).toBeInTheDocument();
  });

  it('toggles ER diagram viewer', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver diagrama entidad-relación/i }));
    expect(mocks.getDiagram).toHaveBeenCalledWith('p1', 'dm-1');
    expect(
      await screen.findByRole('button', { name: /ver en pantalla completa/i }),
    ).toBeInTheDocument();
  });

  it('approves a pending data model', async () => {
    mocks.transition.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith('p1', 'dm-1', 'dmv-1', 'APPROVED'),
    );
  });

  it('filters entities and relationships by search query in real time', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver entidades y relaciones/i }));

    // Search for 'total' (attribute of Pedido)
    const entitySearch = screen.getByPlaceholderText(/buscar entidad o atributo/i);
    await user.type(entitySearch, 'total');

    expect(screen.getByText(/1 coincidencia/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pedido')[0]).toBeInTheDocument();
    expect(screen.queryByText('Persona que realiza pedidos')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(entitySearch, { target: { value: '' } });
    expect(screen.getByText('Persona que realiza pedidos')).toBeInTheDocument();

    // Switch to relationships and filter
    await user.click(screen.getByRole('tab', { name: /relaciones/i }));
    const relationSearch = screen.getByPlaceholderText(/filtrar por entidad o relación/i);
    await user.type(relationSearch, 'inexistente');
    expect(screen.getByText(/no se encontraron relaciones que coincidan/i)).toBeInTheDocument();

    fireEvent.change(relationSearch, { target: { value: '' } });
    expect(screen.getByText('realiza')).toBeInTheDocument();
  });
});
