import { z } from 'zod';

// Workflow orchestration (DEC-116): from one prompt through the existing
// stages, in dependency order, one stage at a time (DEC-111).
export const WORKFLOW_STAGES = [
  'SOURCE',
  'CONTEXT',
  'REQUIREMENTS',
  'USE_CASES',
  'USE_CASE_DIAGRAM',
  'DATA_MODEL',
  'CLASS_DIAGRAM',
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'DESIGN_THEME',
  'MOCKUP',
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'PLANNING_REVIEW',
  'DESIGN_BASELINE',
  'IMPLEMENTATION_PLAN',
  'IMPLEMENTATION_REVIEW',
  'CODE_GENERATION',
  'SANDBOX_VALIDATION',
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

// EXPRESS pauses at these stages for the bulk human review (DEC-119);
// BUILD_ONLY has no review stages at all.
export const WORKFLOW_REVIEW_STAGES = ['PLANNING_REVIEW', 'IMPLEMENTATION_REVIEW'] as const;
export function workflowStagesFor(route: 'EXPRESS' | 'BUILD_ONLY'): WorkflowStage[] {
  return route === 'EXPRESS'
    ? [...WORKFLOW_STAGES]
    : WORKFLOW_STAGES.filter(
        (stage) => !(WORKFLOW_REVIEW_STAGES as readonly string[]).includes(stage),
      );
}

export const WORKFLOW_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'AWAITING_REVIEW',
  'COMPLETED',
  'FAILED',
] as const;

export const createWorkflowRunRequestSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, 'Describa la aplicación que quiere construir.')
      .max(4000, 'La descripción no puede superar los 4000 caracteres.'),
  })
  .strict();
export type CreateWorkflowRunRequest = z.output<typeof createWorkflowRunRequestSchema>;

export const workflowRunResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  prompt: z.string(),
  status: z.enum(WORKFLOW_RUN_STATUSES),
  currentStage: z.enum(WORKFLOW_STAGES).nullable(),
  // The stages of this run's route, in order.
  stages: z.array(z.enum(WORKFLOW_STAGES)),
  completedStages: z.array(z.enum(WORKFLOW_STAGES)),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type WorkflowRunResponse = z.infer<typeof workflowRunResponseSchema>;
// One artifact the bulk review covers, grouped by the stage that produced it.
export const workflowReviewItemSchema = z.object({
  stage: z.enum(WORKFLOW_STAGES),
  artifactType: z.string(),
  artifactId: z.uuid(),
  versionId: z.uuid(),
  code: z.string(),
  title: z.string(),
  versionNumber: z.number().int(),
  status: z.string(),
});
export type WorkflowReviewItem = z.infer<typeof workflowReviewItemSchema>;
export const workflowReviewResponseSchema = z.object({
  items: z.array(workflowReviewItemSchema),
});

export const workflowRunListResponseSchema = z.object({
  items: z.array(workflowRunResponseSchema),
});
