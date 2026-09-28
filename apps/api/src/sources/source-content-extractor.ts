import { Injectable } from '@nestjs/common';
import { extractText } from 'unpdf';
import { LOCALLY_EXTRACTABLE_MIME_TYPES } from '@caseflow-ai/contracts';

export type ExtractionOutcome =
  { state: 'EXTRACTED'; text: string } | { state: 'UNSUPPORTED' } | { state: 'FAILED' };

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);

// Deterministic, local, no AI/OCR/ASR provider (spec §7.1). Never invents a
// transcript: an empty/unreadable result is FAILED, not fabricated content.
@Injectable()
export class SourceContentExtractor {
  static readonly SUPPORTED_MIME_TYPES = LOCALLY_EXTRACTABLE_MIME_TYPES;

  async extract(mimeType: string, buffer: Buffer): Promise<ExtractionOutcome> {
    if (TEXT_MIME_TYPES.has(mimeType)) return this.extractPlainText(buffer);
    if (mimeType === 'application/pdf') return this.extractPdfText(buffer);
    return { state: 'UNSUPPORTED' };
  }

  private extractPlainText(buffer: Buffer): ExtractionOutcome {
    const text = buffer.toString('utf-8').trim();
    return text ? { state: 'EXTRACTED', text } : { state: 'FAILED' };
  }

  private async extractPdfText(buffer: Buffer): Promise<ExtractionOutcome> {
    try {
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      const trimmed = text.trim();
      // A scanned/image-only PDF has no text layer: honest FAILED, not fake OCR.
      return trimmed ? { state: 'EXTRACTED', text: trimmed } : { state: 'FAILED' };
    } catch {
      return { state: 'FAILED' };
    }
  }
}
