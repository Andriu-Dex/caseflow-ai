import { z } from 'zod';

// Sandbox validation, bounded auto-repair and generated-project snapshots
// (spec §172-§177). READY only when every P0 stage passed.

export const SANDBOX_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'READY',
  'FAILED',
  'VALIDATION_FAILED',
  'ERROR',
] as const;
export type SandboxRunStatus = (typeof SANDBOX_RUN_STATUSES)[number];

export const SANDBOX_VALIDATION_STAGES = [
  'INSTALL',
  'LINT',
  'TYPECHECK',
  'TEST',
  'BUILD',
  'STRUCTURE',
  'TRACEABILITY',
] as const;
export type SandboxValidationStage = (typeof SANDBOX_VALIDATION_STAGES)[number];

export const AUTO_REPAIR_STATUSES = ['PATCHED', 'NO_PATCH', 'REJECTED'] as const;

export const sandboxRunResponseSchema = z.object({
  id: z.uuid(),
  generationRunId: z.uuid(),
  attemptNumber: z.number().int(),
  status: z.enum(SANDBOX_RUN_STATUSES),
  currentStage: z.enum(SANDBOX_VALIDATION_STAGES).nullable(),
  failedStage: z.enum(SANDBOX_VALIDATION_STAGES).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  stages: z.array(
    z.object({
      stage: z.enum(SANDBOX_VALIDATION_STAGES),
      passed: z.boolean(),
      exitCode: z.number().int().nullable(),
      timedOut: z.boolean(),
      durationMs: z.number().int(),
      output: z.string(),
    }),
  ),
  repair: z
    .object({
      roundNumber: z.number().int(),
      status: z.enum(AUTO_REPAIR_STATUSES),
      explanation: z.string(),
      patchedPaths: z.array(z.string()),
      findings: z.array(z.string()),
    })
    .nullable(),
  snapshotId: z.uuid().nullable(),
});
export type SandboxRunResponse = z.infer<typeof sandboxRunResponseSchema>;
export const sandboxRunListResponseSchema = z.object({
  items: z.array(sandboxRunResponseSchema),
});

export const generatedProjectSnapshotResponseSchema = z.object({
  id: z.uuid(),
  generationRunId: z.uuid(),
  sandboxRunId: z.uuid(),
  targetTemplateIdentifier: z.string(),
  targetTemplateVersion: z.number().int(),
  generationPlanVersionId: z.uuid().nullable(),
  designBaselineId: z.uuid(),
  implementationPlanVersionId: z.uuid(),
  fileCount: z.number().int(),
  manifestHash: z.string(),
  archiveSha256: z.string(),
  archiveSize: z.number().int(),
  createdByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type GeneratedProjectSnapshotResponse = z.infer<
  typeof generatedProjectSnapshotResponseSchema
>;
export const generatedProjectSnapshotListResponseSchema = z.object({
  items: z.array(generatedProjectSnapshotResponseSchema),
});
