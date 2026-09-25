import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import { FakeStorageProvider, StorageProviderError } from '@caseflow-ai/integrations';
import type { PrismaService } from '../database/prisma.service';
import { SourceContentExtractor } from './source-content-extractor';
import { SourcesService, type UploadedSourceFile } from './sources.service';

const now = new Date('2026-01-01T00:00:00Z');
const artifact = { id: 'artifact', projectId: 'project', code: 'SRC-001', createdAt: now };
const detail = {
  sourceKind: 'NOTES',
  purpose: 'Notas de reunión',
  businessArea: null,
  description: null,
  originalFilename: 'notas.txt',
  mimeType: 'text/plain',
  sizeBytes: 5,
  contentHash: 'hash',
  storageKey: 'sources/project/key.txt',
  language: null,
  extractionState: 'EXTRACTED',
  extractedText: 'hola',
  report: null,
};
const version = {
  id: 'version',
  versionNumber: 1,
  status: 'DRAFT',
  origin: 'MANUAL',
  title: 'Notas',
  createdAt: now,
  sourceDetail: detail,
};

function file(overrides: Partial<UploadedSourceFile> = {}): UploadedSourceFile {
  return {
    originalname: 'notas.txt',
    mimetype: 'text/plain',
    size: 5,
    buffer: Buffer.from('hola'),
    ...overrides,
  };
}
const metadata = {
  title: 'Notas',
  sourceKind: 'NOTES' as const,
  purpose: 'Notas de reunión',
  description: 'Contenido de prueba.',
};

function setup() {
  const tx = {
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project' }) },
    artifact: {
      create: vi.fn().mockResolvedValue(artifact),
      findUniqueOrThrow: vi.fn().mockResolvedValue(artifact),
    },
    artifactVersion: {
      create: vi.fn().mockResolvedValue(version),
      findUniqueOrThrow: vi.fn().mockResolvedValue(version),
      count: vi.fn().mockResolvedValue(0),
    },
    sourceDetail: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
    artifact: { findFirst: vi.fn(), findMany: vi.fn() },
    artifactVersion: { findFirst: vi.fn(), update: vi.fn() },
    sourceReportCandidate: { create: vi.fn(), findFirst: vi.fn() },
    sourceReportDetail: { create: vi.fn() },
  };
  const ai = { generateStructured: vi.fn() };
  const storage = new FakeStorageProvider();
  return {
    tx,
    prisma,
    ai,
    storage,
    service: new SourcesService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      new SourceContentExtractor(),
      storage,
    ),
  };
}

