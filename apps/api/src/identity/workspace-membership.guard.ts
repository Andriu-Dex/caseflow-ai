import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WorkspaceMembershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const workspaceId = request.params.workspaceId || request.body?.workspaceId || request.query?.workspaceId;
    if (!workspaceId) return true;

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
