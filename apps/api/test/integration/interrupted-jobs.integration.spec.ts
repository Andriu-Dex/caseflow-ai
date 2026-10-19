import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INTERRUPTED_BY_RESTART } from '../../src/common/interrupted';
import { CONSTRUCTION_QUEUE_TOKEN } from '../../src/construction/construction-queue.token';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { InterruptedJobsRecovery } from '../../src/construction/interrupted-jobs.recovery';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { approved, approvedDesignBaseline } from './support/construction-fixtures';

// What a restart leaves behind: jobs still marked as running in a process
// that no longer exists. Safe work resumes; costly or audited work is marked
// as interrupted for the person to retry.
describe('Interrupted jobs recovery integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const longAgo = new Date(Date.now() - 60_000);

  beforeAll(async () => {
    ctx = await createTestContext();
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Reinicios')).id;
  });
  afterAll(async () => ctx.close());

  const recover = () => ctx.app.get(InterruptedJobsRecovery).onApplicationBootstrap();

  async function generatedProject(workflowRoute: 'FULL' | 'BUILD_ONLY') {
    const projectId = (
      await ctx.projects.create({ workspaceId, name: `Proyecto ${workflowRoute}`, workflowRoute })
    ).id;
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
          operations: ['LIST', 'CREATE'],
        },
      ],
      routes: [
        {
          path: '/orders',
          screenName: 'Pedidos',
          screenLocalId: 'home',
          moduleLocalId: 'sales',
          kind: 'LIST',
          entityLocalId: 'order',
          actions: [{ label: 'Confirmar pedido', operation: 'LIST' }],
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
    const runs = ctx.app.get(GenerationRunsService);
    const run = await runs.start(projectId, ctx.userId, plan.version.id);
    return { projectId, run, planVersionId: plan.version.id };
  }

  it('marks an interrupted mockup as failed and never runs it again on redelivery', async () => {
    const projectId = (await ctx.projects.create({ workspaceId, name: 'Bocetos' })).id;
    const ui = await approved(ctx, projectId, 'UI_BLUEPRINT');
    await approved(ctx, projectId, 'DESIGN_THEME');
    const job = await ctx.mockups.create(projectId, ui.version.id);
    await ctx.prisma.mockupGenerationJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', updatedAt: longAgo },
    });

    await recover();
    expect(await ctx.mockups.getJob(projectId, job.id)).toMatchObject({
      status: 'FAILED',
      errorMessage: INTERRUPTED_BY_RESTART,
    });
    // A late redelivery of the same job must not run it behind the user's back.
    await ctx.mockups.runJob(job.id);
    expect((await ctx.mockups.getJob(projectId, job.id)).status).toBe('FAILED');
  });

  it('marks an interrupted generation as failed, audited as interrupted', async () => {
    const { projectId, run } = await generatedProject('FULL');
    await ctx.prisma.generationRun.update({
      where: { id: run.id },
      data: { status: 'GENERATING', startedAt: longAgo },
    });

    await recover();
    expect(
      await ctx.prisma.generationRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).toMatchObject({ status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART });
    expect(
      await ctx.prisma.auditEvent.findFirst({
        where: { projectId, entityId: run.id, action: 'GENERATION_RUN_FINISHED' },
      }),
    ).toMatchObject({ metadata: { status: 'FAILED', interrupted: true } });
  });

  it('ends an interrupted validation as an environment error, retrying it once only in BUILD_ONLY', async () => {
    // An attempt left RUNNING by a process that no longer exists.
    const interrupt = async (projectId: string, generationRunId: string) =>
      (
        await ctx.prisma.sandboxRun.create({
          data: {
            projectId,
            generationRunId,
            attemptNumber: 1,
            status: 'RUNNING',
            startedAt: longAgo,
            createdByUserId: ctx.userId,
          },
        })
      ).id;
    const generated = async (route: 'FULL' | 'BUILD_ONLY') => {
      const { projectId, run } = await generatedProject(route);
      await ctx.app.get(GenerationRunsService).runJob(projectId, run.id);
      return { projectId, generationRunId: run.id };
    };

    const full = await generated('FULL');
    const fullRun = await interrupt(full.projectId, full.generationRunId);
    await recover();
    expect(await ctx.prisma.sandboxRun.findUniqueOrThrow({ where: { id: fullRun } })).toMatchObject(
      {
        status: 'ERROR',
        errorMessage: INTERRUPTED_BY_RESTART,
      },
    );
    expect(
      await ctx.prisma.sandboxRun.count({ where: { generationRunId: full.generationRunId } }),
    ).toBe(1);

    const auto = await generated('BUILD_ONLY');
    await interrupt(auto.projectId, auto.generationRunId);
    await recover();
    const afterFirst = await ctx.prisma.sandboxRun.findMany({
      where: { generationRunId: auto.generationRunId },
      orderBy: { createdAt: 'asc' },
    });
    expect(afterFirst.map((r) => r.status)).toEqual(['ERROR', 'QUEUED']);

    // A second interruption is not retried again: the person decides.
    await ctx.prisma.sandboxRun.update({
      where: { id: afterFirst[1]!.id },
      data: { status: 'RUNNING', startedAt: longAgo },
    });
    await recover();
    expect(
      (
        await ctx.prisma.sandboxRun.findMany({
          where: { generationRunId: auto.generationRunId },
          orderBy: { createdAt: 'asc' },
        })
      ).map((r) => r.status),
    ).toEqual(['ERROR', 'ERROR']);
  });

  it('resumes an interrupted workflow run from where it was', async () => {
    const projectId = (
      await ctx.projects.create({ workspaceId, name: 'Prompt', workflowRoute: 'BUILD_ONLY' })
    ).id;
    const run = await ctx.prisma.workflowRun.create({
      data: {
        projectId,
        prompt: 'Una tienda',
        createdByUserId: ctx.userId,
        status: 'RUNNING',
        startedAt: longAgo,
        currentStage: 'REQUIREMENTS',
      },
    });
    const queue = ctx.app.get<{ add: (...args: unknown[]) => Promise<unknown> }>(
      CONSTRUCTION_QUEUE_TOKEN,
    );
    const add = vi.spyOn(queue, 'add');

    await recover();
    expect((await ctx.prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      'QUEUED',
    );
    expect(add).toHaveBeenCalledWith(expect.anything(), {
      type: 'workflow-run',
      runId: run.id,
      projectId,
    });
    add.mockRestore();
  });
});
