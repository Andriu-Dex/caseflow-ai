import { z } from 'zod';

export const RETRIEVAL_STRATEGIES = [
  'NONE',
  'ARTIFACT_ONLY',
  'SOURCE_ONLY',
  'HYBRID',
  'FULL_PROJECT',
] as const;

export const retrievalStrategySchema = z.enum(RETRIEVAL_STRATEGIES);

export type RetrievalStrategy = z.infer<typeof retrievalStrategySchema>;
