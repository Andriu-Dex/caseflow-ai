import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import { DiagramProviderError, FakeDiagramProvider } from '@caseflow-ai/integrations';
import type { PrismaService } from '../database/prisma.service';
import { DataModelsService } from './data-models.service';
import { DiagramEngine } from './diagram-engine';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  title: 'Modelo',
  modelKind: 'ER' as const,
  entities: [
    {
      localId: 'a',
      name: 'A',
      attributes: [
        { name: 'id', type: 'UUID' as const, required: true, primaryKey: true, unique: true },
      ],
    },
    {
      localId: 'b',
      name: 'B',
      attributes: [
        { name: 'name', type: 'STRING' as const, required: true, primaryKey: false, unique: false },
      ],
    },
  ],
  relationships: [
    {
      sourceEntityId: 'a',
      targetEntityId: 'b',
      sourceCardinality: 'ONE' as const,
      targetCardinality: 'ZERO_OR_MORE' as const,
      name: 'has',
    },
  ],
};
const detail = {
  modelKind: 'ER' as const,
  generationId: null,
  generationCandidateId: null,
  aiRunId: null,
  entities: [
    {
      localId: 'a',
      name: 'A',
      description: null,
      attributes: [
        {
          name: 'id',
          type: 'UUID',
          required: true,
          primaryKey: true,
          unique: true,
          description: null,
        },
      ],
    },
    {
      localId: 'b',
      name: 'B',
      description: null,
      attributes: [
        {
          name: 'name',
          type: 'STRING',
          required: true,
          primaryKey: false,
          unique: false,
          description: null,
        },
      ],
    },
  ],
  relationships: [
    {
      name: 'has',
      sourceCardinality: 'ONE',
      targetCardinality: 'ZERO_OR_MORE',
      description: null,
      sourceEntity: { localId: 'a' },
      targetEntity: { localId: 'b' },
    },
  ],
};
const artifact = { id: 'artifact', projectId: 'project', code: 'MD-001', createdAt: now };
const version = {
  id: 'version',
  versionNumber: 1,
  title: 'Modelo',
  status: 'DRAFT',
  origin: 'MANUAL',
  createdAt: now,
  dataModelDetail: detail,
};

function setup() {
  let entity = 0;
  const tx = {
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project' }) },
    artifact: {
      create: vi.fn().mockResolvedValue(artifact),
      findUniqueOrThrow: vi.fn().mockResolvedValue(artifact),
    },
    artifactVersion: {
      create: vi.fn().mockResolvedValue(version),
      findUniqueOrThrow: vi.fn().mockResolvedValue(version),
      findFirstOrThrow: vi.fn().mockResolvedValue(version),
    },
    dataModelDetail: { create: vi.fn() },
    dataModelEntity: {
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: `entity-${++entity}` })),
    },
    dataModelRelationship: { createMany: vi.fn() },
    diagramDetail: {
      create: vi.fn().mockResolvedValue({
        kind: 'ER',
        sourceFormat: 'MERMAID_ER',
        source: 'erDiagram\n',
        svg: '<svg/>',
        sources: [{ sourceArtifactVersionId: 'version' }],
      }),
    },
    dataModelGeneration: { create: vi.fn(), findFirst: vi.fn() },
    dataModelGenerationSource: { createMany: vi.fn() },
    dataModelCandidate: { create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
    artifact: { findMany: vi.fn(), findFirst: vi.fn() },
    artifactVersion: { findMany: vi.fn() },
    dataModelGeneration: { findFirst: vi.fn() },
  };
  const ai = { generateStructured: vi.fn() };
  return {
    tx,
    prisma,
    ai,
    service: new DataModelsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    ),
  };
}

