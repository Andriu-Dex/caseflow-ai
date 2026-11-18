import { z } from 'zod';

// ADR-025: a requirement is met when every criterion of its use cases passed.
export const REQUIREMENT_ACCEPTANCE_STATUSES = [
  'PASSED',
  'FAILED',
  'NOT_RUN',
  'NO_CRITERIA',
] as const;
export type RequirementAcceptanceStatus = (typeof REQUIREMENT_ACCEPTANCE_STATUSES)[number];

export const acceptanceReportResponseSchema = z.object({
  generationRunId: z.uuid(),
  // The validation the results come from; null before the acceptance tests ran.
  sandboxRunId: z.uuid().nullable(),
  criteria: z.array(
    z.object({
      key: z.string(),
      useCaseCode: z.string(),
      useCaseName: z.string(),
      given: z.string(),
      when: z.string(),
      then: z.string(),
      alternativeFlows: z.array(z.string()),
      requirementCodes: z.array(z.string()),
      role: z.string(),
      screens: z.array(z.object({ path: z.string(), screenName: z.string() })),
      result: z.object({ passed: z.boolean(), message: z.string().nullable() }).nullable(),
    }),
  ),
  requirements: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      status: z.enum(REQUIREMENT_ACCEPTANCE_STATUSES),
    }),
  ),
});
export type AcceptanceReportResponse = z.infer<typeof acceptanceReportResponseSchema>;
