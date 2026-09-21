import { z } from 'zod';

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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectListResponseSchema = z.object({
  items: z.array(projectResponseSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
