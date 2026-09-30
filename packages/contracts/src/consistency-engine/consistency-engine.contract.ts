import { z } from 'zod';

export const consistencyIssueSeveritySchema = z.enum(['ERROR', 'WARNING', 'OBSERVATION']);
export type ConsistencyIssueSeverity = z.infer<typeof consistencyIssueSeveritySchema>;

export const consistencyIssueSchema = z.object({
  rule: z.string(),
  severity: consistencyIssueSeveritySchema,
  message: z.string(),
  affectedArtifactIds: z.array(z.string().uuid()),
});
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;

export const consistencyReportResponseSchema = z.object({
  standard: z.string(),
  totalArtifacts: z.number().int().nonnegative(),
  issues: z.array(consistencyIssueSchema),
});
export type ConsistencyReportResponse = z.infer<typeof consistencyReportResponseSchema>;