describe('SourcesService', () => {
  it('uploads a source, extracts text locally and never fabricates a transcript', async () => {
    const { service, tx, storage } = setup();
    const putObject = vi.spyOn(storage, 'putObject');
    const result = await service.create('project', metadata, file());
    expect(result).toMatchObject({
      code: 'SRC-001',
      source: { extractionState: 'EXTRACTED', hasExtractedText: true, hasReport: false },
    });
    expect(tx.sourceDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ extractionState: 'EXTRACTED', extractedText: 'hola' }),
      }),
    );
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/^sources\/project\//) }),
    );
  });

  it('reports UNSUPPORTED extraction for images without inventing OCR content', async () => {
    const { service, tx } = setup();
    await service.create(
      'project',
      metadata,
      file({ originalname: 'foto.png', mimetype: 'image/png' }),
    );
    expect(tx.sourceDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ extractionState: 'UNSUPPORTED', extractedText: null }),
      }),
    );
  });

  it('rejects a disallowed MIME type before touching storage or the database', async () => {
    const { service, prisma } = setup();
    await expect(
      service.create('project', metadata, file({ mimetype: 'application/x-msdownload' })),
    ).rejects.toThrow('no permitido');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create any row when the storage upload fails', async () => {
    const { prisma, ai } = setup();
    const failingStorage = {
      id: 'failing',
      putObject: vi
        .fn()
        .mockRejectedValue(new StorageProviderError('STORAGE_PROVIDER_UNAVAILABLE', 'down')),
      getObject: vi.fn(),
    };
    const service = new SourcesService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      new SourceContentExtractor(),
      failingStorage,
    );
    await expect(service.create('project', metadata, file())).rejects.toMatchObject({
      response: { code: 'STORAGE_PROVIDER_UNAVAILABLE' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a new version for a manual transcript, preserving file metadata', async () => {
    const { service, prisma, tx } = setup();
    prisma.artifact.findFirst.mockResolvedValue({ ...artifact, versions: [version] });
    await service.submitManualTranscript('project', 'artifact', 'transcripción manual');
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) }),
    );
    expect(tx.sourceDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extractionState: 'MANUAL',
          extractedText: 'transcripción manual',
          storageKey: detail.storageKey,
        }),
      }),
    );
  });

  it('blocks review/approval transitions without usable extracted knowledge', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValue({
      id: 'version',
      status: 'DRAFT',
      submittedAt: null,
      approvedAt: null,
      sourceDetail: { ...detail, extractedText: null, extractionState: 'UNSUPPORTED' },
    });
    await expect(service.transition('project', 'artifact', 'version', 'IN_REVIEW')).rejects.toThrow(
      'conocimiento utilizable',
    );
  });

  it('allows approval once extracted knowledge exists', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValue({
      id: 'version',
      status: 'DRAFT',
      submittedAt: null,
      approvedAt: null,
      sourceDetail: detail,
    });
    await service.transition('project', 'artifact', 'version', 'IN_REVIEW');
    expect(prisma.artifactVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_REVIEW' }) }),
    );
  });

  it('generates and accepts a candidate-first report, never auto-approving it', async () => {
    const { service, prisma, ai } = setup();
    prisma.artifact.findFirst.mockResolvedValue({ ...artifact, versions: [version] });
    ai.generateStructured.mockResolvedValue({
      data: {
        summary: 'resumen',
        actors: [],
        businessConcepts: [],
        candidateBusinessRules: [],
        candidateConstraints: [],
        needs: [],
        importantFacts: [],
        ambiguities: [],
      },
      metadata: { runId: 'run' },
    });
    prisma.sourceReportCandidate.create.mockResolvedValue({
      id: 'candidate',
      sourceVersionId: 'version',
      aiRunId: 'run',
      content: {
        summary: 'resumen',
        actors: [],
        businessConcepts: [],
        candidateBusinessRules: [],
        candidateConstraints: [],
        needs: [],
        importantFacts: [],
        ambiguities: [],
      },
      createdAt: now,
    });
    const candidate = await service.generateReport('project', 'artifact');
    expect(candidate).toMatchObject({ id: 'candidate', content: { summary: 'resumen' } });
    expect(prisma.sourceReportDetail.create).not.toHaveBeenCalled();

    prisma.sourceReportCandidate.findFirst.mockResolvedValue({
      id: 'candidate',
      aiRunId: 'run',
      content: candidate.content,
    });
    // Pre-acceptance check (no report yet) then the post-creation re-fetch.
    prisma.artifact.findFirst
      .mockResolvedValueOnce({ ...artifact, versions: [version] })
      .mockResolvedValue({
        ...artifact,
        versions: [
          {
            ...version,
            sourceDetail: {
              ...detail,
              report: {
                artifactVersionId: 'version',
                content: candidate.content,
                generationCandidateId: 'candidate',
                aiRunId: 'run',
              },
            },
          },
        ],
      });
    await service.acceptReport('project', 'artifact', 'candidate');
    expect(prisma.sourceReportDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generationCandidateId: 'candidate', aiRunId: 'run' }),
      }),
    );
  });

  it('normalizes AI failure without persisting a report candidate', async () => {
    const { service, prisma, ai } = setup();
    prisma.artifact.findFirst.mockResolvedValue({ ...artifact, versions: [version] });
    ai.generateStructured.mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe'));
    await expect(service.generateReport('project', 'artifact')).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
    expect(prisma.sourceReportCandidate.create).not.toHaveBeenCalled();
  });

  it('rejects generating a report without extracted text', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [{ ...version, sourceDetail: { ...detail, extractedText: null } }],
    });
    await expect(service.generateReport('project', 'artifact')).rejects.toThrow('texto extraído');
  });

  it('enforces project isolation: a source from another project is not found', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue(null);
    await expect(service.get('other-project', 'artifact')).rejects.toThrow('no encontrada');
  });
});
