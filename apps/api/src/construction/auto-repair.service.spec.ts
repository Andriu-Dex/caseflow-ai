import { describe, expect, it, vi } from 'vitest';
import { AIError } from '@caseflow-ai/ai';
import { AutoRepairService, type RepairInput } from './auto-repair.service';

const SERVICE = 'apps/api/src/orders/order.service.ts';
const original =
  "import { Injectable } from '@nestjs/common';\nexport class OrderService { x = y; }\n";

const input = (overrides: Partial<RepairInput> = {}): RepairInput => ({
  projectId: 'p',
  failedStage: 'TYPECHECK',
  output: `${SERVICE.slice('apps/api/'.length)}(2,32): error TS2304: Cannot find name 'y'.`,
  files: [{ path: SERVICE, kind: 'SOURCE', content: original }],
  versionsByCode: new Map([['RF-001', 'version-rf-1']]),
  ...overrides,
});

const prisma = { project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) } };
const service = (generateStructured: ReturnType<typeof vi.fn>) =>
  new AutoRepairService(prisma as never, { generateStructured } as never);
const proposing = (data: unknown) => vi.fn().mockResolvedValue({ data });

describe('AutoRepairService', () => {
  it('returns a reviewed patch with hashes and mapped findings', async () => {
    const fixed = original.replace('x = y;', 'x = 1;');
    const result = await service(
      proposing({
        explanation: 'Se definió el valor.',
        files: [{ path: SERVICE, content: fixed }],
        findings: [{ message: 'RF-001 no define el valor.', relatedSourceCode: 'RF-001' }],
      }),
    ).repair(input());
    expect(result.status).toBe('PATCHED');
    expect(result.patches).toEqual([
      expect.objectContaining({ path: SERVICE, content: fixed, sha256: expect.any(String) }),
    ]);
    expect(result.patches[0]!.previousSha256).not.toBe(result.patches[0]!.sha256);
    expect(result.findings).toEqual([
      { message: 'RF-001 no define el valor.', relatedArtifactVersionId: 'version-rf-1' },
    ]);
  });

  it('rejects the whole proposal when one file adds a new module', async () => {
    const result = await service(
      proposing({
        explanation: 'x',
        files: [{ path: SERVICE, content: "import dayjs from 'dayjs';" }],
        findings: [],
      }),
    ).repair(input());
    expect(result).toMatchObject({ status: 'REJECTED', patches: [] });
    expect(result.explanation).toContain('dayjs');
  });

  it('does not call AI for stages it may not repair or without diagnosed files', async () => {
    const ai = vi.fn();
    expect((await service(ai).repair(input({ failedStage: 'INSTALL' }))).status).toBe('NO_PATCH');
    expect((await service(ai).repair(input({ failedStage: 'STRUCTURE' }))).status).toBe('NO_PATCH');
    expect((await service(ai).repair(input({ output: 'unrelated failure' }))).status).toBe(
      'NO_PATCH',
    );
    expect(ai).not.toHaveBeenCalled();
  });

  it('reports no patch when AI is unavailable or proposes no change', async () => {
    const down = await service(
      vi.fn().mockRejectedValue(new AIError('AI_NOT_CONFIGURED', 'off')),
    ).repair(input());
    expect(down).toMatchObject({ status: 'NO_PATCH', patches: [] });
    const unchanged = await service(
      proposing({
        explanation: 'Sin cambios.',
        files: [{ path: SERVICE, content: original }],
        findings: [],
      }),
    ).repair(input());
    expect(unchanged.status).toBe('NO_PATCH');
  });
});
