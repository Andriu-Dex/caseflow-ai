import { randomUUID, createHash } from 'node:crypto';
import { Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { SOURCE_PROCESSING_QUEUE, type SourceProcessingJobPayload } from '@caseflow-ai/domain';
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { canTransitionArtifactVersionStatus, formatArtifactCode } from '@caseflow-ai/domain';
import { StorageProviderError, type StorageProvider } from '@caseflow-ai/integrations';
import {
  ALLOWED_SOURCE_MIME_TYPES,
  sourceReportContentSchema,
  type SourceMetadataInput,
  type SourceReportContent,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import type { Prisma } from '../generated/prisma/client';
import { SourceContentExtractor } from './source-content-extractor';
import { STORAGE_PROVIDER } from './storage-provider.token';
import { SOURCE_QUEUE } from './source-queue.token';
import { hasExpectedFileSignature } from './source-file-validation';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';

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
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    private readonly extractor: SourceContentExtractor,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly knowledgeBase: KnowledgeBaseService,
    @Optional() @Inject(SOURCE_QUEUE) private readonly queue?: Queue<SourceProcessingJobPayload>,
  ) {}

  async create(
    projectId: string,
    metadata: SourceMetadataInput,
    file: UploadedSourceFile | undefined,
  ) {
    if (!file && !metadata.description.trim())
      throw new UnprocessableEntityException('Escriba contenido o adjunte un archivo.');
    let fileFields: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      contentHash: string;
      storageKey: string;
      extractionState: 'EXTRACTED' | 'MANUAL' | 'UNSUPPORTED' | 'FAILED' | 'PENDING';
      extractedText: string | null;
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
      data: { status: 'QUEUED', errorMessage: null },
    });
    try {
      await this.queue.add(
        SOURCE_PROCESSING_QUEUE,
        { jobId: job.id, projectId },
        { jobId: `${job.id}-${randomUUID()}` },
      );
    } catch {
      await this.prisma.sourceProcessingJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: 'No se pudo iniciar el procesamiento.' },
      });
    }
    return this.get(projectId, id);
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
            data: { status: 'COMPLETED', errorMessage: null },
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
              ? 'No hay un transcriptor configurado para este archivo.'
              : 'No se pudo obtener texto legible del archivo.',
        },
      });
    } catch (error) {
      logger.warn(
        `Source processing job ${jobId} failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.prisma.sourceProcessingJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: 'No se pudo procesar el archivo.' },
      });
    }
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
  async archive(projectId: string, id: string) {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'PROJECT_SOURCE' },
    });
    if (!artifact) throw new NotFoundException('Fuente no encontrada.');
    if (artifact.archivedAt)
      throw new UnprocessableEntityException('Esta fuente ya está archivada.');

    await this.prisma.artifact.update({ where: { id }, data: { archivedAt: new Date() } });
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

  async download(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const detail = row.versions[0]!.sourceDetail!;
    if (!detail.storageKey)
      throw new UnprocessableEntityException('Esta fuente no tiene un archivo; solo contenido.');
    try {
      const body = await this.storage.getObject(detail.storageKey);
      return { body, mimeType: detail.mimeType!, filename: detail.originalFilename! };
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
    const updatedVersion = await this.prisma.artifactVersion.update({
      where: { id },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });

    if (status === 'APPROVED') {
      // Run asynchronously without awaiting so the transition is fast
      this.knowledgeBase.fragmentAndEmbedSource(projectId, id).catch((err) => {
        console.error('Failed to embed source:', err);
      });
    }

    return updatedVersion;
  }

  async generateReport(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    const detail = version.sourceDetail!;
    if (!detail.extractedText)
      throw new UnprocessableEntityException(
        'La fuente no tiene texto extraído ni transcripción manual.',
      );
    const language = await getProjectLanguage(this.prisma, projectId);
    try {
      const result = await this.ai.generateStructured({
        projectId,
        language,
        sourceArtifactVersionId: version.id,
        promptKey: 'source-report.generate',
        promptVersion: 1,
        messages: [{ role: 'user', content: JSON.stringify({ sourceText: detail.extractedText }) }],
        outputSchema: sourceReportContentSchema,
        schemaName: 'source_report',
        maxOutputTokens: SOURCE_REPORT_MAX_OUTPUT_TOKENS,
      });
      const candidate = await this.prisma.sourceReportCandidate.create({
        data: {
          projectId,
          sourceVersionId: version.id,
          aiRunId: result.metadata.runId,
          content: result.data,
        },
      });
      return this.mapCandidate(candidate);
    } catch (error) {
      if (error instanceof AIError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
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
        language: string | null;
        report: unknown;
      } | null;
      sourceProcessingJobs?: {
        id: string;
        status: string;
        processor: string;
        errorMessage: string | null;
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
            updatedAt: version.sourceProcessingJobs[0].updatedAt.toISOString(),
          }
        : null,
      source: {
        title: version.title,
        sourceKind: detail.sourceKind,
        purpose: detail.purpose,
        businessArea: detail.businessArea,
        description: detail.description,
        originalFilename: detail.originalFilename,
        mimeType: detail.mimeType,
        sizeBytes: detail.sizeBytes,
        contentHash: detail.contentHash,
        language: detail.language,
        extractionState: detail.extractionState,
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

// Never trusted for storage paths, but still useful/safe to display back to
// the user; strip control characters and separators defensively.
function sanitizeFilenameForDisplay(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const printable = Array.from(base)
    .filter((char) => char.codePointAt(0)! >= 0x20)
    .join('');
  return printable.slice(0, 255) || 'archivo';
}
