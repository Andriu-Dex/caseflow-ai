import { provenanceGuard } from '../projects/source-statuses';
import type { ApprovalOrigin } from '@caseflow-ai/contracts';
import { randomUUID, createHash } from 'node:crypto';
import { Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { SOURCE_PROCESSING_QUEUE, type SourceProcessingJobPayload } from '@caseflow-ai/domain';
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator, estimateTokens } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { StorageProviderError, type StorageProvider } from '@caseflow-ai/integrations';
import {
  ALLOWED_SOURCE_MIME_TYPES,
  LEGACY_SOURCE_KINDS,
  SOURCE_LIMITS,
  SOURCE_MAX_FILE_SIZE_BYTES,
  sourceKindAcceptsMimeType,
  sourceReportContentSchema,
  type ProjectSourceKind,
  type SourceCapabilitiesResponse,
  type SourceFailureReason,
  type SourceMetadataInput,
  type SourceReportContent,
  type SourceListResponse,
  type SourceResponse,
  type listSourcesQuerySchema,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import type { Prisma } from '../generated/prisma/client';
import { SourceContentExtractor } from './source-content-extractor';
import { STORAGE_PROVIDER } from './storage-provider.token';
import { SOURCE_QUEUE } from './source-queue.token';
import { hasExpectedFileSignature } from './source-file-validation';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { AuditService } from '../audit/audit.service';
import { splitIntoSections } from '../knowledge-base/source-sections';
import { MAX_REPORT_PARTS, inputBudget, mergeBatches, planReportParts } from './source-report-plan';

type Tx = Prisma.TransactionClient;
const SOURCE_REPORT_MAX_OUTPUT_TOKENS = 4096;
const STALE_SOURCE_JOB_MS = 15 * 60_000;
const logger = new Logger('SourcesService');

export interface UploadedSourceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function safeStorageKey(projectId: string, mimeType: string): string {
  const extensionByMime: Record<string, string> = {
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
  };
  const extension = extensionByMime[mimeType] ?? '';
  // Never derived from the client-supplied filename: no path traversal, no
  // filename trust for storage paths (spec §6.6).
  return `sources/${projectId}/${randomUUID()}${extension}`;
}

@Injectable()
export class SourcesService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    private readonly extractor: SourceContentExtractor,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly knowledgeBase: KnowledgeBaseService,
    @Optional() @Inject(SOURCE_QUEUE) private readonly queue?: Queue<SourceProcessingJobPayload>,
    // Injected by Nest; code constructing the service directly still audits.
    @Optional() audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(prisma);
  }
  private readonly audit: AuditService;

  async create(
    projectId: string,
    metadata: SourceMetadataInput,
    file: UploadedSourceFile | undefined,
  ) {
    if (!file && !metadata.description.trim())
      throw new UnprocessableEntityException('Escriba contenido o adjunte un archivo.');
    if (isLegacyKind(metadata.sourceKind))
      throw new UnprocessableEntityException(
        'Este tipo de fuente ya no está disponible. Use Documento PDF, Imagen u Otro.',
      );
    let fileFields: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      contentHash: string;
      storageKey: string;
      extractionState: 'EXTRACTED' | 'MANUAL' | 'UNSUPPORTED' | 'FAILED' | 'PENDING';
      extractedText: string | null;
      extractionFailureReason: SourceFailureReason | null;
    };

    let processAsync = Boolean(
      file && this.queue && !['text/plain', 'text/markdown'].includes(file.mimetype),
    );
    if (file) {
      if (
        !ALLOWED_SOURCE_MIME_TYPES.includes(
          file.mimetype as (typeof ALLOWED_SOURCE_MIME_TYPES)[number],
        )
      )
        throw new UnprocessableEntityException('Tipo de archivo no permitido.');
      assertKindMatchesFile(metadata.sourceKind, file.mimetype);
      if (file.size <= 0) throw new UnprocessableEntityException('El archivo está vacío.');
      if (!(await hasExpectedFileSignature(file)))
        throw new UnprocessableEntityException('El contenido del archivo no coincide con su tipo.');

      const contentHash = createHash('sha256').update(file.buffer).digest('hex');
      const storageKey = safeStorageKey(projectId, file.mimetype);
      const reusable = await this.prisma.sourceDetail.findFirst({
        where: {
          contentHash,
          extractionState: 'EXTRACTED',
          artifactVersion: { projectId, artifact: { archivedAt: null } },
        },
        select: { extractedText: true },
      });
      if (reusable?.extractedText) processAsync = false;
      const extraction = reusable?.extractedText
        ? ({ state: 'EXTRACTED', text: reusable.extractedText } as const)
        : processAsync
          ? ({ state: 'PENDING' } as const)
          : await this.extractor.extract(file.mimetype, file.buffer, file.originalname);
      try {
        await this.storage.putObject({
          key: storageKey,
          body: file.buffer,
          contentType: file.mimetype,
        });
      } catch (error) {
        if (error instanceof StorageProviderError)
          throw new ServiceUnavailableException({ message: error.message, code: error.code });
        throw error;
      }
      fileFields = {
        originalFilename: sanitizeFilenameForDisplay(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentHash,
        storageKey,
        extractionState: extraction.state === 'EXTRACTED' ? 'EXTRACTED' : extraction.state,
        extractedText: extraction.state === 'EXTRACTED' ? extraction.text : null,
        extractionFailureReason:
          extraction.state === 'FAILED' || extraction.state === 'UNSUPPORTED'
            ? extraction.reason
            : null,
      };
    } else {
      // No file: the typed content itself is the source's knowledge,
      // exactly like the existing manual-transcript mechanism.
      fileFields = {
        originalFilename: null as unknown as string,
        mimeType: null as unknown as string,
        sizeBytes: null as unknown as number,
        contentHash: null as unknown as string,
        storageKey: null as unknown as string,
        extractionState: 'MANUAL',
        extractedText: metadata.description,
        extractionFailureReason: null,
      };
    }

    let processingJob: { id: string; projectId: string } | undefined;
    const created = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.project.findUnique({ where: { id: projectId } })))
        throw new NotFoundException('Proyecto no encontrado.');
      const number = await this.allocate(tx, projectId, 'SRC');
      const artifact = await tx.artifact.create({
        data: {
          projectId,
          artifactTypeCode: 'PROJECT_SOURCE',
          code: formatArtifactCode('SRC', number),
        },
      });
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          projectId,
          versionNumber: 1,
          title: metadata.title,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await tx.sourceDetail.create({
        data: {
          artifactVersionId: version.id,
          sourceKind: metadata.sourceKind,
          purpose: metadata.purpose,
          businessArea: metadata.businessArea,
          description: metadata.description,
          language: metadata.language,
          ...fileFields,
        },
      });
      if (processAsync) {
        processingJob = await tx.sourceProcessingJob.create({
          data: {
            projectId,
            sourceVersionId: version.id,
            processor: file!.mimetype.startsWith('audio/')
              ? 'TRANSCRIPTION'
              : file!.mimetype.startsWith('image/')
                ? 'OCR'
                : file!.mimetype === 'application/pdf'
                  ? 'PDF'
                  : 'DOCUMENT',
          },
        });
      }
      return this.loadAndMap(tx, artifact.id, version.id);
    });
    if (processingJob && this.queue) {
      try {
        await this.queue.add(
          SOURCE_PROCESSING_QUEUE,
          { jobId: processingJob.id, projectId: processingJob.projectId },
          { jobId: processingJob.id },
        );
      } catch {
        await this.prisma.sourceProcessingJob.update({
          where: { id: processingJob.id },
          data: { status: 'FAILED', errorMessage: 'No se pudo iniciar el procesamiento.' },
        });
      }
    }
    return created;
  }

  async list(projectId: string, artifactVersionIds?: Record<string, string>) {
    if (artifactVersionIds) {
      const versionIds = Object.values(artifactVersionIds);
      if (versionIds.length === 0) return { items: [] };
      const versions = await this.prisma.artifactVersion.findMany({
        where: {
          id: { in: versionIds },
          artifact: { projectId, artifactTypeCode: 'PROJECT_SOURCE' },
        },
        include: {
          artifact: true,
          sourceDetail: { include: { report: true } },
          sourceProcessingJobs: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { artifact: { code: 'asc' } },
      });
      return { items: versions.map((v) => this.map(v.artifact, v, true)) };
    }

    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'PROJECT_SOURCE' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            sourceDetail: { include: { report: true } },
            sourceProcessingJobs: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        },
      },
      orderBy: { code: 'asc' },
    });
    const approvedRows = await this.prisma.artifactVersion.findMany({
      where: { artifactId: { in: rows.map((r) => r.id) }, status: 'APPROVED' },
      select: { artifactId: true },
      distinct: ['artifactId'],
    });
    const approvedArtifactIds = new Set(approvedRows.map((r) => r.artifactId));
    return {
      items: rows.map((row) => this.map(row, row.versions[0]!, approvedArtifactIds.has(row.id))),
    };
  }

  // DEC-137: the Sources page's filters and pages. A project holds tens of
  // sources, so they are filtered here over the complete list.
  // ponytail: in memory; move the filters into the query if projects ever
  // hold thousands of sources.
  async search(
    projectId: string,
    query: z.output<typeof listSourcesQuerySchema>,
  ): Promise<SourceListResponse> {
    // map() types statuses loosely; they are the contract's values.
    const items = (await this.list(projectId)).items as SourceResponse[];
    const fold = (value: string) =>
      value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const term = query.search ? fold(query.search) : '';
    const archived = items.filter((item) => item.archivedAt).length;
    const counts = { ACTIVE: items.length - archived, ARCHIVED: archived, ALL: items.length };
    const matching = items.filter(
      (item) =>
        (query.status === 'ALL' || Boolean(item.archivedAt) === (query.status === 'ARCHIVED')) &&
        (!query.versionStatus || item.version.status === query.versionStatus) &&
        (!query.kind || item.source.sourceKind === query.kind) &&
        (!term || fold(`${item.code} ${item.source.title}`).includes(term)),
    );
    const by: Record<typeof query.sort, (a: SourceResponse, b: SourceResponse) => number> = {
      CODE: (a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }),
      TITLE: (a, b) => a.source.title.localeCompare(b.source.title, 'es'),
      RECENT: (a, b) => b.createdAt.localeCompare(a.createdAt),
      UPDATED: (a, b) => b.version.createdAt.localeCompare(a.version.createdAt),
    };
    matching.sort(by[query.sort]);
    const page =
      query.limit === undefined
        ? matching.slice(query.offset)
        : matching.slice(query.offset, query.offset + query.limit);
    return { items: page, total: matching.length, counts };
  }

  async get(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    return this.map(row, row.versions[0]!, await this.hasApprovedHistory(id));
  }

  async getText(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    const text = version.sourceDetail?.extractedText;
    if (!text) throw new NotFoundException('La fuente todavía no tiene texto procesado.');
    return { sourceVersionId: version.id, text };
  }

  async retryProcessing(projectId: string, id: string) {
    if (!this.queue) throw new ServiceUnavailableException('El procesamiento no está disponible.');
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    const job = await this.prisma.sourceProcessingJob.findFirst({
      where: { projectId, sourceVersionId: version.id },
    });
    const stale =
      job?.status === 'RUNNING' && Date.now() - job.updatedAt.getTime() > STALE_SOURCE_JOB_MS;
    if (!job || (!['FAILED', 'UNSUPPORTED'].includes(job.status) && !stale))
      throw new UnprocessableEntityException('Esta fuente no tiene un procesamiento reintentable.');
    await this.prisma.sourceProcessingJob.update({
      where: { id: job.id },
      data: { status: 'QUEUED', errorMessage: null, failureReason: null },
    });
    await this.enqueue({ jobId: job.id, projectId });
    return this.get(projectId, id);
  }

  // Sources are processed inside this API process, so a job still RUNNING when
  // the process starts was cut off by a restart: nothing would ever finish it,
  // and the queue's redelivery is ignored because the job is no longer QUEUED.
  // A job still QUEUED from before the start may have lost its queue entry
  // (the worker could not reach this API while it was down); queueing it
  // again is harmless, since only one run can claim it.
  // ponytail: assumes one API process; with several, a booting one may also
  // re-queue a job another is processing. That is harmless (the result is
  // only stored once, see runProcessingJob) but does the work twice.
  async onApplicationBootstrap() {
    try {
      const recovered = await this.recoverInterruptedJobs(new Date());
      if (recovered) logger.warn(`Re-queued ${recovered} interrupted source processing job(s).`);
    } catch (error) {
      logger.warn(
        `Could not recover interrupted source jobs: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async recoverInterruptedJobs(startedAt: Date): Promise<number> {
    if (!this.queue) return 0;
    const jobs = await this.prisma.sourceProcessingJob.findMany({
      where: { status: { in: ['RUNNING', 'QUEUED'] }, updatedAt: { lt: startedAt } },
      select: { id: true, projectId: true, status: true },
    });
    let recovered = 0;
    for (const job of jobs) {
      const reset = await this.prisma.sourceProcessingJob.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: 'QUEUED', errorMessage: null, failureReason: null },
      });
      if (reset.count !== 1) continue;
      await this.enqueue({ jobId: job.id, projectId: job.projectId });
      recovered++;
    }
    // Report jobs (DEC-127) resume with the parts they already have.
    const reports = await this.prisma.sourceReportJob.findMany({
      where: { status: { in: ['RUNNING', 'QUEUED'] }, updatedAt: { lt: startedAt } },
      select: { id: true, projectId: true, status: true },
    });
    for (const job of reports) {
      const reset = await this.prisma.sourceReportJob.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: 'QUEUED', errorMessage: null },
      });
      if (reset.count !== 1) continue;
      await this.enqueue({ jobId: job.id, projectId: job.projectId, kind: 'REPORT' });
      recovered++;
    }
    return recovered;
  }

  private async enqueue(job: SourceProcessingJobPayload) {
    try {
      await this.queue!.add(SOURCE_PROCESSING_QUEUE, job, {
        jobId: `${job.jobId}-${randomUUID()}`,
      });
    } catch {
      const data = {
        status: 'FAILED' as const,
        errorMessage: 'No se pudo iniciar el procesamiento.',
      };
      if (job.kind === 'REPORT')
        await this.prisma.sourceReportJob.update({ where: { id: job.jobId }, data });
      else await this.prisma.sourceProcessingJob.update({ where: { id: job.jobId }, data });
    }
  }

  async runProcessingJob(projectId: string, jobId: string): Promise<void> {
    const job = await this.prisma.sourceProcessingJob.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    const claimed = await this.prisma.sourceProcessingJob.updateMany({
      where: { id: jobId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count !== 1) return;
    try {
      const source = await this.prisma.artifactVersion.findFirst({
        where: {
          id: job.sourceVersionId,
          projectId,
          artifact: { artifactTypeCode: 'PROJECT_SOURCE', archivedAt: null },
        },
        include: { sourceDetail: true },
      });
      const detail = source?.sourceDetail;
      if (!source || !detail?.storageKey || !detail.mimeType)
        throw new Error('Source file is unavailable.');
      const body = await this.storage.getObject(detail.storageKey);
      const outcome = await this.extractor.extract(
        detail.mimeType,
        body,
        detail.originalFilename ?? 'source',
      );
      if (outcome.state === 'EXTRACTED') {
        await this.prisma.$transaction(async (tx) => {
          const latest = await tx.artifactVersion.findFirst({
            where: { artifactId: source.artifactId, projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (latest?.id === source.id) {
            const version = await tx.artifactVersion.create({
              data: {
                artifactId: source.artifactId,
                projectId,
                versionNumber: source.versionNumber + 1,
                title: source.title,
                status: 'DRAFT',
                origin: 'SYSTEM_GENERATED',
              },
            });
            await tx.sourceDetail.create({
              data: {
                artifactVersionId: version.id,
                sourceKind: detail.sourceKind,
                purpose: detail.purpose,
                businessArea: detail.businessArea,
                description: detail.description,
                originalFilename: detail.originalFilename,
                mimeType: detail.mimeType,
                sizeBytes: detail.sizeBytes,
                contentHash: detail.contentHash,
                storageKey: detail.storageKey,
                language: detail.language,
                extractionState: 'EXTRACTED',
                extractedText: outcome.text,
              },
            });
          }
          await tx.sourceProcessingJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETED', errorMessage: null, failureReason: null },
          });
        });
        return;
      }
      await this.prisma.sourceProcessingJob.update({
        where: { id: jobId },
        data: {
          status: outcome.state === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'FAILED',
          errorMessage:
            outcome.state === 'UNSUPPORTED'
              ? 'No hay un procesador configurado para este archivo.'
              : 'No se pudo obtener texto legible del archivo.',
          failureReason: outcome.reason,
        },
      });
    } catch (error) {
      logger.warn(
        `Source processing job ${jobId} failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.prisma.sourceProcessingJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: 'No se pudo procesar el archivo.',
          failureReason: 'UNREADABLE',
        },
      });
    }
  }

  // Reads the original file again with the current extractor (structure,
  // OCR filtering) into a new version; earlier versions stay as they were.
  // Like an upload, slow formats go through the queue: a pending version
  // first, then the version with the text.
  async reExtract(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    if (row.archivedAt)
      throw new UnprocessableEntityException('Una fuente archivada no se puede volver a extraer.');
    const latest = row.versions[0]!;
    const detail = latest.sourceDetail!;
    if (!detail.storageKey || !detail.mimeType)
      throw new UnprocessableEntityException('Esta fuente no tiene un archivo; solo contenido.');
    if (latest.sourceProcessingJobs.some((job) => ['QUEUED', 'RUNNING'].includes(job.status)))
      throw new UnprocessableEntityException('El archivo ya se está procesando.');
    const async = Boolean(this.queue) && !['text/plain', 'text/markdown'].includes(detail.mimeType);
    const extraction = async
      ? ({ state: 'PENDING' } as const)
      : await this.extractor.extract(
          detail.mimeType,
          await this.storage.getObject(detail.storageKey),
          detail.originalFilename ?? 'source',
        );
    let job: { id: string } | undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: latest.title,
          status: 'DRAFT',
          origin: 'SYSTEM_GENERATED',
        },
      });
      await tx.sourceDetail.create({
        data: {
          artifactVersionId: version.id,
          sourceKind: detail.sourceKind,
          purpose: detail.purpose,
          businessArea: detail.businessArea,
          description: detail.description,
          originalFilename: detail.originalFilename,
          mimeType: detail.mimeType,
          sizeBytes: detail.sizeBytes,
          contentHash: detail.contentHash,
          storageKey: detail.storageKey,
          language: detail.language,
          extractionState: extraction.state,
          extractedText: extraction.state === 'EXTRACTED' ? extraction.text : null,
          extractionFailureReason:
            extraction.state === 'FAILED' || extraction.state === 'UNSUPPORTED'
              ? extraction.reason
              : null,
        },
      });
      if (async)
        job = await tx.sourceProcessingJob.create({
          data: {
            projectId,
            sourceVersionId: version.id,
            processor: detail.mimeType!.startsWith('audio/')
              ? 'TRANSCRIPTION'
              : detail.mimeType!.startsWith('image/')
                ? 'OCR'
                : detail.mimeType === 'application/pdf'
                  ? 'PDF'
                  : 'DOCUMENT',
          },
        });
      return this.loadAndMap(tx, id, version.id);
    });
    if (job) await this.enqueue({ jobId: job.id, projectId });
    return job ? this.get(projectId, id) : result;
  }

  async submitManualTranscript(projectId: string, id: string, transcript: string) {
    const row = await this.findLatest(projectId, id);
    const latest = row.versions[0]!;
    const detail = latest.sourceDetail!;
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: latest.title,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await tx.sourceDetail.create({
        data: {
          artifactVersionId: version.id,
          sourceKind: detail.sourceKind,
          purpose: detail.purpose,
          businessArea: detail.businessArea,
          description: detail.description,
          originalFilename: detail.originalFilename,
          mimeType: detail.mimeType,
          sizeBytes: detail.sizeBytes,
          contentHash: detail.contentHash,
          storageKey: detail.storageKey,
          language: detail.language,
          extractionState: 'MANUAL',
          extractedText: transcript,
        },
      });
      return this.loadAndMap(tx, id, version.id);
    });
  }

  // "Editing" a Source never mutates the current row (ArtifactVersion
  // content is immutable by design — spec §15.2/§5.3); it creates the next
  // version carrying the corrected metadata, exactly like submitManualTranscript.
  async editMetadata(projectId: string, id: string, metadata: SourceMetadataInput) {
    const row = await this.findLatest(projectId, id);
    const latest = row.versions[0]!;
    const detail = latest.sourceDetail!;
    if (!detail.storageKey && !metadata.description.trim())
      throw new UnprocessableEntityException('El contenido de la fuente no puede estar vacío.');
    // A retired kind may be kept, never chosen anew.
    if (isLegacyKind(metadata.sourceKind) && metadata.sourceKind !== detail.sourceKind)
      throw new UnprocessableEntityException(
        'Este tipo de fuente ya no está disponible. Use Documento PDF, Imagen u Otro.',
      );
    if (detail.mimeType) assertKindMatchesFile(metadata.sourceKind, detail.mimeType);
    if (
      detail.extractionState === 'PENDING' &&
      latest.sourceProcessingJobs.some((job) => ['QUEUED', 'RUNNING'].includes(job.status))
    )
      throw new UnprocessableEntityException(
        'Espere a que termine el procesamiento o ingrese una transcripción manual.',
      );
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: id,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: metadata.title,
          status: 'DRAFT',
          origin: 'MANUAL',
        },
      });
      await tx.sourceDetail.create({
        data: {
          artifactVersionId: version.id,
          sourceKind: metadata.sourceKind,
          purpose: metadata.purpose,
          businessArea: metadata.businessArea,
          description: metadata.description,
          originalFilename: detail.originalFilename,
          mimeType: detail.mimeType,
          sizeBytes: detail.sizeBytes,
          contentHash: detail.contentHash,
          storageKey: detail.storageKey,
          language: metadata.language,
          extractionState: detail.extractionState,
          extractedText: detail.storageKey ? detail.extractedText : metadata.description,
          extractionFailureReason: detail.extractionFailureReason,
        },
      });
      return this.loadAndMap(tx, id, version.id);
    });
  }

  private async hasApprovedHistory(artifactId: string): Promise<boolean> {
    const count = await this.prisma.artifactVersion.count({
      where: { artifactId, status: 'APPROVED' },
    });
    return count > 0;
  }

  // Archival is the alternative to deletion once a Source has approved
  // history (spec §87: "fuentes utilizadas → archivar antes que borrar").
  // Purely additive on the Artifact row — never touches any ArtifactVersion,
  // so it needs no immutability exception.
  // Archiving keeps the history; with approved history it is a change of the
  // Sources stage, so the stages after it ask to be reviewed (DEC-137).
  async archive(projectId: string, id: string, userId: string | null = null) {
    return this.setArchived(projectId, id, true, userId);
  }

  async restore(projectId: string, id: string, userId: string | null = null) {
    return this.setArchived(projectId, id, false, userId);
  }

  private async setArchived(
    projectId: string,
    id: string,
    archive: boolean,
    userId: string | null,
  ) {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'PROJECT_SOURCE' },
    });
    if (!artifact) throw new NotFoundException('Fuente no encontrada.');
    if (archive && artifact.archivedAt)
      throw new UnprocessableEntityException('Esta fuente ya está archivada.');
    if (!archive && !artifact.archivedAt)
      throw new UnprocessableEntityException('Esta fuente no está archivada.');

    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.update({
        where: { id },
        data: { archivedAt: archive ? new Date() : null },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: archive ? 'SOURCE_ARCHIVED' : 'SOURCE_RESTORED',
          entityType: 'ARTIFACT',
          entityId: id,
          metadata: { code: artifact.code },
        },
        tx,
      );
    });
    const row = await this.findLatest(projectId, id);
    return this.map(row, row.versions[0]!, await this.hasApprovedHistory(id));
  }

  // Hard delete — only while no version of this Source has ever been
  // APPROVED (enforced again at the database level by the immutability
  // trigger, not just here). Mirrors ProjectsService.delete's reasoning.
  async delete(projectId: string, id: string): Promise<void> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'PROJECT_SOURCE' },
    });
    if (!artifact) throw new NotFoundException('Fuente no encontrada.');

    if (await this.hasApprovedHistory(id))
      throw new UnprocessableEntityException(
        'No se puede eliminar una fuente con versiones aprobadas; el historial aprobado no puede borrarse. Archive la fuente en su lugar.',
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM source_report_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ${id})`;
      await tx.$executeRaw`DELETE FROM source_report_candidates WHERE source_version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ${id})`;
      await tx.$executeRaw`DELETE FROM source_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ${id})`;
      await tx.$executeRaw`DELETE FROM ai_runs WHERE source_artifact_version_id IN (SELECT id FROM artifact_versions WHERE artifact_id = ${id})`;
      await tx.$executeRaw`DELETE FROM artifact_versions WHERE artifact_id = ${id}`;
      await tx.$executeRaw`DELETE FROM artifacts WHERE id = ${id}`;
    });
  }

  capabilities(): SourceCapabilitiesResponse {
    return {
      ...this.extractor.capabilities,
      maxFileSizeBytes: SOURCE_MAX_FILE_SIZE_BYTES,
      maxPdfPages: SOURCE_LIMITS.maxPdfPages,
      maxScannedPdfPages: SOURCE_LIMITS.maxScannedPdfPages,
      maxExtractedCharacters: SOURCE_LIMITS.maxExtractedCharacters,
    };
  }

  async download(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const detail = row.versions[0]!.sourceDetail!;
    if (!detail.storageKey)
      throw new UnprocessableEntityException('Esta fuente no tiene un archivo; solo contenido.');
    try {
      const body = await this.storage.getObject(detail.storageKey);
      return {
        body,
        mimeType: detail.mimeType!,
        filename: repairFilenameEncoding(detail.originalFilename!),
      };
    } catch (error) {
      if (error instanceof StorageProviderError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
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
      where: { id, projectId, artifactId, artifact: { artifactTypeCode: 'PROJECT_SOURCE' } },
      include: { sourceDetail: true },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    if ((status === 'IN_REVIEW' || status === 'APPROVED') && !version.sourceDetail?.extractedText)
      throw new UnprocessableEntityException(
        'La fuente no tiene conocimiento utilizable (texto extraído o transcripción manual).',
      );
    const updatedVersion = await provenanceGuard(
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

    if (status === 'APPROVED') {
      // Run asynchronously without awaiting so the transition is fast
      this.knowledgeBase.indexSource(projectId, id).catch((err) => {
        console.error('Failed to index source:', err);
      });
    }

    return updatedVersion;
  }

  // Generates the report in this request. The background job (DEC-127) runs
  // the same algorithm, keeping each part so it can resume.
  async generateReport(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    const text = version.sourceDetail!.extractedText;
    if (!text)
      throw new UnprocessableEntityException(
        'La fuente no tiene texto extraído ni transcripción manual.',
      );
    try {
      return this.mapCandidate(await this.buildReport(projectId, version.id, text, null));
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
  }

  // Starts (or resumes, after a failure) the report of the latest version.
  async requestReport(projectId: string, id: string) {
    if (!this.queue) throw new ServiceUnavailableException('El procesamiento no está disponible.');
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    if (!version.sourceDetail!.extractedText)
      throw new UnprocessableEntityException(
        'La fuente no tiene texto extraído ni transcripción manual.',
      );
    if (version.sourceDetail!.report)
      throw new UnprocessableEntityException('Esta versión ya tiene un informe.');
    const latest = await this.prisma.sourceReportJob.findFirst({
      where: { projectId, sourceVersionId: version.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.status === 'QUEUED' || latest?.status === 'RUNNING')
      return this.reportJob(projectId, id);
    // A failed job resumes with the parts it already has.
    const job =
      latest?.status === 'FAILED'
        ? await this.prisma.sourceReportJob.update({
            where: { id: latest.id },
            data: { status: 'QUEUED', errorMessage: null },
          })
        : await this.prisma.sourceReportJob.create({
            data: { projectId, sourceVersionId: version.id },
          });
    await this.enqueue({ jobId: job.id, projectId, kind: 'REPORT' });
    return this.reportJob(projectId, id);
  }

  async reportJob(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const job = await this.prisma.sourceReportJob.findFirst({
      where: { projectId, sourceVersionId: row.versions[0]!.id },
      orderBy: { createdAt: 'desc' },
      include: { candidate: true },
    });
    return {
      job: job
        ? {
            id: job.id,
            sourceVersionId: job.sourceVersionId,
            status: job.status,
            totalParts: job.totalParts,
            completedParts: job.completedParts,
            errorMessage: job.errorMessage,
            candidate: job.candidate ? this.mapCandidate(job.candidate) : null,
            updatedAt: job.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async runReportJob(projectId: string, jobId: string): Promise<void> {
    const job = await this.prisma.sourceReportJob.findFirst({
      where: { id: jobId, projectId },
      include: { sourceVersion: { include: { sourceDetail: true } } },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    const claimed = await this.prisma.sourceReportJob.updateMany({
      where: { id: jobId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count !== 1) return;
    try {
      const text = job.sourceVersion.sourceDetail?.extractedText;
      if (!text)
        throw new UnprocessableEntityException(
          'La fuente no tiene texto extraído ni transcripción manual.',
        );
      const candidate = await this.buildReport(projectId, job.sourceVersionId, text, job.id);
      await this.prisma.sourceReportJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', candidateId: candidate.id },
      });
    } catch (error) {
      const known = error instanceof AIError || error instanceof UnprocessableEntityException;
      if (!known)
        logger.warn(
          `Source report job "${jobId}" failed: ${error instanceof Error ? error.message : error}`,
        );
      await this.prisma.sourceReportJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: known
            ? (error as Error).message
            : 'No se pudo generar el reporte. Intente de nuevo.',
        },
      });
    }
  }

  // DEC-127: a text that fits the most capable available provider is read
  // in one request; a longer one part by part, then merged. With a job, the
  // plan and every finished part are stored, so it resumes after a failure.
  private async buildReport(
    projectId: string,
    sourceVersionId: string,
    text: string,
    jobId: string | null,
  ) {
    const language = await getProjectLanguage(this.prisma, projectId);
    const job = jobId
      ? await this.prisma.sourceReportJob.findUniqueOrThrow({
          where: { id: jobId },
          include: { parts: { orderBy: { position: 'asc' } } },
        })
      : null;
    const budget = inputBudget(this.ai.maxInputTokens);
    const ask = async (promptKey: string, content: unknown) => {
      const result = await this.ai.generateStructured({
        projectId,
        language,
        sourceArtifactVersionId: sourceVersionId,
        promptKey,
        promptVersion: 1,
        messages: [{ role: 'user', content: JSON.stringify(content) }],
        outputSchema: sourceReportContentSchema,
        schemaName: 'source_report',
        maxOutputTokens: SOURCE_REPORT_MAX_OUTPUT_TOKENS,
      });
      return { data: result.data, runId: result.metadata.runId };
    };
    const progress = (data: Prisma.SourceReportJobUpdateInput) =>
      jobId ? this.prisma.sourceReportJob.update({ where: { id: jobId }, data }) : undefined;

    let report: { data: SourceReportContent; runId: string };
    if (!job?.partTokens && estimateTokens(JSON.stringify({ sourceText: text })) <= budget) {
      await progress({ totalParts: 1 });
      report = await ask('source-report.generate', { sourceText: text });
      await progress({ completedParts: 1 });
    } else {
      const partTokens = job?.partTokens ?? budget;
      const parts = planReportParts(splitIntoSections(text), partTokens);
      if (parts.length > MAX_REPORT_PARTS)
        throw new UnprocessableEntityException(
          `La fuente es demasiado larga para los proveedores de IA disponibles: se necesitarían ${parts.length} partes y el máximo es ${MAX_REPORT_PARTS}. Divídala en varias fuentes.`,
        );
      if (!job?.partTokens) await progress({ partTokens, totalParts: parts.length });
      const done = new Map(
        (job?.parts ?? []).map((part) => [
          part.position,
          { data: part.content as SourceReportContent, runId: part.aiRunId },
        ]),
      );
      for (const [position, sections] of parts.entries()) {
        if (done.has(position)) continue;
        const result = await ask('source-report.summarize-part', {
          part: position + 1,
          totalParts: parts.length,
          sections,
        });
        done.set(position, result);
        if (jobId)
          await this.prisma.$transaction([
            this.prisma.sourceReportJobPart.create({
              data: { jobId, position, content: result.data, aiRunId: result.runId },
            }),
            this.prisma.sourceReportJob.update({
              where: { id: jobId },
              data: { completedParts: done.size },
            }),
          ]);
      }
      // Merged in batches that fit one request, until one report remains.
      let level = parts.map((_, position) => done.get(position)!);
      while (level.length > 1) {
        const merged: typeof level = [];
        for (const batch of mergeBatches(level, budget))
          merged.push(
            await ask('source-report.merge', { partialReports: batch.map((item) => item.data) }),
          );
        level = merged;
      }
      report = level[0]!;
    }
    return this.prisma.sourceReportCandidate.create({
      data: { projectId, sourceVersionId, aiRunId: report.runId, content: report.data },
    });
  }

  async acceptReport(projectId: string, id: string, candidateId: string) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    if (version.sourceDetail!.report)
      throw new UnprocessableEntityException('Esta versión ya tiene un informe.');
    const candidate = await this.prisma.sourceReportCandidate.findFirst({
      where: { id: candidateId, projectId, sourceVersionId: version.id },
    });
    if (!candidate) throw new NotFoundException('Candidato no encontrado.');
    const parsed = sourceReportContentSchema.safeParse(candidate.content);
    if (!parsed.success)
      throw new UnprocessableEntityException('El candidato persistido no es válido.');
    await this.prisma.sourceReportDetail.create({
      data: {
        artifactVersionId: version.id,
        content: parsed.data,
        generationCandidateId: candidate.id,
        aiRunId: candidate.aiRunId,
      },
    });
    return this.getReport(projectId, id);
  }

  async submitManualReport(projectId: string, id: string, content: SourceReportContent) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    if (version.sourceDetail!.report)
      throw new UnprocessableEntityException('Esta versión ya tiene un informe.');
    await this.prisma.sourceReportDetail.create({
      data: { artifactVersionId: version.id, content },
    });
    return this.getReport(projectId, id);
  }

  async getReport(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const report = row.versions[0]!.sourceDetail!.report;
    if (!report) throw new NotFoundException('Informe no encontrado.');
    return {
      sourceVersionId: report.artifactVersionId,
      content: report.content as SourceReportContent,
      generationCandidateId: report.generationCandidateId,
      aiRunId: report.aiRunId,
    };
  }

  private async findLatest(projectId: string, id: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'PROJECT_SOURCE' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            sourceDetail: { include: { report: true } },
            sourceProcessingJobs: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });
    if (!row?.versions[0]?.sourceDetail) throw new NotFoundException('Fuente no encontrada.');
    return row;
  }
  private async allocate(tx: Tx, projectId: string, prefix: string) {
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,${prefix},1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    return rows[0]!.last_number;
  }
  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: {
        sourceDetail: { include: { report: true } },
        sourceProcessingJobs: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
    const approvedCount = await tx.artifactVersion.count({
      where: { artifactId, status: 'APPROVED' },
    });
    return this.map(artifact, version, approvedCount > 0);
  }
  private map(
    artifact: {
      id: string;
      projectId: string;
      code: string;
      createdAt: Date;
      archivedAt: Date | null;
    },
    version: {
      id: string;
      versionNumber: number;
      status: string;
      origin: string;
      createdAt: Date;
      title: string;
      sourceDetail: {
        sourceKind: string;
        purpose: string;
        businessArea: string | null;
        description: string;
        originalFilename: string | null;
        mimeType: string | null;
        sizeBytes: number | null;
        contentHash: string | null;
        extractionState: string;
        extractedText: string | null;
        extractionFailureReason: string | null;
        language: string | null;
        report: unknown;
      } | null;
      sourceProcessingJobs?: {
        id: string;
        status: string;
        processor: string;
        errorMessage: string | null;
        failureReason: string | null;
        updatedAt: Date;
      }[];
    },
    hasApprovedHistory: boolean,
  ) {
    const detail = version.sourceDetail!;
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      createdAt: artifact.createdAt.toISOString(),
      archivedAt: artifact.archivedAt ? artifact.archivedAt.toISOString() : null,
      hasApprovedHistory,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      processing: version.sourceProcessingJobs?.[0]
        ? {
            id: version.sourceProcessingJobs[0].id,
            status: version.sourceProcessingJobs[0].status,
            processor: version.sourceProcessingJobs[0].processor,
            errorMessage: version.sourceProcessingJobs[0].errorMessage,
            failureReason: version.sourceProcessingJobs[0].failureReason,
            updatedAt: version.sourceProcessingJobs[0].updatedAt.toISOString(),
          }
        : null,
      source: {
        title: version.title,
        sourceKind: detail.sourceKind,
        purpose: detail.purpose,
        businessArea: detail.businessArea,
        description: detail.description,
        originalFilename:
          detail.originalFilename && repairFilenameEncoding(detail.originalFilename),
        mimeType: detail.mimeType,
        sizeBytes: detail.sizeBytes,
        contentHash: detail.contentHash,
        language: detail.language,
        extractionState: detail.extractionState,
        extractionFailureReason: detail.extractionFailureReason,
        hasExtractedText: Boolean(detail.extractedText),
        hasReport: Boolean(detail.report),
      },
    };
  }
  private mapCandidate(candidate: {
    id: string;
    sourceVersionId: string;
    aiRunId: string;
    content: unknown;
    createdAt: Date;
  }) {
    return {
      id: candidate.id,
      sourceVersionId: candidate.sourceVersionId,
      aiRunId: candidate.aiRunId,
      content: candidate.content as SourceReportContent,
      createdAt: candidate.createdAt.toISOString(),
    };
  }
}

// Names stored before uploads were read as UTF-8 came in mis-decoded as
// latin1 ("EstÃ¡ndares.pdf"). Their history is immutable, so they are
// repaired when shown: decoding back only when the result is valid UTF-8.
export function repairFilenameEncoding(name: string): string {
  // Only a name made of single bytes can be the latin1 reading of UTF-8.
  if ([...name].some((char) => char.charCodeAt(0) > 0xff)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const invalid = [...decoded].some((char) => char.charCodeAt(0) === 0xfffd);
  return invalid ? name : decoded;
}

// Never trusted for storage paths, but still useful/safe to display back to
// the user; strip control characters and separators defensively.
function sanitizeFilenameForDisplay(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const printable = Array.from(base)
    .filter((char) => char.codePointAt(0)! >= 0x20)
    .join('');
  return printable.slice(0, 255) || 'archivo';
}

function isLegacyKind(kind: ProjectSourceKind): boolean {
  return (LEGACY_SOURCE_KINDS as readonly string[]).includes(kind);
}

// The chosen kind must fit the file (the web corrects it before uploading).
function assertKindMatchesFile(kind: ProjectSourceKind, mimeType: string) {
  if (!sourceKindAcceptsMimeType(kind, mimeType))
    throw new UnprocessableEntityException(
      'El tipo de fuente no corresponde al formato del archivo.',
    );
}
