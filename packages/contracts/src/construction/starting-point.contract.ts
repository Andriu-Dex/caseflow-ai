import { z } from 'zod';
import { dataModelInputSchema } from '../data-models/data-model.contract';
import { REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../requirements/requirement.contract';
import {
  USE_CASE_RELATION_KINDS,
  useCaseAlternativeFlowSchema,
  useCaseFlowStepSchema,
} from '../use-cases/use-case.contract';

// DEC-176: a starting point is a package of requirements, use cases and a data
// model that another project copies as drafts and adapts. Within it, items
// refer to each other by their key (the code they had where they came from).
const text = (max: number) => z.string().trim().min(1).max(max);
const key = text(40);
const texts = z.array(text(2000)).max(50).default([]);

export const startingPointContentSchema = z
  .object({
    requirements: z
      .array(
        z
          .object({
            key,
            requirementType: z.enum(REQUIREMENT_TYPES),
            name: text(200),
            description: text(4000),
            priority: z.enum(REQUIREMENT_PRIORITIES),
            actors: z.array(text(200)).max(25).default([]),
            preconditions: z.array(text(500)).max(25).default([]),
            postconditions: z.array(text(500)).max(25).default([]),
            dependsOn: z.array(key).max(25).default([]),
          })
          .strict(),
      )
      .max(500),
    useCases: z
      .array(
        z
          .object({
            key,
            name: text(200),
            objective: text(4000),
            primaryActor: text(200),
            secondaryActors: z.array(text(200)).max(25).default([]),
            preconditions: texts,
            postconditions: texts,
            mainFlow: z.array(useCaseFlowStepSchema).min(1).max(100),
            alternativeFlows: z.array(useCaseAlternativeFlowSchema).max(25).default([]),
            requirementKeys: z.array(key).min(1).max(50),
            relations: z
              .array(z.object({ kind: z.enum(USE_CASE_RELATION_KINDS), targetKey: key }).strict())
              .max(25)
              .default([]),
          })
          .strict(),
      )
      .max(500),
    dataModel: dataModelInputSchema.nullable().default(null),
  })
  .strict();
export type StartingPointContent = z.output<typeof startingPointContentSchema>;

// A built-in starting point ships with CASEFlow as data; the others are saved
// from a project of the workspace.
export const startingPointIdSchema = z
  .string()
  .regex(
    /^(builtin-[a-z0-9-]{1,60}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    'Punto de partida no válido.',
  );

export const startingPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  builtIn: z.boolean(),
  counts: z.object({
    requirements: z.number().int(),
    useCases: z.number().int(),
    entities: z.number().int(),
  }),
  createdAt: z.iso.datetime().nullable(),
});
export type StartingPoint = z.infer<typeof startingPointSchema>;
export const startingPointListResponseSchema = z.object({ items: z.array(startingPointSchema) });
export type StartingPointListResponse = z.infer<typeof startingPointListResponseSchema>;

export const saveStartingPointRequestSchema = z
  .object({ name: text(120), description: z.string().trim().max(1000).default('') })
  .strict();
export type SaveStartingPointRequest = z.output<typeof saveStartingPointRequestSchema>;

export const applyStartingPointResponseSchema = z.object({
  requirements: z.number().int(),
  useCases: z.number().int(),
  entities: z.number().int(),
});
export type ApplyStartingPointResponse = z.infer<typeof applyStartingPointResponseSchema>;
