import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import type { ApprovalOrigin } from '@caseflow-ai/contracts';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  canTransitionArtifactVersionStatus,
  initialStatusForOrigin,
  MOCKUP_GENERATION_QUEUE,
  type MockupGenerationJobPayload,
} from '@caseflow-ai/domain';
import {
  designThemeContentSchema,
  uiBlueprintContentSchema,
  type ArtifactVersionStatus,
  type DesignThemeContent,
  type MockupDeviceType,
  type MockupJobResponse,
} from '@caseflow-ai/contracts';
import { provenanceGuard, sourceStatuses } from '../projects/source-statuses';
import { PrismaService } from '../database/prisma.service';
import { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import type { Prisma } from '../generated/prisma/client';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';
import {
  MockupProviderError,
  type MockupGenerationResult,
  type MockupProvider,
  type ScreenGenerator,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import { MOCKUP_GENERATOR_VERSION } from './mockup-renderer';
import { MOCKUP_PROVIDER } from './mockup-provider.token';
import { MOCKUP_QUEUE } from './mockup-queue.token';
import { STORAGE_PROVIDER } from './storage-provider.token';

type Tx = Prisma.TransactionClient;
const MOCKUP_CODE_PREFIX = 'MCK';
const MAX_MOCKUP_ARCHIVE_BYTES = 50_000_000;
const logger = new Logger('MockupsService');
// DEC-146: Stitch screens drawn at the same time, and times each is asked for.
const SCREEN_CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.STITCH_CONCURRENCY) || 4));
const SCREEN_ATTEMPTS = 3;

function safeFileName(value: string, fallback: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || fallback
  );
}

type StoredScreen = {
  screenLocalId: string;
  screenName: string;
  imageStorageKey: string;
  imageContentType: string;
  htmlStorageKey: string;
  stitchProjectId: string | null;
  stitchScreenId: string | null;
  refinementPrompt: string | null;
};
type StoredGeneration = (
  { kind: 'INTERNAL_WIREFRAME'; svg: string } | { kind: 'STITCH'; screens: StoredScreen[] }
) & {
  designThemeVersionId: string | null;
  // Shown with the result: why it is the internal wireframe instead of Stitch.
  notice?: string;
};

