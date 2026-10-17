import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClassDiagramPage from './page';
import { TestProviders } from '../../lib/test-utils';

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
vi.mock('../../lib/api', () => ({
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

const mockClassDiagram = {
  id: 'cd-1',
  projectId: 'p1',
  code: 'CD-001',
  title: 'Diagrama de clases del dominio',
  createdAt: '2026-10-16T00:00:00.000Z',
  version: {
    id: 'cdv-1',
    versionNumber: 1,
    status: 'GENERATED',
    origin: 'AI',
    createdAt: '2026-10-16T00:00:00.000Z',
  },
  content: {
    summary: 'Diagrama de clases del sistema de restaurante',
    classes: [
      {
        localId: 'cls-1',
        name: 'Pedido',
        stereotype: 'ENTITY',
        description: 'Entidad que representa un pedido activo',
        dataModelEntityName: 'Pedido',
        attributes: [
          {
            name: 'id',
            type: 'string',
            visibility: 'PUBLIC',
            required: true,
          },
          {
            name: 'total',
            type: 'number',
            visibility: 'PRIVATE',
            required: true,
          },
        ],
        methods: [
          {
            name: 'calcularTotal',
            visibility: 'PUBLIC',
            parameters: [{ name: 'descuento', type: 'number' }],
            returnType: 'number',
          },
        ],
        relatedSourceCodes: ['RF-001', 'CU-001'],
      },
      {
        localId: 'cls-2',
        name: 'Cliente',
        stereotype: 'ENTITY',
        description: 'Cliente del restaurante',
        attributes: [
          {
            name: 'nombre',
            type: 'string',
            visibility: 'PUBLIC',
            required: true,
          },
        ],
        methods: [],
        relatedSourceCodes: ['RF-001'],
      },
    ],
    relationships: [
      {
        fromLocalId: 'cls-1',
        toLocalId: 'cls-2',
        kind: 'ASSOCIATION',
        label: 'realizadoPor',
        fromMultiplicity: '1..*',
        toMultiplicity: '1',
      },
    ],
  },
};

describe('ClassDiagramPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('caseflow.activeProjectId', 'p1');
    mocks.list.mockResolvedValue({ items: [mockClassDiagram] });
    mocks.latestJob.mockResolvedValue({ job: null });
    mocks.getDiagram.mockResolvedValue({
      svg: '<svg data-testid="class-diagram-svg"><text>UML Classes</text></svg>',
      source: 'classDiagram\nclass Pedido',
      sourceFormat: 'MERMAID',
    });
  });

  function renderPage() {
    return render(
      <TestProviders>
        <ClassDiagramPage />
      </TestProviders>,
    );
  }

  it('renders page header, approved inputs summary, and artifact card with metrics', async () => {
    renderPage();

    // Title
    expect(await screen.findByRole('heading', { name: 'Diagrama de clases' })).toBeInTheDocument();

    // Approved sources checkboxes in top card
    expect(await screen.findByText('RF-001')).toBeInTheDocument();
    expect(screen.getByText('Gestión de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('CU-001')).toBeInTheDocument();
    expect(screen.getByText('Registrar pedido')).toBeInTheDocument();
    expect(screen.getByText('MD-001')).toBeInTheDocument();
    expect(screen.getByText('Modelo relacional')).toBeInTheDocument();

    // Artifact card
    expect(screen.getByText('CD-001')).toBeInTheDocument();
    expect(screen.getByText('Diagrama de clases del dominio')).toBeInTheDocument();
    expect(screen.getByText('2 clases')).toBeInTheDocument();
    expect(screen.getByText('1 relación')).toBeInTheDocument();
  });

  it('expands detail to view structured UML classes, attributes, methods, and relationships', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver detalle/i }));

    // Classes section
    expect(screen.getByText('Clases del dominio (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Pedido')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Cliente')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Entidad')[0]).toBeInTheDocument();

    // Data model coherence
    expect(screen.getByText('Entidad:')).toBeInTheDocument();

    // Attributes and visibility
    expect(screen.getByText('Atributos (2):')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.getAllByText('REQ')[0]).toBeInTheDocument();

    // Methods
    expect(screen.getByText('Métodos (1):')).toBeInTheDocument();
    expect(screen.getByText(/calcularTotal\(descuento: number\)/i)).toBeInTheDocument();
    expect(screen.getByText(': number')).toBeInTheDocument();

    // Sources
    expect(screen.getAllByText('RF-001')[0]).toBeInTheDocument();
    expect(screen.getAllByText('CU-001')[0]).toBeInTheDocument();

    // Relationships section
    expect(screen.getByText('Relaciones UML (1)')).toBeInTheDocument();
    expect(screen.getByText(/Asociación · realizadoPor/i)).toBeInTheDocument();
    expect(screen.getByText('[1..*]')).toBeInTheDocument();
    expect(screen.getByText('[1]')).toBeInTheDocument();
  });

  it('toggles class diagram viewer', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /ver diagrama/i }));
    expect(mocks.getDiagram).toHaveBeenCalledWith('p1', 'CLASS_DIAGRAM', 'cd-1');
    expect(
      await screen.findByRole('button', { name: /ver en pantalla completa/i }),
    ).toBeInTheDocument();
  });

  it('approves a pending class diagram', async () => {
    mocks.transition.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        'p1',
        'CLASS_DIAGRAM',
        'cd-1',
        'cdv-1',
        'APPROVED',
      ),
    );
  });

  // DEC-142: drawn in batches in the background, not in one request.
  it('draws the class diagram as a background job and shows the proposal when it finishes', async () => {
    mocks.startJob.mockResolvedValue({
      id: 'job1',
      projectId: 'p1',
      kind: 'CLASS_DIAGRAM',
      status: 'COMPLETED',
      completedBatches: 6,
      totalBatches: 6,
      outputChars: 0,
      generationId: 'gen1',
      errorMessage: null,
      sourceVersionIds: ['rv1', 'uv1', 'dmv1'],
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    });
    mocks.generation.mockResolvedValue({
      id: 'gen1',
      candidates: [
        {
          id: 'cand1',
          candidateId: 'candidate-1',
          title: 'Diagrama de clases (candidato)',
          content: { classes: [], relationships: [] },
          qualityFindings: [],
          acceptedArtifactId: null,
        },
      ],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Generar' }));
    await waitFor(() =>
      expect(mocks.startJob).toHaveBeenCalledWith(
        'p1',
        'CLASS_DIAGRAM',
        expect.arrayContaining(['rv1', 'uv1', 'dmv1']),
      ),
    );
    // The synchronous generation is no longer used for it.
    expect(mocks.generate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.generation).toHaveBeenCalledWith('p1', 'CLASS_DIAGRAM', 'gen1'),
    );
    expect(await screen.findByText(/La IA generó 1 propuesta/)).toBeInTheDocument();
  });

  it('offers to resume a class diagram run that stopped, keeping the finished batches', async () => {
    mocks.latestJob.mockResolvedValue({
      job: {
        id: 'job1',
        projectId: 'p1',
        kind: 'CLASS_DIAGRAM',
        status: 'FAILED',
        completedBatches: 2,
        totalBatches: 6,
        outputChars: 0,
        generationId: null,
        errorMessage: 'Se interrumpió porque el servidor se reinició. Puede reintentarlo.',
        sourceVersionIds: ['rv1', 'uv1', 'dmv1'],
        createdAt: '2026-10-17T00:00:00.000Z',
        updatedAt: '2026-10-17T00:00:00.000Z',
      },
    });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reanudar generación' })).toBeEnabled();
    expect(
      await screen.findByText(/Se interrumpió porque el servidor se reinició/),
    ).toBeInTheDocument();
  });
});
