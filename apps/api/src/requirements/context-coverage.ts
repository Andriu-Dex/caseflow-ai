import type { Prisma } from '../generated/prisma/client';
import { contextItemRef, contextItems, coverage } from './requirement-context';

const ordered = { orderBy: { position: 'asc' as const } };
const itemRows = { need: true, constraint: true, businessRule: true };

// How the latest approved Project Context is covered by the project's
// requirements (DEC-126): their latest versions, or only the approved ones
// when what counts is what has been agreed (coherence report, Design Gate).
export async function contextCoverage(
  db: Pick<Prisma.TransactionClient, 'artifactVersion' | 'artifact'>,
  projectId: string,
  { approvedOnly }: { approvedOnly: boolean },
) {
  const context = await db.artifactVersion.findFirst({
    where: {
      projectId,
      status: 'APPROVED',
      artifact: { artifactTypeCode: 'PROJECT_CONTEXT', archivedAt: null },
    },
    orderBy: [{ approvedAt: 'desc' }, { versionNumber: 'desc' }],
    include: {
      artifact: true,
      projectContextDetail: {
        include: { needs: ordered, constraints: ordered, businessRules: ordered },
      },
    },
  });
  if (!context?.projectContextDetail) return { context: null, items: [], withoutOrigin: [] };
  const requirements = await db.artifact.findMany({
    where: {
      projectId,
      artifactTypeCode: 'REQUIREMENT',
      archivedAt: null,
      ...(approvedOnly ? { versions: { some: { status: 'APPROVED' } } } : {}),
    },
    include: {
      versions: {
        where: approvedOnly ? { status: 'APPROVED' } : {},
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          requirementDetail: {
            select: { originKind: true, contextLinks: { include: itemRows } },
          },
        },
      },
    },
    orderBy: { code: 'asc' },
  });
  const answers = requirements.map((r) => ({
    id: r.id,
    label: r.code,
    hasOrigin: Boolean(r.versions[0]?.requirementDetail?.originKind),
    items: r.versions[0]?.requirementDetail?.contextLinks.map(contextItemRef) ?? [],
  }));
  return {
    context: {
      artifactId: context.artifactId,
      versionId: context.id,
      versionNumber: context.versionNumber,
      code: context.artifact.code,
    },
    items: coverage(contextItems(context.projectContextDetail), answers),
    withoutOrigin: answers
      .filter((a) => !a.hasOrigin)
      .map(({ id, label }) => ({ id, code: label })),
  };
}