describe('DataModelsService', () => {
  it('creates a normalized manual model and derived ER diagram', async () => {
    const { service, tx } = setup();
    await expect(service.create('project', input)).resolves.toMatchObject({
      code: 'MD-001',
      dataModel: { title: 'Modelo' },
    });
    expect(tx.dataModelEntity.create).toHaveBeenCalledTimes(2);
    expect(tx.dataModelRelationship.createMany).toHaveBeenCalledOnce();
    expect(tx.diagramDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceFormat: 'MERMAID_ER' }) }),
    );
  });
  it('lists, gets, versions and protects project scope', async () => {
    const { service, prisma, tx } = setup();
    prisma.artifact.findMany.mockResolvedValue([{ ...artifact, versions: [version] }]);
    prisma.artifact.findFirst
      .mockResolvedValueOnce({ ...artifact, versions: [version] })
      .mockResolvedValueOnce(null);
    await expect(service.list('project')).resolves.toMatchObject({ items: [{ code: 'MD-001' }] });
    await expect(service.get('project', 'artifact')).resolves.toMatchObject({ id: 'artifact' });
    await expect(service.get('other', 'artifact')).rejects.toThrow('no encontrado');
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    await expect(
      service.version('project', 'artifact', { ...input, title: 'V2' }),
    ).resolves.toMatchObject({ id: 'artifact' });
  });
  it('validates exact approved generation sources and persists candidates', async () => {
    const { service, prisma, tx, ai } = setup();
    const source = {
      id: 'source',
      artifact: { code: 'RF-001', artifactTypeCode: 'REQUIREMENT' },
      requirementDetail: { name: 'R' },
      useCaseDetail: null,
    };
    prisma.artifactVersion.findMany.mockResolvedValue([source]);
    ai.generateStructured.mockResolvedValue({
      data: { candidates: [{ candidateId: 'c', ...input }] },
      metadata: { runId: 'run' },
    });
    tx.dataModelGeneration.create.mockResolvedValue({ id: 'generation' });
    prisma.dataModelGeneration.findFirst.mockResolvedValue({
      id: 'generation',
      projectId: 'project',
      sources: [],
      candidates: [],
    });
    await expect(service.generate('project', ['source'], [])).resolves.toMatchObject({
      id: 'generation',
    });
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ promptKey: 'data-model.generate', maxOutputTokens: 12_288 }),
    );
    expect(tx.dataModelCandidate.create).toHaveBeenCalledOnce();
    prisma.artifactVersion.findMany.mockResolvedValue([]);
    await expect(service.generate('project', ['draft'], [])).rejects.toThrow('APPROVED');
  });
  it('normalizes AI errors without persisting a generation', async () => {
    const { service, prisma, ai } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source',
        artifact: { code: 'RF', artifactTypeCode: 'REQUIREMENT' },
        requirementDetail: {},
        useCaseDetail: null,
      },
    ]);
    ai.generateStructured.mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe'));
    await expect(service.generate('project', ['source'], [])).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
  });
  it('loads ER diagrams and rejects missing diagrams', async () => {
    const { service, prisma } = setup();
    const diagram = {
      kind: 'ER',
      sourceFormat: 'MERMAID_ER',
      source: 'erDiagram\n',
      svg: '<svg/>',
      sources: [{ sourceArtifactVersionId: 'version' }],
    };
    prisma.artifact.findFirst
      .mockResolvedValueOnce({ ...artifact, versions: [{ ...version, diagramDetail: diagram }] })
      .mockResolvedValueOnce(null);
    await expect(service.getERDiagram('project', 'artifact')).resolves.toMatchObject({
      kind: 'ER',
    });
    await expect(service.getERDiagram('project', 'missing')).rejects.toThrow('no encontrado');
  });
  it('rejects invalid creation, version and duplicate-source branches', async () => {
    const { service, prisma, tx } = setup();
    tx.project.findUnique.mockResolvedValueOnce(null);
    await expect(service.create('missing', input)).rejects.toThrow('Proyecto');
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.version('project', 'missing', input)).rejects.toThrow('no encontrado');
    await expect(service.generate('project', ['same'], ['same'])).rejects.toThrow('repetirse');
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'source',
        artifact: { code: 'CU-001', artifactTypeCode: 'USE_CASE' },
        requirementDetail: null,
        useCaseDetail: {},
      },
    ]);
    await expect(service.generate('project', ['source'], [])).rejects.toThrow('APPROVED');
  });
  it('rejects missing generations and invalid candidate selections', async () => {
    const { service, prisma, tx } = setup();
    // accept() now looks the generation up twice (a preview before rendering
    // diagrams, then again inside the write transaction): both mocks mirror
    // the same shared value so either lookup sees consistent state.
    let generationLookup: unknown = null;
    prisma.dataModelGeneration.findFirst.mockImplementation(() =>
      Promise.resolve(generationLookup),
    );
    tx.dataModelGeneration.findFirst.mockImplementation(() => Promise.resolve(generationLookup));

    await expect(service.getGeneration('project', 'missing')).rejects.toThrow('no encontrada');

    generationLookup = null;
    await expect(service.accept('project', 'missing', ['candidate'])).rejects.toThrow(
      'no encontrada',
    );

    generationLookup = { id: 'generation', projectId: 'project', candidates: [] };
    await expect(service.accept('project', 'generation', ['unknown'])).rejects.toThrow(
      'no encontrado',
    );

    generationLookup = {
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c',
          acceptedArtifactId: 'already',
          title: input.title,
          modelKind: 'ER',
          entities: input.entities,
          relationships: input.relationships,
        },
      ],
    };
    await expect(service.accept('project', 'generation', ['candidate'])).rejects.toThrow(
      'ya fue aceptado',
    );
  });
  it('fails the whole accept batch before writing anything when rendering fails', async () => {
    const { prisma, tx } = setup();
    const failing = new DiagramProviderError('DIAGRAM_PROVIDER_UNAVAILABLE', 'down');
    const service = new DataModelsService(
      prisma as unknown as PrismaService,
      { generateStructured: vi.fn() } as unknown as AIOrchestrator,
      new DiagramEngine(),
      new FakeDiagramProvider(failing),
    );
    const generation = {
      id: 'generation',
      projectId: 'project',
      aiRunId: 'run',
      candidates: [
        {
          id: 'candidate',
          candidateId: 'c',
          acceptedArtifactId: null,
          title: input.title,
          modelKind: 'ER',
          entities: input.entities,
          relationships: input.relationships,
        },
      ],
    };
    prisma.dataModelGeneration.findFirst.mockResolvedValue(generation);
    await expect(service.accept('project', 'generation', ['candidate'])).rejects.toMatchObject({
      response: { code: 'DIAGRAM_PROVIDER_UNAVAILABLE' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.artifact.create).not.toHaveBeenCalled();
  });
  it('normalizes a renderer failure on manual creation without writing any row', async () => {
    const { tx, prisma, ai } = setup();
    const failing = new DiagramProviderError('DIAGRAM_INVALID_SOURCE', 'bad source');
    const service = new DataModelsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      new DiagramEngine(),
      new FakeDiagramProvider(failing),
    );
    await expect(service.create('project', input)).rejects.toMatchObject({
      response: { code: 'DIAGRAM_INVALID_SOURCE' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.artifact.create).not.toHaveBeenCalled();
  });
  it('rejects invalid use case diagram sources and missing persisted diagrams', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([]);
    await expect(service.generateUseCaseDiagram('project', ['draft'])).rejects.toThrow('APPROVED');
    prisma.artifact.findFirst.mockResolvedValue(null);
    await expect(service.getUseCaseDiagram('project', 'missing')).rejects.toThrow('no encontrado');
  });
});
