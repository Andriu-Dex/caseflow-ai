import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { RequirementBulkAction, RequirementBulkResponse } from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { provenanceGuard } from '../projects/source-statuses';
import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;
type Target = {
  id: string;
  code: string;
  archivedAt: Date | null;
  versions: { id: string; status: string; submittedAt: Date | null }[];
};

// DEC-138: approve, archive or delete several requirements at once. All of
// them or none: every requirement is checked first, and one that cannot take
// the action stops the whole batch with the reason.
@Injectable()
export class RequirementBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async apply(
    projectId: string,
    action: RequirementBulkAction,
    requirementIds: string[],
    userId: string,
  ): Promise<RequirementBulkResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const targets: Target[] = await tx.artifact.findMany({
          where: { id: { in: requirementIds }, projectId, artifactTypeCode: 'REQUIREMENT' },
          select: {
            id: true,
            code: true,
            archivedAt: true,
            versions: {
              orderBy: { versionNumber: 'desc' },
              select: { id: true, status: true, submittedAt: true },
            },
          },
          orderBy: { code: 'asc' },
        });
        if (targets.length !== new Set(requirementIds).size)
          throw new NotFoundException('Algún requisito no existe en este proyecto.');
        if (action === 'APPROVE') return this.approve(tx, projectId, targets, userId);
        if (action === 'ARCHIVE') return this.archive(tx, projectId, targets, userId);
        return this.delete(tx, projectId, targets, userId);
      },
      // A few hundred requirements take more than Prisma's default 5 s.
      { timeout: 60_000 },
    );
  }

  private async approve(tx: Tx, projectId: string, targets: Target[], userId: string) {
    const pending = targets.filter(
      (t) => !t.archivedAt && t.versions[0] && t.versions[0].status !== 'APPROVED',
    );
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { coherenceRequired: true },
    });
    if (project?.coherenceRequired ?? true) {
      const withoutOrigin = await tx.requirementDetail.findMany({
        where: {
          artifactVersionId: { in: pending.map((t) => t.versions[0]!.id) },
          originKind: null,
        },
        select: { artifactVersionId: true },
      });
      if (withoutOrigin.length)
        throw new UnprocessableEntityException(
          `Indique el origen antes de aprobar: ${codesOf(
            pending.filter((t) =>
              withoutOrigin.some((w) => w.artifactVersionId === t.versions[0]!.id),
            ),
          )}.`,
        );
    }
    const now = new Date();
    for (const target of pending) {
      const version = target.versions[0]!;
      // Through review to approval, as approving one at a time does.
      await provenanceGuard(
        tx.artifactVersion.update({
          where: { id: version.id },
          data: { status: 'IN_REVIEW', submittedAt: version.submittedAt ?? now },
        }),
      );
      await provenanceGuard(
        tx.artifactVersion.update({
          where: { id: version.id },
          data: { status: 'APPROVED', approvedAt: now, approvalOrigin: 'HUMAN' },
        }),
      );
      await this.record(tx, projectId, userId, 'REQUIREMENT_APPROVED', target);
    }
    return { affected: pending.length, skipped: targets.length - pending.length };
  }

  private async archive(tx: Tx, projectId: string, targets: Target[], userId: string) {
    const active = targets.filter((t) => !t.archivedAt);
    await tx.artifact.updateMany({
      where: { id: { in: active.map((t) => t.id) } },
      data: { archivedAt: new Date() },
    });
    for (const target of active)
      await this.record(tx, projectId, userId, 'REQUIREMENT_ARCHIVED', target);
    return { affected: active.length, skipped: targets.length - active.length };
  }

  // Only requirements that were never approved and that nothing uses: their
  // code is never reused, and every other one must be archived instead.
  private async delete(tx: Tx, projectId: string, targets: Target[], userId: string) {
    const ids = targets.map((t) => t.id);
    const versionIds = targets.flatMap((t) => t.versions.map((v) => v.id));
    const problems: string[] = [];
    const approved = targets.filter((t) => t.versions.some((v) => v.status === 'APPROVED'));
    if (approved.length)
      problems.push(`${codesOf(approved)} tuvo una versión aprobada; archívelo en su lugar`);
    // Another requirement outside this batch that depends on one of them.
    const dependents = await tx.requirementDependency.findMany({
      where: {
        dependsOnArtifactId: { in: ids },
        requirement: { artifactVersion: { artifactId: { notIn: ids } } },
      },
      select: {
        dependsOnArtifactId: true,
        requirement: {
          select: { artifactVersion: { select: { artifact: { select: { code: true } } } } },
        },
      },
    });
    for (const d of dependents)
      problems.push(
        `${targets.find((t) => t.id === d.dependsOnArtifactId)!.code} es dependencia de ${d.requirement.artifactVersion.artifact.code}`,
      );
    const useCases = await tx.useCaseRequirementLink.findMany({
      where: { requirementVersionId: { in: versionIds } },
      select: {
        requirementVersionId: true,
        useCase: {
          select: { artifactVersion: { select: { artifact: { select: { code: true } } } } },
        },
      },
    });
    for (const link of useCases)
      problems.push(
        `${targets.find((t) => t.versions.some((v) => v.id === link.requirementVersionId))!.code} lo usa ${link.useCase.artifactVersion.artifact.code}`,
      );
    if (problems.length)
      throw new UnprocessableEntityException(
        `No se eliminó ningún requisito: ${[...new Set(problems)].slice(0, 5).join('; ')}${
          problems.length > 5 ? '…' : ''
        }.`,
      );

    const v = versionIds;
    await tx.$executeRaw`DELETE FROM requirement_context_links WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM requirement_actors WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM requirement_preconditions WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM requirement_postconditions WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM requirement_dependencies WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM requirement_details WHERE artifact_version_id = ANY(${v}::uuid[])`;
    // The proposal it came from can be accepted again.
    await tx.requirementCandidate.updateMany({
      where: { acceptedArtifactId: { in: ids } },
      data: { acceptedArtifactId: null },
    });
    try {
      await tx.$executeRaw`DELETE FROM artifact_versions WHERE id = ANY(${v}::uuid[])`;
      await tx.$executeRaw`DELETE FROM artifacts WHERE id = ANY(${ids}::uuid[])`;
    } catch (error) {
      // Anything else that points at them (a diagram, a generation's sources).
      if (String(error).includes('violates foreign key constraint'))
        throw new UnprocessableEntityException(
          'No se eliminó ningún requisito: alguno está en uso en otro artefacto. Archívelo en su lugar.',
        );
      throw error;
    }
    for (const target of targets)
      await this.record(tx, projectId, userId, 'REQUIREMENT_DELETED', target);
    return { affected: targets.length, skipped: 0 };
  }

  private record(
    tx: Tx,
    projectId: string,
    userId: string,
    action: 'REQUIREMENT_APPROVED' | 'REQUIREMENT_ARCHIVED' | 'REQUIREMENT_DELETED',
    target: Target,
  ) {
    return this.audit.record(
      {
        projectId,
        actorUserId: userId,
        action,
        entityType: 'ARTIFACT',
        entityId: target.id,
        metadata: { code: target.code, bulk: true },
      },
      tx,
    );
  }
}

const codesOf = (targets: { code: string }[]) => targets.map((t) => t.code).join(', ');
