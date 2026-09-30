import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { definePDFJSModule, extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { LOCALLY_EXTRACTABLE_MIME_TYPES } from '@caseflow-ai/contracts';
import {
  DisabledTranscriptionProvider,
  type TranscriptionProvider,
} from '@caseflow-ai/integrations';
import { DisabledSourceOcrProvider, type SourceOcrProvider } from './source-ocr-provider';

export type ExtractionOutcome =
  { state: 'EXTRACTED'; text: string } | { state: 'UNSUPPORTED' } | { state: 'FAILED' };

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
]);
const MAX_PDF_PAGES = 100;
const MAX_OCR_PAGES = 10;
const MAX_EXTRACTED_CHARACTERS = 50_000;
let pdfRendererReady: Promise<void> | undefined;

function result(text: string): ExtractionOutcome {
  const normalized = text.trim();
  return normalized && normalized.length <= MAX_EXTRACTED_CHARACTERS
    ? { state: 'EXTRACTED', text: normalized }
    : { state: 'FAILED' };
}

@Injectable()
export class SourceContentExtractor {
  static readonly SUPPORTED_MIME_TYPES = LOCALLY_EXTRACTABLE_MIME_TYPES;

  constructor(
    private readonly ocr: SourceOcrProvider = new DisabledSourceOcrProvider(),
    private readonly transcription: TranscriptionProvider = new DisabledTranscriptionProvider(),
  ) {}

  async extract(mimeType: string, buffer: Buffer, filename = 'source'): Promise<ExtractionOutcome> {
    try {
      if (TEXT_MIME_TYPES.has(mimeType)) return result(buffer.toString('utf-8'));
      if (mimeType === 'application/pdf') return await this.extractPdfText(buffer);
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const extracted = await mammoth.extractRawText({ buffer });
        return result(extracted.value);
      }
      if (IMAGE_MIME_TYPES.has(mimeType)) {
        if (!this.ocr.available) return { state: 'UNSUPPORTED' };
        return result(await this.ocr.recognize(buffer));
      }
      if (AUDIO_MIME_TYPES.has(mimeType)) {
        if (!this.transcription.available) return { state: 'UNSUPPORTED' };
        return result(await this.transcription.transcribe({ data: buffer, mimeType, filename }));
      }
      return { state: 'UNSUPPORTED' };
    } catch {
      return { state: 'FAILED' };
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<ExtractionOutcome> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      if (pdf.numPages > MAX_PDF_PAGES) return { state: 'FAILED' };
      const extracted = await extractText(pdf);
      const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
      const missingPages = pages.flatMap((page, index) => (page.trim() ? [] : [index + 1]));
      if (missingPages.length > MAX_OCR_PAGES) return { state: 'FAILED' };
      if (missingPages.length) {
        if (!this.ocr.available) return { state: 'UNSUPPORTED' };
        pdfRendererReady ??= definePDFJSModule(() => import('pdfjs-dist'));
        await pdfRendererReady;
      }
      for (const pageNumber of missingPages) {
        const rendered = await renderPageAsImage(new Uint8Array(buffer), pageNumber, {
          canvasImport: () => import('@napi-rs/canvas'),
          width: 1800,
        });
        if (typeof rendered === 'string') return { state: 'FAILED' };
        pages[pageNumber - 1] = await this.ocr.recognize(Buffer.from(rendered));
      }
      return result(pages.join('\n\n'));
    } finally {
      await (pdf as typeof pdf & { destroy?: () => Promise<void> }).destroy?.();
    }
  }
}
