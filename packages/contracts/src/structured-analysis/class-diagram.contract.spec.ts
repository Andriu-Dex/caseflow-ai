import { describe, expect, it } from 'vitest';
import { classDiagramContentSchema, classDiagramCoverageGaps } from './class-diagram.contract';

describe('classDiagramContentSchema', () => {
  it('rejects duplicate classes and dangling relationships', () => {
    const result = classDiagramContentSchema.safeParse({
      classes: [
        { localId: 'a', name: 'Cliente' },
        { localId: 'b', name: 'cliente' },
      ],
      relationships: [{ fromLocalId: 'a', toLocalId: 'zzz', kind: 'ASSOCIATION' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Cada clase debe tener un nombre distinto.',
      'La relación referencia una clase inexistente.',
    ]);
  });
});

describe('classDiagramCoverageGaps', () => {
  const entities = [{ name: 'Pedido', attributes: [{ name: 'total' }] }];

  it('is empty when every entity has a class with all its attributes', () => {
    const content = classDiagramContentSchema.parse({
      classes: [
        {
          localId: 'p',
          name: 'Pedido',
          dataModelEntityName: ' pedido ',
          attributes: [{ name: 'TOTAL', type: 'number' }],
        },
        { localId: 'e', name: 'EstadoPedido', stereotype: 'ENUMERATION' },
      ],
    });
    expect(classDiagramCoverageGaps(content, entities)).toEqual([]);
  });

  it('reports missing classes, missing attributes and unknown entities', () => {
    const content = classDiagramContentSchema.parse({
      classes: [
        { localId: 'p', name: 'Orden', dataModelEntityName: 'Pedido' },
        { localId: 'f', name: 'Factura', dataModelEntityName: 'Factura' },
      ],
    });
    expect(
      classDiagramCoverageGaps(content, [...entities, { name: 'Cliente', attributes: [] }]),
    ).toEqual([
      'A la clase «Orden» le falta el atributo «total» de la entidad «Pedido».',
      'La entidad «Cliente» del modelo de datos no tiene una clase.',
      'La clase «Factura» representa «Factura», que no existe en el modelo de datos.',
    ]);
  });
});
