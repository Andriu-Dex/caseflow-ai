import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import {
  useCaseGenerationOutputSchema,
  type UseCaseInput,
  type UseCaseResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;
const detailInclude = {
  secondaryActors: { orderBy: { position: 'asc' as const } },
  preconditions: { orderBy: { position: 'asc' as const } },
  postconditions: { orderBy: { position: 'asc' as const } },
  mainFlowSteps: { orderBy: { position: 'asc' as const } },
  alternativeFlows: {
    orderBy: { position: 'asc' as const },
    include: { steps: { orderBy: { position: 'asc' as const } } },
  },
  requirementLinks: true,
};

@Injectable()
export class UseCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}

  create(projectId: string, input: UseCaseInput) {
    return this.prisma.$transaction((tx) => this.createInTx(tx, projectId, input, 'MANUAL'));
  }
  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'USE_CASE' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { useCaseDetail: { include: detailInclude } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }
  async get(projectId: string, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'USE_CASE' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { useCaseDetail: { include: detailInclude } },
        },
      },
    });
    if (!row?.versions[0]?.useCaseDetail) throw new NotFoundException('Caso de uso no encontrado.');
    return this.map(row, row.versions[0]);
  }
  async version(projectId: string, id: string, input: UseCaseInput) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM artifacts WHERE id=${id}::uuid AND project_id=${projectId}::uuid AND artifact_type_code='USE_CASE' FOR NO KEY UPDATE`;
      if (!locked.length) throw new NotFoundException('Caso de uso no encontrado.');
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: id },
        orderBy: { versionNumber: 'desc' },
      });
      if (latest.status === 'APPROVED')
        throw new UnprocessableEntityException('Un caso de uso aprobado no puede modificarse.');
      await this.validateRequirements(tx, projectId, input.relatedRequirementVersionIds, false);
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: input.name,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await this.insertDetail(tx, version.id, input);
      return this.loadAndMap(tx, id, version.id);
    });
  }
  async generate(projectId: string, requirementVersionIds: string[]) {
    const requirements = await this.validateRequirements(
      this.prisma,
      projectId,
      requirementVersionIds,
      true,
    );
    const sources = requirements.map((version) => ({
      sourceId: version.id,
      requirementVersionId: version.id,
      code: version.artifact.code,
      requirement: version.requirementDetail,
    }));
    try {
      const result = await this.ai.generateStructured({
        projectId,
        promptKey: 'use-cases.generate',
        promptVersion: 1,
        messages: [{ role: 'user', content: JSON.stringify({ requirementSources: sources }) }],
        outputSchema: useCaseGenerationOutputSchema,
        schemaName: 'use_cases_generation',
        maxOutputTokens: 8192,
      });
      const allowed = new Set(sources.map((source) => source.sourceId));
      if (
        result.data.candidates.some((candidate) =>
          candidate.relatedRequirementSourceIds.some((id) => !allowed.has(id)),
        )
      )
        throw new AIError(
          'AI_INVALID_OUTPUT',
          'La salida contiene referencias de requisitos no suministradas.',
        );
      const id = await this.prisma.$transaction(async (tx) => {
        const generation = await tx.useCaseGeneration.create({
          data: { projectId, aiRunId: result.metadata.runId },
        });
        await tx.useCaseGenerationSource.createMany({
          data: sources.map((source) => ({
            generationId: generation.id,
            requirementVersionId: source.requirementVersionId,
            sourceId: source.sourceId,
          })),
        });
        for (const candidate of result.data.candidates) {
          const row = await tx.useCaseCandidate.create({
            data: {
              generationId: generation.id,
              candidateId: candidate.candidateId,
              name: candidate.name,
              objective: candidate.objective,
              primaryActor: candidate.primaryActor,
              secondaryActors: candidate.secondaryActors,
              preconditions: candidate.preconditions,
              postconditions: candidate.postconditions,
              mainFlow: candidate.mainFlow,
              alternativeFlows: candidate.alternativeFlows,
            },
          });
          await tx.useCaseCandidateSource.createMany({
            data: candidate.relatedRequirementSourceIds.map((sourceId) => ({
              candidateId: row.id,
              generationId: generation.id,
              requirementVersionId: sourceId,
            })),
          });
        }
        return generation.id;
      });
      return this.getGeneration(projectId, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }
  async getGeneration(projectId: string, id: string) {
    const generation = await this.prisma.useCaseGeneration.findFirst({
      where: { id, projectId },
      include: {
        sources: true,
        candidates: { include: { sources: true }, orderBy: { candidateId: 'asc' } },
      },
    });
    if (!generation) throw new NotFoundException('Generación no encontrada.');
    return generation;
  }
  async accept(projectId: string, generationId: string, candidateIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const generation = await tx.useCaseGeneration.findFirst({
        where: { id: generationId, projectId },
        include: { candidates: { include: { sources: true } } },
      });
      if (!generation) throw new NotFoundException('Generación no encontrada.');
      const selected = new Set(candidateIds);
      const candidates = generation.candidates.filter((candidate) => selected.has(candidate.id));
      if (candidates.length !== selected.size)
        throw new NotFoundException('Candidato no encontrado.');
      const items: UseCaseResponse[] = [];
      for (const candidate of candidates) {
        if (candidate.acceptedArtifactId)
          throw new UnprocessableEntityException('El candidato ya fue aceptado.');
        const input: UseCaseInput = {
          name: candidate.name,
          objective: candidate.objective,
          primaryActor: candidate.primaryActor,
          secondaryActors: candidate.secondaryActors as string[],
          preconditions: candidate.preconditions as string[],
          postconditions: candidate.postconditions as string[],
          mainFlow: candidate.mainFlow as UseCaseInput['mainFlow'],
          alternativeFlows: candidate.alternativeFlows as UseCaseInput['alternativeFlows'],
          relatedRequirementVersionIds: candidate.sources.map(
            (source) => source.requirementVersionId,
          ),
        };
        const created = await this.createInTx(
          tx,
          projectId,
          input,
          'AI_GENERATED',
          generation.id,
          candidate.id,
          generation.aiRunId,
        );
        await tx.useCaseCandidate.update({
          where: { id: candidate.id },
          data: { acceptedArtifactId: created.id },
        });
        items.push(created);
      }
      return { items };
    });
  }
  async transition(
    projectId: string,
    artifactId: string,
    id: string,
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id, projectId, artifactId, artifact: { artifactTypeCode: 'USE_CASE' } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return this.prisma.artifactVersion.update({
      where: { id },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });
  }
  async academicValidation(projectId: string) {
    if (!(await this.prisma.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const acceptedCount = await this.prisma.artifact.count({
      where: { projectId, artifactTypeCode: 'USE_CASE' },
    });
    return { acceptedCount, minimumRequired: 4 as const, satisfied: acceptedCount >= 4 };
  }
  private async createInTx(
    tx: Tx,
    projectId: string,
    input: UseCaseInput,
    origin: 'MANUAL' | 'AI_GENERATED',
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    await this.validateRequirements(tx, projectId, input.relatedRequirementVersionIds, false);
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,'CU',1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    const artifact = await tx.artifact.create({
      data: {
        projectId,
        artifactTypeCode: 'USE_CASE',
        code: formatArtifactCode('CU', rows[0]!.last_number),
      },
    });
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title: input.name,
        status: origin === 'MANUAL' ? 'DRAFT' : 'GENERATED',
        origin,
      },
    });
    await this.insertDetail(tx, version.id, input, generationId, candidateId, aiRunId);
    return this.loadAndMap(tx, artifact.id, version.id);
  }
  private async insertDetail(
    tx: Tx,
    versionId: string,
    input: UseCaseInput,
    generationId?: string,
    candidateId?: string,
    aiRunId?: string,
  ) {
    await tx.useCaseDetail.create({
      data: {
        artifactVersionId: versionId,
        name: input.name,
        objective: input.objective,
        primaryActor: input.primaryActor,
        generationId,
        generationCandidateId: candidateId,
        aiRunId,
        secondaryActors: {
          create: input.secondaryActors.map((name, position) => ({ name, position })),
        },
        preconditions: {
          create: input.preconditions.map((description, position) => ({ description, position })),
        },
        postconditions: {
          create: input.postconditions.map((description, position) => ({ description, position })),
        },
        mainFlowSteps: { create: input.mainFlow.map((step, position) => ({ ...step, position })) },
        alternativeFlows: {
          create: input.alternativeFlows.map((flow, position) => ({
            name: flow.name,
            condition: flow.condition,
            position,
            steps: {
              create: flow.steps.map((step, stepPosition) => ({ ...step, position: stepPosition })),
            },
          })),
        },
        requirementLinks: {
          create: input.relatedRequirementVersionIds.map((requirementVersionId) => ({
            requirementVersionId,
          })),
        },
      },
    });
  }
  private async validateRequirements(
    tx: Pick<Tx, 'artifactVersion'>,
    projectId: string,
    ids: string[],
    approved: boolean,
  ) {
    const unique = [...new Set(ids)];
    const versions = await tx.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        ...(approved ? { status: 'APPROVED' as const } : {}),
        artifact: { artifactTypeCode: 'REQUIREMENT' },
      },
      include: {
        artifact: true,
        requirementDetail: {
          include: {
            actors: { orderBy: { position: 'asc' } },
            preconditions: { orderBy: { position: 'asc' } },
            postconditions: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (unique.length !== ids.length || versions.length !== ids.length)
      throw new UnprocessableEntityException(
        approved
          ? 'La generación requiere versiones exactas APPROVED de requisitos del mismo proyecto.'
          : 'Referencia de requisito no válida.',
      );
    return versions;
  }
  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { useCaseDetail: { include: detailInclude } },
    });
    return this.map(artifact, version);
  }
  private map(
    artifact: { id: string; projectId: string; code: string; createdAt: Date },
    version: {
      id: string;
      versionNumber: number;
      status: string;
      origin: string;
      createdAt: Date;
      useCaseDetail: unknown;
    },
  ): UseCaseResponse {
    const detail = version.useCaseDetail as {
      name: string;
      objective: string;
      primaryActor: string;
      generationId: string | null;
      generationCandidateId: string | null;
      aiRunId: string | null;
      secondaryActors: { name: string }[];
      preconditions: { description: string }[];
      postconditions: { description: string }[];
      mainFlowSteps: { actor: string; action: string }[];
      alternativeFlows: {
        name: string;
        condition: string;
        steps: { actor: string; action: string }[];
      }[];
      requirementLinks: { requirementVersionId: string }[];
    };
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      createdAt: artifact.createdAt.toISOString(),
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status as UseCaseResponse['version']['status'],
        origin: version.origin as UseCaseResponse['version']['origin'],
        createdAt: version.createdAt.toISOString(),
      },
      useCase: {
        name: detail.name,
        objective: detail.objective,
        primaryActor: detail.primaryActor,
        secondaryActors: detail.secondaryActors.map((x) => x.name),
        preconditions: detail.preconditions.map((x) => x.description),
        postconditions: detail.postconditions.map((x) => x.description),
        mainFlow: detail.mainFlowSteps.map(({ actor, action }) => ({ actor, action })),
        alternativeFlows: detail.alternativeFlows.map((flow) => ({
          name: flow.name,
          condition: flow.condition,
          steps: flow.steps.map(({ actor, action }) => ({ actor, action })),
        })),
        relatedRequirementVersionIds: detail.requirementLinks.map((x) => x.requirementVersionId),
        generationId: detail.generationId,
        candidateId: detail.generationCandidateId,
        aiRunId: detail.aiRunId,
      },
    };
  }
}
