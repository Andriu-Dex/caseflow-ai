import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const uiBlueprint = {
  screens: [
    {
      localId: 'home',
      name: 'Inicio',
      purpose: 'Ver el panel principal',
      targetActors: [],
      relatedUseCaseCodes: [],
      sections: ['Resumen'],
      primaryActions: ['Crear pedido'],
      secondaryActions: [],
      principalData: [],
      forms: [],
      states: [],
    },
  ],
};

describe('Mockups integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let approvedBlueprintVersionId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma, 'Mockups');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const blueprint = await ctx.structuredAnalysis.create(
      projectId,
      'UI_BLUEPRINT',
      'Blueprint',
      uiBlueprint,
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprint.id,
      blueprint.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprint.id,
      blueprint.version.id,
      'APPROVED',
    );
    approvedBlueprintVersionId = blueprint.version.id;
  });
  afterAll(async () => ctx.close());

  // Mirrors what apps/worker does after popping the job off the queue: run
  // it, then fetch the artifact it produced.
  async function createAndGet(pid: string, blueprintVersionId: string) {
    const job = await ctx.mockups.create(pid, blueprintVersionId);
    await ctx.mockups.runJob(job.id);
    const finished = await ctx.mockups.getJob(pid, job.id);
    expect(finished.status).toBe('COMPLETED');
    return ctx.mockups.get(pid, finished.resultArtifactId!);
  }

  it('creates a SYSTEM_GENERATED mockup from an approved UI Blueprint with a safe deterministic preview', async () => {
    const mockup = await createAndGet(projectId, approvedBlueprintVersionId);
    expect(mockup).toMatchObject({
      code: 'MCK-001',
      uiBlueprintVersionId: approvedBlueprintVersionId,
      version: { origin: 'SYSTEM_GENERATED', status: 'GENERATED' },
    });
    const preview = await ctx.mockups.getPreview(projectId, mockup.id);
    expect(preview.svg).toMatch(/^<svg/);
    expect(preview.svg).toContain('Inicio');
    expect(preview.svg).toContain('Crear pedido');
    expect(preview.uiBlueprintVersionId).toBe(approvedBlueprintVersionId);
  });

  it('rejects a draft (unapproved) or cross-project UI Blueprint source version', async () => {
    const draft = await ctx.structuredAnalysis.create(
      projectId,
      'UI_BLUEPRINT',
      'Borrador',
      uiBlueprint,
    );
    await expect(ctx.mockups.create(projectId, draft.version.id)).rejects.toThrow('APPROVED');

    const workspace = await createWorkspace(ctx.prisma, 'Other Mockups');
    const otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' }))
      .id;
    await expect(ctx.mockups.create(otherProjectId, approvedBlueprintVersionId)).rejects.toThrow(
      'APPROVED',
    );
  });

  it('creates a new mockup version and enforces stage-gated approval', async () => {
    const mockup = await createAndGet(projectId, approvedBlueprintVersionId);
    const job = await ctx.mockups.version(projectId, mockup.id, approvedBlueprintVersionId);
    await ctx.mockups.runJob(job.id);
    const finished = await ctx.mockups.getJob(projectId, job.id);
    expect(finished.status).toBe('COMPLETED');
    const versioned = await ctx.mockups.get(projectId, finished.resultArtifactId!);
    expect(versioned.version.versionNumber).toBe(2);

    await expect(
      ctx.mockups.transition(projectId, mockup.id, versioned.version.id, 'APPROVED'),
    ).rejects.toThrow('no permitida');
    const inReview = await ctx.mockups.transition(
      projectId,
      mockup.id,
      versioned.version.id,
      'IN_REVIEW',
    );
    expect(inReview.status).toBe('IN_REVIEW');
    const approved = await ctx.mockups.transition(
      projectId,
      mockup.id,
      versioned.version.id,
      'APPROVED',
    );
    expect(approved.status).toBe('APPROVED');
  });

  it('refines only Stitch mockups in the same project and never stores a wireframe as the refinement', async () => {
    const mockup = await createAndGet(projectId, approvedBlueprintVersionId);
    await expect(ctx.mockups.refine(projectId, mockup.id, 'Usa tonos verdes')).rejects.toThrow(
      'Stitch',
    );

    const workspace = await createWorkspace(ctx.prisma, 'Refine Mockups');
    const otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' }))
      .id;
    await expect(ctx.mockups.refine(otherProjectId, mockup.id, 'Usa tonos verdes')).rejects.toThrow(
      'no encontrado',
    );

    // Mockup history is immutable, so a Stitch source version can't be faked here; a
    // refinement job is queued directly instead. The test app's provider only produces
    // wireframes, which must fail the job rather than become a "refined" version.
    const job = await ctx.prisma.mockupGenerationJob.create({
      data: {
        projectId,
        uiBlueprintVersionId: approvedBlueprintVersionId,
        existingMockupId: mockup.id,
        refinementPrompt: 'Usa tonos verdes',
      },
    });
    await ctx.mockups.runJob(job.id);
    expect(await ctx.mockups.getJob(projectId, job.id)).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Stitch no está disponible; no se pudo aplicar la edición del boceto.',
    });
    expect((await ctx.mockups.get(projectId, mockup.id)).version.versionNumber).toBe(1);
  });

  it('never exposes a mockup or its preview through another project', async () => {
    const mockup = await createAndGet(projectId, approvedBlueprintVersionId);
    const workspace = await createWorkspace(ctx.prisma, 'Isolation Mockups');
    const otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' }))
      .id;
    await expect(ctx.mockups.get(otherProjectId, mockup.id)).rejects.toThrow('no encontrado');
    await expect(ctx.mockups.getPreview(otherProjectId, mockup.id)).rejects.toThrow(
      'no encontrado',
    );
  });
});
