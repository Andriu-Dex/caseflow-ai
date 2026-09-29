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
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      },
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
    const session = await this.prisma.session.findFirst({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    
    // In a real app we'd find the specific session. For MVP, we fetch all and verify:
    const sessions = await this.prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    let validSession = null;
    for (const s of sessions) {
      if (await argon2.verify(s.refreshTokenHash, refreshToken)) {
        validSession = s;
        break;
      }
    }

    if (!validSession || validSession.user.archivedAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session and generate new tokens (rotation)
    await this.prisma.session.update({
      where: { id: validSession.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(validSession.user);
  }

  async logout(refreshToken: string) {
    const sessions = await this.prisma.session.findMany({
      where: { revokedAt: null },
    });
    for (const s of sessions) {
      if (await argon2.verify(s.refreshTokenHash, refreshToken)) {
        await this.prisma.session.update({
          where: { id: s.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }
  }

  private async generateTokens(user: any): Promise<AuthResponse & { refreshToken: string }> {
    const payload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await argon2.hash(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.session.create({
      data: {
        userId: user.id,
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
