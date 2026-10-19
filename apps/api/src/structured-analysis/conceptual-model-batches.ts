import { AIError } from '@caseflow-ai/ai';
import {
  conceptualDomainModelContentSchema,
  type ClassDiagramContent,
  type ConceptualDomainModelContent,
} from '@caseflow-ai/contracts';

// DEC-144: persisted domain classes per batch. Each becomes a conceptual
// entity with its attributes, so a batch of this size fits one response.
export const CONCEPTUAL_BATCH_SIZE = 8;
// Times a batch is asked for: once, and twice more for the classes it left out.
export const CONCEPTUAL_BATCH_ATTEMPTS = 3;

export type Entity = ConceptualDomainModelContent['entities'][number];
export type Relationship = ConceptualDomainModelContent['relationships'][number];
export type DomainClass = ClassDiagramContent['classes'][number];
export type ClassRelationship = ClassDiagramContent['relationships'][number];
export interface Accumulated {
  entities: Entity[];
  relationships: Relationship[];
}
export interface BatchOutput {
  entities: Entity[];
  relationships: Relationship[];
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
const key = (value: string) => value.trim().toLocaleLowerCase('es');

// The persisted classes: what the conceptual model refines (DEC-121).
export const entityClasses = (classes: DomainClass[]) =>
  classes.filter((cls) => cls.stereotype === 'ENTITY');

export function planConceptualBatches(classes: DomainClass[]): DomainClass[][] {
  const entities = entityClasses(classes);
  return Array.from({ length: Math.ceil(entities.length / CONCEPTUAL_BATCH_SIZE) }, (_, index) =>
    entities.slice(index * CONCEPTUAL_BATCH_SIZE, (index + 1) * CONCEPTUAL_BATCH_SIZE),
  );
}

// The class relationships a batch is asked to carry over: the ones whose later
// class (in diagram order) is in the batch, so the other end is already there.
export function relationshipsToCarry(
  classes: DomainClass[],
  relationships: ClassRelationship[],
  batch: DomainClass[],
) {
  const order = new Map(entityClasses(classes).map((cls, index) => [cls.localId, index]));
  const inBatch = new Set(batch.map((cls) => cls.localId));
  const byId = new Map(classes.map((cls) => [cls.localId, cls]));
  return relationships
    .filter((relationship) => {
      const ends = [relationship.fromLocalId, relationship.toLocalId];
      if (ends.some((id) => !order.has(id))) return false;
      const later = ends.reduce((a, b) => (order.get(a)! >= order.get(b)! ? a : b));
      return inBatch.has(later);
    })
    .map((relationship) => ({
      fromClassLocalId: relationship.fromLocalId,
      fromClass: byId.get(relationship.fromLocalId)?.name,
      toClassLocalId: relationship.toLocalId,
      toClass: byId.get(relationship.toLocalId)?.name,
      label: relationship.label,
      fromMultiplicity: relationship.fromMultiplicity,
      toMultiplicity: relationship.toMultiplicity,
    }));
}

const many = (multiplicity?: string) => multiplicity === '*' || multiplicity === '1..*';

// How many of each side a class relationship has, as a conceptual cardinality
// read from the one end that owns many: fromMultiplicity is how many origins
// there are per destination, toMultiplicity how many destinations per origin.
export function conceptualCardinality(relationship: ClassRelationship): {
  swap: boolean;
  cardinality: Relationship['cardinality'];
} {
  const fromMany = many(relationship.fromMultiplicity);
  const toMany = many(relationship.toMultiplicity);
  if (fromMany && toMany) return { swap: false, cardinality: 'MANY_TO_MANY' };
  if (!fromMany && !toMany) return { swap: false, cardinality: 'ONE_TO_ONE' };
  // One end has many of the other: the "one" end is the origin.
  return { swap: fromMany, cardinality: 'ONE_TO_MANY' };
}

const entityFromClass = (cls: DomainClass, localId: string): Entity => ({
  localId,
  name: cls.name,
  description: cls.description ?? `Entidad «${cls.name}» del dominio.`,
  classLocalId: cls.localId,
  attributes: cls.attributes.length
    ? cls.attributes.map((attribute) => ({ name: attribute.name, required: attribute.required }))
    : [{ name: 'Identificador', required: true }],
  ...(cls.relatedSourceCodes ? { relatedSourceCodes: cls.relatedSourceCodes } : {}),
});

// Adds one batch's entities and relationships to what earlier batches drew.
// An entity belongs to one of the batch's classes; one for a class already
// done is dropped (and relationships follow the existing entity), one for a
// class that does not exist refuses the batch.
export function mergeConceptualBatch(
  accumulated: Accumulated,
  output: BatchOutput,
  targets: DomainClass[],
): Accumulated {
  const entities = accumulated.entities.map((entity) => ({ ...entity }));
  const taken = new Set(entities.map((entity) => entity.localId));
  const inBatch = new Set(targets.map((cls) => cls.localId));
  const finalId = new Map<string, string>();
  const drawn = new Set<string>();
  for (const entity of output.entities) {
    const classId = entity.classLocalId;
    if (!classId) invalid('Una entidad no indica la clase del diagrama que representa.');
    if (!inBatch.has(classId!)) {
      const done = entities.find((value) => value.classLocalId === classId);
      if (done) {
        finalId.set(entity.localId, done.localId);
        continue;
      }
      invalid('Una entidad representa una clase que no es de este lote.');
    }
    if (drawn.has(classId!)) invalid('El lote repite la entidad de una clase.');
    drawn.add(classId!);
    let localId = entity.localId;
    for (let n = 2; taken.has(localId); n += 1) localId = `${entity.localId}-${n}`;
    taken.add(localId);
    finalId.set(entity.localId, localId);
    entities.push({ ...entity, localId });
  }
  const known = new Set(entities.map((entity) => entity.localId));
  const relationships = [...accumulated.relationships];
  // Two entities may be related in more than one way (a user works at a branch
  // and is responsible for it): only the same name between them is a repeat.
  const seen = new Set(relationships.map((r) => `${r.fromLocalId}|${r.toLocalId}|${key(r.name)}`));
  for (const relationship of output.relationships) {
    const from = finalId.get(relationship.fromLocalId) ?? relationship.fromLocalId;
    const to = finalId.get(relationship.toLocalId) ?? relationship.toLocalId;
    if (!known.has(from) || !known.has(to))
      invalid('Una relación cita una entidad que no existe en el modelo.');
    const name = key(relationship.name);
    if (from === to || seen.has(`${from}|${to}|${name}`) || seen.has(`${to}|${from}|${name}`))
      continue;
    seen.add(`${from}|${to}|${name}`);
    relationships.push({ ...relationship, fromLocalId: from, toLocalId: to });
  }
  return { entities, relationships };
}

export function classesWithoutEntity(accumulated: Accumulated, targets: DomainClass[]) {
  const done = new Set(accumulated.entities.map((entity) => entity.classLocalId));
  return targets.filter((cls) => !done.has(cls.localId));
}

// Last resort for a class the model never answered for: its entity comes from
// the class diagram itself (name, description and attributes).
export function fillMissingEntities(accumulated: Accumulated, missing: DomainClass[]): Accumulated {
  const taken = new Set(accumulated.entities.map((entity) => entity.localId));
  const entities = [...accumulated.entities];
  for (const cls of missing) {
    let localId = `entity-${key(cls.name).replace(/[^a-z0-9]+/g, '-')}`;
    for (let n = 2; taken.has(localId); n += 1) localId = `${localId}-${n}`;
    taken.add(localId);
    entities.push(entityFromClass(cls, localId));
  }
  return { entities, relationships: accumulated.relationships };
}

// The last word: every relationship of the class diagram between two entity
// classes joins their entities. One the model did not carry over is added.
export function completeRelationships(
  accumulated: Accumulated,
  relationships: ClassRelationship[],
): Accumulated {
  const entityOf = (classId: string) =>
    accumulated.entities.find((entity) => entity.classLocalId === classId);
  // How many relationships join each pair of entities: the class diagram may
  // have more than one between the same two (the model may merge them).
  const pair = (a: string, b: string) => [a, b].sort().join('|');
  const joined = new Map<string, number>();
  for (const r of accumulated.relationships) {
    const k = pair(r.fromLocalId, r.toLocalId);
    joined.set(k, (joined.get(k) ?? 0) + 1);
  }
  const wanted = new Map<string, number>();
  const added: Relationship[] = [];
  for (const relationship of relationships) {
    const a = entityOf(relationship.fromLocalId);
    const b = entityOf(relationship.toLocalId);
    if (!a || !b || a.localId === b.localId) continue;
    const k = pair(a.localId, b.localId);
    wanted.set(k, (wanted.get(k) ?? 0) + 1);
    if (wanted.get(k)! <= (joined.get(k) ?? 0)) continue;
    const { swap, cardinality } = conceptualCardinality(relationship);
    added.push({
      fromLocalId: swap ? b.localId : a.localId,
      toLocalId: swap ? a.localId : b.localId,
      name: relationship.label ?? 'se relaciona con',
      cardinality,
    });
  }
  return {
    entities: accumulated.entities,
    relationships: [...accumulated.relationships, ...added],
  };
}

export function finishConceptualModel(accumulated: Accumulated): ConceptualDomainModelContent {
  const checked = conceptualDomainModelContentSchema.safeParse(accumulated);
  if (!checked.success)
    return invalid('El modelo reunido contiene entidades o relaciones inválidas.');
  return checked.data;
}
