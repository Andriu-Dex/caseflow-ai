import { describe, expect, it } from 'vitest';
import {
  docxHtmlToMarkdown,
  joinPages,
  pdfPagesToMarkdown,
  type PdfTextItem,
} from './source-structure';

const line = (str: string, fontSize: number, y: number): PdfTextItem => ({
  str,
  fontSize,
  y,
  hasEOL: true,
});

describe('pdfPagesToMarkdown', () => {
  it('recognizes headings by font size, paragraphs by spacing and bullets', () => {
    const [page] = pdfPagesToMarkdown([
      [
        line('NORMAS Y ESTÁNDARES', 28, 700),
        line('EN PROYECTOS', 28, 668),
        line('Calidad del software', 16, 600),
        line('Las normas proporcionan un marco de referencia para', 11, 560),
        line('garantizar la calidad y la informa-', 11, 546),
        line('ción del proyecto.', 11, 532),
        line('• ISO/IEC 25010', 11, 480),
        line('• ISO 9001 aplicado a', 11, 466),
        line('procesos de calidad', 11, 452),
        line('# no es un título', 11, 400),
      ],
    ]);
    expect(page).toBe(
      [
        '# NORMAS Y ESTÁNDARES EN PROYECTOS',
        '## Calidad del software',
        'Las normas proporcionan un marco de referencia para garantizar la calidad y la información del proyecto.',
        '- ISO/IEC 25010\n- ISO 9001 aplicado a procesos de calidad',
        '\\# no es un título',
      ].join('\n\n'),
    );
  });

  it('leaves pages without a text layer empty for OCR, and separates pages', () => {
    const pages = pdfPagesToMarkdown([[line('Uno', 11, 700)], [], [line('Tres', 11, 700)]]);
    expect(pages).toEqual(['Uno', '', 'Tres']);
    expect(joinPages(pages)).toBe('Uno\n\n---\n\nTres');
  });
});

describe('docxHtmlToMarkdown', () => {
  it('keeps headings, emphasis, links, lists and tables', () => {
    const html =
      '<h1>Acta de reunión</h1><p>Se acordó <strong>priorizar</strong> la <em>reserva</em> &amp; el pago. Ver <a href="https://example.com/doc">documento</a>.</p>' +
      '<ul><li>Registrar clientes</li><li>Emitir facturas</li></ul>' +
      '<ol><li>Primero</li><li>Segundo</li></ol>' +
      '<table><tr><td><p>Rol</p></td><td><p>Permiso</p></td></tr><tr><td><p>Cajero</p></td><td><p>Cobrar | anular</p></td></tr></table>';
    expect(docxHtmlToMarkdown(html)).toBe(
      [
        '# Acta de reunión',
        'Se acordó **priorizar** la *reserva* & el pago. Ver [documento](https://example.com/doc).',
        '- Registrar clientes\n- Emitir facturas\n1. Primero\n2. Segundo',
        '| Rol | Permiso |\n| --- | --- |\n| Cajero | Cobrar \\| anular |',
      ].join('\n\n'),
    );
  });

  it('never turns a non-web link into a Markdown link', () => {
    expect(docxHtmlToMarkdown('<p><a href="javascript:alert(1)">clic</a></p>')).toBe('clic');
  });
});
