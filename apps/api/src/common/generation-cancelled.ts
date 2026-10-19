import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';

// Thrown from a batched run's progress callback once the person cancelled the
// job, to stop the run before its next call to the AI.
export class GenerationCancelledError extends Error {}

// Shown on a job the person cancelled: what the finished batches saved is kept.
export const CANCELLED_MESSAGE =
  'Se canceló la generación. Los lotes completados se conservan para reanudar.';

// Same roles that may start a generation.
export async function assertCanGenerate(prisma: PrismaService, projectId: string, userId: string) {
  const member = await prisma.projectMembership.findFirst({
    where: {
      projectId,
      userId,
      role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
      project: { workspace: { memberships: { some: { userId } } } },
    },
  });
  if (!member) throw new ForbiddenException('No tiene permisos para generar en este proyecto.');
}
