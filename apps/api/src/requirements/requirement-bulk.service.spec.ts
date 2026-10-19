import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementBulkService } from './requirement-bulk.service';

const target = (
  id: string,
  code: string,
  extra: Partial<{
    archivedAt: Date | null;
    versions: { id: string; status: string; submittedAt: Date | null }[];
  }> = {},
) => ({
  id,
  code,
  archivedAt: null,
  versions: [{ id: `${id}-v1`, status: 'DRAFT', submittedAt: null }],
  ...extra,
});

describe('RequirementBulkService', () => {
  const tx = {
    artifact: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
    requirementDetail: { findMany: vi.fn() },
    artifactVersion: { update: vi.fn() },
    requirementDependency: { findMany: vi.fn() },
    useCaseRequirementLink: { findMany: vi.fn() },
    requirementCandidate: { updateMany: vi.fn() },
    $executeRaw: vi.fn(),
  };
  const prisma = { $transaction: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new RequirementBulkService(prisma as never, audit as never);
  const apply = (action: 'APPROVE' | 'ARCHIVE' | 'DELETE', ids: string[]) =>
    service.apply('p1', action, ids, 'user');

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.project.findUnique.mockResolvedValue({ coherenceRequired: true });
    tx.requirementDetail.findMany.mockResolvedValue([]);
    tx.requirementDependency.findMany.mockResolvedValue([]);
    tx.useCaseRequirementLink.findMany.mockResolvedValue([]);
    tx.artifactVersion.update.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(1);
    audit.record.mockResolvedValue(undefined);
  });

  it('refuses a requirement that is not in the project', async () => {
    tx.artifact.findMany.mockResolvedValue([target('a', 'RF-001')]);
    await expect(apply('ARCHIVE', ['a', 'b'])).rejects.toThrow('no existe en este proyecto');
  });

  it('approves the pending ones through review, skipping the archived and the approved', async () => {
    tx.artifact.findMany.mockResolvedValue([
      target('a', 'RF-001'),
      target('b', 'RF-002', { archivedAt: new Date() }),
      target('c', 'RF-003', { versions: [{ id: 'c-v1', status: 'APPROVED', submittedAt: null }] }),
    ]);
    expect(await apply('APPROVE', ['a', 'b', 'c'])).toEqual({ affected: 1, skipped: 2 });
    const statuses = tx.artifactVersion.update.mock.calls.map(([args]) => args.data.status);
    expect(statuses).toEqual(['IN_REVIEW', 'APPROVED']);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REQUIREMENT_APPROVED',
        metadata: { code: 'RF-001', bulk: true },
      }),
      tx,
    );
  });

  it('asks for the origin of the ones without it, unless coherence is not required', async () => {
    tx.artifact.findMany.mockResolvedValue([target('a', 'RF-001'), target('b', 'RF-002')]);
    tx.requirementDetail.findMany.mockResolvedValue([{ artifactVersionId: 'a-v1' }]);
    await expect(apply('APPROVE', ['a', 'b'])).rejects.toThrow(
      'Indique el origen antes de aprobar: RF-001',
    );
    expect(tx.artifactVersion.update).not.toHaveBeenCalled();

    tx.project.findUnique.mockResolvedValue({ coherenceRequired: false });
    expect(await apply('APPROVE', ['a', 'b'])).toEqual({ affected: 2, skipped: 0 });
  });

  it('archives the active ones and counts the rest as skipped', async () => {
    tx.artifact.findMany.mockResolvedValue([
      target('a', 'RF-001'),
      target('b', 'RF-002', { archivedAt: new Date() }),
    ]);
    expect(await apply('ARCHIVE', ['a', 'b'])).toEqual({ affected: 1, skipped: 1 });
    expect(tx.artifact.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      data: { archivedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REQUIREMENT_ARCHIVED' }),
      tx,
    );
  });

  describe('delete', () => {
    it('deletes requirements never approved that nothing uses, and frees their proposals', async () => {
      tx.artifact.findMany.mockResolvedValue([target('a', 'RF-001'), target('b', 'RF-002')]);
      expect(await apply('DELETE', ['a', 'b'])).toEqual({ affected: 2, skipped: 0 });
      expect(tx.requirementCandidate.updateMany).toHaveBeenCalledWith({
        where: { acceptedArtifactId: { in: ['a', 'b'] } },
        data: { acceptedArtifactId: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUIREMENT_DELETED' }),
        tx,
      );
    });

    it('refuses the whole batch, saying why, if one was approved, is a dependency or is used', async () => {
      tx.artifact.findMany.mockResolvedValue([
        target('a', 'RF-001', {
          versions: [{ id: 'a-v1', status: 'APPROVED', submittedAt: null }],
        }),
        target('b', 'RF-002'),
        target('c', 'RF-003'),
      ]);
      tx.requirementDependency.findMany.mockResolvedValue([
        {
          dependsOnArtifactId: 'b',
          requirement: { artifactVersion: { artifact: { code: 'RF-900' } } },
        },
      ]);
      tx.useCaseRequirementLink.findMany.mockResolvedValue([
        {
          requirementVersionId: 'c-v1',
          useCase: { artifactVersion: { artifact: { code: 'CU-001' } } },
        },
      ]);
      const failure = apply('DELETE', ['a', 'b', 'c']);
      await expect(failure).rejects.toThrow('No se eliminó ningún requisito');
      await expect(failure).rejects.toThrow('RF-001 tuvo una versión aprobada');
      await expect(failure).rejects.toThrow('RF-002 es dependencia de RF-900');
      await expect(failure).rejects.toThrow('RF-003 lo usa CU-001');
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('shortens a long list of reasons', async () => {
      const many = Array.from({ length: 7 }, (_, i) => target(`t${i}`, `RF-00${i}`));
      tx.artifact.findMany.mockResolvedValue(many);
      tx.useCaseRequirementLink.findMany.mockResolvedValue(
        many.map((m) => ({
          requirementVersionId: `${m.id}-v1`,
          useCase: { artifactVersion: { artifact: { code: 'CU-001' } } },
        })),
      );
      await expect(
        apply(
          'DELETE',
          many.map((m) => m.id),
        ),
      ).rejects.toThrow('…');
    });

    it('explains a foreign key refusal and rethrows anything else', async () => {
      tx.artifact.findMany.mockResolvedValue([target('a', 'RF-001')]);
      tx.$executeRaw
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('violates foreign key constraint "x"'));
      await expect(apply('DELETE', ['a'])).rejects.toThrow('está en uso en otro artefacto');

      tx.$executeRaw.mockReset().mockResolvedValue(1);
      tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        if (String(strings[0]).includes('artifact_versions')) throw new Error('connection lost');
        return 1;
      });
      await expect(apply('DELETE', ['a'])).rejects.toThrow('connection lost');
    });
  });
});
