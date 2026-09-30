import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import { DiagramProviderError, FakeDiagramProvider } from '@caseflow-ai/integrations';
import type { PrismaService } from '../database/prisma.service';
import { DiagramEngine } from '../data-models/diagram-engine';
import { StructuredAnalysisService } from './structured-analysis.service';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';
const now = new Date('2026-01-01T00:00:00Z');

const navigationContent = {
  nodes: [{ localId: 'home', label: 'Inicio', viewName: 'Home', kind: 'HOME' as const }],
};
const artifact = { id: 'artifact', projectId: 'project', code: 'NAV-001', createdAt: now };
const detail = {
  kind: 'NAVIGATION_TREE',
  content: navigationContent,
  generationId: null,
  generationCandidateId: null,
  aiRunId: null,
};
const version = {
  id: 'version',
  versionNumber: 1,
  title: 'Navegación',
  status: 'DRAFT',
  origin: 'MANUAL',
  createdAt: now,
  structuredAnalysisDetail: detail,
};

function setup() {
  const tx = {
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project' }) },
    artifactType: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ code: 'NAVIGATION_TREE', defaultCodePrefix: 'NAV' }),
    },
    artifact: {
      create: vi.fn().mockResolvedValue(artifact),
      findUniqueOrThrow: vi.fn().mockResolvedValue(artifact),
    },
    artifactVersion: {
      create: vi.fn().mockResolvedValue(version),
      findUniqueOrThrow: vi.fn().mockResolvedValue(version),
      findFirstOrThrow: vi.fn().mockResolvedValue(version),
    },
    structuredAnalysisDetail: { create: vi.fn() },
    diagramDetail: { create: vi.fn() },
    structuredAnalysisGeneration: { create: vi.fn(), findFirst: vi.fn() },
    structuredAnalysisGenerationSource: { createMany: vi.fn() },
    structuredAnalysisCandidate: { create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  };
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
    $transaction: vi.fn((callback) => callback(tx)),
    artifact: { findMany: vi.fn(), findFirst: vi.fn() },
    artifactVersion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    structuredAnalysisGeneration: { findFirst: vi.fn() },
  };
  const ai = { generateStructured: vi.fn() };
  return {
    tx,
    prisma,
    ai,
    service: new StructuredAnalysisService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    ),
  };
}

