import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

type ProjectReader = { project: Pick<Prisma.TransactionClient['project'], 'findUnique'> };
type SourceStatus = 'APPROVED' | 'IN_REVIEW' | 'GENERATED' | 'DRAFT';

// Which version statuses a generation may use as sources. Only APPROVED,
// except in the EXPRESS route (DEC-119, ADR-004), where the latest drafts are
// provisional sources; the database still refuses to approve anything before
// the versions it was generated from.
export async function sourceStatuses(
  prisma: ProjectReader,
  projectId: string,
): Promise<SourceStatus[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workflowRoute: true },
  });
  return project?.workflowRoute === 'EXPRESS'
    ? ['APPROVED', 'IN_REVIEW', 'GENERATED', 'DRAFT']
    : ['APPROVED'];
}

// The database refuses to approve a version ahead of the versions it was
// generated from (DEC-119); turn that into a message the user can act on.
export async function provenanceGuard<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('cannot be approved before the versions it was generated from')
    )
      throw new UnprocessableEntityException(
        'Apruebe primero los elementos a partir de los cuales se generó este.',
      );
    throw error;
  }
}
