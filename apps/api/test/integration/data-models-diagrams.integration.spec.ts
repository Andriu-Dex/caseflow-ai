import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DataModelsService } from '../../src/data-models/data-models.service';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';

const model = (title = 'Modelo') => ({
  title,
  modelKind: 'ER' as const,
  entities: [
    {
      localId: 'user',
      name: 'Usuario',
      attributes: [
        { name: 'id', type: 'UUID' as const, required: true, primaryKey: true, unique: true },
      ],
    },
    {
      localId: 'order',
      name: 'Pedido',
      attributes: [
        {
          name: 'total',
          type: 'DECIMAL' as const,
          required: true,
          primaryKey: false,
          unique: false,
        },
      ],
    },
  ],
  relationships: [
    {
      sourceEntityId: 'user',
      targetEntityId: 'order',
      name: 'realiza',
      sourceCardinality: 'ONE' as const,
      targetCardinality: 'ZERO_OR_MORE' as const,
    },
  ],
});
const requirement = {
  requirementType: 'FUNCTIONAL' as const,
  name: 'Registrar pedido',
  description: 'El usuario registra pedidos',
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
};

describe('Data Model + Diagram Engine integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let approvedRequirementId: string;
  let approvedUseCaseId: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma, 'Data Models');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const req = await ctx.requirements.create(projectId, requirement);
    await ctx.requirements.transition(projectId, req.id, req.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, req.id, req.version.id, 'APPROVED');
    approvedRequirementId = req.version.id;
    const useCase = await ctx.useCases.create(projectId, {
      name: 'Registrar pedido',
      objective: 'Registrar',
      primaryActor: 'Usuario',
      secondaryActors: ['Administrador'],
      preconditions: [],
      postconditions: [],
      mainFlow: [{ actor: 'Usuario', action: 'Registra' }],
      alternativeFlows: [],
      relatedRequirementVersionIds: [approvedRequirementId],
    });
    await ctx.useCases.transition(projectId, useCase.id, useCase.version.id, 'IN_REVIEW');
    await ctx.useCases.transition(projectId, useCase.id, useCase.version.id, 'APPROVED');
    approvedUseCaseId = useCase.version.id;
  });
  afterAll(async () => ctx.close());

  it('creates and versions normalized manual ER snapshots with deterministic SVG', async () => {
    const created = await ctx.dataModels.create(projectId, model());
    expect(created).toMatchObject({
      code: 'MD-001',
      version: { origin: 'MANUAL', status: 'DRAFT' },
    });
    const firstDiagram = await ctx.dataModels.getERDiagram(projectId, created.id);
    expect(firstDiagram).toMatchObject({
      kind: 'ER',
      sourceFormat: 'MERMAID_ER',
      sourceArtifactVersionIds: [created.version.id],
    });
    expect(firstDiagram.svg).toMatch(/^<svg/);
    const updated = await ctx.dataModels.version(projectId, created.id, model('Modelo 2'));
    expect(updated.version.versionNumber).toBe(2);
    expect(
      await ctx.prisma.dataModelEntity.count({ where: { artifactVersionId: created.version.id } }),
    ).toBe(2);
  });

  it('generates candidates from exact approved sources and accepts with provenance', async () => {
    const provider = new FakeAIProvider({
      provider: 'fake',
      model: 'fake-v1',
      payload: { candidates: [{ candidateId: 'candidate-1', ...model('Generado') }] },
      usage: null,
      latencyMs: 1,
    });
    const ai = new AIOrchestrator(
      provider,
      new PromptRegistry([
        {
          key: 'data-model.generate',
          version: 1,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'conceptual_data_model_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    const service = new DataModelsService(
      ctx.prisma,
      ai,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const generation = await service.generate(
      projectId,
      [approvedRequirementId],
      [approvedUseCaseId],
    );
    expect(provider.lastRequest?.maxOutputTokens).toBe(12_288);
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'DATA_MODEL' } }),
    ).toBe(1);
    const accepted = await service.accept(projectId, generation.id, [generation.candidates[0]!.id]);
    expect(accepted.items[0]).toMatchObject({
      version: { origin: 'AI_GENERATED', status: 'GENERATED' },
      dataModel: { generationId: generation.id, aiRunId: generation.aiRunId },
    });
    expect(generation.sources.map((source) => source.artifactVersionId).sort()).toEqual(
      [approvedRequirementId, approvedUseCaseId].sort(),
    );
  });

  it('rejects draft and cross-project generation sources', async () => {
    const draft = await ctx.requirements.create(projectId, { ...requirement, name: 'Borrador' });
    await expect(ctx.dataModels.generate(projectId, [draft.version.id], [])).rejects.toThrow(
      'APPROVED',
    );
    const workspace = await createWorkspace(ctx.prisma, 'Other Data Model');
    const other = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' })).id;
    await expect(ctx.dataModels.generate(other, [approvedRequirementId], [])).rejects.toThrow(
      'APPROVED',
    );
  });

  it('creates a deterministic PlantUML use case diagram with exact provenance', async () => {
    const diagram = await ctx.dataModels.generateUseCaseDiagram(projectId, [approvedUseCaseId]);
    expect(diagram).toMatchObject({
      code: 'DIA-001',
      kind: 'USE_CASE',
      sourceFormat: 'PLANTUML',
      sourceArtifactVersionIds: [approvedUseCaseId],
    });
    expect(diagram.source).toContain('actor "Usuario"');
    expect(diagram.source).not.toMatch(/include|extend/);
    // A deterministic diagram derived by CASEFlow itself (no manual authoring,
    // no AI) must be SYSTEM_GENERATED, not MANUAL (spec §6.3).
    const version = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: diagram.versionId },
    });
    expect(version).toMatchObject({ origin: 'SYSTEM_GENERATED', status: 'GENERATED' });
    await expect(
      ctx.dataModels.generateUseCaseDiagram(projectId, [approvedRequirementId]),
    ).rejects.toThrow('APPROVED');
  });

  it('protects DataModelsService.version under concurrent version creation', async () => {
    const created = await ctx.dataModels.create(projectId, model('Concurrente'));

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        ctx.dataModels.version(projectId, created.id, model(`Concurrente v${index}`)),
      ),
    );

    const numbers = (
      await ctx.prisma.artifactVersion.findMany({
        where: { artifactId: created.id },
        select: { versionNumber: true },
        orderBy: { versionNumber: 'asc' },
      })
    ).map((version) => version.versionNumber);
    expect(numbers).toEqual(Array.from({ length: 9 }, (_, index) => index + 1));
  });

  it('rejects an AI data model candidate referencing a nonexistent entity: AI_INVALID_OUTPUT, no batch, no artifact', async () => {
    const beforeGenerations = await ctx.prisma.dataModelGeneration.count({ where: { projectId } });
    const beforeArtifacts = await ctx.prisma.artifact.count({
      where: { projectId, artifactTypeCode: 'DATA_MODEL' },
    });
    const provider = new FakeAIProvider({
      provider: 'fake',
      model: 'fake-v1',
      payload: {
        candidates: [
          {
            candidateId: 'candidate-1',
            ...model('Inválido'),
            relationships: [
              {
                sourceEntityId: 'user',
                targetEntityId: 'nonexistent-entity',
                sourceCardinality: 'ONE',
                targetCardinality: 'ZERO_OR_MORE',
              },
            ],
          },
        ],
      },
      usage: null,
      latencyMs: 1,
    });
    const ai = new AIOrchestrator(
      provider,
      new PromptRegistry([
        {
          key: 'data-model.generate',
          version: 1,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'conceptual_data_model_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    const service = new DataModelsService(
      ctx.prisma,
      ai,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    await expect(
      service.generate(projectId, [approvedRequirementId], [approvedUseCaseId]),
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_OUTPUT' } });
    expect(await ctx.prisma.dataModelGeneration.count({ where: { projectId } })).toBe(
      beforeGenerations,
    );
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'DATA_MODEL' } }),
    ).toBe(beforeArtifacts);
  });
});
