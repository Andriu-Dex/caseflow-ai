import { describe, expect, it } from 'vitest';
import type { Block } from 'tesseract.js';
import { confidentText, OCR_MIN_WORD_CONFIDENCE } from './source-ocr-provider';
import { repairFilenameEncoding } from './sources.service';

describe('repairFilenameEncoding', () => {
  it('repairs a UTF-8 name that was read as latin1', () => {
    const misread = Buffer.from('Normas y Estándares.pdf', 'utf8').toString('latin1');
    expect(misread).toBe('Normas y EstÃ¡ndares.pdf');
    expect(repairFilenameEncoding(misread)).toBe('Normas y Estándares.pdf');
  });

  it('leaves correct names alone', () => {
    for (const name of ['acta.pdf', 'Reunión de diseño.pdf', 'Año — resumen.docx'])
      expect(repairFilenameEncoding(name)).toBe(name);
  });
});

describe('confidentText', () => {
  const word = (text: string, confidence: number) => ({ text, confidence });
  const page = (lines: { text: string; confidence: number }[][][]): Block[] =>
    [
      {
        paragraphs: lines.map((paragraph) => ({ lines: paragraph.map((words) => ({ words })) })),
      },
    ] as unknown as Block[];

  it('keeps confident words and drops the noise of logos and backgrounds', () => {
    const low = OCR_MIN_WORD_CONFIDENCE - 1;
    expect(
      confidentText(
        page([
          [
            [word('NORMAS', 95), word('Y', 93), word('ESTÁNDARES', 91)],
            [word('Aazg', 22), word('—', 30)],
          ],
          [[word('ISO/IEC', 88), word('25010', 90), word('Ee', low), word('E', low)]],
        ]),
      ),
    ).toBe('NORMAS Y ESTÁNDARES\n\nISO/IEC 25010');
  });
});
