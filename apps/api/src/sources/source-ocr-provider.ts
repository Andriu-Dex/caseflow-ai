import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker, type Block } from 'tesseract.js';

const OCR_CACHE_PATH = join(tmpdir(), 'caseflow-ai-ocr-cache');

// Words Tesseract recognizes below this confidence (0-100) are dropped: on
// slides and scans they are logos, icons and backgrounds read as letters
// ("Aazg", "Ee E"), not text. ponytail: one global threshold; raise it if noise
// remains, lower it if real words of poor scans go missing.
export const OCR_MIN_WORD_CONFIDENCE = 60;

export interface SourceOcrProvider {
  readonly available: boolean;
  recognize(image: Buffer): Promise<string>;
}

export class DisabledSourceOcrProvider implements SourceOcrProvider {
  readonly available = false;

  async recognize(): Promise<never> {
    throw new Error('OCR is not configured.');
  }
}

// Rebuilds the recognized text keeping only confident words, one line per
// recognized line and a blank line between paragraphs. A line left with no
// word of two or more letters or digits is noise and is dropped whole.
export function confidentText(blocks: readonly Block[]): string {
  const paragraphs: string[] = [];
  for (const block of blocks)
    for (const paragraph of block.paragraphs) {
      const lines = paragraph.lines
        .map((line) =>
          line.words
            .filter((word) => word.confidence >= OCR_MIN_WORD_CONFIDENCE)
            .map((word) => word.text)
            .join(' ')
            .trim(),
        )
        .filter((line) => /[\p{L}\p{N}]{2}/u.test(line));
      if (lines.length) paragraphs.push(lines.join('\n'));
    }
  return paragraphs.join('\n\n');
}

export class TesseractSourceOcrProvider implements SourceOcrProvider {
  readonly available = true;
  async recognize(image: Buffer): Promise<string> {
    await mkdir(OCR_CACHE_PATH, { recursive: true });
    const worker = await createWorker(['spa', 'eng'], undefined, { cachePath: OCR_CACHE_PATH });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        worker.recognize(image, {}, { text: true, blocks: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('OCR timed out.')), 60_000);
        }),
      ]);
      return result.data.blocks ? confidentText(result.data.blocks) : result.data.text.trim();
    } finally {
      if (timer) clearTimeout(timer);
      await worker.terminate();
    }
  }
}
