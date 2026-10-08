import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { definePDFJSModule, extractTextItems, getDocumentProxy, renderPageAsImage } from 'unpdf';
import {
  LOCALLY_EXTRACTABLE_MIME_TYPES,
  SOURCE_LIMITS,
  type SourceFailureReason,
} from '@caseflow-ai/contracts';
import {
  DisabledTranscriptionProvider,
  type TranscriptionProvider,
} from '@caseflow-ai/integrations';
import { DisabledSourceOcrProvider, type SourceOcrProvider } from './source-ocr-provider';
import { docxHtmlToMarkdown, joinPages, pdfPagesToMarkdown } from './source-structure';

export type ExtractionOutcome =
  | { state: 'EXTRACTED'; text: string }
  | { state: 'UNSUPPORTED' | 'FAILED'; reason: SourceFailureReason };

const failed = (reason: SourceFailureReason): ExtractionOutcome => ({ state: 'FAILED', reason });
const unsupported = (reason: SourceFailureReason): ExtractionOutcome => ({
  state: 'UNSUPPORTED',
  reason,
});

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
]);
const MAX_PDF_PAGES = SOURCE_LIMITS.maxPdfPages;
const MAX_OCR_PAGES = SOURCE_LIMITS.maxScannedPdfPages;
const MAX_EXTRACTED_CHARACTERS = SOURCE_LIMITS.maxExtractedCharacters;
let pdfRendererReady: Promise<void> | undefined;

function result(text: string): ExtractionOutcome {
  const normalized = text.trim();
  if (!normalized) return failed('EMPTY');
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) return failed('TEXT_TOO_LONG');
  return { state: 'EXTRACTED', text: normalized };
}

@Injectable()
export class SourceContentExtractor {
  static readonly SUPPORTED_MIME_TYPES = LOCALLY_EXTRACTABLE_MIME_TYPES;

  constructor(
    private readonly ocr: SourceOcrProvider = new DisabledSourceOcrProvider(),
    private readonly transcription: TranscriptionProvider = new DisabledTranscriptionProvider(),
  ) {}

  // What can be extracted automatically in this installation.
  get capabilities() {
    return { ocr: this.ocr.available, transcription: this.transcription.available };
  }

  async extract(mimeType: string, buffer: Buffer, filename = 'source'): Promise<ExtractionOutcome> {
    try {
      // Extracted text is Markdown (DEC-125): Markdown files as written, plain
      // text with its line breaks kept and nothing read as markup.
      if (mimeType === 'text/markdown') return result(buffer.toString('utf-8'));
      if (TEXT_MIME_TYPES.has(mimeType))
        return result(plainTextToMarkdown(buffer.toString('utf-8')));
      if (mimeType === 'application/pdf') return await this.extractPdfText(buffer);
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const converted = await mammoth.convertToHtml({ buffer });
        return result(docxHtmlToMarkdown(converted.value));
      }
      if (IMAGE_MIME_TYPES.has(mimeType)) {
        if (!this.ocr.available) return unsupported('OCR_UNAVAILABLE');
        return result(await this.ocr.recognize(buffer));
      }
      if (AUDIO_MIME_TYPES.has(mimeType)) {
        if (!this.transcription.available) return unsupported('TRANSCRIPTION_UNAVAILABLE');
        return result(await this.transcription.transcribe({ data: buffer, mimeType, filename }));
      }
      return unsupported('UNSUPPORTED_FORMAT');
    } catch {
      return failed('UNREADABLE');
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<ExtractionOutcome> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      if (pdf.numPages > MAX_PDF_PAGES) return failed('TOO_MANY_PAGES');
      const { items } = await extractTextItems(pdf);
      const pages = pdfPagesToMarkdown(items);
      const missingPages = pages.flatMap((page, index) => (page.trim() ? [] : [index + 1]));
      if (missingPages.length > MAX_OCR_PAGES) return failed('TOO_MANY_SCANNED_PAGES');
      if (missingPages.length) {
        if (!this.ocr.available) return unsupported('OCR_UNAVAILABLE');
        pdfRendererReady ??= definePDFJSModule(() => import('pdfjs-dist'));
        await pdfRendererReady;
      }
      for (const pageNumber of missingPages) {
        const rendered = await renderPageAsImage(new Uint8Array(buffer), pageNumber, {
          canvasImport: () => import('@napi-rs/canvas'),
          width: 1800,
        });
        if (typeof rendered === 'string') return failed('UNREADABLE');
        pages[pageNumber - 1] = await this.ocr.recognize(Buffer.from(rendered));
      }
      return result(joinPages(pages));
    } finally {
      await (pdf as typeof pdf & { destroy?: () => Promise<void> }).destroy?.();
    }
  }
}

// Plain text has no markup: its line breaks are kept and a line starting with
// a heading, quote or table symbol is escaped (lists are meant as lists).
function plainTextToMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trimEnd().replace(/^(\s*)([#>|])/, '$1\\$2'))
        .join('  \n'),
    )
    .join('\n\n');
}
