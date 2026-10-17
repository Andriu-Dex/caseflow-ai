import { describe, expect, it } from 'vitest';
import {
  CLASS_BATCH_SIZE,
  completeRelationships,
  finishClassDiagram,
  mergeClassBatch,
  planClassBatches,
  relationshipsToDraw,
  type BatchOutput,
  type ModelEntity,
  type ModelRelationship,
} from './class-diagram-batches';

const entity = (name: string, attributes: string[] = ['Identificador']): ModelEntity => ({
  name,
  attributes: attributes.map((attribute) => ({ name: attribute, type: 'STRING', required: true })),
});
const cls = (
  localId: string,
  name: string,
  entityName?: string,
  attributes: string[] = ['Identificador'],
): BatchOutput['classes'][number] => ({
  localId,
  name,
  stereotype: entityName ? 'ENTITY' : 'ENUMERATION',
  dataModelEntityName: entityName,
  attributes: attributes.map((attribute) => ({
    name: attribute,
    type: 'String',
    visibility: 'PRIVATE' as const,
    required: true,
  })),
  methods: [],
});
const empty = { classes: [], relationships: [] };

describe('planClassBatches', () => {
  it('splits the entities in model order, a few per batch', () => {
    const entities = Array.from({ length: CLASS_BATCH_SIZE * 2 + 1 }, (_, i) => ({
      name: `E${i}`,
    }));
    const plan = planClassBatches(entities);
    expect(plan).toHaveLength(3);
    expect(plan[0]![0]).toBe('E0');
    expect(plan.flat()).toHaveLength(entities.length);
    expect(plan[2]).toEqual([`E${CLASS_BATCH_SIZE * 2}`]);
  });
});

describe('relationshipsToDraw', () => {
  const entities = [{ name: 'Usuario' }, { name: 'Venta' }, { name: 'Producto' }];
  const relationships: ModelRelationship[] = [
    {
      from: 'Usuario',
      to: 'Venta',
      name: 'registra',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MORE',
    },
    {
      from: 'Producto',
      to: 'Usuario',
      name: 'lo crea',
      fromCardinality: 'ZERO_OR_MORE',
      toCardinality: 'ONE',
    },
  ];
  it('asks a batch for the relationships whose later entity it holds', () => {
    // Usuario—Venta closes in Venta's batch; Producto—Usuario in Producto's.
    expect(relationshipsToDraw(entities, relationships, ['Usuario'])).toEqual([]);
    expect(relationshipsToDraw(entities, relationships, ['Venta'])).toEqual([
      {
        from: 'Usuario',
        to: 'Venta',
        label: 'registra',
        fromMultiplicity: '1',
        toMultiplicity: '*',
      },
    ]);
    expect(relationshipsToDraw(entities, relationships, ['Producto'])[0]).toMatchObject({
      from: 'Producto',
      toMultiplicity: '1',
    });
  });
});

