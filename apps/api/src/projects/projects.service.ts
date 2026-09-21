import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateProjectRequest,
  ProjectListResponse,
  ProjectResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { toProjectResponse } from './projects.mapper';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProjectRequest): Promise<ProjectResponse> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado.');
    }

    const project = await this.prisma.project.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
      },
    });
    return toProjectResponse(project);
  }

  async list(workspaceId: string, limit: number, offset: number): Promise<ProjectListResponse> {
    const projects = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
    return { items: projects.map(toProjectResponse), limit, offset };
  }

  async get(projectId: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }
    return toProjectResponse(project);
  }
}
