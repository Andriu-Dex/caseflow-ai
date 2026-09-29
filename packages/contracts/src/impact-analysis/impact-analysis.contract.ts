import { z } from 'zod';

export const impactAnalysisResponseSchema = z.object({
  directlyAffected: z.array(z.string().uuid()),
  transitivelyAffected: z.array(z.string().uuid()),
  recommendedReviewOrder: z.array(z.string().uuid()),
});

export type ImpactAnalysisResponse = z.infer<typeof impactAnalysisResponseSchema>;
