import { describe, expect, it } from 'vitest';
import {
  CONCEPTUAL_BATCH_SIZE,
  classesWithoutEntity,
  completeRelationships,
  conceptualCardinality,
  fillMissingEntities,
  finishConceptualModel,
  mergeConceptualBatch,
  planConceptualBatches,
  relationshipsToCarry,
  type ClassRelationship,
  type DomainClass,
  type Entity,
} from './conceptual-model-batches';

const cls = (
  localId: string,
  name: string,
  stereotype: DomainClass['stereotype'] = 'ENTITY',
): DomainClass => ({
  localId,
  name,
  stereotype,
  attributes: [
    { name: 'Identificador', type: 'UUID', visibility: 'PRIVATE', required: true },
    { name: 'Nombre', type: 'String', visibility: 'PRIVATE', required: false },
  ],
  methods: [],
  relatedSourceCodes: ['MD-001'],
});
const entity = (localId: string, classLocalId?: string, extra: Partial<Entity> = {}): Entity => ({
  localId,
  name: `Entidad ${localId}`,
  description: 'Una entidad.',
  classLocalId,
  attributes: [{ name: 'id', required: true }],
  ...extra,
});
const empty = { entities: [], relationships: [] };

describe('planConceptualBatches', () => {
  it('batches only the persisted classes, in diagram order', () => {
    const classes = [
      cls('enum', 'Estado', 'ENUMERATION'),
      ...Array.from({ length: CONCEPTUAL_BATCH_SIZE + 1 }, (_, i) => cls(`c${i}`, `Clase ${i}`)),
    ];
    const plan = planConceptualBatches(classes);
    expect(plan).toHaveLength(2);
    expect(plan.flat().map((c) => c.localId)).not.toContain('enum');
    expect(plan[1]).toHaveLength(1);
  });
});

describe('relationshipsToCarry and conceptualCardinality', () => {
  const classes = [cls('a', 'A'), cls('b', 'B'), cls('c', 'C')];
  const relationships: ClassRelationship[] = [
    {
      fromLocalId: 'a',
      toLocalId: 'b',
      kind: 'ASSOCIATION',
      label: 'tiene',
      fromMultiplicity: '1',
      toMultiplicity: '*',
    },
    {
      fromLocalId: 'c',
      toLocalId: 'a',
      kind: 'ASSOCIATION',
      fromMultiplicity: '*',
      toMultiplicity: '1',
    },
    { fromLocalId: 'a', toLocalId: 'enum', kind: 'DEPENDENCY' },
  ];
  it('asks a batch for the relationships whose later class it holds, between entity classes only', () => {
    expect(relationshipsToCarry(classes, relationships, [classes[0]!])).toEqual([]);
    expect(
      relationshipsToCarry(classes, relationships, [classes[1]!]).map((r) => r.fromClassLocalId),
    ).toEqual(['a']);
    expect(
      relationshipsToCarry(classes, relationships, [classes[2]!]).map((r) => r.fromClassLocalId),
    ).toEqual(['c']);
  });
  it('reads the cardinality from the end that has many, with the "one" end as the origin', () => {
    expect(conceptualCardinality(relationships[0]!)).toEqual({
      swap: false,
      cardinality: 'ONE_TO_MANY',
    });
    expect(conceptualCardinality(relationships[1]!)).toEqual({
      swap: true,
      cardinality: 'ONE_TO_MANY',
    });
    expect(
      conceptualCardinality({
        fromLocalId: 'a',
        toLocalId: 'b',
        kind: 'ASSOCIATION',
        fromMultiplicity: '*',
        toMultiplicity: '1..*',
      }),
    ).toEqual({ swap: false, cardinality: 'MANY_TO_MANY' });
    expect(
      conceptualCardinality({
        fromLocalId: 'a',
        toLocalId: 'b',
        kind: 'ASSOCIATION',
        fromMultiplicity: '1',
        toMultiplicity: '0..1',
      }).cardinality,
    ).toBe('ONE_TO_ONE');
  });
});

