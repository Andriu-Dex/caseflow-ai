import { describe, expect, it } from 'vitest';
import { splitIntoSections } from './source-sections';

describe('splitIntoSections (DEC-127)', () => {
  it('follows the headings and keeps the path of each section', () => {
    const sections = splitIntoSections(
      [
        '# Requisitos',
        'Introducción breve.',
        '## Pedidos',
        'El cliente registra pedidos.',
        '- Con producto\n- Con cantidad',
        '---',
        '## Pagos',
        'Se paga al recibir.',
        '# Anexos',
        'Glosario.',
      ].join('\n\n'),
    );
    expect(sections).toEqual([
      { heading: 'Requisitos', content: 'Introducción breve.' },
      {
        heading: 'Requisitos › Pedidos',
        content: 'El cliente registra pedidos.\n\n- Con producto\n- Con cantidad',
      },
      { heading: 'Requisitos › Pagos', content: 'Se paga al recibir.' },
      { heading: 'Anexos', content: 'Glosario.' },
    ]);
  });

  it('keeps text before any heading, and a heading followed directly by text', () =>
    expect(splitIntoSections('Portada.\n\n## Alcance\nIncluye pedidos.')).toEqual([
      { heading: null, content: 'Portada.' },
      { heading: 'Alcance', content: 'Incluye pedidos.' },
    ]));

  it('groups paragraphs up to the target size without cutting them', () => {
    const paragraph = 'a'.repeat(90);
    const sections = splitIntoSections(Array(5).fill(paragraph).join('\n\n'), {
      target: 200,
      max: 300,
    });
    expect(sections.map((s) => s.content.split('\n\n').length)).toEqual([2, 2, 1]);
    expect(sections.every((s) => s.content.split('\n\n').every((p) => p === paragraph))).toBe(true);
  });

  it('cuts a block too large on its own, repeating a table header', () => {
    const table = ['| Código | Nombre |', '| --- | --- |'];
    for (let i = 1; i <= 30; i += 1) table.push(`| P-${i} | Producto número ${i} |`);
    const sections = splitIntoSections(table.join('\n'), { target: 200, max: 300 });
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      expect(section.content.length).toBeLessThanOrEqual(300);
      expect(section.content.startsWith('| Código | Nombre |\n| --- | --- |')).toBe(true);
    }
    const rows = sections.flatMap((s) => s.content.split('\n').slice(2));
    expect(rows).toHaveLength(30);
  });

  it('cuts a single huge paragraph at spaces, keeping every word', () => {
    const words = Array.from({ length: 200 }, (_, i) => `palabra${i}`);
    const sections = splitIntoSections(words.join(' '), { target: 200, max: 300 });
    expect(sections.every((s) => s.content.length <= 300)).toBe(true);
    expect(sections.flatMap((s) => s.content.split(/\s+/))).toEqual(words);
  });
});
