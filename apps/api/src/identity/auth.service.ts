import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { RegisterRequest, LoginRequest, AuthResponse } from '@caseflow-ai/contracts';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterRequest): Promise<AuthResponse & { refreshToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('User already exists');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email, passwordHash, displayName: dto.displayName },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: `${dto.displayName} - Espacio de trabajo`,
          slug: `ws-${randomBytes(8).toString('hex')}`,
        },
      });
      await tx.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: createdUser.id, role: 'OWNER' },
      });
      return createdUser;
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginRequest): Promise<AuthResponse & { refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.archivedAt) throw new UnauthorizedException('Invalid credentials');

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse & { refreshToken: string }> {
    const [tokenId, secret, extra] = refreshToken.split('.');
    if (!tokenId || !secret || extra) throw new UnauthorizedException('Invalid refresh token');
    const session = await this.prisma.session.findUnique({
      where: { tokenId },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.archivedAt ||
      !(await argon2.verify(session.refreshTokenHash, secret))
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedException('Refresh token was already used');

    return this.generateTokens(session.user);
  }

  async logout(refreshToken: string) {
    const [tokenId, secret, extra] = refreshToken.split('.');
    if (!tokenId || !secret || extra) return;
    const session = await this.prisma.session.findUnique({ where: { tokenId } });
    if (!session || !(await argon2.verify(session.refreshTokenHash, secret))) return;
    await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    displayName: string;
  }): Promise<AuthResponse & { refreshToken: string }> {
    const payload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload);

    const tokenId = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const refreshToken = `${tokenId}.${secret}`;
    const refreshTokenHash = await argon2.hash(secret);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenId,
        refreshTokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }
}
