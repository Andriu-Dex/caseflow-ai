import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { RequirementsService } from '../../src/requirements/requirements.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

// DEC-126: requirements answer the Project Context. AI proposals cite the
// coded context items, ideas beyond the context come with a rationale, and
// strict projects approve only requirements with a declared origin.
const manual = (name: string) => ({
  requirementType: 'FUNCTIONAL' as const,
  name,
  description: `Descripción ${name}`,
  priority: 'MEDIUM' as const,
  actors: ['Cliente'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
});
const proposal = (candidateId: string, extra: Record<string, unknown>) => ({
  candidateId,
  requirementType: 'FUNCTIONAL' as const,
  name: `Propuesta ${candidateId}`,
  description: `Descripción ${candidateId}`,
  priority: 'HIGH' as const,
  actors: ['Cliente'],
  preconditions: [],
  postconditions: [],
  dependencyCandidateIds: [],
  ...extra,
});

describe('Requirement origin and context coverage', () => {
  let ctx: TestContext;
  let projectId: string;
  let contextVersionId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspace(ctx.prisma, 'Origin');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Pedidos' })).id;
    const source = await ctx.sources.create(
      projectId,
      { title: 'Notas', sourceKind: 'TEXT', purpose: 'Proceso actual', description: '' },
      {
        originalname: 'notas.txt',
        mimetype: 'text/plain',
        size: 5,
        buffer: Buffer.from('Notas'),
      },
    );
    await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'Los pedidos se anotan en papel',
      objective: 'Registrar pedidos en línea',
      scopeItems: [],
      actors: [{ name: 'Cliente' }],
      needs: [{ description: 'Registrar pedidos' }, { description: 'Consultar pedidos' }],
      constraints: [{ description: 'Funciona en teléfonos' }],
      businessRules: [{ description: 'Todo pedido tiene un cliente' }],
      sourceVersionIds: [source.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');
    contextVersionId = context.version.id;
  });
  afterAll(async () => ctx.close());

  const service = (payload: unknown) =>
    new RequirementsService(
      ctx.prisma,
      new AIOrchestrator(
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
            version: 3,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'requirements_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      ),
      { retrieve: async () => [] } as never,
    );

  it('checks every proposal against the coded context and records its origin', async () => {
    const requirements = service({
      candidates: [
        proposal('a', { contextItemCodes: ['N-1', 'RN-1'] }),
        proposal('b', { contextItemCodes: ['N-9'] }),
        proposal('c', { contextItemCodes: [], actors: ['Marciano'] }),
      ],
      suggestions: [
        proposal('s', {
          rationale: 'Avisar al cliente evita llamadas para preguntar por su pedido.',
          dependencyCandidateIds: ['a'],
        }),
      ],
    });
    const generation = await requirements.generate(projectId, contextVersionId);
    const [a, b, c, s] = ['a', 'b', 'c', 's'].map((id) =>
      generation.candidates.find((x) => x.candidateId === id)!,
    );
    expect(a!.qualityFindings).toEqual([]);
    expect(b!.qualityFindings).toEqual([
      expect.objectContaining({ severity: 'ERROR', code: 'UNKNOWN_CONTEXT_CODE' }),
    ]);
    expect(c!.qualityFindings.map((f) => [f.severity, f.code])).toEqual([
      ['ERROR', 'MISSING_CONTEXT_ORIGIN'],
      ['WARNING', 'UNKNOWN_ACTOR'],
    ]);
    expect(s).toMatchObject({ suggested: true, qualityFindings: [] });

    // What the proposals derived from the context cover; ideas never count.
    const covered = Object.fromEntries(
      generation.coverage.map((item) => [item.code, [item.mandatory, item.coveredBy]]),
    );
    expect(covered).toEqual({
      'N-1': [true, [a!.id]],
      'N-2': [true, []],
      'RN-1': [true, [a!.id]],
      'RES-1': [false, []],
    });

    // The automatic routes take only valid proposals from the context.
    expect(requirements.automaticSelection(generation)).toEqual([a!.id]);

    await expect(requirements.accept(projectId, generation.id, [b!.id])).rejects.toThrow(
      'no puede incorporarse',
    );
    const accepted = await requirements.accept(projectId, generation.id, [a!.id, s!.id]);
    const fromContext = accepted.items.find((x) => x.requirement.name === 'Propuesta a')!;
    const idea = accepted.items.find((x) => x.requirement.name === 'Propuesta s')!;
    expect(fromContext.requirement.origin).toMatchObject({
      kind: 'CONTEXT',
      justification: null,
      contextItems: [
        { code: 'N-1', kind: 'NEED', description: 'Registrar pedidos' },
        { code: 'RN-1', kind: 'BUSINESS_RULE', description: 'Todo pedido tiene un cliente' },
      ],
    });
    expect(idea.requirement.origin).toEqual({
      kind: 'USER_DECISION',
      justification: 'Avisar al cliente evita llamadas para preguntar por su pedido.',
      contextItems: [],
    });
  });

  it('approves in a strict project only a requirement with an origin', async () => {
    const draft = await ctx.requirements.create(projectId, manual('Sin origen'));
    expect(draft.requirement.origin).toBeNull();
    await ctx.requirements.transition(projectId, draft.id, draft.version.id, 'IN_REVIEW');
    await expect(
      ctx.requirements.transition(projectId, draft.id, draft.version.id, 'APPROVED'),
    ).rejects.toThrow('Indique el origen');

    const need = await ctx.prisma.projectContextNeed.findFirstOrThrow({
      where: { artifactVersionId: contextVersionId, position: 1 },
    });
    const linked = await ctx.requirements.version(projectId, draft.id, {
      ...manual('Consultar'),
      origin: { kind: 'CONTEXT', contextItemIds: [need.id] },
    });
    expect(linked.requirement.origin?.contextItems).toEqual([
      expect.objectContaining({ code: 'N-2', description: 'Consultar pedidos' }),
    ]);
    await ctx.requirements.transition(projectId, draft.id, linked.version.id, 'IN_REVIEW');
    await expect(
      ctx.requirements.transition(projectId, draft.id, linked.version.id, 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('lets a project created before DEC-126 approve requirements without an origin', async () => {
    const w = await createWorkspace(ctx.prisma, 'Legacy');
    const legacy = (await ctx.projects.create({ workspaceId: w.id, name: 'Legacy' })).id;
    await ctx.prisma.project.update({ where: { id: legacy }, data: { coherenceRequired: false } });
    const r = await ctx.requirements.create(legacy, manual('Antiguo'));
    await ctx.requirements.transition(legacy, r.id, r.version.id, 'IN_REVIEW');
    await expect(
      ctx.requirements.transition(legacy, r.id, r.version.id, 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it("never links a requirement to another project's context", async () => {
    const w = await createWorkspace(ctx.prisma, 'Ajeno');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Ajeno' })).id;
    const need = await ctx.prisma.projectContextNeed.findFirstOrThrow({
      where: { artifactVersionId: contextVersionId },
    });
    await expect(
      ctx.requirements.create(other, {
        ...manual('Cruzado'),
        origin: { kind: 'CONTEXT', contextItemIds: [need.id] },
      }),
    ).rejects.toThrow('no existe');
    // The database refuses it too.
    const r = await ctx.requirements.create(other, manual('Directo'));
    await expect(
      ctx.prisma.requirementContextLink.create({
        data: { artifactVersionId: r.version.id, needId: need.id },
      }),
    ).rejects.toThrow('same project');
  });

  it('records a decision of the user with its justification', async () => {
    const decided = await ctx.requirements.create(projectId, {
      ...manual('Exportar a Excel'),
      origin: { kind: 'USER_DECISION', justification: 'Lo pidió el cliente en la reunión.' },
    });
    expect(decided.requirement.origin).toEqual({
      kind: 'USER_DECISION',
      justification: 'Lo pidió el cliente en la reunión.',
      contextItems: [],
    });
  });
});
