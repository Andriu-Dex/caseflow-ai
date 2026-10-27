import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  canTransitionArtifactVersionStatus,
  formatArtifactCode,
  type ConstructionJobPayload,
} from '@caseflow-ai/domain';
import {
  implementationPlanContentSchema,
  uiBlueprintContentSchema,
  type ArtifactVersionStatus,
  type EditUserManualRequest,
  type UserManualResponse,
} from '@caseflow-ai/contracts';
import type { StorageProvider } from '@caseflow-ai/integrations';
import {
  CAPTURE_PROFILE,
  RUNTIME_CAPTURE_PROVIDER,
  type RuntimeCaptureProvider,
  type RuntimeCaptureResult,
  assertCapturePng,
} from '@caseflow-ai/integrations';
import type { JobQueue } from '../common/infrastructure';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CONSTRUCTION_QUEUE_TOKEN } from '../construction/construction-queue.token';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { buildUserManual } from './user-manual-builder';
import { renderManualHtml, renderManualPdf } from './user-manual-renderer';

const include = {
  artifact: true,
  userManualDetail: {
    include: {
      tasks: {
        orderBy: { position: 'asc' as const },
        include: {
          roles: { orderBy: { name: 'asc' as const } },
          steps: { orderBy: { position: 'asc' as const } },
          captures: { orderBy: { role: 'asc' as const } },
        },
      },
    },
  },
} satisfies Prisma.ArtifactVersionInclude;
type CaptureEvidence = Omit<Prisma.UserManualCaptureCreateManyInput, 'taskId' | 'id'>;
const captureData = ({
  bundleId,
  role,
  status,
  reason,
  storageKey,
  sha256,
  width,
  height,
  profile,
}: CaptureEvidence): CaptureEvidence => ({
  bundleId,
  role,
  status,
  reason,
  storageKey,
  sha256,
  width,
  height,
  profile,
});
type BaseContent = ReturnType<typeof buildUserManual>;
type Content = Omit<BaseContent, 'tasks'> & {
  tasks: (BaseContent['tasks'][number] & { captures?: CaptureEvidence[] })[];
};
const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex');