describe('StructuredAnalysisService', () => {
  it('creates a manual navigation tree as DRAFT with its deterministic diagram', async () => {
    const { service, tx } = setup();
    await expect(
      service.create('project', 'NAVIGATION_TREE', 'Navegación', navigationContent),
    ).resolves.toMatchObject({ code: 'NAV-001', kind: 'NAVIGATION_TREE' });
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', origin: 'MANUAL' }),
      }),
    );
    expect(tx.diagramDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'NAVIGATION_TREE',
          sourceFormat: 'MERMAID_FLOWCHART',
        }),
      }),
    );
  });

  it('does not render a diagram for UI_BLUEPRINT (no diagram config for that kind)', async () => {
    const { service, tx } = setup();
    tx.artifactType.findUniqueOrThrow.mockResolvedValue({
      code: 'UI_BLUEPRINT',
      defaultCodePrefix: 'UIB',
    });
    await service.create('project', 'UI_BLUEPRINT', 'Pantallas', { screens: [] });
    expect(tx.diagramDetail.create).not.toHaveBeenCalled();
  });

  it('lists, gets and versions, protecting project scope', async () => {
    const { service, prisma, tx } = setup();
    prisma.artifact.findMany.mockResolvedValue([{ ...artifact, versions: [version] }]);
    prisma.artifact.findFirst
      .mockResolvedValueOnce({ ...artifact, versions: [version] })
      .mockResolvedValueOnce({ ...artifact, versions: [] });
    await expect(service.list('project', 'NAVIGATION_TREE')).resolves.toMatchObject({
      items: [{ code: 'NAV-001' }],
    });
    await expect(service.get('project', 'NAVIGATION_TREE', 'artifact')).resolves.toMatchObject({
      id: 'artifact',
    });
    await expect(service.get('other', 'NAVIGATION_TREE', 'artifact')).rejects.toThrow(
      'no encontrado',
    );
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    await expect(
      service.version('project', 'NAVIGATION_TREE', 'artifact', 'V2', navigationContent),
    ).resolves.toMatchObject({ id: 'artifact' });
  });

  it('requires exact APPROVED eligible sources before generating candidates', async () => {
    const { service, prisma, tx, ai } = setup();
    prisma.project.findUnique.mockResolvedValue({ language: 'EN' });
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source',
        artifact: { code: 'RF-001', artifactTypeCode: 'REQUIREMENT' },
        structuredAnalysisDetail: { content: { approved: true } },
      },
    ]);
    ai.generateStructured.mockResolvedValue({
      data: { candidates: [] },
      metadata: { runId: 'run' },
    });
    tx.structuredAnalysisGeneration.create.mockResolvedValue({ id: 'generation' });
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue({
      id: 'generation',
      projectId: 'project',
      kind: 'NAVIGATION_TREE',
      sources: [],
      candidates: [],
    });
    await service.generate('project', 'NAVIGATION_TREE', ['source']);
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ promptKey: 'navigation.generate', language: 'EN' }),
    );

    prisma.artifactVersion.findMany.mockResolvedValue([]);
    await expect(service.generate('project', 'NAVIGATION_TREE', ['missing'])).rejects.toThrow(
      'APPROVED',
    );
    await expect(service.generate('project', 'NAVIGATION_TREE', ['same', 'same'])).rejects.toThrow(
      'repetirse',
    );
  });

  it('sends approved source content rather than only titles to the AI', async () => {
    const { service, prisma, tx, ai } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source-version',
        title: 'Pedidos',
        artifact: { code: 'RF-001', artifactTypeCode: 'REQUIREMENT' },
        requirementDetail: {
          name: 'Registrar pedidos',
          description: 'El vendedor registra un pedido con productos y cantidades.',
          requirementType: 'FUNCTIONAL',
          priority: 'HIGH',
          actors: [{ name: 'Vendedor' }],
          preconditions: [],
          postconditions: [],
        },
      },
    ]);
    ai.generateStructured.mockResolvedValue({
      data: { candidates: [] },
      metadata: { runId: 'run' },
    });
    tx.structuredAnalysisGeneration.create.mockResolvedValue({ id: 'generation' });
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue({
      id: 'generation',
      projectId: 'project',
      kind: 'NAVIGATION_TREE',
      sources: [],
      candidates: [],
    });

    await service.generate('project', 'NAVIGATION_TREE', ['source-version']);
    const input = ai.generateStructured.mock.calls[0]![0];
    expect(input.promptVersion).toBe(4);
    expect(input.messages[0].content).toContain('El vendedor registra un pedido');
    expect(input.messages[0].content).toContain('RF-001');
    expect(input.messages[0].content).not.toContain('"id":"source-version"');
  });

  it('does not silently fall back to titles when selected content is missing', async () => {
    const { service, prisma, ai } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source',
        title: 'Pedidos',
        artifact: { code: 'RF-001', artifactTypeCode: 'REQUIREMENT' },
      },
    ]);
    await expect(service.generate('project', 'NAVIGATION_TREE', ['source'])).rejects.toThrow(
      'contenido estructurado',
    );
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('blocks acceptance when the candidate cites an unselected source', async () => {
    const { service, prisma, tx } = setup();
    const generation = {
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      sources: [{ artifactVersionId: 'source-version' }],
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c1',
          acceptedArtifactId: null,
          title: 'Navegación',
          content: {
            nodes: [
              {
                localId: 'orders',
                label: 'Pedidos',
                viewName: 'Pedidos',
                kind: 'LIST',
                relatedSourceCodes: ['RF-999'],
              },
            ],
          },
        },
      ],
    };
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue(generation);
    prisma.artifactVersion.findMany.mockResolvedValue([
      { id: 'source-version', artifact: { code: 'RF-001', artifactTypeCode: 'REQUIREMENT' } },
    ]);
    await expect(
      service.accept('project', 'NAVIGATION_TREE', 'generation', ['candidate']),
    ).rejects.toThrow('referencias inválidas');
    expect(tx.artifact.create).not.toHaveBeenCalled();
  });

  it('normalizes AI errors without persisting a generation', async () => {
    const { service, prisma, ai } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source',
        artifact: { code: 'RF', artifactTypeCode: 'REQUIREMENT' },
        structuredAnalysisDetail: { content: { approved: true } },
      },
    ]);
    ai.generateStructured.mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe'));
    await expect(service.generate('project', 'NAVIGATION_TREE', ['source'])).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
  });

  it('never auto-approves: accept() creates AI_GENERATED artifacts still requiring review', async () => {
    const { service, prisma, tx } = setup();
    const generation = {
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      sources: [],
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c1',
          acceptedArtifactId: null,
          title: 'Navegación',
          content: navigationContent,
        },
      ],
    };
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue(generation);
    tx.structuredAnalysisGeneration.findFirst.mockResolvedValue(generation);

    const result = await service.accept('project', 'NAVIGATION_TREE', 'generation', ['candidate']);
    expect(result.items).toHaveLength(1);
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'GENERATED', origin: 'AI_GENERATED' }),
      }),
    );
    expect(tx.structuredAnalysisCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { acceptedArtifactId: artifact.id } }),
    );
  });

  it('rejects re-accepting an already accepted candidate and unknown candidates/generations', async () => {
    const { service, prisma, tx } = setup();
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue(null);
    await expect(
      service.accept('project', 'NAVIGATION_TREE', 'missing', ['candidate']),
    ).rejects.toThrow('no encontrada');

    const generation = {
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      sources: [],
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c1',
          acceptedArtifactId: 'already',
          title: 'Navegación',
          content: navigationContent,
        },
      ],
    };
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue(generation);
    tx.structuredAnalysisGeneration.findFirst.mockResolvedValue(generation);
    await expect(
      service.accept('project', 'NAVIGATION_TREE', 'generation', ['candidate']),
    ).rejects.toThrow('ya fue aceptado');
  });

  it('fails the whole accept batch before writing anything when rendering fails', async () => {
    const { prisma, tx } = setup();
    const failing = new DiagramProviderError('DIAGRAM_PROVIDER_UNAVAILABLE', 'down');
    const service = new StructuredAnalysisService(
      prisma as unknown as PrismaService,
      { generateStructured: vi.fn() } as unknown as AIOrchestrator,
      new DiagramEngine(),
      new FakeDiagramProvider(failing),
    );
    prisma.structuredAnalysisGeneration.findFirst.mockResolvedValue({
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      sources: [],
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c1',
          acceptedArtifactId: null,
          title: 'Navegación',
          content: navigationContent,
        },
      ],
    });
    await expect(
      service.accept('project', 'NAVIGATION_TREE', 'generation', ['candidate']),
    ).rejects.toMatchObject({ response: { code: 'DIAGRAM_PROVIDER_UNAVAILABLE' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.artifact.create).not.toHaveBeenCalled();
  });

  it('enforces the artifact lifecycle transition rules', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValue({ id: 'version', status: 'DRAFT' });
    prisma.artifactVersion.update.mockResolvedValue({ id: 'version', status: 'IN_REVIEW' });
    await expect(
      service.transition('project', 'NAVIGATION_TREE', 'artifact', 'version', 'IN_REVIEW'),
    ).resolves.toMatchObject({ status: 'IN_REVIEW' });

    prisma.artifactVersion.findFirst.mockResolvedValue({ id: 'version', status: 'DRAFT' });
    await expect(
      service.transition('project', 'NAVIGATION_TREE', 'artifact', 'version', 'APPROVED'),
    ).rejects.toThrow('no permitida');

    prisma.artifactVersion.findFirst.mockResolvedValue(null);
    await expect(
      service.transition('project', 'NAVIGATION_TREE', 'artifact', 'missing', 'IN_REVIEW'),
    ).rejects.toThrow('no encontrada');
  });

  it('loads diagrams and rejects diagram access for kinds without one', async () => {
    const { service, prisma } = setup();
    const diagram = {
      kind: 'NAVIGATION_TREE',
      sourceFormat: 'MERMAID_FLOWCHART',
      source: 'flowchart TD\n',
      svg: '<svg/>',
      sources: [{ sourceArtifactVersionId: 'version' }],
    };
    prisma.artifact.findFirst.mockResolvedValueOnce({
      ...artifact,
      versions: [{ ...version, diagramDetail: diagram }],
    });
    await expect(
      service.getDiagram('project', 'NAVIGATION_TREE', 'artifact'),
    ).resolves.toMatchObject({
      kind: 'NAVIGATION_TREE',
    });
    await expect(service.getDiagram('project', 'UI_BLUEPRINT', 'artifact')).rejects.toThrow(
      'no tiene diagrama',
    );
  });

  it('re-renders a diagram as a PNG buffer from its stored canonical source', async () => {
    const { service, prisma } = setup();
    const diagram = {
      kind: 'NAVIGATION_TREE',
      sourceFormat: 'MERMAID_FLOWCHART',
      source: 'flowchart TD\n',
      svg: '<svg/>',
      sources: [{ sourceArtifactVersionId: 'version' }],
    };
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [{ ...version, diagramDetail: diagram }],
    });
    const png = await service.getDiagramPng('project', 'NAVIGATION_TREE', 'artifact');
    expect(Buffer.isBuffer(png)).toBe(true);
  });
});
