import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { PrismaAIRunRecorder } from './ai-run-recorder';

describe('PrismaAIRunRecorder', () => {
  const prisma = { aIRun: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() } };
  const recorder = new PrismaAIRunRecorder(prisma as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());

  // A restart closes only runs older than the longest AI call: a younger one
  // may belong to another live process.
  it('closes on startup only the runs that can no longer be running', async () => {
    prisma.aIRun.updateMany.mockResolvedValue({ count: 0 });
    const before = Date.now();
    await recorder.onApplicationBootstrap();
    const { where } = prisma.aIRun.updateMany.mock.calls[0]![0];
    expect(where.status).toBe('RUNNING');
    expect(before - where.startedAt.lt.getTime()).toBeGreaterThanOrEqual(180_000 - 5);
  });

  it('persists successful metadata and nullable usage without payloads or secrets', async () => {
    prisma.aIRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.aIRun.update.mockResolvedValue({});
    const start = {
      provider: 'fake',
      model: 'm',
      capability: 'STRUCTURED_OUTPUT' as const,
      purpose: 'probe',
      promptKey: 'probe',
      promptVersion: 1,
      inputHash: 'a'.repeat(64),
    };
    expect(await recorder.start(start)).toBe('run-1');
    await recorder.succeed('run-1', {
      provider: 'fake',
      model: 'm',
      latencyMs: 3,
      usage: null,
      outputHash: 'b'.repeat(64),
    });
    expect(prisma.aIRun.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ apiKey: expect.anything(), payload: expect.anything() }),
    });
    expect(prisma.aIRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        completedAt: expect.any(Date),
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      }),
    });
  });

  it('persists normalized failure without secret diagnostics', async () => {
    prisma.aIRun.update.mockResolvedValue({});
    await recorder.fail('run-1', 'AI_RATE_LIMITED', 9);
    expect(prisma.aIRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'FAILED',
        completedAt: expect.any(Date),
        latencyMs: 9,
        errorCode: 'AI_RATE_LIMITED',
      },
    });
  });
  it('retains incomplete output diagnostics and the requested model', async () => {
    await recorder.fail('run-1', 'AI_INVALID_OUTPUT', 20, {
      model: 'model-v1',
      reason: 'stream_ended',
      outputChars: 100,
      usage: null,
    });
    expect(prisma.aIRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        model: 'model-v1',
        errorDetails: { reason: 'stream_ended', outputChars: 100, usage: null },
      }),
    });
  });
});
