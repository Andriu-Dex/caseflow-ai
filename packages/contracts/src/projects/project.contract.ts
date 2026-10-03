import { z } from 'zod';

export const PROJECT_LANGUAGES = ['ES', 'EN'] as const;
export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number];

// DEC-116: how much of the planning a person reviews. Ordered from least to
// most review; a project can only move up this list.
export const WORKFLOW_ROUTES = ['BUILD_ONLY', 'EXPRESS', 'FULL'] as const;
export type WorkflowRoute = (typeof WORKFLOW_ROUTES)[number];

export const createProjectRequestSchema = z
  .object({
    workspaceId: z.uuid({ error: 'El identificador del workspace no es válido.' }),
    name: z
      .string({ error: 'El nombre es obligatorio.' })
      .trim()
      .min(1, 'El nombre es obligatorio.')
      .max(200, 'El nombre no puede superar los 200 caracteres.'),
    description: z
      .string()
      .trim()
      .max(5000, 'La descripción no puede superar los 5000 caracteres.')
      .nullish(),
    workflowRoute: z.enum(WORKFLOW_ROUTES).default('FULL'),
  })
  .strict();

export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;

export const listProjectsQuerySchema = z
  .object({
    workspaceId: z.uuid({ error: 'El identificador del workspace no es válido.' }),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListProjectsQuery = z.input<typeof listProjectsQuerySchema>;

export const projectResponseSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  language: z.enum(PROJECT_LANGUAGES),
  workflowRoute: z.enum(WORKFLOW_ROUTES),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  // Whether any artifact in this project ever reached APPROVED — determines
  // whether the project can still be hard-deleted or must be archived
  // instead (spec §87).
  hasApprovedArtifacts: z.boolean(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectListResponseSchema = z.object({
  items: z.array(projectResponseSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const updateProjectLanguageRequestSchema = z
  .object({ language: z.enum(PROJECT_LANGUAGES) })
  .strict();

export const upgradeWorkflowRouteRequestSchema = z
  .object({ workflowRoute: z.enum(WORKFLOW_ROUTES) })
  .strict();

export type UpgradeWorkflowRouteRequest = z.input<typeof upgradeWorkflowRouteRequestSchema>;

export type UpdateProjectLanguageRequest = z.input<typeof updateProjectLanguageRequestSchema>;
