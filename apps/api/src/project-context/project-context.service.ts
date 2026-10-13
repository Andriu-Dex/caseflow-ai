import type { ApprovalOrigin } from '@caseflow-ai/contracts';
import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  type OnApplicationBootstrap,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import {
  projectContextGenerationContentSchema,
  type ProjectContextCandidate,
  type ProjectContextGenerationJob,
  type ProjectContextRequest,
  type ProjectContextResponse,
} from '@caseflow-ai/contracts';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { provenanceGuard, sourceStatuses } from '../projects/source-statuses';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { planContextInput } from './context-input';
import { DEFAULT_CAPACITY_TOKENS } from '../sources/source-report-plan';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';

const logger = new Logger('ProjectContextService');
const CONTEXT_PROMPT_KEY = 'project-context.generate';
// How often a running generation writes its progress (a streamed answer
// reports every few characters).
const PROGRESS_INTERVAL_MS = 1_500;
// Recent successful proposals give the expected size and duration.
const EXPECTATION_SAMPLE = 5;

// The context prompt's instructions and schema take about this much; the
// sources share the rest, up to a ceiling that keeps a very large provider
// from spending its quota on one proposal.
const CONTEXT_PROMPT_RESERVE_TOKENS = 2_500;
const MAX_CONTEXT_INPUT_TOKENS = 100_000;

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
      sources: {
        include: { sourceVersion: { include: { artifact: true } } },
      },
    },
  },
} satisfies Prisma.ArtifactVersionInclude;

type ContextVersion = Prisma.ArtifactVersionGetPayload<{ include: typeof contextInclude }>;
type Transaction = Prisma.TransactionClient;

