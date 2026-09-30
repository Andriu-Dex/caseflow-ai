import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { ProjectsService } from './projects.service';

const workspaceId = '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11';
const now = new Date('2026-01-01T00:00:00.000Z');
const projectRow = {
  id: '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8',
  workspaceId,
  name: 'P',
  description: null,
  language: 'ES' as const,
  createdAt: now,
  updatedAt: now,
};

describe('ProjectsService (rule branches)', () => {
  const prisma = {
    workspace: { findUnique: vi.fn() },
    project: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    projectMembership: { create: vi.fn() },
    artifactVersion: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  };
  let service: ProjectsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ProjectsService(prisma as unknown as PrismaService);
  });

  it('creates a project inside an existing workspace and maps dates to ISO strings', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ id: workspaceId });
    prisma.project.create.mockResolvedValue(projectRow);

    const result = await service.create({ workspaceId, name: 'P' }, 'user-1');

    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { workspaceId, name: 'P', description: null },
    });
    expect(prisma.projectMembership.create).toHaveBeenCalledWith({
      data: { projectId: projectRow.id, userId: 'user-1', role: 'OWNER' },
    });
    expect(result).toMatchObject({ workspaceId, createdAt: now.toISOString(), description: null });
  });

  it('does not create a project for an unknown workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);

    await expect(service.create({ workspaceId, name: 'P' }, 'user-1')).rejects.toThrow(
      'Workspace no encontrado.',
    );
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('lists only projects in the workspace where the user is a member', async () => {
    prisma.project.findMany.mockResolvedValue([projectRow]);
    prisma.artifactVersion.findMany.mockResolvedValue([]);

    const result = await service.list(workspaceId, 10, 20, 'user-1');

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { workspaceId, projectMemberships: { some: { userId: 'user-1' } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 10,
      skip: 20,
    });
    expect(result).toMatchObject({ limit: 10, offset: 20 });
    expect(result.items).toHaveLength(1);
  });

  it('reports a missing project as not found', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.get(projectRow.id)).rejects.toThrow('Proyecto no encontrado.');
  });

  it('updates the project language and preserves its approval indicator', async () => {
    prisma.project.findUnique.mockResolvedValue(projectRow);
    prisma.project.update.mockResolvedValue({ ...projectRow, language: 'EN' });
    prisma.artifactVersion.count.mockResolvedValue(1);

    const result = await service.updateLanguage(projectRow.id, 'EN');

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: projectRow.id },
      data: { language: 'EN' },
    });
    expect(result).toMatchObject({ language: 'EN', hasApprovedArtifacts: true });
  });

  it('does not update the language of an unknown project', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.updateLanguage(projectRow.id, 'EN')).rejects.toThrow(
      'Proyecto no encontrado.',
    );
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});
