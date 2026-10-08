import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n' +
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 44>>stream\n' +
    'BT /F1 24 Tf 10 100 Td (Hello CASEFlow) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n' +
    'trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF',
);

const textFile = (content: string) => ({
  originalname: 'acta.txt',
  mimetype: 'text/plain',
  size: Buffer.byteLength(content),
  buffer: Buffer.from(content),
});
const metadata = (sourceKind: string) => ({
  title: 'Acta',
  sourceKind: sourceKind as 'TEXT',
  purpose: 'Acuerdos de la reunión',
  description: '',
});

// Source kinds follow the file, retired kinds stay only on existing sources,
// and a failed extraction says why.
describe('Source kinds and extraction feedback integration', () => {
  let ctx: TestContext;
  let projectId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspaceId = (await createWorkspaceWithOwner(ctx, 'Tipos de fuente')).id;
    projectId = (await ctx.projects.create({ workspaceId, name: 'Fuentes' })).id;
  });
  afterAll(async () => ctx.close());

  it('refuses retired kinds and kinds that do not match the file', async () => {
    await expect(
      ctx.sources.create(projectId, metadata('INVOICE'), textFile('Total 10')),
    ).rejects.toThrow('Este tipo de fuente ya no está disponible');
    await expect(
      ctx.sources.create(projectId, metadata('AUDIO'), textFile('Hola')),
    ).rejects.toThrow('El tipo de fuente no corresponde al formato del archivo.');
    await expect(
      ctx.sources.create(projectId, metadata('NOTES'), textFile('Hola')),
    ).rejects.toThrow('El tipo de fuente no corresponde al formato del archivo.');
    expect(await ctx.prisma.sourceDetail.count({ where: { artifactVersion: { projectId } } })).toBe(
      0,
    );
  });

  it('keeps a retired kind on an existing source, but never lets one be chosen anew', async () => {
    const created = await ctx.sources.create(projectId, metadata('TEXT'), textFile('Total 10'));
    // An older source of the retired kind, as the data existed before.
    // Test setup only: the database protects source details from updates.
    await ctx.prisma.$transaction([
      ctx.prisma.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'"),
      ctx.prisma
        .$executeRaw`UPDATE source_details SET source_kind = 'INVOICE' WHERE artifact_version_id = ${created.version.id}::uuid`,
    ]);
    const edited = await ctx.sources.editMetadata(projectId, created.id, {
      ...metadata('INVOICE'),
      title: 'Factura 001',
    });
    expect(edited.source).toMatchObject({ sourceKind: 'INVOICE', title: 'Factura 001' });

    const other = await ctx.sources.create(projectId, metadata('TEXT'), textFile('Otra'));
    await expect(ctx.sources.editMetadata(projectId, other.id, metadata('FORM'))).rejects.toThrow(
      'Este tipo de fuente ya no está disponible',
    );
  });

  it('records why the text could not be obtained', async () => {
    const blank = await ctx.sources.create(projectId, metadata('TEXT'), textFile('    '));
    expect(blank.source).toMatchObject({
      extractionState: 'FAILED',
      extractionFailureReason: 'EMPTY',
      hasExtractedText: false,
    });
  });

  it('keeps accented file names intact on upload and download', async () => {
    const uploaded = await http()
      .post(`/projects/${projectId}/sources`)
      .set(auth())
      .field('title', 'Normas')
      .field('sourceKind', 'TEXT')
      .field('purpose', 'Normas del proyecto')
      .field('description', '')
      .attach('file', Buffer.from('Calidad y seguridad'), {
        filename: 'Normas y Estándares.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(uploaded.body.source.originalFilename).toBe('Normas y Estándares.txt');

    const download = await http()
      .get(`/projects/${projectId}/sources/${uploaded.body.id}/download`)
      .set(auth())
      .expect(200);
    expect(download.headers['content-disposition']).toBe(
      `attachment; filename="Normas y Estandares.txt"; filename*=UTF-8''${encodeURIComponent('Normas y Estándares.txt')}`,
    );
  });

  it('reads the original file again into a new version, keeping the earlier ones', async () => {
    const created = await ctx.sources.create(
      projectId,
      metadata('TEXT'),
      textFile('Acta\n# 3 asistentes'),
    );
    const again = await ctx.sources.reExtract(projectId, created.id);
    expect(again.version).toMatchObject({ versionNumber: 2, origin: 'SYSTEM_GENERATED' });
    expect((await ctx.sources.getText(projectId, created.id)).text).toBe(
      'Acta  \n\\# 3 asistentes',
    );
    expect(await ctx.prisma.artifactVersion.count({ where: { artifactId: created.id } })).toBe(2);

    // Slow formats go through the queue: a pending version, then the text.
    const pdf = await ctx.sources.create(projectId, metadata('PDF'), {
      originalname: 'acta.pdf',
      mimetype: 'application/pdf',
      size: MINIMAL_PDF.length,
      buffer: MINIMAL_PDF,
    });
    const job = await ctx.prisma.sourceProcessingJob.findFirstOrThrow({
      where: { sourceVersionId: pdf.version.id },
    });
    await ctx.sources.runProcessingJob(projectId, job.id);
    const pending = await ctx.sources.reExtract(projectId, pdf.id);
    expect(pending.processing).toMatchObject({ status: 'QUEUED', processor: 'PDF' });
    await expect(ctx.sources.reExtract(projectId, pdf.id)).rejects.toThrow(
      'El archivo ya se está procesando.',
    );
    await ctx.sources.runProcessingJob(projectId, pending.processing!.id);
    expect((await ctx.sources.getText(projectId, pdf.id)).text).toBe('Hello CASEFlow');

    const notes = await ctx.sources.create(
      projectId,
      { ...metadata('NOTES'), description: 'Solo notas' },
      undefined,
    );
    await expect(ctx.sources.reExtract(projectId, notes.id)).rejects.toThrow(
      'Esta fuente no tiene un archivo',
    );
  });

  it('tells members what can be extracted automatically', async () => {
    const response = await http()
      .get(`/projects/${projectId}/sources/capabilities`)
      .set(auth())
      .expect(200);
    expect(response.body).toEqual({
      ocr: expect.any(Boolean),
      transcription: expect.any(Boolean),
      maxFileSizeBytes: 25 * 1024 * 1024,
      maxPdfPages: 100,
      maxScannedPdfPages: 10,
      maxExtractedCharacters: 50_000,
    });
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/sources/capabilities`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });
});
