import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';

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
