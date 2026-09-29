import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { ProjectMembershipGuard } from './project-membership.guard';
import { WorkspaceMembershipGuard } from './workspace-membership.guard';

function executionContext(request: Record<string, unknown>): ExecutionContext {
  const normalizedRequest = { params: {}, query: {}, body: {}, ...request };
  return {
    switchToHttp: () => ({ getRequest: () => normalizedRequest }),
  } as unknown as ExecutionContext;
}

describe('ProjectMembershipGuard', () => {
  it('requires an authenticated user and a valid project id', async () => {
    const project = { findUnique: vi.fn() };
    const guard = new ProjectMembershipGuard({ project } as unknown as PrismaService);
    await expect(guard.canActivate(executionContext({ params: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(executionContext({ user: { id: 'u1' }, params: { projectId: 'bad' } })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(project.findUnique).not.toHaveBeenCalled();
  });

  it('allows routes without a project id and lets missing projects reach route-level 404 handling', async () => {
    const project = { findUnique: vi.fn().mockResolvedValue(null) };
    const guard = new ProjectMembershipGuard({ project } as unknown as PrismaService);
    await expect(
      guard.canActivate(executionContext({ user: { id: 'u1' }, params: {} })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        executionContext({
          user: { id: 'u1' },
          params: { projectId: '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11' },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('requires both workspace and project memberships', async () => {
    const project = { findUnique: vi.fn() };
    const guard = new ProjectMembershipGuard({ project } as unknown as PrismaService);
    const context = () =>
      executionContext({
        user: { id: 'u1' },
        params: { projectId: '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11' },
      });

    project.findUnique.mockResolvedValue({
      projectMemberships: [],
      workspace: { memberships: [{ id: 'wm' }] },
    });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
    project.findUnique.mockResolvedValue({
      projectMemberships: [{ id: 'pm' }],
      workspace: { memberships: [] },
    });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
    project.findUnique.mockResolvedValue({
      projectMemberships: [{ id: 'pm' }],
      workspace: { memberships: [{ id: 'wm' }] },
    });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
});

describe('WorkspaceMembershipGuard', () => {
  it('requires an authenticated user and a valid workspace id', async () => {
    const workspaceMembership = { findUnique: vi.fn() };
    const guard = new WorkspaceMembershipGuard({ workspaceMembership } as unknown as PrismaService);
    await expect(guard.canActivate(executionContext({ params: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(executionContext({ user: { id: 'u1' }, body: { workspaceId: 'bad' } })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(workspaceMembership.findUnique).not.toHaveBeenCalled();
  });

  it('allows requests with no workspace scope and checks scoped membership', async () => {
    const workspaceMembership = { findUnique: vi.fn() };
    const guard = new WorkspaceMembershipGuard({ workspaceMembership } as unknown as PrismaService);
    await expect(
      guard.canActivate(executionContext({ user: { id: 'u1' }, params: {} })),
    ).resolves.toBe(true);

    const request = {
      user: { id: 'u1' },
      query: { workspaceId: '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11' },
    };
    workspaceMembership.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(executionContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    workspaceMembership.findUnique.mockResolvedValue({ id: 'membership' });
    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
  });
});
