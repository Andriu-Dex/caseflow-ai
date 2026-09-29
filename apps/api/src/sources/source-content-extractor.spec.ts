import { describe, expect, it, vi } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import PDFDocument from 'pdfkit';
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

  it('extracts a real DOCX document without an AI provider', async () => {
    const document = new Document({
      sections: [{ children: [new Paragraph('Acta de CASEFlow')] }],
    });
    const buffer = await Packer.toBuffer(document);
    expect(
      await extractor.extract(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer,
      ),
    ).toEqual({ state: 'EXTRACTED', text: 'Acta de CASEFlow' });
  });

  it('uses OCR for images only when an OCR adapter is available', async () => {
    const recognize = vi.fn().mockResolvedValue('Texto de la pizarra');
    const withOcr = new SourceContentExtractor({ available: true, recognize });
    expect(await withOcr.extract('image/png', Buffer.from('image'))).toEqual({
      state: 'EXTRACTED',
      text: 'Texto de la pizarra',
    });
    expect(recognize).toHaveBeenCalledOnce();
  });

  it('uses OCR on a scanned PDF page with no text layer', async () => {
    const document = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      document.on('end', () => resolve(Buffer.concat(chunks))),
    );
    document.addPage().rect(20, 20, 60, 60).fill();
    document.end();
    const pdf = await finished;
    const recognize = vi.fn().mockResolvedValue('Texto escaneado');
    const withOcr = new SourceContentExtractor({ available: true, recognize });
    expect(await withOcr.extract('application/pdf', pdf)).toEqual({
      state: 'EXTRACTED',
      text: 'Texto escaneado',
    });
    expect(recognize).toHaveBeenCalledOnce();
  });

  it('transcribes audio through the configured adapter and never invents text without it', async () => {
    const transcribe = vi.fn().mockResolvedValue('Entrevista transcrita');
    const withTranscription = new SourceContentExtractor(undefined, {
      id: 'test',
      available: true,
      transcribe,
    });
    expect(
      await withTranscription.extract('audio/mpeg', Buffer.from('audio'), 'audio.mp3'),
    ).toEqual({
      state: 'EXTRACTED',
      text: 'Entrevista transcrita',
    });
    expect(transcribe).toHaveBeenCalledWith({
      data: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      filename: 'audio.mp3',
    });
    expect(await extractor.extract('audio/mpeg', Buffer.from('audio'))).toEqual({
      state: 'UNSUPPORTED',
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
