import { UnprocessableEntityException } from '@nestjs/common';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import type { PrismaService } from '../database/prisma.service';

// The content of an approved implementation plan version of the project:
// the only plan code is generated from, or delivered in parts (ADR-024).
export async function loadApprovedPlan(
  prisma: PrismaService,
  projectId: string,
  versionId: string,
) {
  const version = await prisma.artifactVersion.findFirst({
    where: {
      id: versionId,
      projectId,
      status: 'APPROVED',
      artifact: { artifactTypeCode: 'IMPLEMENTATION_PLAN' },
    },
    include: { structuredAnalysisDetail: true },
  });
  if (!version?.structuredAnalysisDetail)
    throw new UnprocessableEntityException(
      'Solo se puede generar código desde un plan de implementación aprobado del proyecto.',
    );
  return implementationPlanContentSchema.parse(version.structuredAnalysisDetail.content);
}
