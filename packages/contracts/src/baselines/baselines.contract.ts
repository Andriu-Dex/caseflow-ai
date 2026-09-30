import { z } from 'zod';

export const projectBaselineEntrySchema = z.object({
  id: z.string().uuid(),
  baselineId: z.string().uuid(),
  artifactId: z.string().uuid(),
  artifactVersionId: z.string().uuid(),
});

export const projectBaselineSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  label: z.string().min(1).max(255),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdByUserId: z.string().uuid(),
  user: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      displayName: z.string(),
    })
    .optional(),
  entries: z.array(projectBaselineEntrySchema).optional(),
});

export const createBaselineRequestSchema = z.object({
  label: z.string().min(1, 'Baseline label is required').max(100),
  description: z.string().optional(),
});

export const baselineResponseSchema = projectBaselineSchema;

export const baselinesListResponseSchema = z.array(projectBaselineSchema);

export type ProjectBaseline = z.infer<typeof projectBaselineSchema>;
export type ProjectBaselineEntry = z.infer<typeof projectBaselineEntrySchema>;
export type CreateBaselineRequest = z.infer<typeof createBaselineRequestSchema>;
export type BaselineResponse = z.infer<typeof baselineResponseSchema>;
export type BaselinesListResponse = z.infer<typeof baselinesListResponseSchema>;
