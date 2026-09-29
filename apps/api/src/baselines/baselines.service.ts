import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BaselinesService {
  constructor(private readonly db: PrismaService) {}

  async create(projectId: string, label: string, description: string | undefined, userId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const artifacts = await this.db.artifact.findMany({
      where: { projectId, archivedAt: null },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    const entriesToCreate = artifacts
      .filter((a) => a.versions.length > 0)
      .map((a) => ({
        artifactId: a.id,
        artifactVersionId: a.versions[0]!.id,
      }));

    const baseline = await this.db.projectBaseline.create({
      data: {
        projectId,
        label,
        description,
        createdByUserId: userId,
        entries: {
          create: entriesToCreate,
        },
      },
      include: {
        user: true,
        entries: true,
      },
    });

    return baseline;
  }

  async findAll(projectId: string) {
    return this.db.projectBaseline.findMany({
      where: { projectId },
      include: {
        user: true,
        entries: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(projectId: string, id: string) {
    const baseline = await this.db.projectBaseline.findFirst({
      where: { id, projectId },
      include: {
        user: true,
        entries: true,
      },
    });
    if (!baseline) throw new NotFoundException('Baseline not found');
    return baseline;
  }
}
