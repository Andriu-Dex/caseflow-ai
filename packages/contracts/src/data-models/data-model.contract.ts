import { z } from 'zod';
import { ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

export const DATA_MODEL_ENTITY_LIMIT = 60;
export const DATA_MODEL_ATTRIBUTE_LIMIT = 50;
export const DATA_MODEL_RELATIONSHIP_LIMIT = 150;
export const DATA_MODEL_MAX_OUTPUT_TOKENS = 12_288;
export const CONCEPTUAL_ATTRIBUTE_TYPES = [
  'STRING',
  'TEXT',
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'UUID',
] as const;
export type ConceptualAttributeType = (typeof CONCEPTUAL_ATTRIBUTE_TYPES)[number];
export const DATA_MODEL_CARDINALITIES = [
  'ONE',
  'ZERO_OR_ONE',
  'ONE_OR_MORE',
  'ZERO_OR_MORE',
] as const;
export type DataModelCardinality = (typeof DATA_MODEL_CARDINALITIES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const attributeSchema = z
  .object({
    name: text(120),
    type: z.enum(CONCEPTUAL_ATTRIBUTE_TYPES),
    required: z.boolean(),
    primaryKey: z.boolean(),
    unique: z.boolean(),
    description: text(1000).optional(),
  })
  .strict();
const entitySchema = z
  .object({
    localId: text(80),
    name: text(120),
    description: text(2000).optional(),
    attributes: z.array(attributeSchema).min(1).max(DATA_MODEL_ATTRIBUTE_LIMIT),
  })
  .strict();
const relationshipSchema = z
  .object({
    sourceEntityId: text(80),
    targetEntityId: text(80),
    name: text(120).optional(),
    sourceCardinality: z.enum(DATA_MODEL_CARDINALITIES),
    targetCardinality: z.enum(DATA_MODEL_CARDINALITIES),
    description: text(1000).optional(),
  })
  .strict();

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}
function validateModel(
  value: {
    entities: z.infer<typeof entitySchema>[];
    relationships: z.infer<typeof relationshipSchema>[];
  },
  ctx: z.RefinementCtx,
) {
  const ids = value.entities.map((x) => x.localId);
  const names = value.entities.map((x) => normalized(x.name));
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['entities'] });
  if (new Set(names).size !== names.length)
    ctx.addIssue({
      code: 'custom',
      message: 'Los nombres de entidad deben ser únicos.',
      path: ['entities'],
    });
  const known = new Set(ids);
  value.entities.forEach((entity, index) => {
    const attributeNames = entity.attributes.map((x) => normalized(x.name));
    if (new Set(attributeNames).size !== attributeNames.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Los atributos deben ser únicos.',
        path: ['entities', index, 'attributes'],
      });
    if (entity.attributes.filter((x) => x.primaryKey).length > 1)
      ctx.addIssue({
        code: 'custom',
        message: 'Solo se admite una clave primaria conceptual.',
        path: ['entities', index, 'attributes'],
      });
  });
  value.relationships.forEach((relationship, index) => {
    if (!known.has(relationship.sourceEntityId) || !known.has(relationship.targetEntityId))
      ctx.addIssue({
        code: 'custom',
        message: 'La relación referencia una entidad inexistente.',
        path: ['relationships', index],
      });
  });
}

const dataModelFieldsSchema = z
  .object({
    title: text(200),
    modelKind: z.literal('ER').default('ER'),
    entities: z.array(entitySchema).min(1).max(DATA_MODEL_ENTITY_LIMIT),
    relationships: z.array(relationshipSchema).max(DATA_MODEL_RELATIONSHIP_LIMIT).default([]),
  })
  .strict();
export const dataModelInputSchema = dataModelFieldsSchema.superRefine(validateModel);
export type DataModelInput = z.output<typeof dataModelInputSchema>;

const versionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int(),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  origin: z.string(),
  createdAt: z.iso.datetime(),
});
export const dataModelResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  version: versionSchema,
  dataModel: dataModelFieldsSchema.extend({
    generationId: z.uuid().nullable(),
    candidateId: z.uuid().nullable(),
    aiRunId: z.uuid().nullable(),
  }),
});
export type DataModelResponse = z.infer<typeof dataModelResponseSchema>;
export const dataModelListResponseSchema = z.object({ items: z.array(dataModelResponseSchema) });

const generationCandidateFieldsSchema = dataModelFieldsSchema.extend({ candidateId: text(80) });
const generationCandidateSchema = generationCandidateFieldsSchema.superRefine(validateModel);
export const dataModelGenerationOutputSchema = z
  .object({ candidates: z.array(generationCandidateSchema).min(1).max(5) })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.candidates.map((x) => x.candidateId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        message: 'candidateId debe ser único.',
        path: ['candidates'],
      });
  });
export const generateDataModelRequestSchema = z
  .object({
    requirementVersionIds: z.array(z.uuid()).max(100).default([]),
    useCaseVersionIds: z.array(z.uuid()).max(100).default([]),
  })
  .strict()
  .refine(
    (x) => x.requirementVersionIds.length + x.useCaseVersionIds.length > 0,
    'Debe indicar al menos una fuente.',
  );
export const acceptDataModelCandidatesRequestSchema = z
  .object({ candidateIds: z.array(z.uuid()).min(1).max(5) })
  .strict();

const dataModelGenerationCandidateResponseSchema = generationCandidateFieldsSchema.extend({
  id: z.uuid(),
  generationId: z.uuid(),
  acceptedArtifactId: z.uuid().nullable(),
});
export const dataModelGenerationResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  aiRunId: z.uuid(),
  createdAt: z.iso.datetime(),
  sources: z.array(
    z.object({
      generationId: z.uuid(),
      artifactVersionId: z.uuid(),
      sourceId: z.uuid(),
    }),
  ),
  candidates: z.array(dataModelGenerationCandidateResponseSchema),
});

export const diagramResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  versionId: z.uuid(),
  versionNumber: z.number().int(),
  kind: z.enum(['ER', 'USE_CASE']),
  sourceFormat: z.enum(['MERMAID_ER', 'PLANTUML']),
  source: z.string(),
  svg: z.string(),
  sourceArtifactVersionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export type DiagramResponse = z.infer<typeof diagramResponseSchema>;
export const diagramListResponseSchema = z.object({ items: z.array(diagramResponseSchema) });
export const manualDiagramVersionRequestSchema = z.object({ source: text(50_000) }).strict();
export const generateDiagramRequestSchema = z
  .object({ sourceVersionIds: z.array(z.uuid()).min(1).max(100) })
  .strict();
