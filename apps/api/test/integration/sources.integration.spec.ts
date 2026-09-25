import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeStorageProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { SourceContentExtractor } from '../../src/sources/source-content-extractor';
import { SourcesService } from '../../src/sources/sources.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n' +
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 44>>stream\n' +
    'BT /F1 24 Tf 10 100 Td (Hello CASEFlow) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n' +
    'trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF',
);

const reportContent = {
  summary: 'Resumen',
  actors: ['Cliente'],
  businessConcepts: [],
  candidateBusinessRules: [],
  candidateConstraints: [],
  needs: [],
  importantFacts: [],
  ambiguities: [],
};

describe('Project Source intake integration', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma, 'Sources');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
  });
  afterAll(async () => ctx.close());

  it('uploads a real text-layer PDF and extracts its text locally, without any AI/OCR provider', async () => {
    const source = await ctx.sources.create(
      projectId,
      {
        title: 'Acta de reunión',
        sourceKind: 'PDF',
        purpose: 'Notas de la reunión de operaciones',
      },
      {
        originalname: 'acta.pdf',
        mimetype: 'application/pdf',
        size: MINIMAL_PDF.length,
        buffer: MINIMAL_PDF,
      },
    );
    expect(source).toMatchObject({
      code: 'SRC-001',
      version: { origin: 'MANUAL', status: 'DRAFT' },
      source: { extractionState: 'EXTRACTED', hasExtractedText: true, sourceKind: 'PDF' },
    });

    const { body, mimeType, filename } = await ctx.sources.download(projectId, source.id);
    expect(body.toString()).toBe(MINIMAL_PDF.toString());
    expect(mimeType).toBe('application/pdf');
    expect(filename).toBe('acta.pdf');
  });

  it('never fabricates OCR/transcription for images/audio: uploads, then honors an explicit manual fallback', async () => {
    const source = await ctx.sources.create(
      projectId,
      { title: 'Foto de pizarra', sourceKind: 'NOTES', purpose: 'Lluvia de ideas del equipo' },
      { originalname: 'pizarra.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('abcd') },
    );
    expect(source.source).toMatchObject({
      extractionState: 'UNSUPPORTED',
      hasExtractedText: false,
    });

    await expect(
      ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW'),
    ).rejects.toThrow('conocimiento utilizable');

    const manual = await ctx.sources.submitManualTranscript(
      projectId,
      source.id,
      'Ideas: mejorar el registro de clientes y agilizar la facturación.',
    );
    expect(manual.version.versionNumber).toBe(2);
    expect(manual.source).toMatchObject({ extractionState: 'MANUAL', hasExtractedText: true });

    await ctx.sources.transition(projectId, source.id, manual.version.id, 'IN_REVIEW');
    const approved = await ctx.sources.transition(
      projectId,
      source.id,
      manual.version.id,
      'APPROVED',
    );
    expect(approved.status).toBe('APPROVED');
  });

  it('generates a candidate-first interpretation, requires explicit acceptance, and keeps exact provenance', async () => {
    const source = await ctx.sources.create(
      projectId,
      { title: 'Notas de entrevista', sourceKind: 'NOTES', purpose: 'Entrevista con finanzas' },
      {
        originalname: 'notas.txt',
        mimetype: 'text/plain',
        size: 20,
        buffer: Buffer.from('el cliente pidio ...'),
      },
    );
    const provider = new FakeAIProvider({
      provider: 'fake',
      model: 'fake-v1',
      payload: reportContent,
      usage: null,
      latencyMs: 1,
    });
    const ai = new AIOrchestrator(
      provider,
      new PromptRegistry([
        {
          key: 'source-report.generate',
          version: 1,
          capability: 'STRUCTURED_OUTPUT',
          purpose: 'source_interpretation',
          systemInstructions: 'policy',
        },
      ]),
      new PrismaAIRunRecorder(ctx.prisma),
    );
    // generateReport/acceptReport/getReport never touch storage: the DI-wired
    // AIOrchestrator defaults to disabled in tests, so a fresh service with a
    // real (fake) AI provider is used instead, sharing the same database.
    const service = new SourcesService(
      ctx.prisma,
      ai,
      new SourceContentExtractor(),
      new FakeStorageProvider(),
    );

    const candidate = await service.generateReport(projectId, source.id);
    expect(candidate.content).toMatchObject({ summary: 'Resumen' });
    await expect(ctx.sources.getReport(projectId, source.id)).rejects.toThrow('no encontrado');

    const report = await service.acceptReport(projectId, source.id, candidate.id);
    expect(report).toMatchObject({
      sourceVersionId: source.version.id,
      aiRunId: candidate.aiRunId,
      generationCandidateId: candidate.id,
    });
    await expect(ctx.sources.getReport(projectId, source.id)).resolves.toMatchObject({
      content: { summary: 'Resumen' },
    });
  });

  it('enforces project isolation: another project cannot see or reference this project’s sources', async () => {
    const source = await ctx.sources.create(
      projectId,
      { title: 'Fuente privada', sourceKind: 'NOTES', purpose: 'Interna' },
      { originalname: 'nota.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('hola') },
    );
    const otherWorkspace = await createWorkspace(ctx.prisma, 'Other Sources');
    const otherProjectId = (
      await ctx.projects.create({ workspaceId: otherWorkspace.id, name: 'Other' })
    ).id;

    await expect(ctx.sources.get(otherProjectId, source.id)).rejects.toThrow('no encontrada');
    await expect(
      ctx.sources.submitManualTranscript(otherProjectId, source.id, 'x'),
    ).rejects.toThrow('no encontrada');
  });
});
