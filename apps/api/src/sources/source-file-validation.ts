import JSZip from 'jszip';
import { SOURCE_MAX_FILE_SIZE_BYTES } from '@caseflow-ai/contracts';
import type { UploadedSourceFile } from './sources.service';

const utf8 = new TextDecoder('utf-8', { fatal: true });

export async function hasExpectedFileSignature(file: UploadedSourceFile): Promise<boolean> {
  const data = file.buffer;
  if (file.size !== data.length || data.length === 0 || data.length > SOURCE_MAX_FILE_SIZE_BYTES)
    return false;
  switch (file.mimetype) {
    case 'text/plain':
    case 'text/markdown':
      try {
        utf8.decode(data);
        const header = data.subarray(0, 8);
        return (
          !data.includes(0) &&
          !header.toString().startsWith('%PDF-') &&
          !header.toString().startsWith('PK') &&
          !header.toString().startsWith('RIFF') &&
          !header.toString().startsWith('ID3') &&
          header.subarray(0, 3).toString('hex') !== 'ffd8ff' &&
          header.toString('hex') !== '89504e470d0a1a0a'
        );
      } catch {
        return false;
      }
    case 'application/pdf':
      return data.subarray(0, 5).toString() === '%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      if (data.subarray(0, 4).toString('hex') !== '504b0304') return false;
      try {
        const zip = await JSZip.loadAsync(data, { checkCRC32: false });
        return Boolean(zip.file('[Content_Types].xml') && zip.file('word/document.xml'));
      } catch {
        return false;
      }
    case 'image/png':
      return data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    case 'image/jpeg':
      return data.length > 3 && data.subarray(0, 3).toString('hex') === 'ffd8ff';
    case 'image/webp':
      return (
        data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
      );
    case 'audio/wav':
    case 'audio/x-wav':
      return (
        data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE'
      );
    case 'audio/mp4':
    case 'audio/x-m4a':
      return data.subarray(4, 8).toString() === 'ftyp';
    case 'audio/mpeg':
      return (
        data.subarray(0, 3).toString() === 'ID3' ||
        (data[0] === 0xff && data[1] !== undefined && (data[1] & 0xe0) === 0xe0)
      );
    default:
      return false;
  }
}
