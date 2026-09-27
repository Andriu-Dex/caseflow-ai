import { NotFoundException } from '@nestjs/common';
import type { ProjectLanguage } from '@caseflow-ai/contracts';
import type { PrismaService } from '../database/prisma.service';

export async function getProjectLanguage(
  prisma: PrismaService,
  projectId: string,
): Promise<ProjectLanguage> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { language: true },
  });
  if (!project) throw new NotFoundException('Proyecto no encontrado.');
  return project.language;
}