@Injectable()
export class ProjectContextService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}

  // A generation runs inside this API process, so one still open when the
  // process starts was cut off by a restart.
  async onApplicationBootstrap() {
    try {
      await this.prisma.contextGenerationJob.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] }, updatedAt: { lt: new Date() } },
        data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
      });
    } catch (error) {
      logger.warn(
        `Could not close interrupted context generations: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  // DEC-132: the proposal is generated in the background, so a long one
  // survives leaving or reloading the page. One generation per project at a
  // time: asking again while one runs returns it.
  // ponytail: runs in this API process; a restart cuts it off (marked above).
  async startGeneration(projectId: string): Promise<ProjectContextGenerationJob> {
    if (!(await this.prisma.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const running = await this.prisma.contextGenerationJob.findFirst({
      where: { projectId, status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (running) return this.latestGeneration(projectId).then((latest) => latest.job!);
    const recent = await this.prisma.aIRun.findMany({
      where: { promptKey: CONTEXT_PROMPT_KEY, status: 'SUCCEEDED', outputTokens: { not: null } },
      orderBy: { startedAt: 'desc' },
      take: EXPECTATION_SAMPLE,
      select: { outputTokens: true, latencyMs: true },
    });
    const average = (values: (number | null)[]) => {
      const known = values.filter((value): value is number => value !== null && value > 0);
      return known.length
        ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
        : null;
    };
    const job = await this.prisma.contextGenerationJob.create({
      data: {
        projectId,
        expectedOutputTokens: average(recent.map((run) => run.outputTokens)),
        expectedDurationMs: average(recent.map((run) => run.latencyMs)),
      },
    });
    void this.runGeneration(job.id, projectId);
    return this.latestGeneration(projectId).then((latest) => latest.job!);
  }

  async latestGeneration(projectId: string): Promise<{ job: ProjectContextGenerationJob | null }> {
    const job = await this.prisma.contextGenerationJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { candidate: true },
    });
    if (!job) return { job: null };
    const candidate = job.candidate;
    return {
      job: {
        id: job.id,
        status: job.status as ProjectContextGenerationJob['status'],
        outputChars: job.outputChars,
        expectedOutputTokens: job.expectedOutputTokens,
        expectedDurationMs: job.expectedDurationMs,
        errorMessage: job.errorMessage,
        candidate: candidate
          ? {
              id: candidate.id,
              projectId: candidate.projectId,
              aiRunId: candidate.aiRunId,
              content: candidate.content as ProjectContextCandidate['content'],
              sourceVersionIds: candidate.sourceVersionIds as string[],
              reportSourceVersionIds: candidate.reportSourceVersionIds as string[],
              partialSourceVersionIds: candidate.partialSourceVersionIds as string[],
              createdAt: candidate.createdAt.toISOString(),
            }
          : null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    };
  }

  // Always leaves the job finished, so the page never waits forever.
  private async runGeneration(jobId: string, projectId: string): Promise<void> {
    let lastWrite = 0;
    let pending: Promise<unknown> = Promise.resolve();
    const onProgress = (outputChars: number) => {
      const now = Date.now();
      if (now - lastWrite < PROGRESS_INTERVAL_MS) return;
      lastWrite = now;
      pending = pending.then(() =>
        this.prisma.contextGenerationJob
          .update({ where: { id: jobId }, data: { outputChars } })
          .catch(() => undefined),
      );
    };
    try {
      await this.prisma.contextGenerationJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });
      const candidate = await this.generate(projectId, onProgress);
      await pending;
      await this.prisma.contextGenerationJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', candidateId: candidate.id },
      });
    } catch (error) {
      await pending;
      // HTTP errors carry the user-facing message (the provider's too).
      const message =
        error instanceof HttpException
          ? error.message
          : 'No se pudo generar el contexto con IA en este momento. Puede completarlo manualmente.';
      await this.prisma.contextGenerationJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: message } })
        .catch((cause: unknown) =>
          logger.warn(`Context generation "${jobId}" left unfinished: ${String(cause)}`),
        );
    }
  }

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

  // Exact-version lookup, used by Export (spec Phase H) which selects its own
  // authoritative version via FirstDeliverableSnapshotService rather than
  // always taking the latest version regardless of status (getCurrent above).
  async getVersion(projectId: string, artifactId: string, versionId: string) {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: artifactId, projectId, artifactTypeCode: PROJECT_CONTEXT_TYPE },
      include: { versions: { where: { id: versionId }, take: 1, include: contextInclude } },
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
    // HUMAN_BULK for an EXPRESS bulk approval (DEC-116); otherwise the
    // database records HUMAN, or AUTOMATIC in BUILD_ONLY.
    approvalOrigin?: ApprovalOrigin,
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
    return provenanceGuard(
      this.prisma.artifactVersion.update({
        where: { id: versionId },
        data: {
          status,
          submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
          approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
          approvalOrigin: status === 'APPROVED' ? approvalOrigin : undefined,
        },
      }),
    );
  }

  // AI-assisted pre-fill (spec §5): drafts a Context candidate from this
  // project's approved Source knowledge, for the reviewer to edit and submit
  // through the ordinary create/createVersion path — never persisted as the
  // canonical context by itself.
  async generate(
    projectId: string,
    onProgress?: (outputChars: number) => void,
  ): Promise<ProjectContextCandidate> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, language: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');

    const approvedSources = await this.prisma.artifactVersion.findMany({
      where: {
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: 'PROJECT_SOURCE' },
      },
      include: { artifact: true, sourceDetail: { include: { report: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // A source can have several APPROVED versions over time (the older ones
    // stay APPROVED — immutable history, never un-approved); only the latest
    // one is still current knowledge, so only it may back a new context.
    const latestPerArtifact = new Map<string, (typeof approvedSources)[number]>();
    for (const version of approvedSources) {
      const current = latestPerArtifact.get(version.artifactId);
      if (!current || version.versionNumber > current.versionNumber)
        latestPerArtifact.set(version.artifactId, version);
    }
    const usable = [...latestPerArtifact.values()].filter((v) => v.sourceDetail?.extractedText);
    if (usable.length === 0)
      throw new UnprocessableEntityException(
        'Se requiere al menos una fuente de proyecto APPROVED con conocimiento utilizable.',
      );

    // DEC-127: a bounded input. Every source keeps its report (DEC-124,
    // guidance only); the text is shared fairly, long sources as excerpts.
    const input = planContextInput(
      usable.map((v) => ({
        versionId: v.id,
        code: v.artifact.code,
        title: v.title,
        text: v.sourceDetail!.extractedText!,
        ...(v.sourceDetail!.report ? { report: v.sourceDetail!.report.content } : {}),
      })),
      Math.min(
        MAX_CONTEXT_INPUT_TOKENS,
        (this.ai.maxInputTokens ?? DEFAULT_CAPACITY_TOKENS) - CONTEXT_PROMPT_RESERVE_TOKENS,
      ),
    );
    try {
      const result = await this.ai.generateStructured({
        projectId,
        language: project.language,
        promptKey: CONTEXT_PROMPT_KEY,
        promptVersion: 4,
        messages: [{ role: 'user', content: JSON.stringify(input.entries) }],
        outputSchema: projectContextGenerationContentSchema,
        schemaName: 'project_context_generation',
        // A detailed source lists dozens of needs, rules and qualities; 4096
        // made the proposal summarize them away (DEC-131).
        maxOutputTokens: 16_384,
        onProgress,
      });
      const sourceVersionIds = usable.map((v) => v.id);
      // Recorded so the proposal can be audited: which reports guided it.
      const reportSourceVersionIds = usable.filter((v) => v.sourceDetail!.report).map((v) => v.id);
      const candidate = await this.prisma.projectContextCandidate.create({
        data: {
          projectId,
          aiRunId: result.metadata.runId,
          content: result.data,
          sourceVersionIds,
          reportSourceVersionIds,
          partialSourceVersionIds: input.partialVersionIds,
        },
      });
      return {
        id: candidate.id,
        projectId: candidate.projectId,
        aiRunId: candidate.aiRunId,
        content: result.data,
        sourceVersionIds,
        reportSourceVersionIds,
        partialSourceVersionIds: input.partialVersionIds,
        createdAt: candidate.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  private async insertSnapshot(
    tx: Transaction,
    artifactId: string,
    projectId: string,
    versionNumber: number,
    input: ProjectContextRequest,
  ): Promise<ContextVersion> {
    const sourceVersionIds = [...new Set(input.sourceVersionIds ?? [])];
    if (sourceVersionIds.length) {
      const sources = await tx.artifactVersion.findMany({
        where: {
          id: { in: sourceVersionIds },
          projectId,
          status: { in: await sourceStatuses(tx, projectId) },
          artifact: { artifactTypeCode: 'PROJECT_SOURCE' },
        },
        select: { id: true, artifactId: true },
      });
      if (sources.length !== sourceVersionIds.length)
        throw new UnprocessableEntityException(
          'Las fuentes referenciadas deben ser versiones exactas APPROVED de Project Source del mismo proyecto.',
        );
      // Exactly one version per source: citing two versions of the same
      // source at once is never meaningful provenance (the newer one
      // supersedes the older), and would make staleness permanently
      // contradict itself — "up to date" and "has a newer version" at once.
      const artifactIds = sources.map((s) => s.artifactId);
      if (new Set(artifactIds).size !== artifactIds.length)
        throw new UnprocessableEntityException(
          'Cada fuente debe aparecer una sola vez, con su versión aprobada vigente.',
        );
    }
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
            sources: { create: sourceVersionIds.map((sourceVersionId) => ({ sourceVersionId })) },
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
      sources: detail.sources.map((link) => ({
        id: link.sourceVersion.artifact.id,
        versionId: link.sourceVersionId,
        code: link.sourceVersion.artifact.code,
        title: link.sourceVersion.title,
      })),
    };
  }

  private isUniqueViolation(error: unknown): error is { code: 'P2002' } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
