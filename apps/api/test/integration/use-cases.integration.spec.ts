import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { UseCasesService } from '../../src/use-cases/use-cases.service';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
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
  origin: { kind: 'USER_DECISION' as const, justification: 'Decisión del equipo.' },
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
  relations: [],
});
describe('Use Cases integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let approvedVersionId: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspaceWithOwner(ctx, 'Use Cases');
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
    const w = await createWorkspaceWithOwner(ctx, 'Other UC');
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
      .set('Authorization', `Bearer ${ctx.token}`)
      .send(useCase(approvedVersionId, 'Caso HTTP'));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      code: expect.stringMatching(/^CU-/),
      version: { origin: 'MANUAL', status: 'DRAFT' },
      useCase: { name: 'Caso HTTP' },
    });
    const invalid = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/use-cases`)
      .set('Authorization', `Bearer ${ctx.token}`)
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
          version: 2,
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
    ).toMatchObject({ promptKey: 'use-cases.generate', promptVersion: 2 });
  });
  it('keeps include/extend from the AI through acceptance into the diagram', async () => {
    const w = await createWorkspaceWithOwner(ctx, 'Relaciones');
    const pid = (await ctx.projects.create({ workspaceId: w.id, name: 'Restaurante' })).id;
    const r = await ctx.requirements.create(pid, requirement('Vender'));
    await ctx.requirements.transition(pid, r.id, r.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(pid, r.id, r.version.id, 'APPROVED');
    const proposal = (candidateId: string, name: string, relations: unknown[] = []) => ({
      candidateId,
      name,
      objective: name,
      primaryActor: 'Cajero',
      mainFlow: [{ actor: 'Cajero', action: name }],
      relatedRequirementSourceIds: [r.version.id],
      relations,
    });
    const ai = new AIOrchestrator(
      new FakeAIProvider({
        provider: 'fake',
        model: 'fake',
        payload: {
          candidates: [
            proposal('venta', 'Registrar venta', [{ kind: 'INCLUDE', targetCandidateId: 'stock' }]),
            proposal('stock', 'Descontar existencias'),
            proposal('descuento', 'Aplicar descuento', [
              { kind: 'EXTEND', targetCandidateId: 'venta' },
            ]),
          ],
        },
        usage: null,
        latencyMs: 1,
      }),
      new PromptRegistry([
        {
          key: 'use-cases.generate',
          version: 2,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'use_case_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    const service = new UseCasesService(ctx.prisma, ai);
    const generation = await service.generate(pid, [r.version.id]);
    const id = (candidateId: string) =>
      generation.candidates.find((c) => c.candidateId === candidateId)!.id;
    const first = await service.accept(pid, generation.id, [id('venta'), id('stock')]);
    const byName = (name: string) => first.items.find((u) => u.useCase.name === name);
    const [venta, stock] = [byName('Registrar venta'), byName('Descontar existencias')];
    expect(venta!.useCase.relations).toEqual([{ kind: 'INCLUDE', targetUseCaseId: stock!.id }]);
    // Accepted later, its relation still finds the use case accepted before.
    const [descuento] = (await service.accept(pid, generation.id, [id('descuento')])).items;
    expect(descuento!.useCase.relations).toEqual([{ kind: 'EXTEND', targetUseCaseId: venta!.id }]);

    const own = {
      ...useCase(r.version.id),
      relations: [{ kind: 'INCLUDE' as const, targetUseCaseId: venta!.id }],
    };
    await expect(service.version(pid, venta!.id, own)).rejects.toThrow('otros casos de uso');
    await expect(
      service.create(projectId, { ...useCase(approvedVersionId), relations: own.relations }),
    ).rejects.toThrow('otros casos de uso');

    for (const u of [venta!, stock!, descuento!]) {
      await service.transition(pid, u.id, u.version.id, 'IN_REVIEW');
      await service.transition(pid, u.id, u.version.id, 'APPROVED');
    }
    // Relations are part of the version, immutable once approved.
    await expect(
      ctx.prisma.useCaseRelation.deleteMany({ where: { artifactVersionId: venta!.version.id } }),
    ).rejects.toThrow();
    const { source } = await ctx.dataModels.generateUseCaseDiagram(
      pid,
      [venta!, stock!, descuento!].map((u) => u.version.id),
    );
    expect(source).toContain('rectangle "Restaurante" {');
    const byCode = [venta!, stock!, descuento!].sort((x, y) => x.code.localeCompare(y.code));
    const u = (useCase: { id: string }) => `U${byCode.findIndex((x) => x.id === useCase.id) + 1}`;
    expect(source).toContain(`${u(venta!)} ..> ${u(stock!)} : <<include>>`);
    expect(source).toContain(`${u(descuento!)} ..> ${u(venta!)} : <<extend>>`);
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
          version: 2,
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