describe('mergeConceptualBatch', () => {
  const targets = [cls('a', 'A'), cls('b', 'B')];
  it('adds the entities of a batch and keeps every local id unique', () => {
    const first = mergeConceptualBatch(
      empty,
      { entities: [entity('e', 'a'), entity('f', 'b')], relationships: [] },
      targets,
    );
    const second = mergeConceptualBatch(
      first,
      {
        entities: [entity('e', 'c')],
        relationships: [
          { fromLocalId: 'f', toLocalId: 'e', name: 'tiene', cardinality: 'ONE_TO_MANY' },
        ],
      },
      [cls('c', 'C')],
    );
    expect(second.entities.map((e) => e.localId)).toEqual(['e', 'f', 'e-2']);
    // The relationship names the batch's own "e", which became "e-2".
    expect(second.relationships[0]).toMatchObject({ fromLocalId: 'f', toLocalId: 'e-2' });
  });
  it('drops a repeat of a class already done and refuses an entity of no class', () => {
    const first = mergeConceptualBatch(empty, { entities: [entity('e', 'a')], relationships: [] }, [
      cls('a', 'A'),
    ]);
    const again = mergeConceptualBatch(
      first,
      { entities: [entity('x', 'a'), entity('g', 'b')], relationships: [] },
      [cls('b', 'B')],
    );
    expect(again.entities.map((e) => e.localId)).toEqual(['e', 'g']);
    const merge = (output: { entities: Entity[]; relationships: [] }) =>
      mergeConceptualBatch(empty, output, targets);
    expect(() => merge({ entities: [entity('z', 'nope')], relationships: [] })).toThrow(
      'no es de este lote',
    );
    expect(() => merge({ entities: [entity('z')], relationships: [] })).toThrow('no indica');
    expect(() =>
      merge({ entities: [entity('z', 'a'), entity('y', 'a')], relationships: [] }),
    ).toThrow('repite');
  });
  it('refuses a relationship to an entity that does not exist', () => {
    expect(() =>
      mergeConceptualBatch(
        empty,
        {
          entities: [entity('e', 'a')],
          relationships: [
            { fromLocalId: 'e', toLocalId: 'zzz', name: 'x', cardinality: 'ONE_TO_ONE' },
          ],
        },
        [cls('a', 'A')],
      ),
    ).toThrow('no existe');
  });
});

describe('completing the model from the class diagram', () => {
  const classes = [cls('a', 'Pedido'), cls('b', 'Cliente')];
  it('makes the entity of a class the model never answered for, with its attributes', () => {
    const drawn = mergeConceptualBatch(empty, { entities: [entity('e', 'a')], relationships: [] }, [
      classes[0]!,
    ]);
    const missing = classesWithoutEntity(drawn, classes);
    expect(missing.map((c) => c.localId)).toEqual(['b']);
    const filled = fillMissingEntities(drawn, missing);
    expect(filled.entities[1]).toMatchObject({
      name: 'Cliente',
      classLocalId: 'b',
      relatedSourceCodes: ['MD-001'],
    });
    expect(filled.entities[1]!.attributes).toEqual([
      { name: 'Identificador', required: true },
      { name: 'Nombre', required: false },
    ]);
    expect(classesWithoutEntity(filled, classes)).toEqual([]);
  });
  it('carries over a class relationship the model left out, once, with its cardinality', () => {
    const full = fillMissingEntities(empty, classes);
    const relationship: ClassRelationship = {
      fromLocalId: 'a',
      toLocalId: 'b',
      kind: 'ASSOCIATION',
      label: 'pertenece a',
      fromMultiplicity: '*',
      toMultiplicity: '1',
    };
    const done = completeRelationships(full, [relationship]);
    // Many Pedidos per Cliente: the Cliente is the "one" end, so it is the origin.
    expect(done.relationships).toEqual([
      {
        fromLocalId: full.entities[1]!.localId,
        toLocalId: full.entities[0]!.localId,
        name: 'pertenece a',
        cardinality: 'ONE_TO_MANY',
      },
    ]);
    expect(completeRelationships(done, [relationship]).relationships).toHaveLength(1);
  });
  it('checks the whole model once it is assembled', () => {
    expect(finishConceptualModel(fillMissingEntities(empty, classes)).entities).toHaveLength(2);
    expect(() => finishConceptualModel({ entities: [], relationships: [] })).toThrow('inválidas');
  });
});
