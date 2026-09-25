import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface AuthoritativeArtifactVersion {
  artifactId: string;
  code: string;
  versionId: string;
}

@Injectable()
export class FirstDeliverableSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  // The single shared definition of "current authoritative version" for a
  // project-level artifact type, used by both Readiness and Export so the
  // policy is never duplicated (spec Phase H). When several artifacts of the
  // same type each have their own exact APPROVED version, the most recently
  // approved one wins — not lexicographic code order. Ties (identical
  // approvedAt, which can only occur via bulk-imported or clock-coarse data)
  // break deterministically on versionNumber DESC, then artifactId ASC.
  // Within one artifact, its own highest-versionNumber APPROVED version is
  // always used — a newer DRAFT never displaces it.
  async approvedArtifactVersion(
    projectId: string,
    artifactTypeCode: string,
  ): Promise<AuthoritativeArtifactVersion | null> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
    let best: (AuthoritativeArtifactVersion & { approvedAt: Date; versionNumber: number }) | null =
      null;
    for (const artifact of artifacts) {
      const version = artifact.versions[0];
      if (!version?.approvedAt) continue;
      const candidate = {
        artifactId: artifact.id,
        code: artifact.code,
        versionId: version.id,
        approvedAt: version.approvedAt,
        versionNumber: version.versionNumber,
      };
      if (
        !best ||
        candidate.approvedAt > best.approvedAt ||
        (candidate.approvedAt.getTime() === best.approvedAt.getTime() &&
          (candidate.versionNumber > best.versionNumber ||
            (candidate.versionNumber === best.versionNumber &&
              candidate.artifactId < best.artifactId)))
      )
        best = candidate;
    }
    return best
      ? { artifactId: best.artifactId, code: best.code, versionId: best.versionId }
      : null;
  }
}
