import { z } from 'zod';

// ---- CLASS_DIAGRAM (DEC-121, ADR-006) ----------------------------------------
// Domain classes only: services, controllers and repositories belong to the
// Implementation Plan. Each class names the data-model entity it represents,
// which is how coherence is checked across stages.

const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);

export const CLASS_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'PROTECTED'] as const;
export const CLASS_STEREOTYPES = ['ENTITY', 'VALUE_OBJECT', 'ENUMERATION', 'ABSTRACT'] as const;
export const CLASS_RELATIONSHIP_KINDS = [
  'ASSOCIATION',
  'AGGREGATION',
  'COMPOSITION',
  'INHERITANCE',
  'DEPENDENCY',
] as const;
export const CLASS_MULTIPLICITIES = ['1', '0..1', '*', '1..*'] as const;

const classAttributeSchema = z
  .object({
    name: text(120),
    type: text(80),
    visibility: z.enum(CLASS_VISIBILITIES).default('PRIVATE'),
    required: z.boolean().default(true),
  })
  .strict();

const classMethodSchema = z
  .object({
    name: text(120),
    parameters: z
      .array(z.object({ name: text(120), type: text(80) }).strict())
      .max(20)
      .default([]),
    returnType: text(80).optional(),
    visibility: z.enum(CLASS_VISIBILITIES).default('PUBLIC'),
  })
  .strict();

const domainClassSchema = z
  .object({
    localId: text(80),
    name: text(120),
    stereotype: z.enum(CLASS_STEREOTYPES).default('ENTITY'),
    // Name of the data-model entity this class represents (case-insensitive).
    dataModelEntityName: text(120).optional(),
    description: text(1000).optional(),
    attributes: z.array(classAttributeSchema).max(60).default([]),
    methods: z.array(classMethodSchema).max(40).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();

const classRelationshipSchema = z
  .object({
    fromLocalId: text(80),
    toLocalId: text(80),
    kind: z.enum(CLASS_RELATIONSHIP_KINDS),
    label: text(120).optional(),
    fromMultiplicity: z.enum(CLASS_MULTIPLICITIES).optional(),
    toMultiplicity: z.enum(CLASS_MULTIPLICITIES).optional(),
  })
  .strict();

export const classDiagramContentSchema = z
  .object({
    classes: z.array(domainClassSchema).min(1).max(80),
    relationships: z.array(classRelationshipSchema).max(200).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    value.classes.forEach((cls, index) => {
      if (ids.has(cls.localId))
        ctx.addIssue({
          code: 'custom',
          message: 'localId debe ser único.',
          path: ['classes', index],
        });
      ids.add(cls.localId);
      const name = cls.name.toLocaleLowerCase('es');
      if (names.has(name))
        ctx.addIssue({
          code: 'custom',
          message: 'Cada clase debe tener un nombre distinto.',
          path: ['classes', index, 'name'],
        });
      names.add(name);
    });
    value.relationships.forEach((relationship, index) => {
      if (!ids.has(relationship.fromLocalId) || !ids.has(relationship.toLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'La relación referencia una clase inexistente.',
          path: ['relationships', index],
        });
    });
  });
export type ClassDiagramContent = z.output<typeof classDiagramContentSchema>;

// The data model elements a class diagram must cover (ADR-006): every entity
// has a class that names it, with all of the entity's attributes.
export function classDiagramCoverageGaps(
  content: Pick<ClassDiagramContent, 'classes'>,
  entities: { name: string; attributes: { name: string }[] }[],
): string[] {
  const key = (value: string) => value.trim().toLocaleLowerCase('es');
  const byEntity = new Map(
    content.classes
      .filter((cls) => cls.dataModelEntityName)
      .map((cls) => [key(cls.dataModelEntityName!), cls]),
  );
  const gaps: string[] = [];
  for (const entity of entities) {
    const cls = byEntity.get(key(entity.name));
    if (!cls) {
      gaps.push(`La entidad «${entity.name}» del modelo de datos no tiene una clase.`);
      continue;
    }
    const attributes = new Set(cls.attributes.map((attribute) => key(attribute.name)));
    for (const attribute of entity.attributes)
      if (!attributes.has(key(attribute.name)))
        gaps.push(
          `A la clase «${cls.name}» le falta el atributo «${attribute.name}» de la entidad «${entity.name}».`,
        );
  }
  const known = new Set(entities.map((entity) => key(entity.name)));
  for (const cls of content.classes)
    if (cls.dataModelEntityName && !known.has(key(cls.dataModelEntityName)))
      gaps.push(
        `La clase «${cls.name}» representa «${cls.dataModelEntityName}», que no existe en el modelo de datos.`,
      );
  return gaps;
}
