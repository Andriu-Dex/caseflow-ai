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
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'DESIGN_THEME',
  'MOCKUP',
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'DESIGN_BASELINE',
  'IMPLEMENTATION_PLAN',
  'CODE_GENERATION',
  'SANDBOX_VALIDATION',
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_RUN_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] as const;

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
  completedStages: z.array(z.enum(WORKFLOW_STAGES)),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type WorkflowRunResponse = z.infer<typeof workflowRunResponseSchema>;
export const workflowRunListResponseSchema = z.object({
  items: z.array(workflowRunResponseSchema),
});
