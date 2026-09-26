import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { RequirementsService } from '../../src/requirements/requirements.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';
const input = (requirementType: 'FUNCTIONAL' | 'NON_FUNCTIONAL', name: string) => ({
  requirementType,
  name,
  description: `Descripción ${name}`,
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: ['Existe sesión'],
  postconditions: ['Dato guardado'],
  dependencyArtifactIds: [],
});
describe('Requirements integration', () => {
  let ctx: TestContext;
  let projectId: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspace(ctx.prisma, 'Requirements');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'P' })).id;
  });
  afterAll(async () => ctx.close());
  it('creates RF/RNF manual snapshots and versions without mutating history', async () => {
    const rf = await ctx.requirements.create(projectId, input('FUNCTIONAL', 'Registrar'));
    const rnf = await ctx.requirements.create(projectId, input('NON_FUNCTIONAL', 'Seguridad'));
    expect(rf).toMatchObject({ code: 'RF-001', version: { status: 'DRAFT', origin: 'MANUAL' } });
    expect(rnf.code).toBe('RNF-001');
    const v2 = await ctx.requirements.version(projectId, rf.id, {
      ...input('FUNCTIONAL', 'Registrar editado'),
      dependencyArtifactIds: [rnf.id],
    });
    expect(v2.version.versionNumber).toBe(2);
    expect(
      (
        await ctx.prisma.requirementDetail.findUniqueOrThrow({
          where: { artifactVersionId: rf.version.id },
        })
      ).name,
    ).toBe('Registrar');
  });
  it('enforces lifecycle and approved immutability', async () => {
    const r = await ctx.requirements.create(projectId, input('FUNCTIONAL', 'Aprobar'));
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'APPROVED');
    const edited = await ctx.requirements.version(projectId, r.id, input('FUNCTIONAL', 'Cambio'));
    expect(edited.version).toMatchObject({ versionNumber: 2, status: 'DRAFT' });
    const approvedV1 = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: r.version.id },
      include: { requirementDetail: true },
    });
    expect(approvedV1.status).toBe('APPROVED');
    expect(approvedV1.requirementDetail?.name).toBe('Aprobar');
    await expect(
      ctx.requirements.transition(projectId, r.id, r.version.id, 'DRAFT'),
    ).rejects.toThrow('Transición');
  });
  it('rejects cross-project reads and dependencies', async () => {
    const w = await createWorkspace(ctx.prisma, 'Other');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Other' })).id;
    const r = await ctx.requirements.create(projectId, input('FUNCTIONAL', 'Scoped'));
    await expect(ctx.requirements.get(other, r.id)).rejects.toThrow('no encontrado');
    await expect(
      ctx.requirements.create(other, {
        ...input('FUNCTIONAL', 'Cross'),
        dependencyArtifactIds: [r.id],
      }),
    ).rejects.toThrow('Dependencia');
  });
  it('generates candidates from an exact source-backed context and accepts dependencies transactionally', async () => {
    const source = await ctx.sources.create(
      projectId,
      {
        title: 'Notas de proceso',
        sourceKind: 'NOTES',
        purpose: 'Notas del proceso manual actual',
        description: 'Contenido de prueba.',
      },
      {
        originalname: 'notas.txt',
        mimetype: 'text/plain',
        size: 12,
        buffer: Buffer.from('Notas reales'),
      },
    );
    await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
    const approvedSource = await ctx.sources.transition(
      projectId,
      source.id,
      source.version.id,
      'APPROVED',
    );
    const draftContext = await ctx.projectContext.create(projectId, {
      problemStatement: 'Procesos manuales',
      objective: 'Automatizar',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [approvedSource.id],
    });
    await ctx.projectContext.transition(projectId, draftContext.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, draftContext.version.id, 'APPROVED');
    const contextVersionId = draftContext.version.id;
    const payload = {
      candidates: [
        {
          candidateId: 'a',
          requirementType: 'FUNCTIONAL' as const,
          name: 'Crear',
          description: 'Crear registros',
          priority: 'HIGH' as const,
          actors: ['Usuario'],
          preconditions: [],
          postconditions: ['Creado'],
          dependencyCandidateIds: [],
        },
        {
          candidateId: 'b',
          requirementType: 'NON_FUNCTIONAL' as const,
          name: 'Seguridad',
          description: 'Proteger datos',
          priority: 'HIGH' as const,
          actors: [],
          preconditions: [],
          postconditions: [],
          dependencyCandidateIds: ['a'],
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
          key: 'requirements.generate',
          version: 2,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'requirements_generation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    const service = new RequirementsService(ctx.prisma, ai);
    const generation = await service.generate(projectId, contextVersionId);
    expect(generation).toMatchObject({
      sourceContextVersionId: contextVersionId,
      aiRunId: expect.any(String),
    });
    await expect(
      service.accept(projectId, generation.id, [generation.candidates[1]!.id]),
    ).rejects.toThrow('Seleccione también');
    const accepted = await service.accept(
      projectId,
      generation.id,
      generation.candidates.map((c) => c.id),
    );
    expect(accepted.items.map((x) => x.code.split('-')[0]).sort()).toEqual(['RF', 'RNF']);
    expect(
      accepted.items.every(
        (x) => x.version.origin === 'AI_GENERATED' && x.version.status === 'GENERATED',
      ),
    ).toBe(true);
    const dependent = accepted.items.find((x) => x.code.startsWith('RNF-'))!;
    expect(
      await ctx.prisma.requirementDependency.count({
        where: { artifactVersionId: dependent.version.id },
      }),
    ).toBe(1);
  });
  it('rejects official generation from an APPROVED context with zero linked approved sources', async () => {
    const w = await createWorkspace(ctx.prisma, 'No Sources');
    const noSourceProjectId = (await ctx.projects.create({ workspaceId: w.id, name: 'NS' })).id;
    const context = await ctx.projectContext.create(noSourceProjectId, {
      problemStatement: 'Sin fuentes',
      objective: 'Probar el gate',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
    });
    await ctx.projectContext.transition(noSourceProjectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(noSourceProjectId, context.version.id, 'APPROVED');
    await expect(ctx.requirements.generate(noSourceProjectId, context.version.id)).rejects.toThrow(
      'fuente de proyecto APPROVED',
    );
  });
  it('disabled AI returns AI_NOT_CONFIGURED without candidates', async () => {
    const context = await ctx.projectContext.getCurrent(projectId);
    const before = await ctx.prisma.requirementCandidate.count();
    await expect(ctx.requirements.generate(projectId, context.version.id)).rejects.toMatchObject({
      response: { code: 'AI_NOT_CONFIGURED' },
    });
    expect(await ctx.prisma.requirementCandidate.count()).toBe(before);
  });
});
