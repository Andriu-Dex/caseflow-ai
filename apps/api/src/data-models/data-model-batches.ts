import { AIError } from '@caseflow-ai/ai';
import {
  dataModelInputSchema,
  type DataModelBatchEntity,
  type DataModelBatchRelationship,
  type DataModelInput,
} from '@caseflow-ai/contracts';

// DEC-144: entities per batch. Each brings its attributes and its
// relationships, so a batch of this size fits one response.
export const DATA_MODEL_BATCH_SIZE = 8;
// Times a batch is asked for: once, and twice more for the entities it left out.
export const DATA_MODEL_BATCH_ATTEMPTS = 3;

export interface DiscoveredEntity {
  localId: string;
  name: string;
  description?: string;
  relatedSourceCodes: string[];
}
export interface Drawn {
  entities: DataModelBatchEntity[];
  relationships: DataModelBatchRelationship[];
}
export interface BatchOutput {
  entities: DataModelBatchEntity[];
  relationships: DataModelBatchRelationship[];
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
const key = (value: string) => value.trim().toLocaleLowerCase('en-US');

// The entities the sources support. A repeated name or identifier keeps the
// first: the model often lists an entity twice under two ids.
export function cleanDiscovery(entities: DiscoveredEntity[]): DiscoveredEntity[] {
  const names = new Set<string>();
  const ids = new Set<string>();
  const result: DiscoveredEntity[] = [];
  for (const entity of entities) {
    if (names.has(key(entity.name)) || ids.has(entity.localId)) continue;
    names.add(key(entity.name));
    ids.add(entity.localId);
    result.push(entity);
  }
  if (!result.length) invalid('No se identificó ninguna entidad.');
  return result;
}

export function planDataModelBatches(entities: DiscoveredEntity[]): DiscoveredEntity[][] {
  return Array.from({ length: Math.ceil(entities.length / DATA_MODEL_BATCH_SIZE) }, (_, index) =>
    entities.slice(index * DATA_MODEL_BATCH_SIZE, (index + 1) * DATA_MODEL_BATCH_SIZE),
  );
}

const identifier = (): DataModelBatchEntity['attributes'][number] => ({
  name: 'Identificador',
  type: 'UUID',
  required: true,
  primaryKey: true,
  unique: true,
});

// Adds one batch's entities and relationships to those already drawn. An entity
// is one of the batch's (matched by id, or by name when the model renamed the
// id); one already drawn is dropped. A relationship joins two entities of the
// discovered set, once per pair.
export function mergeDataModelBatch(
  accumulated: Drawn,
  output: BatchOutput,
  targets: DiscoveredEntity[],
  all: DiscoveredEntity[],
): Drawn {
  const byId = new Map(targets.map((entity) => [entity.localId, entity]));
  const byName = new Map(targets.map((entity) => [key(entity.name), entity]));
  const allIds = new Set(all.map((entity) => entity.localId));
  const idOf = new Map(all.map((entity) => [key(entity.name), entity.localId]));
  const done = new Set(accumulated.entities.map((entity) => entity.localId));
  const entities = [...accumulated.entities];
  const remap = new Map<string, string>();
  const drawn = new Set<string>();
  for (const entity of output.entities) {
    const target = byId.get(entity.localId) ?? byName.get(key(entity.name));
    if (!target) {
      const known = allIds.has(entity.localId) ? entity.localId : idOf.get(key(entity.name));
      if (known && done.has(known)) {
        remap.set(entity.localId, known);
        continue;
      }
      invalid('Una entidad no es de este lote.');
    }
    if (drawn.has(target!.localId)) invalid('El lote repite una entidad.');
    drawn.add(target!.localId);
    remap.set(entity.localId, target!.localId);
    const names = new Set<string>();
    let primaryKey = false;
    const attributes = entity.attributes
      .filter((attribute) => {
        if (names.has(key(attribute.name))) return false;
        names.add(key(attribute.name));
        return true;
      })
      .map((attribute) => {
        if (!attribute.primaryKey) return attribute;
        if (primaryKey) return { ...attribute, primaryKey: false };
        primaryKey = true;
        return attribute;
      });
    entities.push({
      ...entity,
      localId: target!.localId,
      name: target!.name,
      attributes: attributes.length ? attributes : [identifier()],
    });
  }
  const relationships = [...accumulated.relationships];
  const pairs = new Set(
    relationships.flatMap((r) => [
      `${r.sourceEntityId}|${r.targetEntityId}`,
      `${r.targetEntityId}|${r.sourceEntityId}`,
    ]),
  );
  for (const relationship of output.relationships) {
    const source = remap.get(relationship.sourceEntityId) ?? relationship.sourceEntityId;
    const target = remap.get(relationship.targetEntityId) ?? relationship.targetEntityId;
    if (!allIds.has(source) || !allIds.has(target)) continue;
    if (pairs.has(`${source}|${target}`)) continue;
    pairs.add(`${source}|${target}`);
    pairs.add(`${target}|${source}`);
    relationships.push({ ...relationship, sourceEntityId: source, targetEntityId: target });
  }
  return { entities, relationships };
}

export const entitiesWithoutDetail = (drawn: Drawn, targets: DiscoveredEntity[]) => {
  const done = new Set(drawn.entities.map((entity) => entity.localId));
  return targets.filter((entity) => !done.has(entity.localId));
};

// Last resort for an entity the model never detailed: it still exists in the
// model, with an identifier the author can complete.
export function fillMissingEntities(drawn: Drawn, missing: DiscoveredEntity[]): Drawn {
  return {
    entities: [
      ...drawn.entities,
      ...missing.map((entity): DataModelBatchEntity => ({
        localId: entity.localId,
        name: entity.name,
        ...(entity.description ? { description: entity.description } : {}),
        attributes: [identifier()],
      })),
    ],
    relationships: drawn.relationships,
  };
}

export function finishDataModel(title: string, drawn: Drawn): DataModelInput {
  const checked = dataModelInputSchema.safeParse({
    title,
    modelKind: 'ER',
    entities: drawn.entities,
    relationships: drawn.relationships,
  });
  if (!checked.success)
    return invalid('El modelo reunido contiene entidades o relaciones inválidas.');
  return checked.data;
}
