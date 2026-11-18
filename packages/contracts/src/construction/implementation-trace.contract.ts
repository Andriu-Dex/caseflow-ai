import { z } from 'zod';

// DEC-172: where a requirement or use case is implemented, and how its latest
// construction left it.
export const implementationTraceResponseSchema = z.object({
  code: z.string(),
  title: z.string(),
  type: z.enum(['REQUIREMENT', 'USE_CASE']),
  useCases: z.array(z.object({ code: z.string(), name: z.string() })),
  // The construction the screens, actions and files come from; null before
  // anything was built (screens and actions then come from the latest plan).
  run: z
    .object({
      id: z.uuid(),
      createdAt: z.iso.datetime(),
      deliveryId: z.uuid().nullable(),
      validation: z.string().nullable(),
    })
    .nullable(),
  screens: z.array(z.object({ path: z.string(), screenName: z.string() })),
  actions: z.array(z.object({ key: z.string(), summary: z.string() })),
  files: z.array(z.object({ path: z.string(), kind: z.string(), origin: z.string() })),
  // Design elements that cite it, such as an architecture component answering
  // a quality requirement.
  design: z.array(z.object({ source: z.string(), name: z.string() })),
  acceptance: z.array(
    z.object({
      key: z.string(),
      useCaseName: z.string(),
      result: z.object({ passed: z.boolean(), message: z.string().nullable() }).nullable(),
    }),
  ),
});
export type ImplementationTraceResponse = z.infer<typeof implementationTraceResponseSchema>;
