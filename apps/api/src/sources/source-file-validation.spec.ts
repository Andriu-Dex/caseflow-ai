import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { hasExpectedFileSignature } from './source-file-validation';

function sourceFile(mimetype: string, buffer: Buffer) {
  return { originalname: 'source', mimetype, size: buffer.length, buffer };
}

describe('source file validation', () => {
  it('accepts UTF-8 text and rejects disguised binary content', async () => {
    await expect(
      hasExpectedFileSignature(sourceFile('text/plain', Buffer.from('Acta'))),
    ).resolves.toBe(true);
    await expect(
      hasExpectedFileSignature(sourceFile('text/plain', Buffer.from([0, 255]))),
    ).resolves.toBe(false);
    await expect(
      hasExpectedFileSignature(sourceFile('text/plain', Buffer.from('%PDF-1.4'))),
    ).resolves.toBe(false);
  });

  it('checks PDF and image signatures', async () => {
    await expect(
      hasExpectedFileSignature(sourceFile('application/pdf', Buffer.from('%PDF-1.4'))),
    ).resolves.toBe(true);
    await expect(
      hasExpectedFileSignature(sourceFile('application/pdf', Buffer.from('fake'))),
    ).resolves.toBe(false);
    await expect(
      hasExpectedFileSignature(sourceFile('image/png', Buffer.from('89504e470d0a1a0a', 'hex'))),
    ).resolves.toBe(true);
  });

  it('rejects mismatched size before parsing', async () => {
    await expect(
      hasExpectedFileSignature({
        ...sourceFile('application/pdf', Buffer.from('%PDF-1.4')),
        size: 500,
      }),
    ).resolves.toBe(false);
  });

  it('recognizes the supported image and audio signatures', async () => {
    const cases: [string, Buffer][] = [
      ['image/jpeg', Buffer.from('ffd8ff00', 'hex')],
      ['image/webp', Buffer.from('RIFF0000WEBP')],
      ['audio/wav', Buffer.from('RIFF0000WAVE')],
      ['audio/x-wav', Buffer.from('RIFF0000WAVE')],
      ['audio/mp4', Buffer.from('0000ftyp')],
      ['audio/x-m4a', Buffer.from('0000ftyp')],
      ['audio/mpeg', Buffer.from('ID3audio')],
      ['audio/mpeg', Buffer.from([0xff, 0xfb, 0, 0])],
    ];
    for (const [mime, buffer] of cases) {
      await expect(hasExpectedFileSignature(sourceFile(mime, buffer))).resolves.toBe(true);
      await expect(
        hasExpectedFileSignature(sourceFile(mime, Buffer.from('unrelated'))),
      ).resolves.toBe(false);
    }
  });

  it('accepts a DOCX package and rejects unrelated ZIP files', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', '<document/>');
    const docx = await zip.generateAsync({ type: 'nodebuffer' });
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    await expect(hasExpectedFileSignature(sourceFile(mime, docx))).resolves.toBe(true);
    const unrelatedZip = new JSZip();
    unrelatedZip.file('readme.txt', 'hello');
    const other = await unrelatedZip.generateAsync({ type: 'nodebuffer' });
    await expect(hasExpectedFileSignature(sourceFile(mime, other))).resolves.toBe(false);
    await expect(
      hasExpectedFileSignature(sourceFile(mime, Buffer.from('not a zip'))),
    ).resolves.toBe(false);
  });

  it('rejects unknown file types and oversized files', async () => {
    await expect(
      hasExpectedFileSignature(sourceFile('application/octet-stream', Buffer.from('data'))),
    ).resolves.toBe(false);
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, 65);
    await expect(hasExpectedFileSignature(sourceFile('text/plain', oversized))).resolves.toBe(
      false,
    );
  });
});
