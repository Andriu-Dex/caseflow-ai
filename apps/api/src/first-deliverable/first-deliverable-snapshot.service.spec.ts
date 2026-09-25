import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { FirstDeliverableSnapshotService } from './first-deliverable-snapshot.service';

describe('FirstDeliverableSnapshotService', () => {
  it('selects the most recently approved artifact, not the lexicographically first', async () => {
    const prisma = {
      artifact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'b',
            code: 'MD-001',
            versions: [{ id: 'md1-v1', approvedAt: new Date('2026-01-01') }],
          },
          {
            id: 'a',
            code: 'MD-002',
            versions: [{ id: 'md2-v1', approvedAt: new Date('2026-06-01') }],
          },
        ]),
      },
    };
    const service = new FirstDeliverableSnapshotService(prisma as unknown as PrismaService);
    const result = await service.approvedArtifactVersion('p', 'DATA_MODEL');
    expect(result).toEqual({ artifactId: 'a', code: 'MD-002', versionId: 'md2-v1' });
  });

  it('breaks a tied approvedAt deterministically: higher versionNumber wins, then lower artifactId', async () => {
    const sameInstant = new Date('2026-01-01T00:00:00Z');
    const prisma = {
      artifact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'zzz',
            code: 'NAV-002',
            versions: [{ id: 'v-low', approvedAt: sameInstant, versionNumber: 1 }],
          },
          {
            id: 'aaa',
            code: 'NAV-001',
            versions: [{ id: 'v-high', approvedAt: sameInstant, versionNumber: 2 }],
          },
        ]),
      },
    };
    const service = new FirstDeliverableSnapshotService(prisma as unknown as PrismaService);
    const result = await service.approvedArtifactVersion('p', 'NAVIGATION_TREE');
    // Higher versionNumber wins even though its artifactId/code sort later.
    expect(result?.versionId).toBe('v-high');

    // Now make versionNumber tie too: lowest artifactId wins.
    prisma.artifact.findMany.mockResolvedValue([
      {
        id: 'zzz',
        code: 'NAV-002',
        versions: [{ id: 'v-zzz', approvedAt: sameInstant, versionNumber: 1 }],
      },
      {
        id: 'aaa',
        code: 'NAV-001',
        versions: [{ id: 'v-aaa', approvedAt: sameInstant, versionNumber: 1 }],
      },
    ]);
    const tieResult = await service.approvedArtifactVersion('p', 'NAVIGATION_TREE');
    expect(tieResult?.versionId).toBe('v-aaa');
  });

  it('returns null when no artifact of the type has an approved version', async () => {
    const prisma = { artifact: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new FirstDeliverableSnapshotService(prisma as unknown as PrismaService);
    await expect(service.approvedArtifactVersion('p', 'UI_BLUEPRINT')).resolves.toBeNull();
  });
});