@Injectable()
export class UserManualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: JobQueue<ConstructionJobPayload>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Optional()
    @Inject(RUNTIME_CAPTURE_PROVIDER)
    private readonly captureProvider?: RuntimeCaptureProvider,
  ) {}

  private async snapshot(projectId: string, snapshotId: string) {
    const row = await this.prisma.generatedProjectSnapshot.findFirst({
      where: { id: snapshotId, projectId },
      include: { project: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Versión de software validada no encontrada.');
    return row;
  }

  private async authorize(projectId: string, userId: string, review = false) {
    const membership = await this.prisma.projectMembership.findFirst({
      where: { projectId, userId, project: { workspace: { memberships: { some: { userId } } } } },
    });
    if (
      !membership ||
      !(review ? ['OWNER', 'EDITOR', 'REVIEWER'] : ['OWNER', 'EDITOR']).includes(membership.role)
    )
      throw new ForbiddenException('Su rol no permite modificar o aprobar este manual.');
  }

  async enqueue(projectId: string, snapshotId: string, userId?: string) {
    if (userId) await this.authorize(projectId, userId);
    await this.snapshot(projectId, snapshotId);
    const job = await this.prisma.userManualJob.upsert({
      where: { snapshotId },
      create: { projectId, snapshotId },
      update: {},
    });
    if (job.projectId !== projectId) throw new NotFoundException('Manual no encontrado.');
    if (job.status === 'COMPLETED' || job.status === 'RUNNING') return job;
    await this.prisma.userManualJob.updateMany({
      where: { id: job.id, status: 'FAILED' },
      data: { status: 'QUEUED', errorMessage: null },
    });
    try {
      await this.queue.add('user-manual', { type: 'user-manual', projectId, runId: job.id });
    } catch {
      await this.prisma.userManualJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          errorMessage:
            'No se pudo iniciar la generación del manual. Puede reintentar sin reconstruir el software.',
        },
      });
    }
    return this.prisma.userManualJob.findUniqueOrThrow({ where: { id: job.id } });
  }

  async recover(bootedAt: Date) {
    await this.prisma.userManualJob.updateMany({
      where: { status: 'RUNNING', updatedAt: { lt: bootedAt } },
      data: {
        status: 'FAILED',
        errorMessage: 'La generación del manual se interrumpió. Puede reintentar.',
      },
    });
    const queued = await this.prisma.userManualJob.findMany({ where: { status: 'QUEUED' } });
    for (const job of queued) await this.enqueue(job.projectId, job.snapshotId);
    return queued.length;
  }

  async runJob(projectId: string, jobId: string) {
    const claimed = await this.prisma.userManualJob.updateMany({
      where: { id: jobId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING', errorMessage: null },
    });
    if (!claimed.count) return;
    const job = await this.prisma.userManualJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.captureRequested) return this.runCapture(projectId, job.snapshotId, jobId);
    try {
      const snapshot = await this.snapshot(projectId, job.snapshotId);
      const [planVersion, baseline, files] = await Promise.all([
        this.prisma.artifactVersion.findFirst({
          where: { id: snapshot.implementationPlanVersionId, projectId, status: 'APPROVED' },
          include: { structuredAnalysisDetail: true },
        }),
        this.prisma.designBaseline.findFirst({
          where: { id: snapshot.designBaselineId, projectId },
          include: {
            entries: {
              include: { artifactVersion: { include: { structuredAnalysisDetail: true } } },
            },
          },
        }),
        this.prisma.generatedFile.findMany({
          where: { generationRunId: snapshot.generationRunId, generationRun: { projectId } },
          select: { id: true, path: true },
        }),
      ]);
      const plan = implementationPlanContentSchema.parse(
        planVersion?.structuredAnalysisDetail?.content,
      );
      const uiEntry = baseline?.entries.find((entry) => entry.role === 'UI_BLUEPRINT');
      const ui = uiBlueprintContentSchema.safeParse(
        uiEntry?.artifactVersion.structuredAnalysisDetail?.content,
      );
      const content = buildUserManual(plan, ui.success ? ui.data : null, files);
      await this.prisma.$transaction(async (tx) => {
        // The snapshot serializes duplicate deliveries and generation retries.
        await tx.$queryRaw`SELECT id FROM generated_project_snapshots WHERE id=${snapshot.id}::uuid AND project_id=${projectId}::uuid FOR UPDATE`;
        const existing = await tx.userManualDetail.findFirst({
          where: { snapshotId: snapshot.id },
        });
        if (!existing) {
          const counters = await tx.$queryRaw<
            { last_number: number }[]
          >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES (${projectId}::uuid,'MAN',1) ON CONFLICT (project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
          const artifact = await tx.artifact.create({
            data: {
              projectId,
              artifactTypeCode: 'USER_MANUAL',
              code: formatArtifactCode('MAN', counters[0]!.last_number),
            },
          });
          await this.writeVersion(
            tx,
            projectId,
            artifact.id,
            snapshot.id,
            1,
            content,
            'SYSTEM_GENERATED',
            snapshot.project?.name
              ? `Manual de usuario — ${snapshot.project.name}`
              : 'Manual de usuario',
          );
          await this.audit.record(
            {
              projectId,
              actorUserId: null,
              action: 'USER_MANUAL_GENERATED',
              entityType: 'GENERATED_PROJECT_SNAPSHOT',
              entityId: snapshot.id,
              metadata: { artifactId: artifact.id },
            },
            tx,
          );
        }
        await tx.userManualJob.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });
      });
      if (this.captureProvider) await this.capture(projectId, job.snapshotId);
    } catch {
      await this.prisma.userManualJob.updateMany({
        where: { id: jobId, projectId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          errorMessage:
            'No se pudo generar el manual con las fuentes de esta versión. Revise el plan y las pantallas; puede reintentar sin reconstruir el software.',
        },
      });
    }
  }

  private async writeVersion(
    tx: Prisma.TransactionClient,
    projectId: string,
    artifactId: string,
    snapshotId: string,
    versionNumber: number,
    content: Content,
    origin: 'SYSTEM_GENERATED' | 'MANUAL',
    title = 'Manual de usuario',
  ) {
    return tx.artifactVersion.create({
      data: {
        projectId,
        artifactId,
        title,
        versionNumber,
        origin,
        status: origin === 'MANUAL' ? 'DRAFT' : 'GENERATED',
        userManualDetail: {
          create: {
            snapshotId,
            introduction: content.introduction,
            tasks: {
              create: content.tasks.map((task, position) => ({
                title: task.title,
                routePath: task.routePath,
                generatedFileId: task.generatedFileId,
                verified: task.verified,
                position,
                roles: { createMany: { data: [...new Set(task.roles)].map((name) => ({ name })) } },
                steps: {
                  createMany: {
                    data: task.steps.map(({ instruction, expectedResult }, index) => ({
                      instruction,
                      expectedResult,
                      position: index,
                    })),
                  },
                },
                captures: { createMany: { data: task.captures ?? [] } },
              })),
            },
          },
        },
      },
    });
  }

  async get(
    projectId: string,
    snapshotId: string,
    versionId?: string,
  ): Promise<UserManualResponse | null> {
    await this.snapshot(projectId, snapshotId);
    const version = await this.prisma.artifactVersion.findFirst({
      where: {
        projectId,
        ...(versionId ? { id: versionId } : {}),
        artifact: { artifactTypeCode: 'USER_MANUAL', archivedAt: null },
        userManualDetail: { snapshotId },
      },
      orderBy: { versionNumber: 'desc' },
      include,
    });
    if (!version) {
      if (versionId) throw new NotFoundException('Versión de manual no encontrada.');
      return null;
    }
    const detail = version.userManualDetail!;
    const [latest, history] = await Promise.all([
      this.prisma.generatedProjectSnapshot.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
      this.prisma.artifactVersion.findMany({
        where: { artifactId: version.artifactId, projectId },
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true, status: true },
      }),
    ]);
    return {
      id: version.artifactId,
      code: version.artifact.code,
      title: version.title,
      snapshotId,
      isCurrent: latest?.id === snapshotId,
      introduction: detail.introduction,
      version: { id: version.id, versionNumber: version.versionNumber, status: version.status },
      history,
      tasks: detail.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        routePath: task.routePath,
        generatedFileId: task.generatedFileId,
        verified: task.verified,
        captures: task.captures.map(
          ({ id, bundleId, role, status, reason, sha256, width, height, profile }) => ({
            id,
            bundleId,
            role,
            status: status as 'CAPTURED' | 'FAILED' | 'SKIPPED',
            reason,
            sha256,
            width,
            height,
            profile: profile as typeof CAPTURE_PROFILE,
          }),
        ),
        roles: task.roles.map((role) => role.name),
        steps: task.steps.map(({ instruction, expectedResult }) => ({
          instruction,
          expectedResult,
        })),
      })),
    };
  }

  async state(projectId: string, snapshotId: string) {
    const job = await this.prisma.userManualJob.findFirst({ where: { projectId, snapshotId } });
    // Read content after completion is observed so the final poll cannot retain the old version.
    const manual = await this.get(projectId, snapshotId);
    return {
      manual,
      job: job ? { id: job.id, status: job.status, errorMessage: job.errorMessage } : null,
    };
  }

  async edit(projectId: string, snapshotId: string, userId: string, input: EditUserManualRequest) {
    await this.authorize(projectId, userId, true);
    const current = await this.get(projectId, snapshotId);
    if (!current) throw new NotFoundException('Manual no encontrado.');
    if (
      new Set(input.tasks.map((task) => task.id)).size !== current.tasks.length ||
      input.tasks.length !== current.tasks.length ||
      input.tasks.some((task) => !current.tasks.some((item) => item.id === task.id))
    )
      throw new UnprocessableEntityException('Conserve las tareas de esta versión del software.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM artifacts WHERE id=${current.id}::uuid AND project_id=${projectId}::uuid FOR UPDATE`;
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: current.id, projectId },
        orderBy: { versionNumber: 'desc' },
      });
      if (latest.id !== input.expectedVersionId)
        throw new ConflictException('El manual cambió. Recargue antes de guardar.');
      const content = {
        introduction: input.introduction,
        tasks: current.tasks.map((task) => {
          const edited = input.tasks.find((item) => item.id === task.id)!;
          return {
            ...task,
            captures: undefined,
            title: edited.title,
            verified: edited.verified,
            steps: edited.steps,
          };
        }),
      };
      const evidence = await tx.userManualCapture.findMany({
        where: { task: { manualVersionId: current.version.id } },
      });
      const withEvidence: Content = {
        ...content,
        tasks: content.tasks.map((task) => ({
          ...task,
          captures: evidence.filter((item) => item.taskId === task.id).map(captureData),
        })),
      };
      const next = await this.writeVersion(
        tx,
        projectId,
        current.id,
        snapshotId,
        latest.versionNumber + 1,
        withEvidence,
        'MANUAL',
        current.title,
      );
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'USER_MANUAL_EDITED',
          entityType: 'ARTIFACT_VERSION',
          entityId: next.id,
        },
        tx,
      );
    });
    return this.get(projectId, snapshotId);
  }

  async transition(
    projectId: string,
    snapshotId: string,
    versionId: string,
    userId: string,
    status: ArtifactVersionStatus,
  ) {
    await this.authorize(projectId, userId, true);
    const manual = await this.get(projectId, snapshotId, versionId);
    if (!manual) throw new NotFoundException('Manual no encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM artifacts WHERE id=${manual.id}::uuid AND project_id=${projectId}::uuid FOR UPDATE`;
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: manual.id, projectId },
        orderBy: { versionNumber: 'desc' },
      });
      if (latest.id !== versionId)
        throw new ConflictException('Revise la última versión del manual.');
      const pending = await tx.userManualJob.findFirst({
        where: {
          projectId,
          snapshotId,
          status: { in: ['QUEUED', 'RUNNING'] },
          captureRequested: true,
        },
      });
      if (pending)
        throw new ConflictException(
          'Espere a que terminen las capturas antes de revisar el manual.',
        );
      if (!canTransitionArtifactVersionStatus(latest.status, status))
        throw new UnprocessableEntityException('Transición no permitida.');
      if (status === 'APPROVED' && !manual.tasks.every((task) => task.verified))
        throw new UnprocessableEntityException(
          'Compruebe y marque todas las tareas en la aplicación antes de aprobar.',
        );
      await tx.artifactVersion.update({
        where: { id: versionId },
        data: {
          status,
          ...(status === 'IN_REVIEW' ? { submittedAt: new Date() } : {}),
          ...(status === 'APPROVED' ? { approvedAt: new Date(), approvalOrigin: 'HUMAN' } : {}),
        },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'USER_MANUAL_REVIEWED',
          entityType: 'ARTIFACT_VERSION',
          entityId: versionId,
          metadata: { status, snapshotId },
        },
        tx,
      );
    });
    return this.get(projectId, snapshotId, versionId);
  }

  async download(
    projectId: string,
    snapshotId: string,
    versionId: string,
    userId: string,
    format: 'html' | 'pdf' | 'zip',
  ) {
    const manual = await this.get(projectId, snapshotId, versionId);
    if (!manual) throw new NotFoundException('Manual no encontrado.');
    if (format === 'zip' && manual.version.status !== 'APPROVED')
      throw new UnprocessableEntityException(
        'Apruebe el manual antes de descargar la entrega completa.',
      );
    let body: Buffer;
    const images = await this.images(projectId, snapshotId, versionId);
    if (format === 'html') body = renderManualHtml(manual, images);
    else if (format === 'pdf') body = await renderManualPdf(manual, images);
    else {
      const snapshot = await this.snapshot(projectId, snapshotId);
      if (snapshot.archiveSize > 200_000_000)
        throw new PayloadTooLargeException(
          'Descargue el software y el manual por separado: la entrega supera el tamaño permitido.',
        );
      const code = await this.storage.getObject(snapshot.archiveStorageKey);
      if (digest(code) !== snapshot.archiveSha256)
        throw new UnprocessableEntityException(
          'El archivo de software no coincide con la versión registrada.',
        );
      const html = renderManualHtml(manual, images);
      const pdf = await renderManualPdf(manual, images);
      const zip = new JSZip();
      zip.file('software.zip', code);
      zip.file('manual/index.html', html);
      zip.file('manual/manual.pdf', pdf);
      for (const [id, image] of Object.entries(images))
        zip.file(`manual/capturas/${id}.png`, image);
      zip.file(
        'entrega.json',
        JSON.stringify(
          {
            snapshotId,
            manualVersionId: versionId,
            softwareSha256: digest(code),
            htmlSha256: digest(html),
            pdfSha256: digest(pdf),
            captures: manual.tasks.flatMap((task) =>
              (task.captures ?? []).map((capture) => ({
                ...capture,
                routePath: task.routePath,
                file: images[capture.id] ? `manual/capturas/${capture.id}.png` : null,
              })),
            ),
          },
          null,
          2,
        ),
      );
      body = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    }
    await this.audit.record({
      projectId,
      actorUserId: userId,
      action: 'USER_MANUAL_DOWNLOADED',
      entityType: 'ARTIFACT_VERSION',
      entityId: versionId,
      metadata: { snapshotId, format },
    });
    return {
      body,
      contentType:
        format === 'html'
          ? 'text/html; charset=utf-8'
          : format === 'pdf'
            ? 'application/pdf'
            : 'application/zip',
      filename: `${format === 'zip' ? 'entrega' : 'manual'}-${manual.code}-v${manual.version.versionNumber}.${format}`,
    };
  }

  async capture(projectId: string, snapshotId: string, userId?: string) {
    if (userId) await this.authorize(projectId, userId);
    const manual = await this.get(projectId, snapshotId);
    if (!manual) throw new NotFoundException('Genere el manual antes de solicitar capturas.');
    if (!this.captureProvider)
      throw new UnprocessableEntityException(
        'El capturador no está disponible. El manual sigue disponible.',
      );
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM artifacts WHERE id=${manual.id}::uuid FOR UPDATE`;
      const current = await tx.userManualJob.findUniqueOrThrow({ where: { snapshotId } });
      if (['QUEUED', 'RUNNING'].includes(current.status))
        throw new ConflictException('Ya existe una tarea del manual en curso.');
      await this.audit.record(
        {
          projectId,
          actorUserId: userId ?? null,
          action: 'USER_MANUAL_CAPTURE_STARTED',
          entityType: 'GENERATED_PROJECT_SNAPSHOT',
          entityId: snapshotId,
          metadata: {
            jobId: current.id,
            sourceManualVersionId: manual.version.id,
            profile: CAPTURE_PROFILE,
          },
        },
        tx,
      );
      return tx.userManualJob.update({
        where: { id: current.id },
        data: { status: 'QUEUED', errorMessage: null, captureRequested: true },
      });
    });
    try {
      await this.queue.add('user-manual', { type: 'user-manual', projectId, runId: job.id });
    } catch {
      await this.prisma.userManualJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          errorMessage:
            'No se pudieron iniciar las capturas. Puede reintentar; el manual sigue disponible.',
        },
      });
    }
    return this.state(projectId, snapshotId);
  }

  private async runCapture(projectId: string, snapshotId: string, jobId: string) {
    const stored: string[] = [];
    try {
      const manual = await this.get(projectId, snapshotId);
      if (!manual || !this.captureProvider) throw new Error('Capture unavailable.');
      const targets = manual.tasks.flatMap((task) =>
        (task.roles.length ? task.roles : ['']).map((role) => ({
          routePath: task.routePath,
          role,
        })),
      );
      let results: RuntimeCaptureResult[];
      try {
        const snapshot = await this.snapshot(projectId, snapshotId);
        if (snapshot.targetTemplateIdentifier !== 'CASEFLOW_WEB_TS_V1')
          throw new Error('Unsupported capture template.');
        if (snapshot.archiveSize > 30_000_000) throw new Error('Capture archive too large.');
        const archive = await this.storage.getObject(snapshot.archiveStorageKey);
        if (digest(archive) !== snapshot.archiveSha256) throw new Error('Snapshot hash mismatch.');
        const zip = await JSZip.loadAsync(archive);
        const entries = Object.values(zip.files).filter((entry) => !entry.dir);
        if (entries.length > 4000) throw new Error('Too many archive entries.');
        const files: { path: string; content: string }[] = [];
        let size = 0;
        const roots = new Set(entries.map((entry) => entry.name.split('/')[0]));
        if (roots.size !== 1) throw new Error('Invalid archive root.');
        for (const entry of entries) {
          // JSZip exposes the original name separately when it normalizes traversal.
          if (
            (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName !==
              entry.name ||
            (Number(entry.unixPermissions) & 0o170000) === 0o120000
          )
            throw new Error('Unsafe archive entry.');
          const chunks: Buffer[] = [];
          for await (const chunk of new Readable().wrap(entry.nodeStream())) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > 30_000_000) throw new Error('Expanded archive too large.');
            chunks.push(bytes);
          }
          const content = Buffer.concat(chunks).toString('utf8');
          files.push({ path: entry.name.slice(entry.name.indexOf('/') + 1), content });
        }
        const scheduled = targets.slice(0, 40);
        results = await this.captureProvider.capture({ files, targets: scheduled });
        if (
          results.length !== scheduled.length ||
          results.some(
            (result, index) =>
              result.routePath !== targets[index]!.routePath ||
              result.role !== targets[index]!.role,
          )
        )
          throw new Error('Capture target mismatch.');
        results.push(
          ...targets.slice(40).map((target): RuntimeCaptureResult => ({
            ...target,
            status: 'SKIPPED',
            reason:
              'Se alcanzó el límite de 40 pantallas y roles por captura. Revise esta pantalla manualmente.',
          })),
        );
      } catch {
        results = targets.map((target) => ({
          ...target,
          status: 'FAILED',
          reason:
            'No fue posible ejecutar o capturar esta pantalla en Docker. Se conserva el esquema del flujo.',
        }));
      }
      const bundleId = randomUUID();
      const evidence: (CaptureEvidence & { routePath: string })[] = [];
      for (const [index, result] of results.entries()) {
        let storageKey: string | null = null;
        if (result.status === 'CAPTURED' && result.png) {
          assertCapturePng(result.png);
          storageKey = `projects/${projectId}/manual-captures/${snapshotId}/${bundleId}/${index}.png`;
          await this.storage.putObject({
            key: storageKey,
            body: result.png,
            contentType: 'image/png',
          });
          stored.push(storageKey);
        }
        evidence.push({
          routePath: result.routePath,
          bundleId,
          role: result.role,
          status: storageKey ? 'CAPTURED' : result.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
          reason: storageKey ? null : (result.reason ?? 'Captura no disponible.'),
          storageKey,
          sha256: storageKey ? digest(result.png!) : null,
          width: storageKey ? 1440 : null,
          height: storageKey ? 900 : null,
          profile: CAPTURE_PROFILE,
        });
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM artifacts WHERE id=${manual.id}::uuid AND project_id=${projectId}::uuid FOR UPDATE`;
        const latest = await tx.artifactVersion.findFirstOrThrow({
          where: { artifactId: manual.id, projectId },
          orderBy: { versionNumber: 'desc' },
          include,
        });
        const detail = latest.userManualDetail!;
        const content: Content = {
          introduction: detail.introduction,
          tasks: detail.tasks.map((task) => ({
            ...task,
            verified: false,
            roles: task.roles.map((role) => role.name),
            captures: evidence.filter((item) => item.routePath === task.routePath).map(captureData),
          })),
        };
        const version = await this.writeVersion(
          tx,
          projectId,
          manual.id,
          snapshotId,
          latest.versionNumber + 1,
          content,
          'SYSTEM_GENERATED',
          latest.title,
        );
        await tx.userManualJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            errorMessage: results.every((item) => item.status === 'CAPTURED')
              ? null
              : 'Algunas pantallas no tienen captura. Revise los avisos del manual.',
          },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: null,
            action: 'USER_MANUAL_CAPTURED',
            entityType: 'ARTIFACT_VERSION',
            entityId: version.id,
            metadata: {
              snapshotId,
              bundleId,
              captured: evidence.filter((item) => item.status === 'CAPTURED').length,
              total: targets.length,
              profile: CAPTURE_PROFILE,
            },
          },
          tx,
        );
      });
    } catch {
      for (const key of stored) await this.storage.deleteObject(key).catch(() => undefined);
      await this.prisma.userManualJob.updateMany({
        where: { id: jobId, projectId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          errorMessage:
            'No se pudieron incorporar las capturas. El manual anterior sigue disponible.',
        },
      });
    }
  }

  private async images(projectId: string, snapshotId: string, versionId: string) {
    const rows = await this.prisma.userManualCapture.findMany({
      where: {
        status: 'CAPTURED',
        task: {
          manualVersionId: versionId,
          manual: { snapshotId, artifactVersion: { projectId } },
        },
      },
    });
    const images: Record<string, Buffer> = {};
    for (const row of rows) {
      const image = await this.storage.getObject(row.storageKey!);
      if (digest(image) !== row.sha256)
        throw new UnprocessableEntityException(
          'La captura no coincide con la evidencia registrada.',
        );
      images[row.id] = image;
    }
    return images;
  }

  async image(projectId: string, snapshotId: string, versionId: string, captureId: string) {
    await this.snapshot(projectId, snapshotId);
    const row = await this.prisma.userManualCapture.findFirst({
      where: {
        id: captureId,
        status: 'CAPTURED',
        task: {
          manualVersionId: versionId,
          manual: { snapshotId, artifactVersion: { projectId } },
        },
      },
    });
    if (!row) throw new NotFoundException('Captura no encontrada.');
    const image = await this.storage.getObject(row.storageKey!);
    if (digest(image) !== row.sha256)
      throw new UnprocessableEntityException('La captura no coincide con la evidencia registrada.');
    return image;
  }
}
