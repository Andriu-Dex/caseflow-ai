import { describe, expect, it, vi } from 'vitest';
import { TRACEABILITY_MAX_NODES } from '@caseflow-ai/contracts';
import { DiagramProviderError, type DiagramProvider } from '@caseflow-ai/integrations';
import type { PrismaService } from '../database/prisma.service';
import { DiagramEngine } from '../data-models/diagram-engine';
import { TraceabilityService } from './traceability.service';

function createService(prisma: unknown) {
  const diagramProvider: DiagramProvider = {
    id: 'fake',
    render: vi.fn(),
    renderPng: vi.fn(),
  };
  return new TraceabilityService(
    prisma as unknown as PrismaService,
    new DiagramEngine(),
    diagramProvider,
  );
}

function emptyPrisma() {
  return {
    artifactVersion: { findMany: vi.fn().mockResolvedValue([]) },
    requirementDetail: { findMany: vi.fn().mockResolvedValue([]) },
    requirementCandidate: { findMany: vi.fn().mockResolvedValue([]) },
    useCaseDetail: { findMany: vi.fn().mockResolvedValue([]) },
    aIRun: { findMany: vi.fn().mockResolvedValue([]) },
    dataModelDetail: { findMany: vi.fn().mockResolvedValue([]) },
    structuredAnalysisDetail: { findMany: vi.fn().mockResolvedValue([]) },
    diagramDetail: { findMany: vi.fn().mockResolvedValue([]) },
    mockupDetail: { findMany: vi.fn().mockResolvedValue([]) },
    projectContextSource: { findMany: vi.fn().mockResolvedValue([]) },
    useCaseRequirementLink: { findMany: vi.fn().mockResolvedValue([]) },
    dataModelGenerationSource: { findMany: vi.fn().mockResolvedValue([]) },
    diagramSourceVersion: { findMany: vi.fn().mockResolvedValue([]) },
    structuredAnalysisGenerationSource: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('TraceabilityService', () => {
  it('returns an empty graph for a project with no traced artifacts', async () => {
    const prisma = emptyPrisma();
    const service = createService(prisma);
    await expect(service.buildGraph('p')).resolves.toEqual({
      nodes: [],
      edges: [],
      truncated: false,
    });
    // No follow-up queries were issued once there are zero versions to trace.
    expect(prisma.projectContextSource.findMany).not.toHaveBeenCalled();
  });

  it('marks the highest version number per artifact as current, others as historical', async () => {
    const prisma = emptyPrisma();
    const artifact = { id: 'artifact-1', code: 'NAV-001' };
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        artifactId: artifact.id,
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Nav',
        artifact,
      },
      {
        id: 'v2',
        artifactId: artifact.id,
        versionNumber: 2,
        status: 'DRAFT',
        origin: 'MANUAL',
        title: 'Nav v2',
        artifact,
      },
    ]);
    const service = createService(prisma);
    const { nodes } = await service.buildGraph('p');
    expect(nodes.find((n) => n.id === 'v1')?.isCurrent).toBe(false);
    expect(nodes.find((n) => n.id === 'v2')?.isCurrent).toBe(true);
  });

  it('never invents an edge without a matching persisted join row', async () => {
    const prisma = emptyPrisma();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'ctx-v1',
        artifactId: 'ctx',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Contexto',
        artifact: { id: 'ctx', code: 'CTX-001' },
      },
      {
        id: 'rf-v1',
        artifactId: 'rf',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'RF',
        artifact: { id: 'rf', code: 'RF-001' },
      },
    ]);
    // A Requirement exists but its sourceContextVersionId is null (manual
    // creation): no CONTEXT_SOURCE_FOR_REQUIREMENT edge should be inferred.
    prisma.requirementDetail.findMany.mockResolvedValue([
      {
        artifactVersionId: 'rf-v1',
        sourceContextVersionId: null,
        generationCandidateId: null,
        aiRun: null,
      },
    ]);
    const service = createService(prisma);
    const { edges } = await service.buildGraph('p');
    expect(edges).toEqual([]);
  });

  it('bounds the graph and reports truncated=true rather than silently growing unbounded (closure item A)', async () => {
    const prisma = emptyPrisma();
    prisma.artifactVersion.findMany.mockResolvedValue(
      Array.from({ length: TRACEABILITY_MAX_NODES + 1 }, (_, i) => ({
        id: `v${i}`,
        artifactId: `a${i}`,
        versionNumber: 1,
        status: 'DRAFT',
        origin: 'MANUAL',
        title: `T${i}`,
        artifact: { id: `a${i}`, code: `X-${i}` },
      })),
    );
    const service = createService(prisma);
    const { nodes, truncated } = await service.buildGraph('p');
    expect(nodes).toHaveLength(TRACEABILITY_MAX_NODES);
    expect(truncated).toBe(true);
  });

  it('never returns a dangling edge: every edge endpoint is present in the returned node set (hardening check 2)', async () => {
    const prisma = emptyPrisma();
    const context = {
      id: 'ctx-v1',
      artifactId: 'ctx',
      versionNumber: 1,
      status: 'APPROVED',
      origin: 'MANUAL',
      title: 'Contexto',
      artifact: { id: 'ctx', code: 'CTX-001' },
    };
    const requirement = {
      id: 'rf-v1',
      artifactId: 'rf',
      versionNumber: 1,
      status: 'APPROVED',
      origin: 'AI_GENERATED',
      title: 'RF',
      artifact: { id: 'rf', code: 'RF-001' },
    };
    prisma.artifactVersion.findMany.mockResolvedValue([context, requirement]);
    prisma.requirementDetail.findMany.mockResolvedValue([
      {
        artifactVersionId: 'rf-v1',
        sourceContextVersionId: 'ctx-v1',
        generationCandidateId: null,
        aiRun: null,
      },
    ]);
    const service = createService(prisma);
    const { nodes, edges } = await service.buildGraph('p');
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      expect(nodeIds.has(edge.fromId)).toBe(true);
      expect(nodeIds.has(edge.toId)).toBe(true);
    }
  });

  it('returns a fixed placeholder diagram instead of calling the renderer for an empty project', async () => {
    const prisma = emptyPrisma();
    const render = vi.fn();
    const service = new TraceabilityService(
      prisma as unknown as PrismaService,
      new DiagramEngine(),
      {
        id: 'fake',
        render,
        renderPng: vi.fn(),
      },
    );
    const diagram = await service.buildDiagram('p');
    expect(diagram.svg).toContain('Aún no hay artefactos');
    expect(render).not.toHaveBeenCalled();
  });

  it('renders a deterministic Mermaid flowchart from the graph and sanitizes the result', async () => {
    const prisma = emptyPrisma();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        artifactId: 'a1',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Registrar pedido',
        artifact: { id: 'a1', code: 'RF-001' },
      },
    ]);
    const render = vi
      .fn()
      .mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>' });
    const service = new TraceabilityService(
      prisma as unknown as PrismaService,
      new DiagramEngine(),
      {
        id: 'fake',
        render,
        renderPng: vi.fn(),
      },
    );
    const diagram = await service.buildDiagram('p');
    expect(diagram.sourceFormat).toBe('MERMAID_FLOWCHART');
    expect(diagram.source).toBe('flowchart TD\n  v1["RF-001: Registrar pedido"]');
    expect(render).toHaveBeenCalledWith({ format: 'MERMAID_FLOWCHART', source: diagram.source });
    expect(diagram.svg).toContain('<svg');
  });

  it('rejects a PNG download for an empty project instead of rendering nothing', async () => {
    const prisma = emptyPrisma();
    const service = createService(prisma);
    await expect(service.getDiagramPng('p')).rejects.toThrow('No hay artefactos que graficar.');
  });

  function withOneNode(prisma: ReturnType<typeof emptyPrisma>) {
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        artifactId: 'a1',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Registrar pedido',
        artifact: { id: 'a1', code: 'RF-001' },
      },
    ]);
  }

  it('renders the diagram PNG from the same on-demand source', async () => {
    const prisma = emptyPrisma();
    withOneNode(prisma);
    const png = Buffer.from('png-bytes');
    const renderPng = vi.fn().mockResolvedValue({ png });
    const service = new TraceabilityService(
      prisma as unknown as PrismaService,
      new DiagramEngine(),
      {
        id: 'fake',
        render: vi.fn(),
        renderPng,
      },
    );
    await expect(service.getDiagramPng('p')).resolves.toBe(png);
    expect(renderPng).toHaveBeenCalledWith({
      format: 'MERMAID_FLOWCHART',
      source: 'flowchart TD\n  v1["RF-001: Registrar pedido"]',
    });
  });

  it.each([
    ['DIAGRAM_INVALID_SOURCE' as const, 'invalid'],
    ['DIAGRAM_PROVIDER_UNAVAILABLE' as const, 'unavailable'],
  ])(
    'maps a %s DiagramProviderError from render() to the right HTTP exception',
    async (code, description) => {
      const prisma = emptyPrisma();
      withOneNode(prisma);
      const service = new TraceabilityService(
        prisma as unknown as PrismaService,
        new DiagramEngine(),
        {
          id: 'fake',
          render: vi.fn().mockRejectedValue(new DiagramProviderError(code, description)),
          renderPng: vi.fn(),
        },
      );
      await expect(service.buildDiagram('p')).rejects.toMatchObject({ message: description });
    },
  );

  it('lets a non-DiagramProviderError from render() propagate unchanged', async () => {
    const prisma = emptyPrisma();
    withOneNode(prisma);
    const service = new TraceabilityService(
      prisma as unknown as PrismaService,
      new DiagramEngine(),
      {
        id: 'fake',
        render: vi.fn().mockRejectedValue(new Error('boom')),
        renderPng: vi.fn(),
      },
    );
    await expect(service.buildDiagram('p')).rejects.toThrow('boom');
  });

  it('maps a DiagramProviderError from renderPng() the same way as buildDiagram()', async () => {
    const prisma = emptyPrisma();
    withOneNode(prisma);
    const service = new TraceabilityService(
      prisma as unknown as PrismaService,
      new DiagramEngine(),
      {
        id: 'fake',
        render: vi.fn(),
        renderPng: vi
          .fn()
          .mockRejectedValue(new DiagramProviderError('DIAGRAM_PROVIDER_UNAVAILABLE', 'down')),
      },
    );
    await expect(service.getDiagramPng('p')).rejects.toMatchObject({ message: 'down' });
  });
});