describe('mergeClassBatch', () => {
  const targets = [entity('Usuario', ['Identificador', 'Nombre'])];

  it('adds the classes and relationships of a batch to those already drawn', () => {
    const first = mergeClassBatch(
      empty,
      { classes: [cls('u', 'Usuario', 'Usuario', ['Identificador', 'Nombre'])], relationships: [] },
      targets,
    );
    const second = mergeClassBatch(
      first,
      {
        classes: [cls('v', 'Venta', 'Venta')],
        relationships: [{ fromLocalId: 'u', toLocalId: 'v', kind: 'ASSOCIATION' }],
      },
      [entity('Venta')],
    );
    expect(second.classes.map((c) => c.name)).toEqual(['Usuario', 'Venta']);
    expect(second.relationships).toEqual([
      { fromLocalId: 'u', toLocalId: 'v', kind: 'ASSOCIATION' },
    ]);
    expect(first.classes).toHaveLength(1);
  });

  it('draws a support class once and points later relationships at it', () => {
    const first = mergeClassBatch(
      empty,
      {
        classes: [
          cls('u', 'Usuario', 'Usuario', ['Identificador', 'Nombre']),
          cls('e1', 'EstadoVenta'),
        ],
        relationships: [],
      },
      targets,
    );
    const second = mergeClassBatch(
      first,
      {
        classes: [cls('v', 'Venta', 'Venta'), cls('e2', 'estadoventa')],
        relationships: [{ fromLocalId: 'v', toLocalId: 'e2', kind: 'DEPENDENCY' }],
      },
      [entity('Venta')],
    );
    expect(second.classes.filter((c) => c.stereotype === 'ENUMERATION')).toHaveLength(1);
    expect(second.relationships[0]).toMatchObject({ fromLocalId: 'v', toLocalId: 'e1' });
  });

  it('fills in from the data model what the model left out of an entity', () => {
    const result = mergeClassBatch(
      empty,
      { classes: [cls('u', 'Usuario', 'Usuario', ['Identificador'])], relationships: [] },
      targets,
    );
    expect(result.classes[0]!.attributes.map((a) => a.name)).toEqual(['Identificador', 'Nombre']);
    // A class the model did not draw at all comes from the data model too.
    const missing = mergeClassBatch(
      empty,
      { classes: [cls('x', 'Auxiliar')], relationships: [] },
      targets,
    );
    expect(missing.classes.map((c) => c.name)).toEqual(['Auxiliar', 'Usuario']);
    expect(missing.classes[1]).toMatchObject({
      stereotype: 'ENTITY',
      dataModelEntityName: 'Usuario',
    });
    expect(missing.classes[1]!.attributes.map((a) => a.type)).toEqual(['String', 'String']);
  });

  it('keeps every local id unique across batches', () => {
    const first = mergeClassBatch(
      empty,
      { classes: [cls('c', 'Usuario', 'Usuario', ['Identificador', 'Nombre'])], relationships: [] },
      targets,
    );
    const second = mergeClassBatch(
      first,
      { classes: [cls('c', 'Venta', 'Venta')], relationships: [] },
      [entity('Venta')],
    );
    expect(second.classes.map((c) => c.localId)).toEqual(['c', 'c-2']);
  });

  it("rejects an entity that is not the batch's, a repeated one and unknown relationship ends", () => {
    const merge = (output: BatchOutput) => mergeClassBatch(empty, output, targets);
    expect(() => merge({ classes: [cls('x', 'Otra', 'Otra')], relationships: [] })).toThrow(
      'no es de este lote',
    );
    expect(() =>
      merge({
        classes: [cls('a', 'Usuario', 'Usuario'), cls('b', 'Usuario 2', 'Usuario')],
        relationships: [],
      }),
    ).toThrow('repite');
    expect(() =>
      merge({
        classes: [cls('a', 'Usuario', 'Usuario')],
        relationships: [{ fromLocalId: 'a', toLocalId: 'nadie', kind: 'ASSOCIATION' }],
      }),
    ).toThrow('no existe');
  });
});

describe('completeRelationships and finishClassDiagram', () => {
  const drawn = mergeClassBatch(
    mergeClassBatch(empty, { classes: [cls('u', 'Usuario', 'Usuario')], relationships: [] }, [
      entity('Usuario'),
    ]),
    { classes: [cls('v', 'Venta', 'Venta')], relationships: [] },
    [entity('Venta')],
  );
  const relationships: ModelRelationship[] = [
    {
      from: 'Usuario',
      to: 'Venta',
      name: 'registra',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MORE',
    },
  ];

  it('draws a data-model relationship the model left out, with its multiplicities', () => {
    const done = completeRelationships(drawn, relationships);
    expect(done.relationships).toEqual([
      {
        fromLocalId: 'u',
        toLocalId: 'v',
        kind: 'ASSOCIATION',
        label: 'registra',
        fromMultiplicity: '1',
        toMultiplicity: '*',
      },
    ]);
  });

  it('does not draw it again, in either direction', () => {
    const done = completeRelationships(
      { ...drawn, relationships: [{ fromLocalId: 'v', toLocalId: 'u', kind: 'ASSOCIATION' }] },
      relationships,
    );
    expect(done.relationships).toHaveLength(1);
  });

  it('checks the whole diagram once it is assembled', () => {
    expect(finishClassDiagram(completeRelationships(drawn, relationships)).classes).toHaveLength(2);
    expect(() =>
      finishClassDiagram({
        classes: drawn.classes,
        relationships: [{ fromLocalId: 'u', toLocalId: 'zzz', kind: 'ASSOCIATION' }],
      }),
    ).toThrow('inválidas');
  });
});
