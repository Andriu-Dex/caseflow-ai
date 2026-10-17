import { describe, expect, it } from 'vitest';
import {
  DATA_MODEL_BATCH_SIZE,
  cleanDiscovery,
  entitiesWithoutDetail,
  fillMissingEntities,
  finishDataModel,
  mergeDataModelBatch,
  planDataModelBatches,
  type DiscoveredEntity,
} from './data-model-batches';

const found = (localId: string, name: string): DiscoveredEntity => ({
  localId,
  name,
  relatedSourceCodes: [],
});
const attribute = (name: string, primaryKey = false) => ({
  name,
  type: 'STRING' as const,
  required: true,
  primaryKey,
  unique: false,
});
const entity = (localId: string, name: string, attributes = [attribute('id', true)]) => ({
  localId,
  name,
  attributes,
});
const relation = (sourceEntityId: string, targetEntityId: string) => ({
  sourceEntityId,
  targetEntityId,
  sourceCardinality: 'ONE' as const,
  targetCardinality: 'ZERO_OR_MORE' as const,
});
const empty = { entities: [], relationships: [] };

describe('discovery', () => {
  it('keeps the first of a repeated name or id and refuses an empty list', () => {
    const entities = cleanDiscovery([
      found('a', 'Cliente'),
      found('b', ' cliente '),
      found('a', 'Otro'),
      found('c', 'Pedido'),
    ]);
    expect(entities.map((e) => e.localId)).toEqual(['a', 'c']);
    expect(() => cleanDiscovery([])).toThrow('ninguna entidad');
  });
  it('cuts the entities into batches in their order', () => {
    const entities = Array.from({ length: DATA_MODEL_BATCH_SIZE + 1 }, (_, i) =>
      found(`e${i}`, `E${i}`),
    );
    expect(planDataModelBatches(entities).map((batch) => batch.length)).toEqual([
      DATA_MODEL_BATCH_SIZE,
      1,
    ]);
  });
});

describe('mergeDataModelBatch', () => {
  const all = [found('a', 'Cliente'), found('b', 'Pedido'), found('c', 'Producto')];
  it('matches an entity by id or, when the model renamed the id, by name', () => {
    const merged = mergeDataModelBatch(
      empty,
      { entities: [entity('x', 'cliente'), entity('b', 'Pedido')], relationships: [] },
      all.slice(0, 2),
      all,
    );
    expect(merged.entities.map((e) => [e.localId, e.name])).toEqual([
      ['a', 'Cliente'],
      ['b', 'Pedido'],
    ]);
  });
  it('repairs attributes, drops an entity already done and refuses one of no batch', () => {
    const first = mergeDataModelBatch(
      empty,
      {
        entities: [
          entity('a', 'Cliente', [attribute('id', true), attribute('ID'), attribute('dni', true)]),
        ],
        relationships: [],
      },
      [all[0]!],
      all,
    );
    expect(first.entities[0]!.attributes.map((a) => [a.name, a.primaryKey])).toEqual([
      ['id', true],
      ['dni', false],
    ]);
    const second = mergeDataModelBatch(
      first,
      { entities: [entity('a', 'Cliente'), entity('b', 'Pedido')], relationships: [] },
      [all[1]!],
      all,
    );
    expect(second.entities.map((e) => e.localId)).toEqual(['a', 'b']);
    expect(() =>
      mergeDataModelBatch(
        empty,
        { entities: [entity('z', 'Nada')], relationships: [] },
        [all[0]!],
        all,
      ),
    ).toThrow('no es de este lote');
    expect(() =>
      mergeDataModelBatch(
        empty,
        { entities: [entity('a', 'Cliente'), entity('a', 'Cliente')], relationships: [] },
        [all[0]!],
        all,
      ),
    ).toThrow('repite');
  });
  it('keeps a relationship between discovered entities once per pair and drops the others', () => {
    const merged = mergeDataModelBatch(
      empty,
      {
        entities: [entity('a', 'Cliente'), entity('b', 'Pedido')],
        relationships: [relation('a', 'b'), relation('b', 'a'), relation('a', 'ghost')],
      },
      all.slice(0, 2),
      all,
    );
    expect(merged.relationships).toHaveLength(1);
    expect(merged.relationships[0]).toMatchObject({ sourceEntityId: 'a', targetEntityId: 'b' });
  });
});

describe('completing the model', () => {
  it('draws an entity the model never detailed with an identifier, and checks the whole model', () => {
    const all = [found('a', 'Cliente'), found('b', 'Pedido')];
    const drawn = mergeDataModelBatch(
      empty,
      { entities: [entity('a', 'Cliente')], relationships: [] },
      all,
      all,
    );
    const missing = entitiesWithoutDetail(drawn, all);
    expect(missing.map((e) => e.localId)).toEqual(['b']);
    const filled = fillMissingEntities(drawn, missing);
    expect(filled.entities[1]!.attributes).toEqual([
      expect.objectContaining({ name: 'Identificador', primaryKey: true }),
    ]);
    expect(finishDataModel('Modelo', filled).entities).toHaveLength(2);
    expect(() => finishDataModel('Modelo', empty)).toThrow('inválidas');
  });
});
