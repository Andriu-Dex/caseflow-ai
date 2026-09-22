import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ProjectContextRequest, ProjectContextResponse } from '@caseflow-ai/contracts';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

const PROJECT_CONTEXT_TYPE = 'PROJECT_CONTEXT';
const PROJECT_CONTEXT_TITLE = 'Contexto del proyecto';

const contextInclude = {
  projectContextDetail: {
    include: {
      actors: { orderBy: { position: 'asc' as const } },
      needs: { orderBy: { position: 'asc' as const } },
      constraints: { orderBy: { position: 'asc' as const } },
      businessRules: { orderBy: { position: 'asc' as const } },
      scopeItems: { orderBy: { position: 'asc' as const } },
    },
  },
} satisfies Prisma.ArtifactVersionInclude;

type ContextVersion = Prisma.ArtifactVersionGetPayload<{ include: typeof contextInclude }>;
type Transaction = Prisma.TransactionClient;

@Injectable()
export class ProjectContextService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, input: ProjectContextRequest): Promise<ProjectContextResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('Proyecto no encontrado.');

        const existing = await tx.artifact.findFirst({
          where: { projectId, artifactTypeCode: PROJECT_CONTEXT_TYPE },
          select: { id: true },
        });
        if (existing) throw new ConflictException('El proyecto ya tiene un contexto canónico.');

        const artifactType = await tx.artifactType.findUnique({
          where: { code: PROJECT_CONTEXT_TYPE },
        });
        if (!artifactType) throw new InternalServerErrorException();

        const number = await this.allocateCodeNumber(tx, projectId, artifactType.defaultCodePrefix);
        const artifact = await tx.artifact.create({
          data: {
            projectId,
            artifactTypeCode: PROJECT_CONTEXT_TYPE,
            code: formatArtifactCode(artifactType.defaultCodePrefix, number),
          },
        });
        const version = await this.insertSnapshot(tx, artifact.id, projectId, 1, input);
        return this.toResponse(artifact.id, artifact.projectId, artifact.code, version);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('El proyecto ya tiene un contexto canónico.');
      }
      throw error;
    }
  }

  async getCurrent(projectId: string): Promise<ProjectContextResponse> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { projectId, artifactTypeCode: PROJECT_CONTEXT_TYPE },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, include: contextInclude },
      },
    });
    const version = artifact?.versions[0];
    if (!artifact || !version?.projectContextDetail) {
      throw new NotFoundException('Contexto del proyecto no encontrado.');
    }
    return this.toResponse(artifact.id, artifact.projectId, artifact.code, version);
  }

  async createVersion(
    projectId: string,
    input: ProjectContextRequest,
  ): Promise<ProjectContextResponse> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; code: string }[]>`
        SELECT id, code FROM artifacts
        WHERE project_id = ${projectId}::uuid
          AND artifact_type_code = ${PROJECT_CONTEXT_TYPE}
        FOR NO KEY UPDATE`;
      const artifact = locked[0];
      if (!artifact) throw new NotFoundException('Contexto del proyecto no encontrado.');

      const { _max } = await tx.artifactVersion.aggregate({
        where: { artifactId: artifact.id },
        _max: { versionNumber: true },
      });
      const version = await this.insertSnapshot(
        tx,
        artifact.id,
        projectId,
        (_max.versionNumber ?? 0) + 1,
        input,
      );
      return this.toResponse(artifact.id, projectId, artifact.code, version);
    });
  }

  // Explicit human approval gate (spec §5): official downstream generation
  // (Requirements) requires an APPROVED context version. AI never approves.
  async transition(
    projectId: string,
    versionId: string,
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: {
        id: versionId,
        projectId,
        artifact: { artifactTypeCode: PROJECT_CONTEXT_TYPE },
      },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return this.prisma.artifactVersion.update({
      where: { id: versionId },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });
  }

  private insertSnapshot(
    tx: Transaction,
    artifactId: string,
    projectId: string,
    versionNumber: number,
    input: ProjectContextRequest,
  ): Promise<ContextVersion> {
    return tx.artifactVersion.create({
      data: {
        artifactId,
        projectId,
        versionNumber,
        title: PROJECT_CONTEXT_TITLE,
        status: 'DRAFT',
        origin: 'MANUAL',
        metadataAuxiliary: {},
        projectContextDetail: {
          create: {
            problemStatement: input.problemStatement,
            objective: input.objective,
            additionalContext: input.additionalContext,
            actors: { create: input.actors.map((item, position) => ({ ...item, position })) },
            needs: { create: input.needs.map((item, position) => ({ ...item, position })) },
            constraints: {
              create: input.constraints.map((item, position) => ({ ...item, position })),
            },
            businessRules: {
              create: input.businessRules.map((item, position) => ({ ...item, position })),
            },
            scopeItems: {
              create: input.scopeItems.map((item, position) => ({ ...item, position })),
            },
          },
        },
      },
      include: contextInclude,
    });
  }

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
    const number = rows[0]?.last_number;
    if (number === undefined) throw new InternalServerErrorException();
    return number;
  }

  private toResponse(
    artifactId: string,
    projectId: string,
    code: string,
    version: ContextVersion,
  ): ProjectContextResponse {
    const detail = version.projectContextDetail;
    if (!detail) throw new InternalServerErrorException();
    return {
      artifactId,
      projectId,
      type: PROJECT_CONTEXT_TYPE,
      code,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      problemStatement: detail.problemStatement,
      objective: detail.objective,
      additionalContext: detail.additionalContext,
      actors: detail.actors.map(({ id, position, name, description }) => ({
        id,
        position,
        name,
        description,
      })),
      needs: detail.needs.map(({ id, position, description }) => ({ id, position, description })),
      constraints: detail.constraints.map(({ id, position, description }) => ({
        id,
        position,
        description,
      })),
      businessRules: detail.businessRules.map(({ id, position, description }) => ({
        id,
        position,
        description,
      })),
      scopeItems: detail.scopeItems.map(({ id, position, type, description }) => ({
        id,
        position,
        type,
        description,
      })),
    };
  }

  private isUniqueViolation(error: unknown): error is { code: 'P2002' } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
