import { randomUUID, createHash } from 'node:crypto';
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
import type { Prisma } from '../generated/prisma/client';
import { SourceContentExtractor } from './source-content-extractor';
import { STORAGE_PROVIDER } from './storage-provider.token';

type Tx = Prisma.TransactionClient;
const SOURCE_REPORT_MAX_OUTPUT_TOKENS = 4096;

export interface UploadedSourceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function safeStorageKey(projectId: string, mimeType: string): string {
  const extension = ALLOWED_SOURCE_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_SOURCE_MIME_TYPES)[number],
  )
    ? `.${mimeType.split('/')[1]!.replace(/[^a-z0-9]/gi, '')}`
    : '';
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
  ) {}

  async create(
    projectId: string,
    metadata: SourceMetadataInput,
    file: UploadedSourceFile | undefined,
  ) {
    let fileFields: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      contentHash: string;
      storageKey: string;
      extractionState: 'EXTRACTED' | 'MANUAL' | 'UNSUPPORTED' | 'FAILED' | 'PENDING';
      extractedText: string | null;
    };

    if (file) {
      if (
        !ALLOWED_SOURCE_MIME_TYPES.includes(
          file.mimetype as (typeof ALLOWED_SOURCE_MIME_TYPES)[number],
        )
      )
        throw new UnprocessableEntityException('Tipo de archivo no permitido.');
      if (file.size <= 0) throw new UnprocessableEntityException('El archivo está vacío.');

      const contentHash = createHash('sha256').update(file.buffer).digest('hex');
      const storageKey = safeStorageKey(projectId, file.mimetype);
      const extraction = await this.extractor.extract(file.mimetype, file.buffer);
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

    return this.prisma.$transaction(async (tx) => {
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
      return this.loadAndMap(tx, artifact.id, version.id);
    });
  }

  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'PROJECT_SOURCE' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { sourceDetail: { include: { report: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }

  async get(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    return this.map(row, row.versions[0]!);
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

  // Hard delete — only while no version of this Source has ever been
  // APPROVED (enforced again at the database level by the immutability
  // trigger, not just here). Mirrors ProjectsService.delete's reasoning.
  async delete(projectId: string, id: string): Promise<void> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id, projectId, artifactTypeCode: 'PROJECT_SOURCE' },
    });
    if (!artifact) throw new NotFoundException('Fuente no encontrada.');

    const approvedCount = await this.prisma.artifactVersion.count({
      where: { artifactId: id, status: 'APPROVED' },
    });
    if (approvedCount > 0)
      throw new UnprocessableEntityException(
        'No se puede eliminar una fuente con versiones aprobadas; el historial aprobado no puede borrarse.',
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
    return this.prisma.artifactVersion.update({
      where: { id },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });
  }

  async generateReport(projectId: string, id: string) {
    const row = await this.findLatest(projectId, id);
    const version = row.versions[0]!;
    const detail = version.sourceDetail!;
    if (!detail.extractedText)
      throw new UnprocessableEntityException(
        'La fuente no tiene texto extraído ni transcripción manual.',
      );
    try {
      const result = await this.ai.generateStructured({
        projectId,
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
          include: { sourceDetail: { include: { report: true } } },
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
      include: { sourceDetail: { include: { report: true } } },
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
    },
  ) {
    const detail = version.sourceDetail!;
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      createdAt: artifact.createdAt.toISOString(),
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
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
