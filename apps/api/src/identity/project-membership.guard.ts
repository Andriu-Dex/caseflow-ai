import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProjectMembershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const projectId = request.params.projectId || request.body?.projectId || request.query?.projectId;
    if (!projectId) return true;

    const membership = await this.prisma.projectMembership.findUnique({
      where: {
        projectId_userId: { projectId, userId: user.id },
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this project');
    }
    return true;
  }
}
