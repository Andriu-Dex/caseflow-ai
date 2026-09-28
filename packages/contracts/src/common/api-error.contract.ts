import { z } from 'zod';

// Public error body. Never carries SQL, stack traces or internal paths.
// Validation errors (400) add per-field `errors`; framework errors (404, 422)
// add `error` and `statusCode`.
export const apiErrorResponseSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
  statusCode: z.number().int().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
