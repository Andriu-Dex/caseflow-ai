import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  it('lists workspaces ordered by name, mapped to id/slug/name only', async () => {
    const prisma = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'w1',
            slug: 'dev-workspace',
            name: 'Development Workspace',
            createdAt: new Date(),
          },
        ]),
      },
    };
    const service = new WorkspacesService(prisma as unknown as PrismaService);
    await expect(service.list()).resolves.toEqual({
      items: [{ id: 'w1', slug: 'dev-workspace', name: 'Development Workspace' }],
    });
  });
});
