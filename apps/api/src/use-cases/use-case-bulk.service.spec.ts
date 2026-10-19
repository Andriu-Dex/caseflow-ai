import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UseCaseBulkService } from './use-case-bulk.service';

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

describe('UseCaseBulkService', () => {
  const tx = {
    artifact: { findMany: vi.fn(), updateMany: vi.fn() },
    artifactVersion: { update: vi.fn() },
    useCaseRelation: { findMany: vi.fn() },
    useCaseCandidate: { updateMany: vi.fn() },
    $executeRaw: vi.fn(),
  };
  const prisma = { $transaction: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new UseCaseBulkService(prisma as never, audit as never);
  const apply = (action: 'APPROVE' | 'ARCHIVE' | 'DELETE', ids: string[]) =>
    service.apply('p1', action, ids, 'user');

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.useCaseRelation.findMany.mockResolvedValue([]);
    tx.artifactVersion.update.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(1);
    audit.record.mockResolvedValue(undefined);
  });

  it('refuses a use case that is not in the project', async () => {
    tx.artifact.findMany.mockResolvedValue([target('a', 'CU-001')]);
    await expect(apply('ARCHIVE', ['a', 'b'])).rejects.toThrow('no existe en este proyecto');
  });

  it('approves the pending ones through review, skipping the archived and the approved', async () => {
    tx.artifact.findMany.mockResolvedValue([
      target('a', 'CU-001'),
      target('b', 'CU-002', { archivedAt: new Date() }),
      target('c', 'CU-003', { versions: [{ id: 'c-v1', status: 'APPROVED', submittedAt: null }] }),
    ]);
    expect(await apply('APPROVE', ['a', 'b', 'c'])).toEqual({ affected: 1, skipped: 2 });
    expect(tx.artifactVersion.update.mock.calls.map(([args]) => args.data.status)).toEqual([
      'IN_REVIEW',
      'APPROVED',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USE_CASE_APPROVED' }),
      tx,
    );
  });

  it('archives the active ones and counts the rest as skipped', async () => {
    tx.artifact.findMany.mockResolvedValue([
      target('a', 'CU-001'),
      target('b', 'CU-002', { archivedAt: new Date() }),
    ]);
    expect(await apply('ARCHIVE', ['a', 'b'])).toEqual({ affected: 1, skipped: 1 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USE_CASE_ARCHIVED' }),
      tx,
    );
  });

  describe('delete', () => {
    it('deletes use cases never approved that nothing uses, and frees their proposals', async () => {
      tx.artifact.findMany.mockResolvedValue([target('a', 'CU-001'), target('b', 'CU-002')]);
      expect(await apply('DELETE', ['a', 'b'])).toEqual({ affected: 2, skipped: 0 });
      expect(tx.useCaseCandidate.updateMany).toHaveBeenCalledWith({
        where: { acceptedArtifactId: { in: ['a', 'b'] } },
        data: { acceptedArtifactId: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USE_CASE_DELETED' }),
        tx,
      );
    });

    it('refuses the whole batch, saying why, if one was approved or another use case uses it', async () => {
      tx.artifact.findMany.mockResolvedValue([
        target('a', 'CU-001', {
          versions: [{ id: 'a-v1', status: 'APPROVED', submittedAt: null }],
        }),
        target('b', 'CU-002'),
      ]);
      tx.useCaseRelation.findMany.mockResolvedValue([
        {
          targetArtifactId: 'b',
          useCase: { artifactVersion: { artifact: { code: 'CU-900' } } },
        },
      ]);
      const failure = apply('DELETE', ['a', 'b']);
      await expect(failure).rejects.toThrow('No se eliminó ningún caso de uso');
      await expect(failure).rejects.toThrow('CU-001 tuvo una versión aprobada');
      await expect(failure).rejects.toThrow('CU-002 lo usa CU-900');
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('shortens a long list of reasons', async () => {
      const many = Array.from({ length: 7 }, (_, i) => target(`t${i}`, `CU-00${i}`));
      tx.artifact.findMany.mockResolvedValue(many);
      tx.useCaseRelation.findMany.mockResolvedValue(
        many.map((m) => ({
          targetArtifactId: m.id,
          useCase: { artifactVersion: { artifact: { code: 'CU-900' } } },
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
      tx.artifact.findMany.mockResolvedValue([target('a', 'CU-001')]);
      tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        if (String(strings[0]).includes('FROM artifact_versions'))
          throw new Error('violates foreign key constraint "x"');
        return 1;
      });
      await expect(apply('DELETE', ['a'])).rejects.toThrow('está en uso en otro artefacto');

      tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        if (String(strings[0]).includes('FROM artifact_versions'))
          throw new Error('connection lost');
        return 1;
      });
      await expect(apply('DELETE', ['a'])).rejects.toThrow('connection lost');
    });
  });
});
