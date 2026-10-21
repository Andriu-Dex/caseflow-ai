import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CONSTRUCTION_QUEUE,
  MAX_AUTO_REPAIR_ROUNDS,
  findTargetTemplate,
  type ConstructionJobPayload,
  type TargetTemplateVersion,
} from '@caseflow-ai/domain';
import {
  SandboxExecutionError,
  StorageProviderError,
  stagePassed,
  type SandboxExecutionProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import type {
  ImplementationPlanContent,
  SandboxRunResponse,
  SandboxValidationStage,
} from '@caseflow-ai/contracts';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { projectSlug } from '../code-generation/engine/project-generator';
import { AutoRepairService } from './auto-repair.service';
import { CONSTRUCTION_QUEUE_TOKEN } from './construction-queue.token';
import { DependencyCatalogService } from './dependency-catalog.service';
import { DesignBaselinesService } from './design-baselines.service';
import {
  applyPatches,
  buildArchive,
  manifestHash,
  sha256,
  planCoverageProblems,
  structuralProblems,
  firstRunProblems,
  traceabilityProblems,
  type ProjectFile,
} from './project-validation';
import { SANDBOX_EXECUTION_PROVIDER } from './sandbox-provider.token';

const logger = new Logger('SandboxRunsService');

// Generous for a cold `pnpm install` + Next.js build, bounded all the same.
const SANDBOX_LIMITS = { timeoutMs: 15 * 60_000, memoryMb: 4096, cpus: 2, pids: 2048 };
const LOCKFILE = 'pnpm-lock.yaml';
const REGISTRY_UNREACHABLE =
  /ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_FETCH_|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ERR_SOCKET_TIMEOUT|fetch failed/;

const runInclude = {
  stageResults: true,
  repairAttempt: { include: { patches: { select: { path: true } }, findings: true } },
  snapshot: { select: { id: true } },
} satisfies Prisma.SandboxRunInclude;
type RunRow = Prisma.SandboxRunGetPayload<{ include: typeof runInclude }>;

const STAGE_ORDER: SandboxValidationStage[] = [
  'INSTALL',
  'LINT',
  'TYPECHECK',
  'TEST',
  'BUILD',
  'STRUCTURE',
  'TRACEABILITY',
];

interface StageRecord {
  stage: SandboxValidationStage;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  output: string;
}

// Validation of a generated project (spec §175-§177): the TargetTemplate's own
// commands run in the sandbox, then structural and traceability checks. READY
// — and its immutable snapshot — only when every P0 stage passed.
@Injectable()
export class SandboxRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly designBaselines: DesignBaselinesService,
    private readonly catalog: DependencyCatalogService,
    private readonly autoRepair: AutoRepairService,
    @Inject(SANDBOX_EXECUTION_PROVIDER) private readonly sandbox: SandboxExecutionProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: Queue<ConstructionJobPayload>,
  ) {}

  async start(projectId: string, userId: string, generationRunId: string) {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: generationRunId, projectId },
    });
    if (!run) throw new NotFoundException('Corrida de generación no encontrada.');
    if (run.status !== 'GENERATED')
      throw new UnprocessableEntityException('Solo se puede validar una generación completada.');
    const latest = await this.prisma.sandboxRun.findFirst({
      where: { generationRunId },
      orderBy: { createdAt: 'desc' },
    });
    // Only a sandbox outage may be retried; a verdict on the code is final.
    if (latest && latest.status !== 'ERROR')
      throw new ConflictException('Esta generación ya tiene una validación en curso o terminada.');
    let created: { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.sandboxRun.create({
          data: {
            projectId,
            generationRunId,
            attemptNumber: latest?.attemptNumber ?? 1,
            createdByUserId: userId,
          },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: userId,
            action: 'SANDBOX_RUN_STARTED',
            entityType: 'SANDBOX_RUN',
            entityId: row.id,
            metadata: { generationRunId, attemptNumber: row.attemptNumber },
          },
          tx,
        );
        return row;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new ConflictException('Esta generación ya tiene una validación en curso.');
      throw error;
    }
    await this.enqueue(projectId, created.id);
    // Relations are read outside the transaction: one transaction client
    // never runs queries in parallel.
    return this.map(
      await this.prisma.sandboxRun.findUniqueOrThrow({
        where: { id: created.id },
        include: runInclude,
      }),
    );
  }

  // An attempt still RUNNING when the API starts was cut off by a restart: it
  // ends as ERROR (it says nothing about the code) and the person retries the
  // validation. BUILD_ONLY promises no intervention, so there a fresh
  // validation starts automatically, once per generation.
  async markInterrupted(bootedAt: Date): Promise<number> {
    const runs = await this.prisma.sandboxRun.findMany({
      where: { status: 'RUNNING', startedAt: { lt: bootedAt } },
      select: {
        id: true,
        projectId: true,
        generationRunId: true,
        createdByUserId: true,
        project: { select: { workflowRoute: true } },
      },
    });
    for (const run of runs) {
      await this.finish(run.id, run.projectId, {
        status: 'ERROR',
        errorMessage: INTERRUPTED_BY_RESTART,
      });
      if (run.project.workflowRoute !== 'BUILD_ONLY') continue;
      const interruptions = await this.prisma.sandboxRun.count({
        where: { generationRunId: run.generationRunId, errorMessage: INTERRUPTED_BY_RESTART },
      });
      if (interruptions === 1)
        await this.start(run.projectId, run.createdByUserId, run.generationRunId);
    }
    return runs.length;
  }

  // Worker callback. Always ends in a terminal status, so polling never hangs.
  async runJob(projectId: string, sandboxRunId: string): Promise<void> {
    const { count } = await this.prisma.sandboxRun.updateMany({
      where: { id: sandboxRunId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (!count) return; // Already picked up by a previous delivery of the job.
    const run = await this.prisma.sandboxRun.findUniqueOrThrow({
      where: { id: sandboxRunId },
      include: { generationRun: { include: { project: { select: { name: true } } } } },
    });
    const generation = run.generationRun;
    try {
      const template = findTargetTemplate(
        generation.targetTemplateIdentifier,
        generation.targetTemplateVersion,
      );
      if (!template)
        throw new SandboxExecutionError('SANDBOX_INVALID_INPUT', 'Plantilla no soportada.');
      const files = await this.projectFiles(generation.id, run.attemptNumber);
      const stages = await this.validate(projectId, run.id, generation.id, files, template);
      const failed = stages.find((s) => !s.passed);
      if (!failed) {
        await this.formalize(run, files, template, stages);
        return;
      }
      // Dependencies are pinned from the catalog, so a registry outage says
      // nothing about the code: an environment error, retryable.
      if (failed.stage === 'INSTALL' && REGISTRY_UNREACHABLE.test(failed.output)) {
        await this.finish(run.id, projectId, {
          status: 'ERROR',
          failedStage: 'INSTALL',
          errorMessage:
            'No se pudieron descargar las dependencias desde el registro aprobado. Intente de nuevo más tarde.',
        });
        return;
      }
      await this.afterFailure(run, failed, files);
    } catch (error) {
      const message =
        error instanceof SandboxExecutionError
          ? 'El entorno aislado de validación no está disponible. Intente de nuevo más tarde.'
          : error instanceof StorageProviderError
            ? 'No se pudo almacenar el proyecto validado. Intente de nuevo más tarde.'
            : 'La validación no pudo completarse.';
      logger.warn(
        `Sandbox run "${sandboxRunId}" errored: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.finish(run.id, projectId, { status: 'ERROR', errorMessage: message });
    }
  }

  async list(projectId: string, generationRunId: string): Promise<{ items: SandboxRunResponse[] }> {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: generationRunId, projectId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Corrida de generación no encontrada.');
    const rows = await this.prisma.sandboxRun.findMany({
      where: { generationRunId, projectId },
      include: runInclude,
      orderBy: { createdAt: 'asc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  // Generated files with every earlier repair round applied, in order.
  private async projectFiles(generationRunId: string, attemptNumber: number) {
    const [files, repairs] = await Promise.all([
      this.prisma.generatedFile.findMany({
        where: { generationRunId },
        select: { path: true, content: true, kind: true },
        orderBy: { path: 'asc' },
      }),
      this.prisma.autoRepairAttempt.findMany({
        where: { generationRunId, status: 'PATCHED', roundNumber: { lt: attemptNumber } },
        include: { patches: true },
        orderBy: { roundNumber: 'asc' },
      }),
    ]);
    return repairs.reduce<ProjectFile[]>((acc, r) => applyPatches(acc, r.patches), files);
  }

  private async validate(
    projectId: string,
    sandboxRunId: string,
    generationRunId: string,
    files: ProjectFile[],
    template: TargetTemplateVersion,
  ): Promise<StageRecord[]> {
    const commands = template.validationCommands.map((c) => ({
      stage: c.stage,
      argv: c.argv,
      network: c.stage === 'INSTALL',
    }));
    const result = await this.sandbox.execute({
      files: files.map(({ path, content }) => ({ path, content })),
      commands,
      allowedCommands: template.validationCommands.map((c) => c.argv),
      toolchain: {
        nodeMajor: Number(/\d+/.exec(template.toolchain.node)![0]),
        packageManager: template.toolchain.packageManager,
      },
      limits: SANDBOX_LIMITS,
      collect: [LOCKFILE],
      onStageStart: async (stage) => {
        await this.prisma.sandboxRun.updateMany({
          where: { id: sandboxRunId, status: 'RUNNING' },
          data: { currentStage: stage as SandboxValidationStage },
        });
      },
    });
    const stages: StageRecord[] = result.stages.map((s) => ({
      stage: s.stage as SandboxValidationStage,
      passed: stagePassed(s),
      exitCode: s.exitCode,
      timedOut: s.timedOut,
      durationMs: s.durationMs,
      output: s.output,
    }));
    if (stages.length === commands.length && stages.every((s) => s.passed)) {
      const allowed = await this.catalog.listAllowed(projectId, template);
      const links = await this.prisma.codeTraceLink.findMany({
        where: { generatedFile: { generationRunId } },
        select: { generatedFile: { select: { path: true } } },
        distinct: ['generatedFileId'],
      });
      const check = (stage: SandboxValidationStage, problems: string[]): StageRecord => ({
        stage,
        passed: problems.length === 0,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        output: problems.length ? problems.join('\n') : 'Sin observaciones.',
      });
      const generation = await this.prisma.generationRun.findUniqueOrThrow({
        where: { id: generationRunId },
        select: {
          implementationPlanVersion: { select: { structuredAnalysisDetail: true } },
        },
      });
      const plan = generation.implementationPlanVersion.structuredAnalysisDetail
        ?.content as unknown as ImplementationPlanContent;
      stages.push(
        check('STRUCTURE', [
          ...structuralProblems(files, template, allowed),
          ...firstRunProblems(files),
          ...planCoverageProblems(files, plan),
        ]),
      );
      if (stages.at(-1)!.passed)
        stages.push(
          check(
            'TRACEABILITY',
            traceabilityProblems(files, new Set(links.map((l) => l.generatedFile.path))),
          ),
        );
    }
    await this.prisma.sandboxRun.updateMany({
      where: { id: sandboxRunId, status: 'RUNNING' },
      data: { lockfile: result.collected[LOCKFILE] ?? null },
    });
    await this.prisma.sandboxStageResult.createMany({
      data: stages.map((s) => ({ sandboxRunId, ...s })),
    });
    return stages;
  }

  private async formalize(
    run: { id: string; projectId: string; generationRunId: string; createdByUserId: string },
    files: ProjectFile[],
    template: TargetTemplateVersion,
    stages: StageRecord[],
  ) {
    const generation = await this.prisma.generationRun.findUniqueOrThrow({
      where: { id: run.generationRunId },
      include: { project: { select: { name: true } } },
    });
    const baseline = await this.designBaselines.get(run.projectId, generation.designBaselineId);
    const { lockfile } = await this.prisma.sandboxRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { lockfile: true },
    });
    const traceLinks = await this.prisma.codeTraceLink.findMany({
      where: { generatedFile: { generationRunId: generation.id } },
      select: {
        planElement: true,
        linkType: true,
        generatedFile: { select: { path: true } },
        sourceArtifactVersion: {
          select: { id: true, versionNumber: true, artifact: { select: { code: true } } },
        },
      },
    });
    const snapshotId = randomUUID();
    const projectFiles = [
      ...files.map(({ path, content }) => ({ path, content })),
      ...(lockfile ? [{ path: LOCKFILE, content: lockfile }] : []),
    ];
    const hash = manifestHash(projectFiles);
    // Generation/traceability manifest (spec §177.1), shipped inside the ZIP.
    const manifest = {
      snapshotId,
      targetTemplate: { identifier: template.identifier, version: template.version },
      generationRunId: generation.id,
      implementationPlanVersionId: generation.implementationPlanVersionId,
      designBaseline: {
        id: baseline.id,
        label: baseline.label,
        entries: baseline.entries.map((e) => ({
          role: e.role,
          code: e.code,
          versionNumber: e.versionNumber,
          artifactVersionId: e.artifactVersionId,
        })),
      },
      validation: stages.map(({ stage, passed, durationMs }) => ({ stage, passed, durationMs })),
      manifestHash: hash,
      files: projectFiles.map((f) => ({ path: f.path, sha256: sha256(f.content) })),
      traceLinks: traceLinks.map((l) => ({
        path: l.generatedFile.path,
        planElement: l.planElement,
        linkType: l.linkType,
        code: l.sourceArtifactVersion.artifact.code,
        versionNumber: l.sourceArtifactVersion.versionNumber,
        artifactVersionId: l.sourceArtifactVersion.id,
      })),
    };
    const archive = await buildArchive(projectSlug(generation.project.name), [
      ...projectFiles,
      { path: 'caseflow-manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    ]);
    const key = `projects/${run.projectId}/generated-projects/${snapshotId}.zip`;
    await this.storage.putObject({ key, body: archive, contentType: 'application/zip' });
    await this.prisma.$transaction(async (tx) => {
      await tx.sandboxRun.update({
        where: { id: run.id },
        data: { status: 'READY', currentStage: null, finishedAt: new Date() },
      });
      await tx.generatedProjectSnapshot.create({
        data: {
          id: snapshotId,
          projectId: run.projectId,
          generationRunId: generation.id,
          sandboxRunId: run.id,
          targetTemplateIdentifier: generation.targetTemplateIdentifier,
          targetTemplateVersion: generation.targetTemplateVersion,
          generationPlanVersionId:
            baseline.entries.find((e) => e.role === 'GENERATION_PLAN')?.artifactVersionId ?? null,
          designBaselineId: generation.designBaselineId,
          implementationPlanVersionId: generation.implementationPlanVersionId,
          fileCount: projectFiles.length,
          manifestHash: hash,
          archiveStorageKey: key,
          archiveSha256: sha256(archive),
          archiveSize: archive.length,
          createdByUserId: run.createdByUserId,
        },
      });
      await this.audit.record(
        {
          projectId: run.projectId,
          actorUserId: null,
          action: 'SANDBOX_RUN_FINISHED',
          entityType: 'SANDBOX_RUN',
          entityId: run.id,
          metadata: { status: 'READY' },
        },
        tx,
      );
      await this.audit.record(
        {
          projectId: run.projectId,
          actorUserId: null,
          action: 'GENERATED_PROJECT_SNAPSHOT_CREATED',
          entityType: 'GENERATED_PROJECT_SNAPSHOT',
          entityId: snapshotId,
          metadata: { generationRunId: generation.id, manifestHash: hash },
        },
        tx,
      );
    });
  }

  private async afterFailure(
    run: {
      id: string;
      projectId: string;
      generationRunId: string;
      attemptNumber: number;
      createdByUserId: string;
    },
    failed: StageRecord,
    files: ProjectFile[],
  ) {
    const round = run.attemptNumber;
    if (round > MAX_AUTO_REPAIR_ROUNDS) {
      await this.finish(run.id, run.projectId, {
        status: 'VALIDATION_FAILED',
        failedStage: failed.stage,
        errorMessage: `La etapa ${failed.stage} sigue fallando tras ${MAX_AUTO_REPAIR_ROUNDS} rondas de reparación. Requiere revisión humana.`,
      });
      return;
    }
    const repair = await this.autoRepair.repair({
      projectId: run.projectId,
      failedStage: failed.stage,
      output: failed.output,
      files,
      versionsByCode: await this.versionsByCode(run.projectId, run.generationRunId),
    });
    let next: { id: string } | null = null;
    await this.prisma.$transaction(async (tx) => {
      // Sequential writes: one transaction client never runs queries in parallel.
      const attempt = await tx.autoRepairAttempt.create({
        data: {
          generationRunId: run.generationRunId,
          sandboxRunId: run.id,
          roundNumber: round,
          failedStage: failed.stage,
          status: repair.status,
          explanation: repair.explanation,
        },
        select: { id: true },
      });
      await tx.repairPatch.createMany({
        data: repair.patches.map((p) => ({ autoRepairAttemptId: attempt.id, ...p })),
      });
      await tx.repairFinding.createMany({
        data: repair.findings.map((f) => ({ autoRepairAttemptId: attempt.id, ...f })),
      });
      const patched = repair.status === 'PATCHED';
      await tx.sandboxRun.update({
        where: { id: run.id },
        data: {
          status: patched ? 'FAILED' : 'VALIDATION_FAILED',
          failedStage: failed.stage,
          currentStage: null,
          finishedAt: new Date(),
          errorMessage: patched
            ? `La etapa ${failed.stage} falló; se aplicó la ronda de reparación ${round}.`
            : `La etapa ${failed.stage} falló y no se pudo reparar automáticamente: ${repair.explanation}`,
        },
      });
      await this.audit.record(
        {
          projectId: run.projectId,
          actorUserId: null,
          action: 'AUTO_REPAIR_ROUND',
          entityType: 'SANDBOX_RUN',
          entityId: run.id,
          metadata: {
            roundNumber: round,
            status: repair.status,
            patchedPaths: repair.patches.map((p) => p.path),
          },
        },
        tx,
      );
      await this.audit.record(
        {
          projectId: run.projectId,
          actorUserId: null,
          action: 'SANDBOX_RUN_FINISHED',
          entityType: 'SANDBOX_RUN',
          entityId: run.id,
          metadata: { status: patched ? 'FAILED' : 'VALIDATION_FAILED', failedStage: failed.stage },
        },
        tx,
      );
      if (patched)
        next = await tx.sandboxRun.create({
          data: {
            projectId: run.projectId,
            generationRunId: run.generationRunId,
            attemptNumber: round + 1,
            createdByUserId: run.createdByUserId,
          },
          select: { id: true },
        });
    });
    if (next) await this.enqueue(run.projectId, (next as { id: string }).id);
  }

  private async versionsByCode(projectId: string, generationRunId: string) {
    const generation = await this.prisma.generationRun.findUniqueOrThrow({
      where: { id: generationRunId },
      select: {
        designBaselineId: true,
        implementationPlanVersion: { select: { id: true, artifact: { select: { code: true } } } },
      },
    });
    const baseline = await this.designBaselines.get(projectId, generation.designBaselineId);
    return new Map([
      ...baseline.entries.map((e): [string, string] => [e.code, e.artifactVersionId]),
      [generation.implementationPlanVersion.artifact.code, generation.implementationPlanVersion.id],
    ]);
  }

  private async finish(
    id: string,
    projectId: string,
    data: {
      status: 'ERROR' | 'VALIDATION_FAILED';
      errorMessage: string;
      failedStage?: SandboxValidationStage;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.sandboxRun.update({
        where: { id },
        data: { ...data, currentStage: null, finishedAt: new Date() },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: null,
          action: 'SANDBOX_RUN_FINISHED',
          entityType: 'SANDBOX_RUN',
          entityId: id,
          metadata: { status: data.status, failedStage: data.failedStage ?? null },
        },
        tx,
      );
    });
  }

  private async enqueue(projectId: string, runId: string) {
    await this.queue.add(CONSTRUCTION_QUEUE, { type: 'sandbox-run', runId, projectId });
  }

  private map(row: RunRow): SandboxRunResponse {
    return {
      id: row.id,
      generationRunId: row.generationRunId,
      attemptNumber: row.attemptNumber,
      status: row.status,
      currentStage: row.currentStage,
      failedStage: row.failedStage,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      stages: [...row.stageResults]
        .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
        .map(({ stage, passed, exitCode, timedOut, durationMs, output }) => ({
          stage,
          passed,
          exitCode,
          timedOut,
          durationMs,
          output,
        })),
      repair: row.repairAttempt
        ? {
            roundNumber: row.repairAttempt.roundNumber,
            status: row.repairAttempt.status,
            explanation: row.repairAttempt.explanation,
            patchedPaths: row.repairAttempt.patches.map((p) => p.path),
            findings: row.repairAttempt.findings.map((f) => f.message),
          }
        : null,
      snapshotId: row.snapshot?.id ?? null,
    };
  }
}
