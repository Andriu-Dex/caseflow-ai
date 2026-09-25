import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

async function approveSource(ctx: TestContext, projectId: string, title: string, text: string) {
  const source = await ctx.sources.create(
    projectId,
    {
      title,
      sourceKind: 'NOTES',
      purpose: 'Conocimiento del proyecto',
      description: 'Contenido de prueba.',
    },
    { originalname: 'n.txt', mimetype: 'text/plain', size: text.length, buffer: Buffer.from(text) },
  );
  await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
  const approved = await ctx.sources.transition(
    projectId,
    source.id,
    source.version.id,
    'APPROVED',
  );
  return { artifactId: source.id, version: approved };
}

const useCase = (requirementVersionId: string) => ({
  name: 'Registrar pedido',
  objective: 'Registrar',
  primaryActor: 'Usuario',
  secondaryActors: [],
  preconditions: [],
  postconditions: [],
  mainFlow: [{ actor: 'Usuario', action: 'Registra' }],
  alternativeFlows: [],
  relatedRequirementVersionIds: [requirementVersionId],
});

describe('Staleness / potential-impact integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  it('reports CURRENT everywhere when no newer source knowledge exists', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Staleness Current');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const approvedSource = await approveSource(ctx, projectId, 'Notas', 'Contenido inicial');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'p',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [approvedSource.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');

    const result = await ctx.staleness.analyzeProject(projectId);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      artifactType: 'PROJECT_CONTEXT',
      impactState: 'CURRENT',
      reasons: [],
    });
  });

  it('flags NEWER_APPROVED_KNOWLEDGE_AVAILABLE when a linked source gets a newer approved version, and propagates to Requirement/Use Case', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Staleness Propagation');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const sourceV1 = await approveSource(ctx, projectId, 'Notas', 'SRC-001 v1');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'p',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [sourceV1.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');

    // Manual creation does not set sourceContextVersionId; use a real
    // generated Requirement instead so the exact provenance link genuinely
    // exists.
    const { AIOrchestrator, FakeAIProvider, PromptRegistry } = await import('@caseflow-ai/ai');
    const { PrismaAIRunRecorder } = await import('../../src/ai/ai-run-recorder');
    const { RequirementsService } = await import('../../src/requirements/requirements.service');
    const ai = new AIOrchestrator(
      new FakeAIProvider({
        provider: 'fake',
        model: 'fake-v1',
        payload: {
          candidates: [
            {
              candidateId: 'a',
              requirementType: 'FUNCTIONAL' as const,
              name: 'Registrar pedido',
              description: 'El usuario registra pedidos',
              priority: 'HIGH' as const,
              actors: ['Usuario'],
              preconditions: [],
              postconditions: [],
              dependencyCandidateIds: [],
            },
          ],
        },
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
    const requirementsService = new RequirementsService(ctx.prisma, ai);
    const generation = await requirementsService.generate(projectId, context.version.id);
    const accepted = await requirementsService.accept(projectId, generation.id, [
      generation.candidates[0]!.id,
    ]);
    const acceptedRequirement = accepted.items[0]!;
    await ctx.requirements.transition(
      projectId,
      acceptedRequirement.id,
      acceptedRequirement.version.id,
      'IN_REVIEW',
    );
    await ctx.requirements.transition(
      projectId,
      acceptedRequirement.id,
      acceptedRequirement.version.id,
      'APPROVED',
    );

    const cu = await ctx.useCases.create(projectId, useCase(acceptedRequirement.version.id));

    // Before any newer source: everything is CURRENT.
    const before = await ctx.staleness.analyzeProject(projectId);
    expect(before.entries.map((e) => e.impactState)).toEqual(['CURRENT', 'CURRENT', 'CURRENT']);

    // A newer APPROVED version of the SAME linked source appears (SRC-001 v2),
    // matching the exact scenario from requirements.md Phase E.
    const v2 = await ctx.sources.submitManualTranscript(
      projectId,
      sourceV1.artifactId,
      'Contenido actualizado',
    );
    await ctx.sources.transition(projectId, sourceV1.artifactId, v2.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, sourceV1.artifactId, v2.version.id, 'APPROVED');

    const after = await ctx.staleness.analyzeProject(projectId);
    const contextEntry = after.entries.find((e) => e.artifactType === 'PROJECT_CONTEXT')!;
    const requirementEntry = after.entries.find((e) => e.artifactType === 'REQUIREMENT')!;
    const useCaseEntry = after.entries.find((e) => e.artifactType === 'USE_CASE')!;

    expect(contextEntry.impactState).toBe('NEWER_APPROVED_KNOWLEDGE_AVAILABLE');
    expect(contextEntry.reasons).toEqual([
      expect.objectContaining({
        type: 'NEWER_APPROVED_SOURCE_VERSION',
        sourceArtifactId: sourceV1.artifactId,
      }),
    ]);
    expect(requirementEntry.artifactId).toBe(acceptedRequirement.id);
    expect(requirementEntry.impactState).toBe('POTENTIALLY_AFFECTED');
    expect(useCaseEntry.artifactId).toBe(cu.id);
    expect(useCaseEntry.impactState).toBe('POTENTIALLY_AFFECTED');

    // The original APPROVED Requirement/Use Case versions themselves are
    // never mutated — only reported as potentially affected.
    const rfRow = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: acceptedRequirement.version.id },
    });
    expect(rfRow.status).toBe('APPROVED');
  });

  it('flags a brand-new APPROVED source that the context never linked at all', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Staleness New Source');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const linkedSource = await approveSource(ctx, projectId, 'Notas iniciales', 'Contenido');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'p',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [linkedSource.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');

    const newSource = await approveSource(ctx, projectId, 'Entrevista adicional', 'Nuevo hallazgo');

    const result = await ctx.staleness.analyzeProject(projectId);
    const contextEntry = result.entries.find((e) => e.artifactType === 'PROJECT_CONTEXT')!;
    expect(contextEntry.impactState).toBe('NEWER_APPROVED_KNOWLEDGE_AVAILABLE');
    expect(contextEntry.reasons).toEqual([
      expect.objectContaining({
        type: 'NEW_APPROVED_SOURCE_NOT_LINKED',
        sourceVersionId: newSource.version.id,
      }),
    ]);
  });

  it('enforces project isolation: analysis never leaks another project state', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Staleness Isolation');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const result = await ctx.staleness.analyzeProject(projectId);
    expect(result.entries).toEqual([]);
  });
});
