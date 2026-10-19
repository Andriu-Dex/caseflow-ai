import { describe, expect, it } from 'vitest';
import { estimateTokens } from '@caseflow-ai/ai';
import { planContextInput } from './context-input';

const source = (n: number, text: string, report?: unknown) => ({
  versionId: `v${n}`,
  code: `SRC-00${n}`,
  title: `Fuente ${n}`,
  text,
  ...(report ? { report } : {}),
});
const longText = [
  '# Horarios\n\nLa tienda abre de lunes a sábado por la mañana.',
  '# Pedidos\n\nEl cliente registra pedidos con su dirección de entrega.',
  '# Historia\n\nLa empresa se fundó hace veinte años en el centro.',
  '# Inventario\n\nEl stock se descuenta al confirmar cada pedido.',
].join('\n\n');

describe('planContextInput (DEC-127)', () => {
  it('sends every source whole when they fit', () => {
    const { entries, partialVersionIds } = planContextInput(
      [source(1, 'Texto corto.'), source(2, 'Otro texto.', { summary: 'Resumen' })],
      10_000,
    );
    expect(entries).toEqual([
      { code: 'SRC-001', title: 'Fuente 1', extractedText: 'Texto corto.' },
      {
        code: 'SRC-002',
        title: 'Fuente 2',
        report: { summary: 'Resumen' },
        extractedText: 'Otro texto.',
      },
    ]);
    expect(partialVersionIds).toEqual([]);
  });

  it('keeps short sources whole and sends a long one as excerpts closest to its report', () => {
    const report = { summary: 'Pedidos de clientes', needs: ['Descontar inventario del stock'] };
    const plan = planContextInput([source(1, 'Nota breve.'), source(2, longText, report)], 120);
    expect(plan.entries[0]).toMatchObject({ extractedText: 'Nota breve.' });
    expect(plan.partialVersionIds).toEqual(['v2']);
    const partial = plan.entries[1] as { partial: true; excerpts: { heading: string }[] };
    expect(partial.partial).toBe(true);
    // The two sections that match the report, in document order.
    expect(partial.excerpts.map((e) => e.heading)).toEqual(['Pedidos', 'Inventario']);
  });

  it('never exceeds the budget, sharing it fairly among long sources', () => {
    const sources = [source(1, longText), source(2, longText), source(3, 'Corta.')];
    const plan = planContextInput(sources, 150);
    expect(estimateTokens(JSON.stringify(plan.entries))).toBeLessThanOrEqual(150 + 30);
    expect(plan.partialVersionIds).toEqual(['v1', 'v2']);
    const counts = plan.entries
      .filter((e): e is Extract<typeof e, { partial: true }> => 'partial' in e)
      .map((e) => e.excerpts.length);
    expect(counts[0]).toBe(counts[1]);
  });
});
