import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ArtifactOrigin,
  ArtifactResponse,
  ArtifactVersionResponse,
} from '@caseflow-ai/contracts';
import { formatArtifactCode, initialStatusForOrigin } from '@caseflow-ai/domain';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { toArtifactResponse, toArtifactVersionResponse } from './artifacts.mapper';

const ARCHIVABLE_TYPES = new Set([
  'REQUIREMENT',
  'USE_CASE',
  'DATA_MODEL',
  'USE_CASE_DIAGRAM',
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'MOCKUP',
]);

export interface CreateArtifactInput {
  type: string;
  title: string;
  metadataAuxiliary?: Record<string, unknown>;
  codePrefix?: string;
  // Defaults to MANUAL. HTTP callers never choose it; future AI/import flows do.
  origin?: ArtifactOrigin;
}

export interface CreateArtifactVersionInput {
  title: string;
  metadataAuxiliary?: Record<string, unknown>;
  origin?: ArtifactOrigin;
}

type Transaction = Prisma.TransactionClient;

// Every operation is scoped by projectId: an artifact is never resolved by its
// id alone, so future authorization can constrain access per project/workspace.
@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  async createArtifact(projectId: string, input: CreateArtifactInput): Promise<ArtifactResponse> {
    if (
      [
        'PROJECT_CONTEXT',
        'REQUIREMENT',
        'USE_CASE',
        'DATA_MODEL',
        'USE_CASE_DIAGRAM',
        'PROJECT_SOURCE',
        'NAVIGATION_TREE',
        'SOFTWARE_ARCHITECTURE',
        'SYSTEM_ARCHITECTURE',
        'UI_BLUEPRINT',
        'MOCKUP',
      ].includes(input.type)
    ) {
      throw new UnprocessableEntityException(
        'Este artefacto estructurado debe crearse mediante su endpoint específico.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Proyecto no encontrado.');
      }

      const artifactType = await tx.artifactType.findUnique({ where: { code: input.type } });
      if (!artifactType) {
        throw new UnprocessableEntityException('El tipo de artefacto no existe.');
      }

      const prefix = input.codePrefix ?? artifactType.defaultCodePrefix;
      const sequenceNumber = await this.allocateCodeNumber(tx, projectId, prefix);
      const artifact = await tx.artifact.create({
        data: {
          projectId,
          artifactTypeCode: artifactType.code,
          code: formatArtifactCode(prefix, sequenceNumber),
        },
      });

      const version = await this.insertVersion(tx, artifact.id, projectId, 1, input);
      return toArtifactResponse(artifact, version);
    });
  }

  // Retires an artifact from active work (lists, readiness, export) without
  // touching any version — history stays intact and auditable. Sources and
  // the canonical Project Context have their own semantics and are excluded.
  async archive(projectId: string, artifactId: string): Promise<{ archivedAt: string }> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: artifactId, projectId },
      select: { artifactTypeCode: true, archivedAt: true },
    });
    if (!artifact) throw new NotFoundException('Artefacto no encontrado.');
    if (!ARCHIVABLE_TYPES.has(artifact.artifactTypeCode))
      throw new UnprocessableEntityException('Este tipo de artefacto no se puede archivar aquí.');
    if (artifact.archivedAt)
      throw new UnprocessableEntityException('Este artefacto ya está archivado.');
    const archivedAt = new Date();
    await this.prisma.artifact.update({ where: { id: artifactId }, data: { archivedAt } });
    return { archivedAt: archivedAt.toISOString() };
  }

  async getArtifact(projectId: string, artifactId: string): Promise<ArtifactResponse> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: artifactId, projectId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const currentVersion = artifact?.versions[0];
    if (!artifact || !currentVersion) {
      throw new NotFoundException('Artefacto no encontrado.');
    }
    return toArtifactResponse(artifact, currentVersion);
  }

  async createVersion(
    projectId: string,
    artifactId: string,
    input: CreateArtifactVersionInput,
  ): Promise<ArtifactVersionResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent version creation for one artifact so version
      // numbers stay sequential; the (artifact_id, version_number) unique
      // constraint remains the database-level backstop.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM artifacts
        WHERE id = ${artifactId}::uuid AND project_id = ${projectId}::uuid
        FOR NO KEY UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('Artefacto no encontrado.');
      }

      const { _max } = await tx.artifactVersion.aggregate({
        where: { artifactId },
        _max: { versionNumber: true },
      });
      const version = await this.insertVersion(
        tx,
        artifactId,
        projectId,
        (_max.versionNumber ?? 0) + 1,
        input,
      );
      return toArtifactVersionResponse(version);
    });
  }

  // Monotonic per-(project, prefix) counter: numbers are never reused.
  private async allocateCodeNumber(
    tx: Transaction,
    projectId: string,
    prefix: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO project_code_counters (project_id, code_prefix, last_number)
      VALUES (${projectId}::uuid, ${prefix}, 1)
      ON CONFLICT (project_id, code_prefix)
      DO UPDATE SET last_number = project_code_counters.last_number + 1
      RETURNING last_number`;
    const lastNumber = rows[0]?.last_number;
    if (lastNumber === undefined) {
      throw new InternalServerErrorException();
    }
    return lastNumber;
  }

  private insertVersion(
    tx: Transaction,
    artifactId: string,
    projectId: string,
    versionNumber: number,
    input: CreateArtifactVersionInput,
  ) {
    const origin = input.origin ?? 'MANUAL';
    return tx.artifactVersion.create({
      data: {
        artifactId,
        projectId,
        versionNumber,
        title: input.title,
        status: initialStatusForOrigin(origin),
        origin,
        metadataAuxiliary: (input.metadataAuxiliary ?? {}) as Prisma.InputJsonObject,
      },
    });
  }
}
