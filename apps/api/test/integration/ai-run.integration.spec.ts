import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

describe('AIRun persistence integration', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  it('persists successful and failed audit metadata without request/output bodies', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'AI Audit');
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Audit' });
    const recorder = new PrismaAIRunRecorder(ctx.prisma);
    const base = {
      projectId: project.id,
      provider: 'fake',
      model: 'fake-v1',
      capability: 'STRUCTURED_OUTPUT' as const,
      purpose: 'probe',
      promptKey: 'foundation.probe',
      promptVersion: 1,
      inputHash: 'a'.repeat(64),
    };
    const successId = await recorder.start(base);
    await recorder.succeed(successId, {
      provider: 'fake',
      model: 'fake-v1',
      latencyMs: 5,
      usage: null,
      outputHash: 'b'.repeat(64),
    });
    const failureId = await recorder.start(base);
    await recorder.fail(failureId, 'AI_TIMEOUT', 10);
    expect(await ctx.prisma.aIRun.findUniqueOrThrow({ where: { id: successId } })).toMatchObject({
      status: 'SUCCEEDED',
      projectId: project.id,
      completedAt: expect.any(Date),
      inputTokens: null,
      outputHash: 'b'.repeat(64),
      errorCode: null,
    });
    expect(await ctx.prisma.aIRun.findUniqueOrThrow({ where: { id: failureId } })).toMatchObject({
      status: 'FAILED',
      completedAt: expect.any(Date),
      errorCode: 'AI_TIMEOUT',
      outputHash: null,
    });
    const { rows } = await ctx.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_runs'`,
    );
    expect(rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(['api_key', 'authorization', 'request_payload', 'response_payload']),
    );
  });
});
