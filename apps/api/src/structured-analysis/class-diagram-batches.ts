import { AIError } from '@caseflow-ai/ai';
import {
  classBatchOutputSchema,
  classDiagramContentSchema,
  type ClassDiagramContent,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';

// DEC-142: data-model entities per batch. A class carries its attributes and
// methods, so a batch of this size fits one response with room to spare.
export const CLASS_BATCH_SIZE = 8;
// Times a batch is asked for: once, and twice more for the entities it left out.
export const CLASS_BATCH_ATTEMPTS = 3;

export type BatchOutput = z.infer<typeof classBatchOutputSchema>;
export type DomainClass = ClassDiagramContent['classes'][number];
export type ClassRelationship = ClassDiagramContent['relationships'][number];
export type Multiplicity = NonNullable<ClassRelationship['fromMultiplicity']>;
export interface Accumulated {
  classes: DomainClass[];
  relationships: ClassRelationship[];
}

export interface ModelEntity {
  name: string;
  description?: string | null;
  attributes: { name: string; type: string; required: boolean }[];
}
export interface ModelRelationship {
  from: string;
  to: string;
  name?: string | null;
  fromCardinality: string;
  toCardinality: string;
}

const key = (value: string) => value.trim().toLocaleLowerCase('es');
const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};

export function planClassBatches(entities: { name: string }[]): string[][] {
  return Array.from({ length: Math.ceil(entities.length / CLASS_BATCH_SIZE) }, (_, index) =>
    entities.slice(index * CLASS_BATCH_SIZE, (index + 1) * CLASS_BATCH_SIZE).map((e) => e.name),
  );
}

const MULTIPLICITY: Record<string, Multiplicity> = {
  ONE: '1',
  ZERO_OR_ONE: '0..1',
  ZERO_OR_MORE: '*',
  ONE_OR_MORE: '1..*',
};
const ATTRIBUTE_TYPE: Record<string, string> = {
  UUID: 'UUID',
  STRING: 'String',
  TEXT: 'String',
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  BOOLEAN: 'Boolean',
  DATE: 'Date',
  DATETIME: 'DateTime',
};

// The relationships of the data model that a batch is asked to draw: the ones
// whose later entity (in model order) is in the batch, so the other end is
// either in the batch or already drawn.
export function relationshipsToDraw(
  entities: { name: string }[],
  relationships: ModelRelationship[],
  batch: string[],
) {
  const order = new Map(entities.map((entity, index) => [key(entity.name), index]));
  const inBatch = new Set(batch.map(key));
  return relationships
    .filter((relationship) => {
      const later = Math.max(
        order.get(key(relationship.from)) ?? -1,
        order.get(key(relationship.to)) ?? -1,
      );
      return inBatch.has(key(entities[later]?.name ?? ''));
    })
    .map((relationship) => ({
      from: relationship.from,
      to: relationship.to,
      label: relationship.name ?? undefined,
      fromMultiplicity: MULTIPLICITY[relationship.fromCardinality],
      toMultiplicity: MULTIPLICITY[relationship.toCardinality],
    }));
}

const classFromEntity = (entity: ModelEntity, localId: string): DomainClass => ({
  localId,
  name: entity.name,
  stereotype: 'ENTITY',
  dataModelEntityName: entity.name,
  attributes: entity.attributes.map((attribute) => ({
    name: attribute.name,
    type: ATTRIBUTE_TYPE[attribute.type] ?? attribute.type,
    visibility: 'PRIVATE',
    required: attribute.required,
  })),
  methods: [],
});

