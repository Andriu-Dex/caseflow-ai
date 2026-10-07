import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import {
  DockerSandboxExecutionProvider,
  FakeSandboxExecutionProvider,
  SandboxExecutionError,
  type SandboxExecutionRequest,
} from '@caseflow-ai/integrations';
import { AutoRepairService } from '../../src/construction/auto-repair.service';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { SandboxRunsService } from '../../src/construction/sandbox-runs.service';
import { SANDBOX_EXECUTION_PROVIDER } from '../../src/construction/sandbox-provider.token';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { approvedDesignBaseline } from './support/construction-fixtures';

const SERVICE = 'apps/api/src/sales/order.service.ts';

describe('Construction sandbox validation integration', () => {
  let ctx: TestContext;
  let generationRuns: GenerationRunsService;
  let sandboxRuns: SandboxRunsService;
  let sandbox: FakeSandboxExecutionProvider;
  let projectId: string;
  let otherProjectId: string;
  let planVersionId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  const failing = (stage: string, output: string) => (req: SandboxExecutionRequest) => ({
    stages: req.commands
      .slice(0, req.commands.findIndex((c) => c.stage === stage) + 1)
      .map((c) => ({
        stage: c.stage,
        exitCode: c.stage === stage ? 2 : 0,
        timedOut: false,
        durationMs: 1,
        output: c.stage === stage ? output : 'ok',
      })),
    collected: {},
  });

  async function generatedRun(): Promise<string> {
    const run = await generationRuns.start(projectId, ctx.userId, planVersionId);
    await generationRuns.runJob(projectId, run.id);
    return run.id;
  }

  async function validate(runId: string) {
    const started = await http()
      .post(`/projects/${projectId}/generation-runs/${runId}/sandbox-runs`)
      .set(auth())
      .expect(202);
    // The queue is a no-op in tests: drain every attempt the service enqueues.
    for (;;) {
      const next = await ctx.prisma.sandboxRun.findFirst({
        where: { generationRunId: runId, status: 'QUEUED' },
      });
      if (!next) break;
      await sandboxRuns.runJob(projectId, next.id);
    }
    return started.body.id as string;
  }

  const runs = async (runId: string) =>
    (
      await http()
        .get(`/projects/${projectId}/generation-runs/${runId}/sandbox-runs`)
        .set(auth())
        .expect(200)
    ).body.items;

  beforeAll(async () => {
    ctx = await createTestContext();
    generationRuns = ctx.app.get(GenerationRunsService);
    sandboxRuns = ctx.app.get(SandboxRunsService);
    sandbox = ctx.app.get(SANDBOX_EXECUTION_PROVIDER);
    const workspace = await createWorkspaceWithOwner(ctx, 'Sandbox');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Tienda' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Otra' })).id;
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
          screenName: 'Inicio',
          screenLocalId: 'home',
          moduleLocalId: 'sales',
          kind: 'LIST',
          entityLocalId: 'order',
          actions: [{ label: 'Confirmar pedido', operation: 'CREATE' }],
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
    planVersionId = plan.version.id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => ctx.close());

  it('validates with the template commands only, then formalizes an immutable snapshot', async () => {
    const runId = await generatedRun();
    await validate(runId);

    const [attempt] = await runs(runId);
    expect(attempt).toMatchObject({ status: 'READY', attemptNumber: 1, repair: null });
    expect(
      attempt.stages.map((s: { stage: string; passed: boolean }) => [s.stage, s.passed]),
    ).toEqual([
      ['INSTALL', true],
      ['LINT', true],
      ['TYPECHECK', true],
      ['TEST', true],
      ['BUILD', true],
      ['STRUCTURE', true],
      ['TRACEABILITY', true],
    ]);
    const executed = sandbox.requests.at(-1)!;
    expect(executed.commands.map((c) => [c.argv.join(' '), c.network])).toEqual([
      ['pnpm install', true],
      ['pnpm run lint', false],
      ['pnpm run typecheck', false],
      ['pnpm run test', false],
      ['pnpm run build', false],
    ]);
    // No CASEFlow secret travels into the sandbox input.
    expect(JSON.stringify(executed.files)).not.toContain(process.env.INTERNAL_JOBS_SECRET ?? '§');

    const snapshots = await http()
      .get(`/projects/${projectId}/generated-project-snapshots`)
      .set(auth())
      .expect(200);
    expect(snapshots.body.items).toHaveLength(1);
    const snapshot = snapshots.body.items[0];
    expect(snapshot).toMatchObject({
      id: attempt.snapshotId,
      generationRunId: runId,
      implementationPlanVersionId: planVersionId,
      targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
    });
    expect(snapshot.generationPlanVersionId).not.toBeNull();

    const archive = await http()
      .get(`/projects/${projectId}/generated-project-snapshots/${snapshot.id}/archive`)
      .set(auth())
      .responseType('blob')
      .expect(200)
      .expect('Content-Type', 'application/zip');
    const zip = await JSZip.loadAsync(archive.body as Buffer);
    const paths = Object.keys(zip.files);
    expect(paths).toEqual(
      expect.arrayContaining([
        'tienda/README.md',
        'tienda/pnpm-lock.yaml',
        'tienda/caseflow-manifest.json',
        'tienda/.env.example',
      ]),
    );
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    const manifest = JSON.parse(await zip.file('tienda/caseflow-manifest.json')!.async('string'));
    expect(manifest).toMatchObject({
      manifestHash: snapshot.manifestHash,
      snapshotId: snapshot.id,
    });
    expect(manifest.traceLinks.length).toBeGreaterThan(0);

    const audit = await ctx.prisma.auditEvent.findMany({
      where: { projectId, action: { startsWith: 'GENERATED_PROJECT_SNAPSHOT' } },
    });
    expect(audit.map((e) => e.action).sort()).toEqual([
      'GENERATED_PROJECT_SNAPSHOT_CREATED',
      'GENERATED_PROJECT_SNAPSHOT_DOWNLOADED',
    ]);

    // History is immutable and a verdict is final.
    await expect(
      ctx.prisma.generatedProjectSnapshot.update({
        where: { id: snapshot.id },
        data: { manifestHash: 'x' },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.sandboxRun.update({ where: { id: attempt.id }, data: { status: 'QUEUED' } }),
    ).rejects.toThrow();
    await http()
      .post(`/projects/${projectId}/generation-runs/${runId}/sandbox-runs`)
      .set(auth())
      .expect(409);
  });

  it('never formalizes a snapshot without a READY run', async () => {
    const runId = await generatedRun();
    vi.spyOn(sandbox, 'execute').mockImplementation(async (req) =>
      failing('BUILD', 'build failed')(req),
    );
    await validate(runId);
    const failed = (await runs(runId))[0];
    await expect(
      ctx.prisma.generatedProjectSnapshot.create({
        data: {
          projectId,
          generationRunId: runId,
          sandboxRunId: failed.id,
          targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
          targetTemplateVersion: 1,
          designBaselineId: (
            await ctx.prisma.generationRun.findUniqueOrThrow({
              where: { id: runId },
            })
          ).designBaselineId,
          implementationPlanVersionId: planVersionId,
          fileCount: 1,
          manifestHash: 'x',
          archiveStorageKey: 'x',
          archiveSha256: 'x',
          archiveSize: 1,
          createdByUserId: ctx.userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('marks VALIDATION_FAILED without a snapshot when no repair is possible', async () => {
    const runId = await generatedRun();
    vi.spyOn(sandbox, 'execute').mockImplementation(async (req) =>
      failing('TYPECHECK', `src/sales/order.service.ts(1,1): error TS2304`)(req),
    );
    await validate(runId);
    const items = await runs(runId);
    expect(items).toHaveLength(1);
    // AI is not configured in tests: the round is recorded, nothing is invented.
    expect(items[0]).toMatchObject({
      status: 'VALIDATION_FAILED',
      failedStage: 'TYPECHECK',
      snapshotId: null,
      repair: { roundNumber: 1, status: 'NO_PATCH', patchedPaths: [] },
    });
    expect(
      await ctx.prisma.generatedProjectSnapshot.count({ where: { generationRunId: runId } }),
    ).toBe(0);
  });

  it('applies at most 3 repair rounds, feeding each patch into the next attempt', async () => {
    const runId = await generatedRun();
    vi.spyOn(sandbox, 'execute').mockImplementation(async (req) =>
      failing('TEST', `${SERVICE} failed`)(req),
    );
    let round = 0;
    vi.spyOn(ctx.app.get(AutoRepairService), 'repair').mockImplementation(async () => {
      round += 1;
      return {
        status: 'PATCHED',
        explanation: `ronda ${round}`,
        patches: [
          { path: SERVICE, previousSha256: 'a', content: `// fix ${round}`, sha256: `s${round}` },
        ],
        findings: [],
      };
    });
    await validate(runId);

    const items = await runs(runId);
    expect(
      items.map((r: { attemptNumber: number; status: string }) => [r.attemptNumber, r.status]),
    ).toEqual([
      [1, 'FAILED'],
      [2, 'FAILED'],
      [3, 'FAILED'],
      [4, 'VALIDATION_FAILED'],
    ]);
    expect(round).toBe(3);
    expect(items[3].repair).toBeNull();
    // Attempt 4 ran the project with the third patch applied.
    const lastInput = vi.mocked(sandbox.execute).mock.calls.at(-1)![0];
    expect(lastInput.files.find((f) => f.path === SERVICE)!.content).toBe('// fix 3');
    // The database itself refuses a fourth round.
    await expect(
      ctx.prisma.autoRepairAttempt.create({
        data: {
          generationRunId: runId,
          sandboxRunId: items[3].id,
          roundNumber: 4,
          failedStage: 'TEST',
          status: 'NO_PATCH',
          explanation: 'x',
        },
      }),
    ).rejects.toThrow();
  });

  it('reports a sandbox outage as ERROR and allows retrying it', async () => {
    const runId = await generatedRun();
    vi.spyOn(sandbox, 'execute').mockRejectedValue(
      new SandboxExecutionError('SANDBOX_UNAVAILABLE', 'docker down'),
    );
    await validate(runId);
    const [errored] = await runs(runId);
    expect(errored).toMatchObject({ status: 'ERROR', snapshotId: null });
    expect(errored.errorMessage).not.toContain('docker');
    vi.restoreAllMocks();
    await validate(runId);
    expect((await runs(runId)).map((r: { status: string }) => r.status)).toEqual([
      'ERROR',
      'READY',
    ]);
  });

  it('treats an unreachable registry during install as a retryable environment error', async () => {
    const runId = await generatedRun();
    vi.spyOn(sandbox, 'execute').mockImplementation(async (req) =>
      failing(
        'INSTALL',
        'ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/x: fetch failed',
      )(req),
    );
    await validate(runId);
    const [errored] = await runs(runId);
    expect(errored).toMatchObject({ status: 'ERROR', failedStage: 'INSTALL', repair: null });
    vi.restoreAllMocks();
    await validate(runId);
    expect((await runs(runId)).at(-1).status).toBe('READY');
  });

  it('keeps every snapshot: a new generation never overwrites an earlier one', async () => {
    const before = await ctx.prisma.generatedProjectSnapshot.findMany({ where: { projectId } });
    const runId = await generatedRun();
    await validate(runId);
    const after = await ctx.prisma.generatedProjectSnapshot.findMany({ where: { projectId } });
    expect(after).toHaveLength(before.length + 1);
    for (const old of before) expect(after).toContainEqual(old);
  });

  it('isolates validations and snapshots by project and membership', async () => {
    const [snapshot] = (await ctx.prisma.generatedProjectSnapshot.findMany({
      where: { projectId },
    }))!;
    await http()
      .get(`/projects/${otherProjectId}/generated-project-snapshots/${snapshot!.id}/archive`)
      .set(auth())
      .expect(404);
    await http()
      .get(`/projects/${otherProjectId}/generation-runs/${snapshot!.generationRunId}/sandbox-runs`)
      .set(auth())
      .expect(404);
    await http()
      .post(`/projects/${otherProjectId}/generation-runs/${snapshot!.generationRunId}/sandbox-runs`)
      .set(auth())
      .expect(404);
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/generated-project-snapshots/${snapshot!.id}/archive`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  // Real Docker end to end (spec §179 points 15, 19): opt-in, never in CI.
  it.skipIf(process.env.CASEFLOW_SANDBOX_DOCKER_TESTS !== '1')(
    'validates a generated project in real Docker and exports its ZIP',
    async () => {
      const docker = new DockerSandboxExecutionProvider();
      vi.spyOn(sandbox, 'execute').mockImplementation((req) => docker.execute(req));
      const runId = await generatedRun();
      await validate(runId);
      const [attempt] = await runs(runId);
      expect(attempt.stages.filter((s: { passed: boolean }) => !s.passed)).toEqual([]);
      expect(attempt.status).toBe('READY');
      const archive = await http()
        .get(`/projects/${projectId}/generated-project-snapshots/${attempt.snapshotId}/archive`)
        .set(auth())
        .responseType('blob')
        .expect(200);
      if (process.env.CASEFLOW_SANDBOX_ZIP_OUT)
        writeFileSync(process.env.CASEFLOW_SANDBOX_ZIP_OUT, archive.body as Buffer);
    },
    20 * 60_000,
  );
});