@Injectable()
export class MockupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MOCKUP_PROVIDER) private readonly mockupProvider: MockupProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MOCKUP_QUEUE) private readonly queue: Queue<MockupGenerationJobPayload>,
  ) {}

  // Creation/regeneration only enqueue the real generation (spec §40): the
  // HTTP request never blocks on Stitch's real latency. The client polls
  // getJob() until it reaches COMPLETED/FAILED.
  async create(
    projectId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType = 'DESKTOP',
  ): Promise<MockupJobResponse> {
    await this.assertApprovedBlueprint(projectId, uiBlueprintVersionId);
    await this.currentTheme(projectId);
    return this.enqueueJob(projectId, uiBlueprintVersionId, null, deviceType);
  }

  // For a route orchestration that already runs as a job (DEC-116): the
  // generation is recorded like any other job but runs inline, never queued.
  async generateNow(projectId: string, uiBlueprintVersionId: string): Promise<MockupJobResponse> {
    await this.assertApprovedBlueprint(projectId, uiBlueprintVersionId);
    await this.currentTheme(projectId);
    const job = await this.prisma.mockupGenerationJob.create({
      data: { projectId, uiBlueprintVersionId, deviceType: 'DESKTOP' },
    });
    await this.runJob(job.id);
    return this.getJob(projectId, job.id);
  }

  async version(
    projectId: string,
    mockupId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType = 'DESKTOP',
  ): Promise<MockupJobResponse> {
    await this.assertApprovedBlueprint(projectId, uiBlueprintVersionId);
    await this.currentTheme(projectId);
    const exists = await this.prisma.artifact.findFirst({
      where: { id: mockupId, projectId, artifactTypeCode: 'MOCKUP' },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Artefacto no encontrado.');
    return this.enqueueJob(projectId, uiBlueprintVersionId, mockupId, deviceType);
  }

  // Refinement = a new version of the same mockup, regenerated from the same
  // approved UI Blueprint plus the user's instruction. Only Stitch mockups
  // qualify: the internal wireframe is deterministic and has no prompt.
  async refine(projectId: string, mockupId: string, prompt: string): Promise<MockupJobResponse> {
    const detail = (await this.findLatest(projectId, mockupId)).versions[0]!.mockupDetail!;
    if (detail.generatorKind !== 'STITCH')
      throw new UnprocessableEntityException(
        'Solo los bocetos generados con Stitch pueden editarse con instrucciones.',
      );
    await this.assertApprovedBlueprint(projectId, detail.uiBlueprintVersionId);
    return this.enqueueJob(
      projectId,
      detail.uiBlueprintVersionId,
      mockupId,
      detail.deviceType,
      prompt,
    );
  }

  // Single-screen edit: Stitch edits that one screen in place; the new mockup
  // version carries every other screen over unchanged (same stored assets).
  async refineScreen(
    projectId: string,
    mockupId: string,
    screenId: string,
    prompt: string,
  ): Promise<MockupJobResponse> {
    const detail = (await this.findLatest(projectId, mockupId)).versions[0]!.mockupDetail!;
    // Only a screen of the latest version can be edited, so an old gallery
    // page can't silently fork history from a superseded version.
    const screen = detail.screens.find((s) => s.id === screenId);
    if (!screen) throw new NotFoundException('Pantalla no encontrada.');
    if (detail.generatorKind !== 'STITCH' || !screen.stitchProjectId || !screen.stitchScreenId)
      throw new UnprocessableEntityException(
        'Esta pantalla no se puede editar individualmente. Regenere el boceto con Stitch para habilitarlo.',
      );
    await this.assertApprovedBlueprint(projectId, detail.uiBlueprintVersionId);
    return this.enqueueJob(
      projectId,
      detail.uiBlueprintVersionId,
      mockupId,
      detail.deviceType,
      prompt,
      screen.screenLocalId,
    );
  }

  private async enqueueJob(
    projectId: string,
    uiBlueprintVersionId: string,
    existingMockupId: string | null,
    deviceType: MockupDeviceType,
    refinementPrompt: string | null = null,
    screenLocalId: string | null = null,
  ): Promise<MockupJobResponse> {
    // DEC-146: the same request after a run that stopped with screens already
    // drawn continues that run, so only the missing screens are asked for.
    const resumable = screenLocalId
      ? null
      : await this.prisma.mockupGenerationJob.findFirst({
          where: {
            projectId,
            uiBlueprintVersionId,
            existingMockupId,
            deviceType,
            refinementPrompt,
            screenLocalId: null,
            status: 'FAILED',
            parts: { some: {} },
          },
          orderBy: { createdAt: 'desc' },
        });
    if (resumable) {
      const resumed = await this.prisma.mockupGenerationJob.update({
        where: { id: resumable.id },
        data: { status: 'QUEUED', errorMessage: null },
      });
      await this.queue.add(MOCKUP_GENERATION_QUEUE, { jobId: resumed.id, projectId });
      return this.mapJob(resumed);
    }
    const job = await this.prisma.mockupGenerationJob.create({
      data: {
        projectId,
        uiBlueprintVersionId,
        existingMockupId,
        deviceType,
        refinementPrompt,
        ...(screenLocalId ? { screenLocalId } : {}),
      },
    });
    await this.queue.add(MOCKUP_GENERATION_QUEUE, { jobId: job.id, projectId });
    return this.mapJob(job);
  }

  // The page follows a generation that is still running after it is reopened.
  async latestJob(projectId: string): Promise<{ job: MockupJobResponse | null }> {
    const job = await this.prisma.mockupGenerationJob.findFirst({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    return { job: job ? this.mapJob(job) : null };
  }

  async getJob(projectId: string, jobId: string): Promise<MockupJobResponse> {
    const job = await this.prisma.mockupGenerationJob.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return this.mapJob(job);
  }

  // A mockup still RUNNING when the API starts was cut off by a restart. It is
  // not repeated automatically (Stitch is slow, has a quota and may already
  // have produced it): the person generates it again.
  async markInterrupted(bootedAt: Date): Promise<number> {
    const { count } = await this.prisma.mockupGenerationJob.updateMany({
      where: { status: 'RUNNING', updatedAt: { lt: bootedAt } },
      data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
    });
    return count;
  }

  // A job still QUEUED when the API starts may never run: the worker's call
  // that should have started it can fail while the API is down (the queue
  // then counts that delivery as done). Enqueuing it again is safe, because
  // runJob only picks up a job that is still QUEUED.
  async requeuePending(): Promise<number> {
    const pending = await this.prisma.mockupGenerationJob.findMany({
      where: { status: 'QUEUED' },
      select: { id: true, projectId: true },
    });
    for (const job of pending)
      await this.queue.add(MOCKUP_GENERATION_QUEUE, { jobId: job.id, projectId: job.projectId });
    return pending.length;
  }

  // Invoked only by the worker's authenticated internal callback (never
  // reachable from the browser) — runs the actual generation this job
  // describes and always leaves the job in a terminal status, even on an
  // unexpected failure, so polling never hangs on RUNNING forever.
  async runJob(jobId: string): Promise<void> {
    // Only a QUEUED job is picked up: a redelivered job (or one already marked
    // as interrupted) must not run again behind the user's back.
    const { count } = await this.prisma.mockupGenerationJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (!count) return;
    const job = await this.prisma.mockupGenerationJob.findUniqueOrThrow({ where: { id: jobId } });
    try {
      const screenEdit = Boolean(job.screenLocalId && job.existingMockupId && job.refinementPrompt);
      const generated = screenEdit
        ? await this.editOneScreen(
            job.projectId,
            job.existingMockupId!,
            job.screenLocalId!,
            job.refinementPrompt!,
            job.deviceType,
          )
        : await this.generateFromApprovedBlueprint(
            job.projectId,
            job.uiBlueprintVersionId,
            job.deviceType,
            job.refinementPrompt,
            job.id,
          );
      const result = await this.prisma.$transaction((tx) =>
        job.existingMockupId
          ? this.createVersionInTx(
              tx,
              job.projectId,
              job.existingMockupId!,
              job.uiBlueprintVersionId,
              job.deviceType,
              generated,
              // A screen edit records its prompt on that screen, not the version.
              screenEdit ? null : job.refinementPrompt,
            )
          : this.createInTx(tx, job.projectId, job.uiBlueprintVersionId, job.deviceType, generated),
      );
      await this.prisma.mockupGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          resultArtifactId: result.id,
          ...(generated.notice ? { errorMessage: generated.notice } : {}),
        },
      });
    } catch (error) {
      const message =
        error instanceof ServiceUnavailableException ||
        error instanceof UnprocessableEntityException
          ? ((error.getResponse() as { message?: string })?.message ?? error.message)
          : 'No se pudo generar el boceto.';
      logger.warn(
        `Mockup job "${jobId}" failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.mockupGenerationJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: message },
      });
    }
  }

  private mapJob(job: {
    id: string;
    projectId: string;
    status: string;
    resultArtifactId: string | null;
    errorMessage: string | null;
    completedScreens?: number;
    totalScreens?: number;
    createdAt: Date;
    updatedAt: Date;
  }): MockupJobResponse {
    return {
      id: job.id,
      projectId: job.projectId,
      status: job.status as MockupJobResponse['status'],
      resultArtifactId: job.resultArtifactId,
      errorMessage: job.errorMessage,
      completedScreens: job.completedScreens ?? 0,
      totalScreens: job.totalScreens ?? 0,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private async assertApprovedBlueprint(
    projectId: string,
    uiBlueprintVersionId: string,
  ): Promise<void> {
    const source = await this.prisma.artifactVersion.findFirst({
      where: {
        id: uiBlueprintVersionId,
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: 'UI_BLUEPRINT' },
      },
      select: { id: true },
    });
    if (!source)
      throw new UnprocessableEntityException(
        'Se requiere una versión exacta APPROVED de plano de interfaz del mismo proyecto.',
      );
  }

  // DEC-118: mockups are painted with the project's current approved theme.
  // Projects that require one cannot generate mockups without it; older
  // projects without a theme keep the standard design (null).
  private async currentTheme(
    projectId: string,
  ): Promise<{ versionId: string; content: DesignThemeContent } | null> {
    const [approvedTheme, project] = await Promise.all([
      new FirstDeliverableSnapshotService(this.prisma).approvedArtifactVersion(
        projectId,
        'DESIGN_THEME',
      ),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { designThemeRequired: true, workflowRoute: true },
      }),
    ]);
    // DEC-119: in EXPRESS the latest theme draft is a provisional source.
    const theme =
      approvedTheme ??
      (project?.workflowRoute === 'EXPRESS'
        ? await this.prisma.artifactVersion
            .findFirst({
              where: {
                projectId,
                status: { in: await sourceStatuses(this.prisma, projectId) },
                artifact: { artifactTypeCode: 'DESIGN_THEME', archivedAt: null },
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            })
            .then((version) => (version ? { versionId: version.id } : null))
        : null);
    if (!theme) {
      if (project?.designThemeRequired)
        throw new UnprocessableEntityException(
          'Apruebe el tema y los colores antes de generar los bocetos.',
        );
      return null;
    }
    const detail = await this.prisma.structuredAnalysisDetail.findUniqueOrThrow({
      where: { artifactVersionId: theme.versionId },
    });
    return { versionId: theme.versionId, content: designThemeContentSchema.parse(detail.content) };
  }

  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP', archivedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: { include: { screens: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }

  async get(projectId: string, mockupId: string) {
    const row = await this.findLatest(projectId, mockupId);
    return this.map(row, row.versions[0]!);
  }

  // Authoritative collection for Export (spec Phase H): APPROVED mockups
  // derived exactly from the selected authoritative UI Blueprint version —
  // never a mockup left over from a superseded blueprint version.
  async listApprovedForBlueprint(projectId: string, uiBlueprintVersionId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP', versions: { some: { status: 'APPROVED' } } },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: { include: { screens: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return rows
      .filter((row) => row.versions[0]?.mockupDetail?.uiBlueprintVersionId === uiBlueprintVersionId)
      .map((row) => {
        const version = row.versions[0]!;
        const detail = version.mockupDetail!;
        return {
          id: row.id,
          projectId: row.projectId,
          code: row.code,
          versionId: version.id,
          uiBlueprintVersionId: detail.uiBlueprintVersionId,
          deviceType: detail.deviceType,
          svg: detail.svg,
          generatorKind: detail.generatorKind,
          screens:
            detail.generatorKind === 'STITCH'
              ? this.screenLinks(projectId, row.id, detail.screens)
              : null,
          refinementPrompt: detail.refinementPrompt,
          createdAt: version.createdAt.toISOString(),
        };
      });
  }

  async getPreview(projectId: string, mockupId: string) {
    const row = await this.findLatest(projectId, mockupId);
    const version = row.versions[0]!;
    const detail = version.mockupDetail!;
    return {
      id: row.id,
      projectId: row.projectId,
      code: row.code,
      versionId: version.id,
      uiBlueprintVersionId: detail.uiBlueprintVersionId,
      deviceType: detail.deviceType,
      generatorKind: detail.generatorKind,
      svg: detail.svg,
      screens:
        detail.generatorKind === 'STITCH'
          ? this.screenLinks(projectId, row.id, detail.screens)
          : null,
      refinementPrompt: detail.refinementPrompt,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private async createVersionInTx(
    tx: Tx,
    projectId: string,
    mockupId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType,
    generated: StoredGeneration,
    refinementPrompt: string | null = null,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM artifacts WHERE id=${mockupId}::uuid AND project_id=${projectId}::uuid AND artifact_type_code='MOCKUP' FOR NO KEY UPDATE`;
    if (!locked.length) throw new NotFoundException('Artefacto no encontrado.');
    const latest = await tx.artifactVersion.findFirstOrThrow({
      where: { artifactId: mockupId },
      orderBy: { versionNumber: 'desc' },
    });
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: mockupId,
        projectId,
        versionNumber: latest.versionNumber + 1,
        title: latest.title,
        status: initialStatusForOrigin('SYSTEM_GENERATED'),
        origin: 'SYSTEM_GENERATED',
      },
    });
    await this.saveDetail(
      tx,
      version.id,
      uiBlueprintVersionId,
      deviceType,
      generated,
      refinementPrompt,
    );
    return this.loadAndMap(tx, mockupId, version.id);
  }

  async transition(
    projectId: string,
    artifactId: string,
    versionId: string,
    status: ArtifactVersionStatus,
    // HUMAN_BULK for an EXPRESS bulk approval (DEC-116); otherwise the
    // database records HUMAN, or AUTOMATIC in BUILD_ONLY.
    approvalOrigin?: ApprovalOrigin,
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: versionId, projectId, artifactId, artifact: { artifactTypeCode: 'MOCKUP' } },
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

  // Rendered/sanitized before any transaction opens, matching the established
  // "no network/CPU-heavy work under a DB lock" pattern used elsewhere.
  private async generateFromApprovedBlueprint(
    projectId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType,
    refinementPrompt: string | null = null,
    jobId: string | null = null,
  ): Promise<StoredGeneration> {
    const source = await this.prisma.artifactVersion.findFirst({
      where: {
        id: uiBlueprintVersionId,
        projectId,
        status: { in: await sourceStatuses(this.prisma, projectId) },
        artifact: { artifactTypeCode: 'UI_BLUEPRINT' },
      },
      include: { structuredAnalysisDetail: true },
    });
    if (!source?.structuredAnalysisDetail)
      throw new UnprocessableEntityException(
        'Se requiere una versión exacta APPROVED de plano de interfaz del mismo proyecto.',
      );
    const content = uiBlueprintContentSchema.parse(source.structuredAnalysisDetail.content);
    const theme = await this.currentTheme(projectId);
    const designThemeVersionId = theme?.versionId ?? null;
    const generator = this.mockupProvider.screens;
    if (generator && jobId)
      return this.generateScreenByScreen(
        jobId,
        projectId,
        content,
        deviceType,
        refinementPrompt,
        theme?.content,
        designThemeVersionId,
        generator,
      );
    let generated: MockupGenerationResult;
    try {
      generated = await this.mockupProvider.generate(
        content,
        deviceType,
        refinementPrompt ?? undefined,
        theme?.content,
      );
    } catch (error) {
      if (error instanceof MockupProviderError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
    // A fallback wireframe would silently drop the user's instruction.
    if (refinementPrompt && generated.kind !== 'STITCH')
      throw new ServiceUnavailableException(
        'Stitch no está disponible; no se pudo aplicar la edición del boceto.',
      );
    if (generated.kind === 'INTERNAL_WIREFRAME')
      return { kind: generated.kind, svg: sanitizeDiagramSvg(generated.svg), designThemeVersionId };
    if (
      generated.screens.length !== content.screens.length ||
      new Set(generated.screens.map((screen) => screen.screenLocalId)).size !==
        content.screens.length
    )
      throw new ServiceUnavailableException('El proveedor devolvió pantallas incompletas.');
    const expectedIds = new Set(content.screens.map((screen) => screen.localId));
    if (generated.screens.some((screen) => !expectedIds.has(screen.screenLocalId)))
      throw new ServiceUnavailableException('El proveedor devolvió pantallas inesperadas.');
    const screens: StoredGeneration & { kind: 'STITCH' } = {
      kind: 'STITCH',
      screens: [],
      designThemeVersionId,
    };
    for (const screen of generated.screens)
      screens.screens.push({
        screenLocalId: screen.screenLocalId,
        screenName: screen.screenName,
        ...(await this.storeScreenAssets(projectId, screen.image, screen.html)),
        stitchProjectId: screen.providerRef?.projectId ?? null,
        stitchScreenId: screen.providerRef?.screenId ?? null,
        refinementPrompt: null,
      });
    return screens;
  }

  // DEC-146: Stitch draws a screen in about two minutes, so a mockup of many
  // screens is drawn a few at a time, each with its own time limit and asked
  // for again when it fails. Each screen is kept as soon as it arrives (files
  // in storage, a row per screen), so a run that stops — a failure, a restart —
  // continues with the missing screens when the person generates it again.
  // Only when no screen at all could be drawn does the mockup fall back to the
  // internal wireframe, and the result says why.
  private async generateScreenByScreen(
    jobId: string,
    projectId: string,
    content: ReturnType<typeof uiBlueprintContentSchema.parse>,
    deviceType: MockupDeviceType,
    refinementPrompt: string | null,
    theme: DesignThemeContent | undefined,
    designThemeVersionId: string | null,
    generator: ScreenGenerator,
  ): Promise<StoredGeneration> {
    const job = await this.prisma.mockupGenerationJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { parts: true },
    });
    const wanted = new Set(content.screens.map((screen) => screen.localId));
    const done = new Map(
      job.parts
        .filter((part) => wanted.has(part.screenLocalId))
        .map((part) => [part.screenLocalId, part]),
    );
    await this.prisma.mockupGenerationJob.update({
      where: { id: jobId },
      data: { totalScreens: content.screens.length, completedScreens: done.size },
    });
    const pending = content.screens.filter((screen) => !done.has(screen.localId));
    const failures: { name: string; error: unknown }[] = [];
    let stitchProjectId = job.stitchProjectId;
    try {
      if (pending.length && !stitchProjectId) {
        stitchProjectId = await generator.createProject(`CASEFlow ${new Date().toISOString()}`);
        await this.prisma.mockupGenerationJob.update({
          where: { id: jobId },
          data: { stitchProjectId },
        });
      }
    } catch (error) {
      failures.push({ name: 'proyecto', error });
    }
    let next = 0;
    const drawNext = async () => {
      while (stitchProjectId && next < pending.length) {
        const screen = pending[next++]!;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < SCREEN_ATTEMPTS; attempt += 1) {
          try {
            const drawn = await generator.generateScreen(
              stitchProjectId,
              screen,
              deviceType,
              refinementPrompt ?? undefined,
              theme,
            );
            const assets = await this.storeScreenAssets(projectId, drawn.image, drawn.html);
            const part = await this.prisma.mockupGenerationPart.create({
              data: {
                jobId,
                screenLocalId: screen.localId,
                screenName: drawn.screenName,
                ...assets,
                stitchProjectId: drawn.providerRef?.projectId ?? stitchProjectId,
                stitchScreenId: drawn.providerRef?.screenId ?? null,
              },
            });
            done.set(screen.localId, part);
            await this.prisma.mockupGenerationJob.update({
              where: { id: jobId },
              data: { completedScreens: { increment: 1 } },
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (lastError) {
          failures.push({ name: screen.name, error: lastError });
          logger.warn(
            `Mockup screen "${screen.localId}" of job "${jobId}" failed: ${
              lastError instanceof Error ? lastError.message : String(lastError)
            }`,
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SCREEN_CONCURRENCY, Math.max(pending.length, 1)) }, drawNext),
    );

    if (failures.length) {
      const reason =
        failures[0]!.error instanceof MockupProviderError
          ? failures[0]!.error.message
          : 'El proveedor de bocetos no está disponible.';
      // Nothing drawn and nothing to keep: the internal wireframe, as before.
      if (!done.size && !refinementPrompt && this.mockupProvider.generateFallback) {
        const fallback = await this.mockupProvider.generateFallback(content, deviceType, theme);
        if (fallback.kind === 'INTERNAL_WIREFRAME')
          return {
            kind: 'INTERNAL_WIREFRAME',
            svg: sanitizeDiagramSvg(fallback.svg),
            designThemeVersionId,
            notice: `Stitch no generó ninguna pantalla (${reason}); se creó el esquema interno.`,
          };
      }
      const missing = content.screens.length - done.size;
      const names = failures
        .filter((failure) => failure.name !== 'proyecto')
        .slice(0, 3)
        .map((failure) => `«${failure.name}»`)
        .join(', ');
      throw new ServiceUnavailableException(
        `Faltan ${missing} de ${content.screens.length} pantallas${names ? ` (${names}${missing > 3 ? ' y otras' : ''})` : ''}: ${reason} Vuelva a generar el boceto para completarlas; las ${done.size} ya generadas se conservan.`,
      );
    }
    return {
      kind: 'STITCH',
      designThemeVersionId,
      screens: content.screens.map((screen) => {
        const part = done.get(screen.localId)!;
        return {
          screenLocalId: part.screenLocalId,
          screenName: part.screenName,
          imageStorageKey: part.imageStorageKey,
          imageContentType: part.imageContentType,
          htmlStorageKey: part.htmlStorageKey,
          stitchProjectId: part.stitchProjectId,
          stitchScreenId: part.stitchScreenId,
          refinementPrompt: null,
        };
      }),
    };
  }

  // Edits one screen at the provider and returns the full screen set for the
  // next version: the edited screen replaced, the rest copied as-is (same
  // storage keys, so their files are shared with the previous version).
  private async editOneScreen(
    projectId: string,
    mockupId: string,
    screenLocalId: string,
    prompt: string,
    deviceType: MockupDeviceType,
  ): Promise<StoredGeneration> {
    const detail = (await this.findLatest(projectId, mockupId)).versions[0]!.mockupDetail!;
    const target = detail.screens.find((s) => s.screenLocalId === screenLocalId);
    if (detail.generatorKind !== 'STITCH' || !target?.stitchProjectId || !target.stitchScreenId)
      throw new UnprocessableEntityException('Esta pantalla no se puede editar individualmente.');
    if (!this.mockupProvider.editScreen)
      throw new ServiceUnavailableException('Stitch no está disponible para editar la pantalla.');
    let edited;
    try {
      edited = await this.mockupProvider.editScreen(
        { projectId: target.stitchProjectId, screenId: target.stitchScreenId },
        prompt,
        deviceType,
      );
    } catch (error) {
      if (error instanceof MockupProviderError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
    const assets = await this.storeScreenAssets(projectId, edited.image, edited.html);
    return {
      kind: 'STITCH',
      // An in-place edit keeps the palette the screens were painted with.
      designThemeVersionId: detail.designThemeVersionId,
      screens: detail.screens.map((s) =>
        s.id === target.id
          ? {
              screenLocalId: s.screenLocalId,
              screenName: s.screenName,
              ...assets,
              stitchProjectId: edited.providerRef.projectId,
              stitchScreenId: edited.providerRef.screenId,
              refinementPrompt: prompt,
            }
          : {
              screenLocalId: s.screenLocalId,
              screenName: s.screenName,
              imageStorageKey: s.imageStorageKey,
              imageContentType: s.imageContentType,
              htmlStorageKey: s.htmlStorageKey,
              stitchProjectId: s.stitchProjectId,
              stitchScreenId: s.stitchScreenId,
              refinementPrompt: s.refinementPrompt,
            },
      ),
    };
  }

  private async storeScreenAssets(
    projectId: string,
    image: { body: Buffer; contentType: string },
    html: string,
  ) {
    const extension =
      image.contentType === 'image/jpeg'
        ? 'jpg'
        : image.contentType === 'image/webp'
          ? 'webp'
          : 'png';
    const prefix = `mockups/${projectId}/${randomUUID()}`;
    const imageStorageKey = `${prefix}.${extension}`;
    const htmlStorageKey = `${prefix}.html`;
    try {
      await this.storage.putObject({
        key: imageStorageKey,
        body: image.body,
        contentType: image.contentType,
      });
      await this.storage.putObject({
        key: htmlStorageKey,
        body: Buffer.from(html, 'utf8'),
        contentType: 'text/html',
      });
    } catch {
      throw new ServiceUnavailableException('No se pudieron guardar los archivos del boceto.');
    }
    return { imageStorageKey, imageContentType: image.contentType, htmlStorageKey };
  }

  private async createInTx(
    tx: Tx,
    projectId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType,
    generated: StoredGeneration,
  ) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const number = await this.allocate(tx, projectId, MOCKUP_CODE_PREFIX);
    const artifact = await tx.artifact.create({
      data: {
        projectId,
        artifactTypeCode: 'MOCKUP',
        code: `${MOCKUP_CODE_PREFIX}-${String(number).padStart(3, '0')}`,
      },
    });
    // Internal or Stitch derivation from an approved UI Blueprint; both remain
    // SYSTEM_GENERATED candidates requiring human review.
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title: 'Boceto',
        status: initialStatusForOrigin('SYSTEM_GENERATED'),
        origin: 'SYSTEM_GENERATED',
      },
    });
    await this.saveDetail(tx, version.id, uiBlueprintVersionId, deviceType, generated);
    return this.loadAndMap(tx, artifact.id, version.id);
  }

  private async findLatest(projectId: string, mockupId: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id: mockupId, projectId, artifactTypeCode: 'MOCKUP' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: { include: { screens: true } } },
        },
      },
    });
    if (!row?.versions[0]?.mockupDetail) throw new NotFoundException('Artefacto no encontrado.');
    return row;
  }

  private async allocate(tx: Tx, projectId: string, prefix: string) {
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,${prefix},1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    return rows[0]!.last_number;
  }

  private async saveDetail(
    tx: Tx,
    versionId: string,
    uiBlueprintVersionId: string,
    deviceType: MockupDeviceType,
    generated: StoredGeneration,
    refinementPrompt: string | null = null,
  ) {
    await tx.mockupDetail.create({
      data: {
        artifactVersionId: versionId,
        uiBlueprintVersionId,
        deviceType,
        refinementPrompt,
        designThemeVersionId: generated.designThemeVersionId,
        generatorKind: generated.kind,
        generatorVersion:
          generated.kind === 'STITCH' ? 'stitch-sdk-0.3.5' : MOCKUP_GENERATOR_VERSION,
        svg: generated.kind === 'INTERNAL_WIREFRAME' ? generated.svg : null,
        ...(generated.kind === 'STITCH' ? { screens: { create: generated.screens } } : {}),
      },
    });
  }

  private screenLinks(
    projectId: string,
    mockupId: string,
    screens: {
      id: string;
      screenLocalId: string;
      screenName: string;
      stitchProjectId?: string | null;
      stitchScreenId?: string | null;
      refinementPrompt?: string | null;
    }[],
  ) {
    return screens.map((screen) => ({
      id: screen.id,
      screenLocalId: screen.screenLocalId,
      screenName: screen.screenName,
      imageUrl: `/projects/${projectId}/mockups/${mockupId}/screens/${screen.id}/image`,
      htmlUrl: `/projects/${projectId}/mockups/${mockupId}/screens/${screen.id}/html`,
      editable: Boolean(screen.stitchProjectId && screen.stitchScreenId),
      refinementPrompt: screen.refinementPrompt ?? null,
    }));
  }

  private async findScreen(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.prisma.mockupScreenDetail.findFirst({
      where: {
        id: screenId,
        mockup: {
          artifactVersion: {
            projectId,
            artifactId: mockupId,
            artifact: { artifactTypeCode: 'MOCKUP' },
          },
        },
      },
    });
    if (!screen) throw new NotFoundException('Pantalla no encontrada.');
    return screen;
  }

  async downloadScreenImage(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.findScreen(projectId, mockupId, screenId);
    const extension =
      screen.imageContentType === 'image/jpeg'
        ? 'jpg'
        : screen.imageContentType === 'image/webp'
          ? 'webp'
          : 'png';
    return {
      body: await this.storage.getObject(screen.imageStorageKey),
      contentType: screen.imageContentType,
      fileName: `${safeFileName(screen.screenName, 'pantalla')}.${extension}`,
    };
  }

  async downloadMockupScreensZip(projectId: string, mockupId: string) {
    const mockup = await this.findLatest(projectId, mockupId);
    const detail = mockup.versions[0]!.mockupDetail!;
    const screens = detail.generatorKind === 'STITCH' ? detail.screens : [];
    if (screens.length === 0) throw new NotFoundException('No hay imágenes para descargar.');

    const zip = new JSZip();
    let archiveSourceBytes = 0;
    for (const [index, screen] of screens.entries()) {
      const extension =
        screen.imageContentType === 'image/jpeg'
          ? 'jpg'
          : screen.imageContentType === 'image/webp'
            ? 'webp'
            : 'png';
      const safeName = safeFileName(screen.screenName, `pantalla-${index + 1}`);
      const body = await this.storage.getObject(screen.imageStorageKey);
      archiveSourceBytes += body.length;
      if (archiveSourceBytes > MAX_MOCKUP_ARCHIVE_BYTES)
        throw new PayloadTooLargeException('El archivo de pantallas supera el límite de descarga.');
      zip.file(`${String(index + 1).padStart(2, '0')}-${safeName}.${extension}`, body);
    }
    const body = await zip.generateAsync({ type: 'nodebuffer' });
    return { body, fileName: `${mockup.code}-pantallas.zip` };
  }

  async downloadScreenHtml(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.findScreen(projectId, mockupId, screenId);
    return { body: await this.storage.getObject(screen.htmlStorageKey) };
  }

  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { mockupDetail: { include: { screens: true } } },
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
      mockupDetail: {
        uiBlueprintVersionId: string;
        designThemeVersionId: string | null;
        deviceType: MockupDeviceType;
      } | null;
    },
  ) {
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      uiBlueprintVersionId: version.mockupDetail!.uiBlueprintVersionId,
      designThemeVersionId: version.mockupDetail!.designThemeVersionId,
      deviceType: version.mockupDetail!.deviceType,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      createdAt: artifact.createdAt.toISOString(),
    };
  }
}
