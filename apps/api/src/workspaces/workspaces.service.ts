import { Injectable } from '@nestjs/common';
import type { WorkspaceListResponse } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkspaceListResponse> {
    const workspaces = await this.prisma.workspace.findMany({ orderBy: { name: 'asc' } });
    return { items: workspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name })) };
  }
}
