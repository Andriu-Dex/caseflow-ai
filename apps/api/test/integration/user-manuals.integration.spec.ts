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
import { capturePng } from '../../../../packages/integrations/src/testing/runtime-capture-fixture';
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

  it('captures privately into new versions, preserves concurrent edits and keeps fallback and software history intact', async () => {
    const before = (await manuals.get(projectId, snapshotId))!;
    const snapshot = await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });
    const png = capturePng();
    const capture = vi.fn(async ({ targets }: { targets: { routePath: string; role: string }[] }) =>
      targets.map((target) => ({
        ...target,
        status: 'CAPTURED',
        reason: null,
        png,
        width: 1440,
        height: 900,
      })),
    );
    Reflect.set(manuals, 'captureProvider', { capture });
    try {
      await request(ctx.app.getHttpServer())
        .post(`${url()}/capture`)
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({})
        .expect(202);
      await expect(manuals.capture(projectId, snapshotId, ctx.userId)).rejects.toThrow('curso');
      await expect(
        manuals.transition(projectId, snapshotId, before.version.id, ctx.userId, 'IN_REVIEW'),
      ).rejects.toThrow('capturas');
      const edited = (await manuals.edit(projectId, snapshotId, ctx.userId, {
        expectedVersionId: before.version.id,
        introduction: 'Texto editado durante la captura.',
        tasks: before.tasks.map(({ id, title, verified, steps }) => ({
          id,
          title,
          verified,
          steps,
        })),
      }))!;
      const job = await ctx.prisma.userManualJob.findUniqueOrThrow({ where: { snapshotId } });
      await manuals.runJob(projectId, job.id);
      const current = (await manuals.get(projectId, snapshotId))!;
      expect(current.version.versionNumber).toBe(edited.version.versionNumber + 1);
      expect(current.introduction).toBe('Texto editado durante la captura.');
      expect(current.tasks.every((task) => !task.verified)).toBe(true);
      const image = current.tasks[0]!.captures![0]!;
      expect(image.status).toBe('CAPTURED');
      expect(capture).toHaveBeenCalledTimes(1);
      const invalidEvidence = (storageKey: string, sha256: string | null) =>
        ctx.prisma.artifactVersion.create({
          data: {
            projectId,
            artifactId: current.id,
            versionNumber: 999,
            title: 'Invalid evidence',
            status: 'DRAFT',
            origin: 'MANUAL',
            userManualDetail: {
              create: {
                snapshotId,
                introduction: 'Invalid evidence',
                tasks: {
                  create: {
                    generatedFileId: current.tasks[0]!.generatedFileId,
                    position: 0,
                    title: 'Invalid',
                    routePath: '/orders',
                    captures: {
                      create: {
                        bundleId: image.bundleId,
                        role: '',
                        status: 'CAPTURED',
                        storageKey,
                        sha256,
                        width: 1440,
                        height: 900,
                        profile: 'EMPTY_DATABASE_DESKTOP_V1',
                      },
                    },
                  },
                },
              },
            },
          },
        });
      await expect(
        invalidEvidence(
          `projects/${otherProjectId}/manual-captures/${snapshotId}/${image.bundleId}/0.png`,
          image.sha256,
        ),
      ).rejects.toThrow('capture storage');
      await expect(
        invalidEvidence(
          `projects/${projectId}/manual-captures/${snapshotId}/${image.bundleId}/0.png`,
          null,
        ),
      ).rejects.toThrow('manual_capture_image');
      expect(
        await ctx.prisma.artifactVersion.count({
          where: { artifactId: current.id, versionNumber: 999 },
        }),
      ).toBe(0);
      expect((await manuals.get(projectId, snapshotId, before.version.id))!.version.status).toBe(
        before.version.status,
      );
      const imagePath = `${url()}/versions/${current.version.id}/captures/${image.id}`;
      const response = await request(ctx.app.getHttpServer())
        .get(imagePath)
        .set('Authorization', `Bearer ${ctx.token}`)
        .expect(200)
        .expect('Content-Type', /image\/png/);
      expect(response.body).toEqual(png);
      await request(ctx.app.getHttpServer())
        .get(imagePath.replace(projectId, otherProjectId))
        .set('Authorization', `Bearer ${ctx.token}`)
        .expect(404);
      await request(ctx.app.getHttpServer())
        .get(imagePath.replace(current.version.id, before.version.id))
        .set('Authorization', `Bearer ${ctx.token}`)
        .expect(404);
      const outsider = await createUnauthorizedUser(ctx);
      const outsiderToken = await ctx.jwtService.signAsync({ sub: outsider.id });
      await request(ctx.app.getHttpServer())
        .get(imagePath)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
      await expect(
        ctx.prisma.userManualCapture.update({
          where: { id: image.id },
          data: { reason: 'Changed' },
        }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.userManualCapture.create({
          data: {
            taskId: current.tasks[0]!.id,
            bundleId: image.bundleId,
            role: 'Other',
            status: 'FAILED',
            reason: 'Late insertion',
            profile: 'EMPTY_DATABASE_DESKTOP_V1',
          },
        }),
      ).rejects.toThrow();
      const verified = (await manuals.edit(projectId, snapshotId, ctx.userId, {
        expectedVersionId: current.version.id,
        introduction: current.introduction,
        tasks: current.tasks.map(({ id, title, steps }) => ({ id, title, steps, verified: true })),
      }))!;
      expect(verified.tasks[0]!.captures![0]!.sha256).toBe(image.sha256);
      await manuals.transition(projectId, snapshotId, verified.version.id, ctx.userId, 'IN_REVIEW');
      await manuals.transition(projectId, snapshotId, verified.version.id, ctx.userId, 'APPROVED');
      const delivery = await manuals.download(
        projectId,
        snapshotId,
        verified.version.id,
        ctx.userId,
        'zip',
      );
      const zip = await JSZip.loadAsync(delivery.body);
      expect(Object.keys(zip.files).some((name) => name.endsWith('.png'))).toBe(true);
      expect(await zip.file('manual/index.html')!.async('string')).toContain(
        'data:image/png;base64,',
      );
      capture.mockRejectedValueOnce(new Error('Private Docker failure'));
      await manuals.capture(projectId, snapshotId, ctx.userId);
      await manuals.runJob(projectId, job.id);
      const fallback = (await manuals.get(projectId, snapshotId))!;
      expect(fallback.tasks[0]!.captures![0]!.status).toBe('FAILED');
      expect(JSON.stringify(fallback)).not.toContain('Private Docker');
      expect((await manuals.get(projectId, snapshotId, verified.version.id))!.version.status).toBe(
        'APPROVED',
      );
      expect(
        (await ctx.prisma.generatedProjectSnapshot.findUniqueOrThrow({ where: { id: snapshotId } }))
          .archiveSha256,
      ).toBe(snapshot.archiveSha256);
    } finally {
      Reflect.set(manuals, 'captureProvider', undefined);
    }
  });

  it('includes manual history in the authorized whole-project purge', async () => {
    await ctx.projects.delete(projectId, 'Tienda de prueba', ctx.userId);
    expect(await ctx.prisma.userManualDetail.count()).toBe(0);
    expect(await ctx.prisma.userManualJob.count({ where: { projectId } })).toBe(0);
    expect(await ctx.prisma.project.findUnique({ where: { id: otherProjectId } })).not.toBeNull();
  });
});