// Adds one batch's classes and relationships to what earlier batches drew.
//  - A support class (enumeration, value object) named like one already drawn
//    is not drawn twice; relationships aimed at it follow the existing one.
//  - An attribute the model left out of an entity's class is filled in from
//    the data model, which is the authority on them; a class it left out is
//    asked for again (see fillMissingEntities for what is left after that).
//  - Every entity's class cites the data model it comes from.
export interface MergeOptions {
  // Entities already drawn in earlier batches: if the model repeats one, the
  // repeat is dropped (the entity is not a mistake, it is just done).
  knownEntities?: Set<string>;
  dataModelCode?: string;
}
export function mergeClassBatch(
  accumulated: Accumulated,
  output: BatchOutput,
  targets: ModelEntity[],
  options: MergeOptions = {},
): Accumulated {
  const classes = accumulated.classes.map((cls) => ({ ...cls }));
  const taken = new Set(classes.map((cls) => cls.localId));
  const byName = new Map(classes.map((cls) => [key(cls.name), cls]));
  const targetByName = new Map(targets.map((entity) => [key(entity.name), entity]));
  const finalId = new Map<string, string>();
  const drawn = new Set<string>();
  const unique = (id: string) => {
    let next = id;
    for (let n = 2; taken.has(next); n += 1) next = `${id}-${n}`;
    taken.add(next);
    return next;
  };
  for (const cls of output.classes) {
    const entity = cls.dataModelEntityName ? key(cls.dataModelEntityName) : null;
    if (entity) {
      if (!targetByName.has(entity)) {
        const done = classes.find(
          (value) => value.dataModelEntityName && key(value.dataModelEntityName) === entity,
        );
        if (done && options.knownEntities?.has(entity)) {
          finalId.set(cls.localId, done.localId);
          continue;
        }
        invalid('Una clase representa una entidad que no es de este lote.');
      }
      if (drawn.has(entity)) invalid('El lote repite la clase de una entidad.');
      drawn.add(entity);
    }
    const existing = byName.get(key(cls.name));
    if (existing && !entity) {
      finalId.set(cls.localId, existing.localId);
      continue;
    }
    if (existing) invalid('Una clase de este lote repite el nombre de una ya dibujada.');
    const created = { ...cls, localId: unique(cls.localId) };
    finalId.set(cls.localId, created.localId);
    byName.set(key(created.name), created);
    classes.push(created);
  }
  // The data model is the authority on an entity's attributes.
  for (const entity of targets) {
    const name = key(entity.name);
    const cls = classes.find(
      (value) => value.dataModelEntityName && key(value.dataModelEntityName) === name,
    );
    if (!cls) continue;
    if (options.dataModelCode)
      cls.relatedSourceCodes = [
        ...new Set([...(cls.relatedSourceCodes ?? []), options.dataModelCode]),
      ];
    const have = new Set(cls.attributes.map((attribute) => key(attribute.name)));
    const missing = classFromEntity(entity, cls.localId).attributes.filter(
      (attribute) => !have.has(key(attribute.name)),
    );
    cls.attributes = [...cls.attributes, ...missing];
  }
  const known = new Set(classes.map((cls) => cls.localId));
  const relationships = [...accumulated.relationships];
  const seen = new Set(relationships.map(relationshipKey));
  for (const relationship of output.relationships) {
    const from = finalId.get(relationship.fromLocalId) ?? relationship.fromLocalId;
    const to = finalId.get(relationship.toLocalId) ?? relationship.toLocalId;
    if (!known.has(from) || !known.has(to))
      invalid('Una relación cita una clase que no existe en el diagrama.');
    const next = { ...relationship, fromLocalId: from, toLocalId: to };
    if (seen.has(relationshipKey(next))) continue;
    seen.add(relationshipKey(next));
    relationships.push(next);
  }
  return { classes, relationships };
}

// The entities of a batch that still have no class: what the model gave back
// after being asked again.
export function entitiesWithoutClass(accumulated: Accumulated, targets: ModelEntity[]) {
  return targets.filter(
    (entity) =>
      !accumulated.classes.some(
        (cls) => cls.dataModelEntityName && key(cls.dataModelEntityName) === key(entity.name),
      ),
  );
}

// Last resort for an entity the model never drew: its class comes from the data
// model, with its attributes, and says so by citing it.
export function fillMissingEntities(
  accumulated: Accumulated,
  missing: ModelEntity[],
  dataModelCode?: string,
): Accumulated {
  const taken = new Set(accumulated.classes.map((cls) => cls.localId));
  const classes = [...accumulated.classes];
  for (const entity of missing) {
    let localId = `entity-${key(entity.name).replace(/[^a-z0-9]+/g, '-')}`;
    for (let n = 2; taken.has(localId); n += 1) localId = `${localId}-${n}`;
    taken.add(localId);
    classes.push({
      ...classFromEntity(entity, localId),
      ...(dataModelCode ? { relatedSourceCodes: [dataModelCode] } : {}),
    });
  }
  return { classes, relationships: accumulated.relationships };
}

const relationshipKey = (relationship: ClassRelationship) =>
  [
    relationship.fromLocalId,
    relationship.toLocalId,
    relationship.kind,
    relationship.label ?? '',
  ].join('|');

// The last word: every relationship of the data model joins its two classes,
// in either direction. One the model did not draw is drawn from the data model.
export function completeRelationships(
  accumulated: Accumulated,
  relationships: ModelRelationship[],
): Accumulated {
  const classOf = (name: string) =>
    accumulated.classes.find(
      (cls) => cls.dataModelEntityName && key(cls.dataModelEntityName) === key(name),
    );
  const joined = new Set(
    accumulated.relationships.flatMap((r) => [
      `${r.fromLocalId}|${r.toLocalId}`,
      `${r.toLocalId}|${r.fromLocalId}`,
    ]),
  );
  const added: ClassRelationship[] = [];
  for (const relationship of relationships) {
    const from = classOf(relationship.from);
    const to = classOf(relationship.to);
    if (!from || !to || joined.has(`${from.localId}|${to.localId}`)) continue;
    joined.add(`${from.localId}|${to.localId}`);
    added.push({
      fromLocalId: from.localId,
      toLocalId: to.localId,
      kind: 'ASSOCIATION',
      label: relationship.name ?? undefined,
      fromMultiplicity: MULTIPLICITY[relationship.fromCardinality],
      toMultiplicity: MULTIPLICITY[relationship.toCardinality],
    });
  }
  return { classes: accumulated.classes, relationships: [...accumulated.relationships, ...added] };
}

export function finishClassDiagram(accumulated: Accumulated): ClassDiagramContent {
  const checked = classDiagramContentSchema.safeParse(accumulated);
  if (!checked.success)
    return invalid('El diagrama reunido contiene clases o relaciones inválidas.');
  return checked.data;
}
