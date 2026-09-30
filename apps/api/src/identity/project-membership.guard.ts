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
export class ProjectMembershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    const projectId =
      request.params.projectId || request.body?.projectId || request.query?.projectId;
    if (!projectId) return true;
    if (!z.uuid().safeParse(projectId).success)
      throw new BadRequestException('La solicitud no es válida.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        projectMemberships: { where: { userId: user.id }, select: { id: true } },
        workspace: {
          select: { memberships: { where: { userId: user.id }, select: { id: true } } },
        },
      },
    });

    // Let the route's resource lookup preserve its established 404 semantics.
    if (!project) return true;
    if (!project.projectMemberships.length || !project.workspace.memberships.length) {
      throw new ForbiddenException('User is not a member of this workspace and project');
    }
    return true;
  }
}
