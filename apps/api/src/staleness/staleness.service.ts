import { Injectable } from '@nestjs/common';
import type { StalenessEntry, StalenessReason } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StalenessService {
  constructor(private readonly prisma: PrismaService) {}

  // Bounded, deterministic, no AI/semantic comparison (spec Phase E): reports
  // that newer approved project knowledge exists outside an artifact's exact
  // approved provenance. Historical APPROVED versions are read-only here —
  // nothing is mutated, and impact is never claimed as proven/semantic.
  async analyzeProject(projectId: string): Promise<{ entries: StalenessEntry[] }> {
    const entries: StalenessEntry[] = [];

    const contextArtifact = await this.prisma.artifact.findFirst({
      where: { projectId, artifactTypeCode: 'PROJECT_CONTEXT' },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { projectContextDetail: { include: { sources: true } } },
        },
      },
    });
    const contextVersion = contextArtifact?.versions[0];
    if (!contextArtifact || !contextVersion?.projectContextDetail) return { entries };

    const linkedSourceVersionIds = contextVersion.projectContextDetail.sources.map(
      (link) => link.sourceVersionId,
    );
    const linkedSourceVersions = linkedSourceVersionIds.length
      ? await this.prisma.artifactVersion.findMany({
          where: { id: { in: linkedSourceVersionIds } },
          include: { artifact: true },
        })
      : [];
    const linkedArtifactIds = new Set(linkedSourceVersions.map((v) => v.artifactId));

    const reasons: StalenessReason[] = [];

    // A source already linked to the context now has a newer APPROVED version.
    for (const linked of linkedSourceVersions) {
      const latest = await this.prisma.artifactVersion.findFirst({
        where: { artifactId: linked.artifactId },
        orderBy: { versionNumber: 'desc' },
      });
      if (latest && latest.status === 'APPROVED' && latest.versionNumber > linked.versionNumber) {
        reasons.push({
          type: 'NEWER_APPROVED_SOURCE_VERSION',
          sourceArtifactId: linked.artifactId,
          sourceVersionId: latest.id,
          message: `${linked.artifact.code} tiene una versión APPROVED más reciente (v${latest.versionNumber}) que la vinculada al contexto (v${linked.versionNumber}).`,
        });
      }
    }

    // An entirely new approved source exists that the context never linked.
    const allApprovedSources = await this.prisma.artifact.findMany({
      where: {
        projectId,
        artifactTypeCode: 'PROJECT_SOURCE',
        ...(linkedArtifactIds.size ? { id: { notIn: [...linkedArtifactIds] } } : {}),
      },
      include: {
        versions: { where: { status: 'APPROVED' }, orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
    for (const source of allApprovedSources) {
      const approved = source.versions[0];
      if (!approved) continue;
      reasons.push({
        type: 'NEW_APPROVED_SOURCE_NOT_LINKED',
        sourceArtifactId: source.id,
        sourceVersionId: approved.id,
        message: `${source.code} está APPROVED pero no está vinculado al contexto actual del proyecto.`,
      });
    }

    entries.push({
      artifactId: contextArtifact.id,
      artifactVersionId: contextVersion.id,
      artifactType: 'PROJECT_CONTEXT',
      code: contextArtifact.code,
      versionNumber: contextVersion.versionNumber,
      status: contextVersion.status,
      impactState: reasons.length ? 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE' : 'CURRENT',
      reasons,
    });
    const contextFlagged = reasons.length > 0;

    // One hop: Requirements generated from this exact context version.
    const requirementDetails = await this.prisma.requirementDetail.findMany({
      where: { sourceContextVersionId: contextVersion.id },
      include: { artifactVersion: { include: { artifact: true } } },
    });
    const flaggedRequirementVersionIds = new Set<string>();
    const requirementVersionIds: string[] = [];
    for (const detail of requirementDetails) {
      const version = detail.artifactVersion;
      requirementVersionIds.push(version.id);
      const requirementReasons: StalenessReason[] = contextFlagged
        ? [
            {
              type: 'CONTEXT_POTENTIALLY_AFFECTED',
              sourceArtifactId: contextArtifact.id,
              sourceVersionId: contextVersion.id,
              message: `Generado desde ${contextArtifact.code} v${contextVersion.versionNumber}, que tiene conocimiento de fuente más reciente disponible.`,
            },
          ]
        : [];
      if (requirementReasons.length) flaggedRequirementVersionIds.add(version.id);
      entries.push({
        artifactId: version.artifact.id,
        artifactVersionId: version.id,
        artifactType: 'REQUIREMENT',
        code: version.artifact.code,
        versionNumber: version.versionNumber,
        status: version.status,
        impactState: requirementReasons.length ? 'POTENTIALLY_AFFECTED' : 'CURRENT',
        reasons: requirementReasons,
      });
    }

    // One more hop: every Use Case linking to one of the Requirement versions
    // above (reported CURRENT or POTENTIALLY_AFFECTED, mirroring its linked
    // Requirement's state, exactly like Requirements mirror the Context).
    if (requirementVersionIds.length) {
      const links = await this.prisma.useCaseRequirementLink.findMany({
        where: { requirementVersionId: { in: requirementVersionIds } },
        include: {
          useCase: { include: { artifactVersion: { include: { artifact: true } } } },
          requirementVersion: { include: { artifact: true } },
        },
      });
      const seen = new Set<string>();
      for (const link of links) {
        const version = link.useCase.artifactVersion;
        if (seen.has(version.id)) continue;
        seen.add(version.id);
        const affected = flaggedRequirementVersionIds.has(link.requirementVersionId);
        entries.push({
          artifactId: version.artifact.id,
          artifactVersionId: version.id,
          artifactType: 'USE_CASE',
          code: version.artifact.code,
          versionNumber: version.versionNumber,
          status: version.status,
          impactState: affected ? 'POTENTIALLY_AFFECTED' : 'CURRENT',
          reasons: affected
            ? [
                {
                  type: 'REQUIREMENT_POTENTIALLY_AFFECTED',
                  sourceArtifactId: link.requirementVersion.artifact.id,
                  sourceVersionId: link.requirementVersionId,
                  message: `Vinculado a ${link.requirementVersion.artifact.code} v${link.requirementVersion.versionNumber}, potencialmente afectado por conocimiento de fuente más reciente.`,
                },
              ]
            : [],
        });
      }
    }

    return { entries };
  }
}
