import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WorkspaceMembershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const workspaceId =
      request.params.workspaceId || request.body?.workspaceId || request.query?.workspaceId;
    if (!workspaceId) return true;
    if (!z.uuid().safeParse(workspaceId).success)
      throw new BadRequestException('La solicitud no es válida.');

    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: user.id },
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this workspace');
    }
    return true;
  }
}
