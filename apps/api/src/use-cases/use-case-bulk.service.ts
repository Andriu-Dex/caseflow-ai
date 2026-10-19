import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { UseCaseBulkAction, UseCaseBulkResponse } from '@caseflow-ai/contracts';
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

// DEC-138: approve, archive or delete several use cases at once. All of them
// or none: every use case is checked first, and one that cannot take the
// action stops the whole batch with the reason.
@Injectable()
export class UseCaseBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async apply(
    projectId: string,
    action: UseCaseBulkAction,
    useCaseIds: string[],
    userId: string,
  ): Promise<UseCaseBulkResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const targets: Target[] = await tx.artifact.findMany({
          where: { id: { in: useCaseIds }, projectId, artifactTypeCode: 'USE_CASE' },
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
        if (targets.length !== new Set(useCaseIds).size)
          throw new NotFoundException('Algún caso de uso no existe en este proyecto.');
        if (action === 'APPROVE') return this.approve(tx, projectId, targets, userId);
        if (action === 'ARCHIVE') return this.archive(tx, projectId, targets, userId);
        return this.delete(tx, projectId, targets, userId);
      },
      // A few hundred use cases take more than Prisma's default 5 s.
      { timeout: 60_000 },
    );
  }

  private async approve(tx: Tx, projectId: string, targets: Target[], userId: string) {
    const pending = targets.filter(
      (t) => !t.archivedAt && t.versions[0] && t.versions[0].status !== 'APPROVED',
    );
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
      await this.record(tx, projectId, userId, 'USE_CASE_APPROVED', target);
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
      await this.record(tx, projectId, userId, 'USE_CASE_ARCHIVED', target);
    return { affected: active.length, skipped: targets.length - active.length };
  }

  // Only use cases that were never approved and that nothing uses: their code
  // is never reused, and every other one must be archived instead.
  private async delete(tx: Tx, projectId: string, targets: Target[], userId: string) {
    const ids = targets.map((t) => t.id);
    const versionIds = targets.flatMap((t) => t.versions.map((v) => v.id));
    const problems: string[] = [];
    const approved = targets.filter((t) => t.versions.some((v) => v.status === 'APPROVED'));
    if (approved.length)
      problems.push(`${codesOf(approved)} tuvo una versión aprobada; archívelo en su lugar`);
    // Another use case outside this batch that includes or extends one of them.
    const users = await tx.useCaseRelation.findMany({
      where: {
        targetArtifactId: { in: ids },
        useCase: { artifactVersion: { artifactId: { notIn: ids } } },
      },
      select: {
        targetArtifactId: true,
        useCase: {
          select: { artifactVersion: { select: { artifact: { select: { code: true } } } } },
        },
      },
    });
    for (const relation of users)
      problems.push(
        `${targets.find((t) => t.id === relation.targetArtifactId)!.code} lo usa ${relation.useCase.artifactVersion.artifact.code}`,
      );
    if (problems.length)
      throw new UnprocessableEntityException(
        `No se eliminó ningún caso de uso: ${[...new Set(problems)].slice(0, 5).join('; ')}${
          problems.length > 5 ? '…' : ''
        }.`,
      );

    const v = versionIds;
    await tx.$executeRaw`DELETE FROM use_case_alternative_flow_steps WHERE alternative_flow_id IN (SELECT id FROM use_case_alternative_flows WHERE artifact_version_id = ANY(${v}::uuid[]))`;
    await tx.$executeRaw`DELETE FROM use_case_alternative_flows WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_main_flow_steps WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_preconditions WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_postconditions WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_secondary_actors WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_requirement_links WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_relations WHERE artifact_version_id = ANY(${v}::uuid[])`;
    await tx.$executeRaw`DELETE FROM use_case_details WHERE artifact_version_id = ANY(${v}::uuid[])`;
    // The proposal it came from can be accepted again.
    await tx.useCaseCandidate.updateMany({
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
          'No se eliminó ningún caso de uso: alguno está en uso en otro artefacto. Archívelo en su lugar.',
        );
      throw error;
    }
    for (const target of targets)
      await this.record(tx, projectId, userId, 'USE_CASE_DELETED', target);
    return { affected: targets.length, skipped: 0 };
  }

  private record(
    tx: Tx,
    projectId: string,
    userId: string,
    action: 'USE_CASE_APPROVED' | 'USE_CASE_ARCHIVED' | 'USE_CASE_DELETED',
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
