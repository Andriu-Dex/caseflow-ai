import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  verify: vi.fn(async (hash: string, value: string) => hash === `hashed:${value}`),
}));

import * as argon2 from 'argon2';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn() },
    workspace: { create: vi.fn() },
    workspaceMembership: { create: vi.fn() },
    session: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  const jwt = { sign: vi.fn(() => 'access-token') };
  let service: AuthService;
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    displayName: 'Person',
    passwordHash: 'hashed:password',
    archivedAt: null as Date | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.workspace.create.mockResolvedValue({ id: 'workspace-1' });
    prisma.session.findUnique.mockResolvedValue(null);
    prisma.session.create.mockResolvedValue({});
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
  });

  it('registers a user, creates an owned workspace, and stores only a hashed refresh secret', async () => {
    const result = await service.register({
      email: user.email,
      password: 'password',
      displayName: user.displayName,
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: 'workspace-1', userId: user.id, role: 'OWNER' },
    });
    expect(result.user).toEqual({ id: user.id, email: user.email, displayName: user.displayName });
    expect(result.refreshToken).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{64}$/);
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        refreshTokenHash: expect.stringMatching(/^hashed:/),
      }),
    });
  });

  it('rejects duplicate registration before creating records', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(
      service.register({ email: user.email, password: 'password', displayName: user.displayName }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing, archived, or password-mismatched login accounts', async () => {
    await expect(service.login({ email: user.email, password: 'password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    prisma.user.findUnique.mockResolvedValue({ ...user, archivedAt: new Date() });
    await expect(service.login({ email: user.email, password: 'password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    prisma.user.findUnique.mockResolvedValue(user);
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('creates a session after valid login', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    const result = await service.login({ email: user.email, password: 'password' });
    expect(result.accessToken).toBe('access-token');
    expect(argon2.verify).toHaveBeenCalledWith(user.passwordHash, 'password');
    expect(prisma.session.create).toHaveBeenCalledOnce();
  });

  it('rejects malformed, unknown, expired, revoked, archived, and incorrect refresh sessions', async () => {
    await expect(service.refresh('legacy-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();

    await expect(service.refresh('selector.secret')).rejects.toBeInstanceOf(UnauthorizedException);

    const valid = {
      id: 'session-1',
      tokenId: 'selector',
      refreshTokenHash: 'hashed:secret',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    };
    for (const invalid of [
      { ...valid, revokedAt: new Date() },
      { ...valid, expiresAt: new Date(Date.now() - 1) },
      { ...valid, user: { ...user, archivedAt: new Date() } },
      { ...valid, refreshTokenHash: 'not-the-secret' },
    ]) {
      prisma.session.findUnique.mockResolvedValueOnce(invalid);
      await expect(service.refresh('selector.secret')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('rotates a valid refresh session and rejects a concurrent replay', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenId: 'selector',
      refreshTokenHash: 'hashed:secret',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });
    const result = await service.refresh('selector.secret');
    expect(result.accessToken).toBe('access-token');
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { revokedAt: expect.any(Date) },
    });

    prisma.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh('selector.secret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('makes logout safe for malformed, unknown, and invalid tokens and revokes a valid one', async () => {
    await expect(service.logout('malformed')).resolves.toBeUndefined();
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(service.logout('selector.secret')).resolves.toBeUndefined();

    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      tokenId: 'selector',
      refreshTokenHash: 'hashed:secret',
    });
    await expect(service.logout('selector.wrong')).resolves.toBeUndefined();
    await service.logout('selector.secret');
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
