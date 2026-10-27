import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import JSZip from 'jszip';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { SandboxRunsService } from '../../src/construction/sandbox-runs.service';
import { UserManualsService } from '../../src/user-manuals/user-manuals.service';
import { CONSTRUCTION_QUEUE_TOKEN } from '../../src/construction/construction-queue.token';
import type { JobQueue } from '../../src/common/infrastructure';
import type { ConstructionJobPayload } from '@caseflow-ai/domain';
import { userManualStateSchema } from '@caseflow-ai/contracts';
import {
  createTestContext,
  createWorkspaceWithOwner,
  createUnauthorizedUser,
  type TestContext,
} from './support/test-app';
import { approvedDesignBaseline } from './support/construction-fixtures';

describe('User manual delivery integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let snapshotId: string;
  let otherProjectId: string;
  let manuals: UserManualsService;
  beforeAll(async () => {
    ctx = await createTestContext();
    manuals = ctx.app.get(UserManualsService);
    const workspace = await createWorkspaceWithOwner(ctx, 'Manual delivery');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Tienda de prueba' }))
      .id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Otra tienda' }))
      .id;
    const { baseline } = await approvedDesignBaseline(ctx, projectId);
    const plan = await ctx.structuredAnalysis.create(projectId, 'IMPLEMENTATION_PLAN', 'Plan', {
      designBaselineId: baseline.id,
      authentication: { required: false, roles: [] },
      modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
      entities: [
        {
          localId: 'order',
          name: 'Order',
          moduleLocalId: 'sales',
          classLocalId: 'order',
          fields: [{ name: 'total', type: 'DECIMAL' }],
          operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
        },
      ],
      customEndpoints: [
        {
          moduleLocalId: 'sales',
          method: 'POST',
          path: '/orders/:orderId/confirm',
          summary: 'Confirmar pedido',
          entityLocalId: 'order',
        },
      ],
      routes: [
        {
          path: '/orders',
          screenName: 'Inicio',
          screenLocalId: 'home',
          moduleLocalId: 'sales',
          kind: 'LIST',
          entityLocalId: 'order',
          actions: [{ label: 'Confirmar pedido', endpoint: 'POST /orders/:orderId/confirm' }],
        },
      ],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'IMPLEMENTATION_PLAN',
        plan.id,
        plan.version.id,
        status,
      );
    const generation = ctx.app.get(GenerationRunsService);
    const sandbox = ctx.app.get(SandboxRunsService);
    const run = await generation.start(projectId, ctx.userId, plan.version.id);
    await generation.runJob(projectId, run.id);
    const validation = await sandbox.start(projectId, ctx.userId, run.id);
    await sandbox.runJob(projectId, validation.id);
    snapshotId = (
      await ctx.prisma.generatedProjectSnapshot.findFirstOrThrow({
        where: { generationRunId: run.id },
      })
    ).id;
  }, 30000);
  afterAll(async () => ctx.close());
  const url = () => `/projects/${projectId}/generated-project-snapshots/${snapshotId}/user-manual`;

  it('automatically enqueues a separate manual and keeps duplicate deliveries idempotent', async () => {
    const job = await ctx.prisma.userManualJob.findUniqueOrThrow({ where: { snapshotId } });
    expect(job.status).toBe('QUEUED');
    await manuals.runJob(projectId, job.id);
    await manuals.runJob(projectId, job.id);
    const res = await request(ctx.app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${ctx.token}`)
      .expect(200);
    const state = userManualStateSchema.parse(res.body);
    expect(state.job?.status).toBe('COMPLETED');
    expect(state.manual?.title).toBe('Manual de usuario — Tienda de prueba');
    expect(state.manual?.tasks).toHaveLength(1);
    expect(state.manual?.tasks[0]?.verified).toBe(false);
    expect(await ctx.prisma.userManualDetail.count({ where: { snapshotId } })).toBe(1);
    expect((await manuals.enqueue(projectId, snapshotId, ctx.userId)).id).toBe(job.id);
  });

  it('requires verification and review, preserves versions and packages the original software unchanged', async () => {
    const original = (await manuals.get(projectId, snapshotId))!;
    await manuals.transition(projectId, snapshotId, original.version.id, ctx.userId, 'IN_REVIEW');
    await expect(
      manuals.transition(projectId, snapshotId, original.version.id, ctx.userId, 'APPROVED'),
    ).rejects.toThrow('todas las tareas');
    const edited = (await manuals.edit(projectId, snapshotId, ctx.userId, {
      expectedVersionId: original.version.id,
      introduction: 'Guía revisada para la entrega.',
      tasks: original.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        steps: task.steps,
        verified: true,
      })),
    }))!;
    expect(edited.version.versionNumber).toBe(2);
    await manuals.transition(projectId, snapshotId, edited.version.id, ctx.userId, 'IN_REVIEW');
    await manuals.transition(projectId, snapshotId, edited.version.id, ctx.userId, 'APPROVED');
    const archiveBefore = await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });
    const zip = await manuals.download(projectId, snapshotId, edited.version.id, ctx.userId, 'zip');
    const parsed = await JSZip.loadAsync(zip.body);
    expect(Object.keys(parsed.files)).toEqual(
      expect.arrayContaining([
        'software.zip',
        'manual/index.html',
        'manual/manual.pdf',
        'entrega.json',
      ]),
    );
    const manifest = JSON.parse(await parsed.file('entrega.json')!.async('string'));
    expect(manifest.softwareSha256).toBe(archiveBefore.archiveSha256);
    expect(
      (await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({ where: { id: snapshotId } }))
        .archiveSha256,
    ).toBe(archiveBefore.archiveSha256);
    const old = (await manuals.get(projectId, snapshotId, original.version.id))!;
    expect(old.tasks[0]!.verified).toBe(false);
    expect(old.version.status).toBe('IN_REVIEW');
    await expect(
      ctx.prisma.userManualStep.update({
        where: {
          id: (
            await ctx.prisma.userManualStep.findFirstOrThrow({
              where: { task: { manualVersionId: edited.version.id } },
            })
          ).id,
        },
        data: { instruction: 'Cambio silencioso' },
      }),
    ).rejects.toThrow();
    await expect(
      manuals.edit(projectId, snapshotId, ctx.userId, {
        expectedVersionId: original.version.id,
        introduction: 'Obsoleta',
        tasks: edited.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          steps: task.steps,
          verified: true,
        })),
      }),
    ).rejects.toThrow('Recargue');
  });

  it('rejects cross-project access, missing versions and delivery of unapproved manuals', async () => {
    await expect(manuals.get(otherProjectId, snapshotId)).rejects.toThrow('no encontrada');
    const manual = (await manuals.get(projectId, snapshotId))!;
    const old = manual.history.find((item) => item.versionNumber === 1)!;
    await expect(
      manuals.download(projectId, snapshotId, old.id, ctx.userId, 'zip'),
    ).rejects.toThrow('Apruebe');
    const outsider = await createUnauthorizedUser(ctx);
    const token = await ctx.jwtService.signAsync({ sub: outsider.id });
    await request(ctx.app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    const project = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await ctx.prisma.workspaceMembership.create({
      data: { workspaceId: project.workspaceId, userId: outsider.id, role: 'MEMBER' },
    });
    await ctx.prisma.projectMembership.create({
      data: { projectId, userId: outsider.id, role: 'VIEWER' },
    });
    await request(ctx.app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`${url()}/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
    await request(ctx.app.getHttpServer())
      .post(`${url()}/versions/${manual.version.id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' })
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(url().replace(projectId, otherProjectId))
      .set('Authorization', `Bearer ${ctx.token}`)
      .expect(404);
  });
  it('retries a delivery failure independently and marks the older manual as historical', async () => {
    const original = await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });
    const generation = ctx.app.get(GenerationRunsService);
    const sandbox = ctx.app.get(SandboxRunsService);
    const run = await generation.start(projectId, ctx.userId, original.implementationPlanVersionId);
    await generation.runJob(projectId, run.id);
    const validation = await sandbox.start(projectId, ctx.userId, run.id);
    const queue = ctx.app.get<JobQueue<ConstructionJobPayload>>(CONSTRUCTION_QUEUE_TOKEN);
    const enqueue = vi.spyOn(queue, 'add').mockRejectedValue(new Error('Queue unavailable'));
    try {
      await sandbox.runJob(projectId, validation.id);
    } finally {
      enqueue.mockRestore();
    }
    expect(
      (await ctx.prisma.sandboxRun.findUniqueOrThrow({ where: { id: validation.id } })).status,
    ).toBe('READY');
    const snapshot = await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({
      where: { generationRunId: run.id },
    });
    const state = await manuals.state(projectId, snapshot.id);
    expect(state.job?.status).toBe('FAILED');
    expect(state.manual).toBeNull();
    const job = await manuals.enqueue(projectId, snapshot.id, ctx.userId);
    await manuals.runJob(projectId, job.id);
    expect((await manuals.state(projectId, snapshot.id)).job?.status).toBe('COMPLETED');
    expect((await manuals.get(projectId, snapshot.id))?.isCurrent).toBe(true);
    expect((await manuals.get(projectId, snapshotId))?.isCurrent).toBe(false);
    expect(await ctx.prisma.generationRun.count({ where: { projectId } })).toBe(2);
    expect(await ctx.prisma.userManualDetail.count({ where: { snapshotId: snapshot.id } })).toBe(1);
    expect(
      (await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({ where: { id: snapshotId } }))
        .archiveSha256,
    ).toBe(original.archiveSha256);
  });

  it('includes manual history in the authorized whole-project purge', async () => {
    await ctx.projects.delete(projectId, 'Tienda de prueba', ctx.userId);
    expect(await ctx.prisma.userManualDetail.count()).toBe(0);
    expect(await ctx.prisma.userManualJob.count({ where: { projectId } })).toBe(0);
    expect(await ctx.prisma.project.findUnique({ where: { id: otherProjectId } })).not.toBeNull();
  });
});
