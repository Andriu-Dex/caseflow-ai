import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorker } from 'tesseract.js';

const OCR_CACHE_PATH = join(tmpdir(), 'caseflow-ai-ocr-cache');

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

export class TesseractSourceOcrProvider implements SourceOcrProvider {
  readonly available = true;
  async recognize(image: Buffer): Promise<string> {
    await mkdir(OCR_CACHE_PATH, { recursive: true });
    const worker = await createWorker(['spa', 'eng'], undefined, { cachePath: OCR_CACHE_PATH });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        worker.recognize(image),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('OCR timed out.')), 60_000);
        }),
      ]);
      return result.data.text.trim();
    } finally {
      if (timer) clearTimeout(timer);
      await worker.terminate();
    }
  }
}
