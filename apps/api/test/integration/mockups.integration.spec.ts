import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';
import request from 'supertest';
import type { MockupProvider } from '@caseflow-ai/integrations';
import { MOCKUP_PROVIDER } from '../../src/mockups/mockup-provider.token';
import { MOCKUP_GENERATION_QUEUE, type MockupGenerationJobPayload } from '@caseflow-ai/domain';
import type { JobQueue } from '../../src/common/infrastructure';
import { MOCKUP_QUEUE } from '../../src/mockups/mockup-queue.token';
import { approved } from './support/construction-fixtures';
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
    // New projects paint their mockups with an approved theme (DEC-118).
    await approved(ctx, projectId, 'DESIGN_THEME');
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

  it('isolates the queue and leaves execution to the test harness', async () => {
    const queue = ctx.app.get<JobQueue<MockupGenerationJobPayload>>(MOCKUP_QUEUE);
    expect(queue).not.toBeInstanceOf(Queue);
    const enqueue = vi.spyOn(queue, 'add');
    try {
      const workspace = await createWorkspace(ctx.prisma, 'Mockup Queue Isolation');
      const isolatedProjectId = (
        await ctx.projects.create({ workspaceId: workspace.id, name: 'Queue test' })
      ).id;
      const blueprint = await approved(ctx, isolatedProjectId, 'UI_BLUEPRINT');
      await approved(ctx, isolatedProjectId, 'DESIGN_THEME');
      const job = await ctx.mockups.create(isolatedProjectId, blueprint.version.id);
      expect(enqueue).toHaveBeenCalledExactlyOnceWith(MOCKUP_GENERATION_QUEUE, {
        jobId: job.id,
        projectId: isolatedProjectId,
      });
      expect((await ctx.mockups.getJob(isolatedProjectId, job.id)).status).toBe('QUEUED');
      await ctx.mockups.runJob(job.id);
      expect((await ctx.mockups.getJob(isolatedProjectId, job.id)).status).toBe('COMPLETED');
    } finally {
      enqueue.mockRestore();
    }
  });

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

  it('rejects approval of contradictory stored HTML through the API and keeps the candidate unchanged', async () => {
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Límite de operaciones',
      description: 'Se permite como máximo tres operaciones activas.',
      priority: 'HIGH',
      actors: ['Usuario'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Regla aprobada para la prueba.' },
    });
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'IN_REVIEW',
    );
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'APPROVED',
    );
    const provider = ctx.app.get<MockupProvider>(MOCKUP_PROVIDER);
    const draw = vi.spyOn(provider, 'generate').mockResolvedValue({
      kind: 'STITCH',
      screens: [
        {
          screenLocalId: 'home',
          screenName: 'Inicio',
          image: { body: Buffer.from('preview'), contentType: 'image/png' },
          html: '<html><body>Máximo 2 operaciones activas.</body></html>',
        },
      ],
    });
    try {
      const mockup = await createAndGet(projectId, approvedBlueprintVersionId);
      const preview = await ctx.mockups.getPreview(projectId, mockup.id);
      expect(preview.fidelityReview?.findings).toContainEqual(
        expect.objectContaining({ code: 'CONTRADICTORY_LIMIT', severity: 'ERROR' }),
      );
      expect(preview.fidelityReview?.requirementVersionIds).toContain(requirement.version.id);
      await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
      const response = await request(ctx.app.getHttpServer())
        .post(
          `/projects/${projectId}/mockups/${mockup.id}/versions/${mockup.version.id}/transition`,
        )
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ status: 'APPROVED' });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('MOCKUP_FIDELITY_FAILED');
      expect((await ctx.mockups.get(projectId, mockup.id)).version.status).toBe('IN_REVIEW');
      expect(
        (
          await ctx.mockups.downloadScreenHtml(projectId, mockup.id, preview.screens![0]!.id)
        ).body.toString(),
      ).toContain('Máximo 2 operaciones');
    } finally {
      draw.mockRestore();
    }
  });
});
