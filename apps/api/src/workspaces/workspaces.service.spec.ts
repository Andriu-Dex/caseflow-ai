import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  it('lists only the user workspaces ordered by name, mapped to safe fields', async () => {
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
    await expect(service.list('user-1')).resolves.toEqual({
      items: [{ id: 'w1', slug: 'dev-workspace', name: 'Development Workspace' }],
    });
    expect(prisma.workspace.findMany).toHaveBeenCalledWith({
      where: { memberships: { some: { userId: 'user-1' } } },
      orderBy: { name: 'asc' },
    });
  });
});
