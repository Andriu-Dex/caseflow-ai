import type { ApprovalOrigin } from '@caseflow-ai/contracts';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import {
  useCaseBatchOutputSchema,
  useCaseGenerationOutputSchema,
  type UseCaseInput,
  type UseCaseResponse,
} from '@caseflow-ai/contracts';
import { mergeUseCaseBatch, planUseCaseBatches, type BatchCandidate } from './use-case-batches';
import { provenanceGuard, sourceStatuses } from '../projects/source-statuses';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import type { Prisma } from '../generated/prisma/client';
import type { z } from 'zod';

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
  relations: { orderBy: { target: { code: 'asc' as const } } },
};
type CandidateRelation = { kind: 'INCLUDE' | 'EXTEND'; targetCandidateId: string };
// Progress and checkpoints of a batched run (DEC-139).
export interface UseCaseGenerationProgress {
  jobId: string;
  update: (completedBatches: number, totalBatches: number, outputChars: number) => void;
}

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
      where: { projectId, artifactTypeCode: 'USE_CASE', archivedAt: null },
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
  // Authoritative collection for Export (spec Phase H): each artifact's own
  // highest APPROVED version, never a newer DRAFT on top of it — unlike
  // list() above, which always takes the latest version regardless of status.
  async listApproved(projectId: string, artifactVersionIds?: Record<string, string>) {
    if (artifactVersionIds) {
      const versionIds = Object.values(artifactVersionIds);
      if (versionIds.length === 0) return { items: [] };
      const versions = await this.prisma.artifactVersion.findMany({
        where: { id: { in: versionIds }, artifact: { projectId, artifactTypeCode: 'USE_CASE' } },
        include: { artifact: true, useCaseDetail: { include: detailInclude } },
        orderBy: { artifact: { code: 'asc' } },
      });
      return { items: versions.map((v) => this.map(v.artifact, v)) };
    }

    const rows = await this.prisma.artifact.findMany({
      where: {
        projectId,
        artifactTypeCode: 'USE_CASE',
        versions: { some: { status: 'APPROVED' } },
      },
      include: {
        versions: {
          where: { status: 'APPROVED' },
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
      // Editing an approved artifact never touches the approved version: it
      // opens a new DRAFT version that needs its own approval, exactly like
      // Project Context, Data Model and the design artifacts.
      await this.validateRequirements(tx, projectId, input.relatedRequirementVersionIds, false);
      await this.validateRelations(tx, projectId, id, input.relations);
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
    const language = await getProjectLanguage(this.prisma, projectId);
    try {
      const result = await this.ai.generateStructured({
        projectId,
        language,
        promptKey: 'use-cases.generate',
        promptVersion: 2,
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
      const id = await this.persistGeneration(
        projectId,
        result.metadata.runId,
        sources,
        result.data.candidates,
      );
      return this.getGeneration(projectId, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }
  // Validates the chosen requirements before a job is queued, so the user
  // hears about a bad selection immediately.
  async checkGenerationSources(projectId: string, requirementVersionIds: string[]) {
    await this.validateRequirements(this.prisma, projectId, requirementVersionIds, true);
  }
  // DEC-139: the same result as generate(), built in batches. Each batch gets a
  // few requirements and the use cases proposed so far; its validated output
  // is checkpointed, so a failed run resumes from the last finished batch.
  async generateInBatches(
    projectId: string,
    requirementVersionIds: string[],
    progress?: UseCaseGenerationProgress,
  ) {
    const requirements = await this.validateRequirements(
      this.prisma,
      projectId,
      requirementVersionIds,
      true,
    );
    const byCode = new Map(requirements.map((version) => [version.artifact.code, version]));
    const plan = planUseCaseBatches(
      requirements.map((version) => ({
        code: version.artifact.code,
        requirementType: version.requirementDetail!.requirementType,
      })),
    );
    const compact = (code: string) => {
      const detail = byCode.get(code)!.requirementDetail!;
      return {
        sourceId: code,
        requirementType: detail.requirementType,
        name: detail.name,
        description: detail.description,
        priority: detail.priority,
        actors: detail.actors.map((actor) => actor.name),
        preconditions: detail.preconditions.map((item) => item.description),
        postconditions: detail.postconditions.map((item) => item.description),
      };
    };
    const planned = new Set(plan.flat());
    const sharedContext = [...byCode.keys()]
      .filter((code) => !planned.has(code))
      .map((code) => ({
        sourceId: code,
        name: byCode.get(code)!.requirementDetail!.name,
        description: byCode.get(code)!.requirementDetail!.description,
      }));
    const language = await getProjectLanguage(this.prisma, projectId);
    const allowed = new Set(byCode.keys());
    const mergeOptions = {
      contextCodes: new Set([...byCode.keys()].filter((code) => !planned.has(code))),
      knownActors: [
        ...new Set(requirements.flatMap((v) => v.requirementDetail!.actors.map((a) => a.name))),
      ],
    };
    let candidates: BatchCandidate[] = [];
    let lastRunId = '';
    try {
      for (const [position, targets] of plan.entries()) {
        progress?.update(position, plan.length, 0);
        const cached = progress
          ? await this.prisma.useCaseGenerationPart.findUnique({
              where: { jobId_position: { jobId: progress.jobId, position } },
            })
          : null;
        let output: z.infer<typeof useCaseBatchOutputSchema>;
        if (cached) {
          output = useCaseBatchOutputSchema.parse(cached.content);
          lastRunId = cached.aiRunId;
        } else {
          const result = await this.ai.generateStructured({
            projectId,
            language,
            promptKey: 'use-cases.generate',
            promptVersion: 4,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  targetRequirementSources: targets.map(compact),
                  contextRequirementSources: sharedContext,
                  existingUseCases: candidates.map((candidate) => ({
                    candidateId: candidate.candidateId,
                    name: candidate.name,
                    primaryActor: candidate.primaryActor,
                    requirementSourceIds: candidate.relatedRequirementSourceIds,
                  })),
                }),
              },
            ],
            outputSchema: useCaseBatchOutputSchema,
            schemaName: 'use_cases_batch',
            maxOutputTokens: 8192,
          });
          output = result.data;
          lastRunId = result.metadata.runId;
        }
        // Domain validation happens here, before anything is checkpointed.
        candidates = mergeUseCaseBatch(
          candidates,
          output,
          targets,
          allowed,
          position,
          mergeOptions,
        );
        if (progress && !cached)
          await this.prisma.useCaseGenerationPart.upsert({
            where: { jobId_position: { jobId: progress.jobId, position } },
            create: { jobId: progress.jobId, position, aiRunId: lastRunId, content: output },
            update: { aiRunId: lastRunId, content: output },
          });
        progress?.update(position + 1, plan.length, 0);
      }
      if (!candidates.length)
        throw new AIError('AI_INVALID_OUTPUT', 'La IA no propuso ningún caso de uso.');
      const sources = requirements.map((version) => ({
        sourceId: version.id,
        requirementVersionId: version.id,
      }));
      const id = await this.persistGeneration(
        projectId,
        lastRunId,
        sources,
        candidates.map((candidate) => ({
          ...candidate,
          relatedRequirementSourceIds: candidate.relatedRequirementSourceIds.map(
            (code) => byCode.get(code)!.id,
          ),
        })),
      );
      return this.getGeneration(projectId, id);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }
  private persistGeneration(
    projectId: string,
    aiRunId: string,
    sources: { sourceId: string; requirementVersionId: string }[],
    candidates: BatchCandidate[],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const generation = await tx.useCaseGeneration.create({
          data: { projectId, aiRunId },
        });
        await tx.useCaseGenerationSource.createMany({
          data: sources.map((source) => ({
            generationId: generation.id,
            requirementVersionId: source.requirementVersionId,
            sourceId: source.sourceId,
          })),
        });
        for (const candidate of candidates) {
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
              relations: candidate.relations,
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
      },
      // A few dozen proposals take more than Prisma's default 5 s.
      { timeout: 60_000 },
    );
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
    // Accepting dozens of proposals takes more than Prisma's default 5 s.
    return this.prisma.$transaction(
      async (tx) => {
        const generation = await tx.useCaseGeneration.findFirst({
          where: { id: generationId, projectId },
          include: { candidates: { include: { sources: true } } },
        });
        if (!generation) throw new NotFoundException('Generación no encontrada.');
        const selected = new Set(candidateIds);
        const candidates = generation.candidates.filter((candidate) => selected.has(candidate.id));
        if (candidates.length !== selected.size)
          throw new NotFoundException('Candidato no encontrado.');
        const created = new Map<string, { artifactId: string; versionId: string }>();
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
            relations: [],
          };
          const useCase = await this.createInTx(
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
            data: { acceptedArtifactId: useCase.id },
          });
          created.set(candidate.id, { artifactId: useCase.id, versionId: useCase.version.id });
        }
        // Relations go in once every candidate exists. They keep only the
        // targets accepted now or in an earlier acceptance of the generation;
        // a relation to a discarded proposal is dropped with it.
        const acceptedArtifact = new Map(
          (
            await tx.useCaseCandidate.findMany({
              where: { generationId },
              select: { candidateId: true, acceptedArtifactId: true },
            })
          ).map((c) => [c.candidateId, c.acceptedArtifactId]),
        );
        for (const candidate of candidates) {
          const { versionId } = created.get(candidate.id)!;
          const data = (candidate.relations as CandidateRelation[]).flatMap(
            ({ kind, targetCandidateId }) => {
              const target = acceptedArtifact.get(targetCandidateId);
              return target
                ? [{ artifactVersionId: versionId, targetArtifactId: target, kind }]
                : [];
            },
          );
          if (data.length) await tx.useCaseRelation.createMany({ data });
        }
        const items: UseCaseResponse[] = [];
        for (const { artifactId, versionId } of created.values())
          items.push(await this.loadAndMap(tx, artifactId, versionId));
        return { items };
      },
      { timeout: 60_000 },
    );
  }
  async transition(
    projectId: string,
    artifactId: string,
    id: string,
    status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
    // HUMAN_BULK for an EXPRESS bulk approval (DEC-116); otherwise the
    // database records HUMAN, or AUTOMATIC in BUILD_ONLY.
    approvalOrigin?: ApprovalOrigin,
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id, projectId, artifactId, artifact: { artifactTypeCode: 'USE_CASE' } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return provenanceGuard(
      this.prisma.artifactVersion.update({
        where: { id },
        data: {
          status,
          submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
          approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
          approvalOrigin: status === 'APPROVED' ? approvalOrigin : undefined,
        },
      }),
    );
  }
  async academicValidation(projectId: string) {
    if (!(await this.prisma.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const acceptedCount = await this.prisma.artifact.count({
      where: { projectId, artifactTypeCode: 'USE_CASE', archivedAt: null },
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
    await this.validateRelations(tx, projectId, null, input.relations);
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
        relations: {
          create: input.relations.map(({ kind, targetUseCaseId }) => ({
            kind,
            targetArtifactId: targetUseCaseId,
          })),
        },
      },
    });
  }
  // Targets must be other, non-archived use cases of the same project.
  private async validateRelations(
    tx: Tx,
    projectId: string,
    ownArtifactId: string | null,
    relations: UseCaseInput['relations'],
  ) {
    if (!relations.length) return;
    const ids = relations.map((relation) => relation.targetUseCaseId);
    const found = await tx.artifact.count({
      where: { id: { in: ids }, projectId, artifactTypeCode: 'USE_CASE', archivedAt: null },
    });
    if (found !== new Set(ids).size || (ownArtifactId && ids.includes(ownArtifactId)))
      throw new UnprocessableEntityException(
        'Las relaciones deben apuntar a otros casos de uso vigentes del proyecto.',
      );
  }
  private async validateRequirements(
    tx: Pick<Tx, 'artifactVersion' | 'project'>,
    projectId: string,
    ids: string[],
    approved: boolean,
  ) {
    const unique = [...new Set(ids)];
    const versions = await tx.artifactVersion.findMany({
      where: {
        id: { in: unique },
        projectId,
        ...(approved ? { status: { in: await sourceStatuses(tx, projectId) } } : {}),
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
      relations: { kind: 'INCLUDE' | 'EXTEND'; targetArtifactId: string }[];
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
        relations: detail.relations.map((x) => ({
          kind: x.kind,
          targetUseCaseId: x.targetArtifactId,
        })),
        generationId: detail.generationId,
        candidateId: detail.generationCandidateId,
        aiRunId: detail.aiRunId,
      },
    };
  }
}
