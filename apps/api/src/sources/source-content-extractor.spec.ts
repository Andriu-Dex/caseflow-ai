import { describe, expect, it } from 'vitest';
import { SourceContentExtractor } from './source-content-extractor';

// A minimal, real (if not fully spec-compliant) single-page PDF containing
// the literal text "Hello CASEFlow" — enough for pdf.js to extract text from.
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n' +
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 44>>stream\n' +
    'BT /F1 24 Tf 10 100 Td (Hello CASEFlow) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n' +
    'trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF',
);

describe('SourceContentExtractor', () => {
  const extractor = new SourceContentExtractor();

  it('extracts plain text deterministically', async () => {
    expect(await extractor.extract('text/plain', Buffer.from('  hola mundo  '))).toEqual({
      state: 'EXTRACTED',
      text: 'hola mundo',
    });
  });

  it('extracts markdown as plain text', async () => {
    expect(await extractor.extract('text/markdown', Buffer.from('# Título\ncontenido'))).toEqual({
      state: 'EXTRACTED',
      text: '# Título\ncontenido',
    });
  });

  it('reports FAILED for blank text content, never fabricating a transcript', async () => {
    expect(await extractor.extract('text/plain', Buffer.from('   '))).toEqual({
      state: 'FAILED',
    });
  });

  it('extracts real text-layer PDF content locally, without any AI/OCR provider', async () => {
    const result = await extractor.extract('application/pdf', MINIMAL_PDF);
    expect(result).toEqual({ state: 'EXTRACTED', text: 'Hello CASEFlow' });
  });

  it('reports FAILED for a PDF unpdf cannot parse, never fabricating a transcript', async () => {
    expect(await extractor.extract('application/pdf', Buffer.from('not a pdf'))).toEqual({
      state: 'FAILED',
    });
  });

  it.each(['image/png', 'audio/mpeg', 'application/octet-stream'])(
    'reports UNSUPPORTED for %s without any automatic OCR/ASR',
    async (mimeType) => {
      expect(await extractor.extract(mimeType, Buffer.from('binary'))).toEqual({
        state: 'UNSUPPORTED',
      });
    },
  );
});
