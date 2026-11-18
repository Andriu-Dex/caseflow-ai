import { z } from 'zod';

// DEC-173: what a delivery or a construction brings, in plain words for the
// people who will use it.
export const releaseNotesResponseSchema = z.object({
  title: z.string(),
  // A delivery's number and name, or null for a construction of everything.
  delivery: z.object({ position: z.number().int(), name: z.string() }).nullable(),
  // What each role can do: the use cases its screens realize.
  canDo: z.array(z.object({ role: z.string(), useCases: z.array(z.string()) })),
  requirements: z.object({
    passed: z.array(z.object({ code: z.string(), title: z.string() })),
    failed: z.number().int(),
    notRun: z.number().int(),
    withoutCriteria: z.number().int(),
  }),
  // The running demonstration of this construction, if any. Passwords are
  // never stored: they are the one chosen when deploying.
  demo: z
    .object({
      url: z.string().nullable(),
      accounts: z.array(
        z.object({ role: z.string(), identifier: z.string(), name: z.string().nullable() }),
      ),
    })
    .nullable(),
  changes: z.object({
    // What it is compared with, or null for the first one.
    since: z.string().nullable(),
    newScreens: z.array(z.string()),
    newUseCases: z.array(z.string()),
  }),
  markdown: z.string(),
});
export type ReleaseNotesResponse = z.infer<typeof releaseNotesResponseSchema>;
