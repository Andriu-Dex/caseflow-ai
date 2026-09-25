import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

// Project-scoped First Deliverable provenance graph (requirements.md Phase F).
// Every edge corresponds to a real persisted exact-version relationship —
// never an inferred "adjacent stage" guess.
export const TRACEABILITY_ARTIFACT_TYPES = [
  'PROJECT_SOURCE',
  'PROJECT_CONTEXT',
  'REQUIREMENT',
  'USE_CASE',
  'DATA_MODEL',
  'USE_CASE_DIAGRAM',
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'MOCKUP',
] as const;
export type TraceabilityArtifactType = (typeof TRACEABILITY_ARTIFACT_TYPES)[number];

export const TRACEABILITY_EDGE_TYPES = [
  'SOURCE_SUPPORTS_CONTEXT',
  'CONTEXT_SOURCE_FOR_REQUIREMENT',
  'REQUIREMENT_SOURCE_FOR_USE_CASE',
  'SOURCE_FOR_DATA_MODEL',
  'SOURCE_FOR_DIAGRAM',
  'SOURCE_FOR_STRUCTURED_ANALYSIS',
  'UI_BLUEPRINT_SOURCE_FOR_MOCKUP',
] as const;
export type TraceabilityEdgeType = (typeof TRACEABILITY_EDGE_TYPES)[number];

export const traceabilityGenerationSchema = z.object({
  generationId: z.uuid().nullable(),
  candidateId: z.uuid().nullable(),
  aiRunId: z.uuid().nullable(),
  promptKey: z.string().nullable(),
  promptVersion: z.number().int().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
});
export type TraceabilityGeneration = z.infer<typeof traceabilityGenerationSchema>;

export const traceabilityGeneratorSchema = z.object({
  sourceFormat: z.string().nullable(),
  generatorVersion: z.string(),
});
export type TraceabilityGenerator = z.infer<typeof traceabilityGeneratorSchema>;

export const traceabilityNodeSchema = z.object({
  id: z.uuid(),
  artifactId: z.uuid(),
  artifactType: z.enum(TRACEABILITY_ARTIFACT_TYPES),
  code: z.string(),
  versionNumber: z.number().int().min(1),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  origin: z.enum(ARTIFACT_ORIGINS),
  title: z.string(),
  isCurrent: z.boolean(),
  generation: traceabilityGenerationSchema.nullable(),
  generator: traceabilityGeneratorSchema.nullable(),
});
export type TraceabilityNode = z.infer<typeof traceabilityNodeSchema>;

export const traceabilityEdgeSchema = z.object({
  type: z.enum(TRACEABILITY_EDGE_TYPES),
  fromId: z.uuid(),
  toId: z.uuid(),
});
export type TraceabilityEdge = z.infer<typeof traceabilityEdgeSchema>;

// Explicit, never-silent bound (spec Phase F closure item A): a project
// large enough to exceed these limits gets a truncated graph with
// truncated=true, never a silently-dropped partial result.
export const TRACEABILITY_MAX_NODES = 500;
export const TRACEABILITY_MAX_EDGES = 1000;

export const traceabilityGraphResponseSchema = z.object({
  projectId: z.uuid(),
  generatedAt: z.iso.datetime(),
  nodes: z.array(traceabilityNodeSchema),
  edges: z.array(traceabilityEdgeSchema),
  truncated: z.boolean(),
});
export type TraceabilityGraphResponse = z.infer<typeof traceabilityGraphResponseSchema>;
