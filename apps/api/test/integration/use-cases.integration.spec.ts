import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { UseCasesService } from '../../src/use-cases/use-cases.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';
import request from 'supertest';
const requirement = (name: string) => ({
  requirementType: 'FUNCTIONAL' as const,
  name,
  description: `Descripción ${name}`,
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
});
const useCase = (requirementVersionId: string, name = 'Procesar') => ({
  name,
  objective: 'Completar el proceso',
  primaryActor: 'Usuario',
  secondaryActors: ['Sistema externo'],
  preconditions: ['Usuario autenticado'],
  postconditions: ['Operación registrada'],
  mainFlow: [
    { actor: 'Usuario', action: 'Solicita la operación' },
    { actor: 'Sistema', action: 'Registra la operación' },
  ],
  alternativeFlows: [
    {
      name: 'Datos inválidos',
      condition: 'La entrada es inválida',
      steps: [{ actor: 'Sistema', action: 'Informa el error' }],
    },
  ],
  relatedRequirementVersionIds: [requirementVersionId],
});
describe('Use Cases integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let approvedVersionId: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspace(ctx.prisma, 'Use Cases');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'P' })).id;
    const r = await ctx.requirements.create(projectId, requirement('Registrar'));
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'APPROVED');
    approvedVersionId = r.version.id;
    // Every current first-deliverable artifact type now has a dedicated
    // endpoint; this test-only type stands in for "some unrelated artifact
    // type" below.
    await ctx.prisma.artifactType.upsert({
      where: { code: 'GENERIC_TEST_TYPE' },
      create: { code: 'GENERIC_TEST_TYPE', defaultCodePrefix: 'GEN' },
      update: {},
    });
  });
  afterAll(async () => ctx.close());
  it('creates CU snapshots, versions and immutable ordered flows', async () => {
    const created = await ctx.useCases.create(projectId, useCase(approvedVersionId));
    expect(created).toMatchObject({
      code: 'CU-001',
      version: { origin: 'MANUAL', status: 'DRAFT' },
    });
    const v2 = await ctx.useCases.version(
      projectId,
      created.id,
      useCase(approvedVersionId, 'Procesar editado'),
    );
    expect(v2.version.versionNumber).toBe(2);
    expect(
      (
        await ctx.prisma.useCaseDetail.findUniqueOrThrow({
          where: { artifactVersionId: created.version.id },
        })
      ).name,
    ).toBe('Procesar');
    expect(
      await ctx.prisma.useCaseMainFlowStep.count({
        where: { artifactVersionId: created.version.id },
      }),
    ).toBe(2);
    await ctx.useCases.transition(projectId, created.id, v2.version.id, 'IN_REVIEW');
    await ctx.useCases.transition(projectId, created.id, v2.version.id, 'APPROVED');
    const v3 = await ctx.useCases.version(projectId, created.id, useCase(approvedVersionId));
    expect(v3.version).toMatchObject({ versionNumber: 3, status: 'DRAFT' });
    expect(
      (await ctx.prisma.artifactVersion.findUniqueOrThrow({ where: { id: v2.version.id } })).status,
    ).toBe('APPROVED');
  });
  it('rejects cross-project, non-requirement and non-approved generation sources', async () => {
    const w = await createWorkspace(ctx.prisma, 'Other UC');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Other' })).id;
    await expect(ctx.useCases.create(other, useCase(approvedVersionId))).rejects.toThrow(
      'Referencia',
    );
    const generic = await ctx.artifacts.createArtifact(projectId, {
      type: 'GENERIC_TEST_TYPE',
      title: 'Modelo',
    });
    await expect(
      ctx.useCases.create(projectId, useCase(generic.currentVersion.id)),
    ).rejects.toThrow('Referencia');
    const draft = await ctx.requirements.create(projectId, requirement('Borrador'));
    await expect(ctx.useCases.generate(projectId, [draft.version.id])).rejects.toThrow('APPROVED');
  });
  it('exposes project-scoped HTTP creation with shared contract validation', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/use-cases`)
      .send(useCase(approvedVersionId, 'Caso HTTP'));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      code: expect.stringMatching(/^CU-/),
      version: { origin: 'MANUAL', status: 'DRAFT' },
      useCase: { name: 'Caso HTTP' },
    });
    const invalid = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/use-cases`)
      .send({});
    expect(invalid.status).toBe(400);
  });
  it('persists candidates, accepts selected only and preserves exact provenance', async () => {
    const payload = {
      candidates: [
        {
          candidateId: 'uc-1',
          name: 'Registrar operación',
          objective: 'Registrar',
          primaryActor: 'Usuario',
          secondaryActors: [],
          preconditions: [],
          postconditions: ['Registrado'],
          mainFlow: [{ actor: 'Usuario', action: 'Registra' }],
          alternativeFlows: [],
          relatedRequirementSourceIds: [approvedVersionId],
        },
        {
          candidateId: 'uc-2',
          name: 'Consultar operación',
          objective: 'Consultar',
          primaryActor: 'Usuario',
          secondaryActors: [],
          preconditions: [],
          postconditions: [],
          mainFlow: [{ actor: 'Usuario', action: 'Consulta' }],
          alternativeFlows: [],
          relatedRequirementSourceIds: [approvedVersionId],
        },
      ],
    };
    const ai = new AIOrchestrator(
      new FakeAIProvider({
        provider: 'fake',
        model: 'fake-v1',
        payload,
        usage: null,
        latencyMs: 1,
      }),
      new PromptRegistry([
        {
          key: 'use-cases.generate',
          version: 1,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'use_case_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    const service = new UseCasesService(ctx.prisma, ai);
    const generation = await service.generate(projectId, [approvedVersionId]);
    expect(generation.candidates).toHaveLength(2);
    const accepted = await service.accept(projectId, generation.id, [generation.candidates[0]!.id]);
    expect(accepted.items).toHaveLength(1);
    expect(accepted.items[0]).toMatchObject({
      version: { origin: 'AI_GENERATED', status: 'GENERATED' },
      useCase: {
        generationId: generation.id,
        aiRunId: generation.aiRunId,
        relatedRequirementVersionIds: [approvedVersionId],
      },
    });
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'USE_CASE' } }),
    ).toBe(3);
    expect(
      await ctx.prisma.aIRun.findUniqueOrThrow({ where: { id: generation.aiRunId } }),
    ).toMatchObject({ promptKey: 'use-cases.generate', promptVersion: 1 });
  });
  it('rejects invented references as AI_INVALID_OUTPUT and persists no batch', async () => {
    const before = await ctx.prisma.useCaseGeneration.count();
    const ai = new AIOrchestrator(
      new FakeAIProvider({
        provider: 'fake',
        model: 'fake',
        payload: {
          candidates: [
            {
              candidateId: 'x',
              name: 'X',
              objective: 'X',
              primaryActor: 'U',
              secondaryActors: [],
              preconditions: [],
              postconditions: [],
              mainFlow: [{ actor: 'U', action: 'X' }],
              alternativeFlows: [],
              relatedRequirementSourceIds: ['invented'],
            },
          ],
        },
        usage: null,
        latencyMs: 1,
      }),
      new PromptRegistry([
        {
          key: 'use-cases.generate',
          version: 1,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'use_case_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    await expect(
      new UseCasesService(ctx.prisma, ai).generate(projectId, [approvedVersionId]),
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_OUTPUT' } });
    expect(await ctx.prisma.useCaseGeneration.count()).toBe(before);
  });
  it('reports fewer than four without fabrication and normalizes disabled AI', async () => {
    expect(await ctx.useCases.academicValidation(projectId)).toMatchObject({
      acceptedCount: 3,
      minimumRequired: 4,
      satisfied: false,
    });
    await expect(ctx.useCases.generate(projectId, [approvedVersionId])).rejects.toMatchObject({
      response: { code: 'AI_NOT_CONFIGURED' },
    });
  });
});
