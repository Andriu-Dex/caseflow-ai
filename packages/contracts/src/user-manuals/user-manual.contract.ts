import { z } from 'zod';
import { ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

const stepSchema = z
  .object({
    instruction: z.string().trim().min(1).max(1000),
    expectedResult: z.string().trim().min(1).max(1000),
  })
  .strict();
export const editUserManualSchema = z
  .object({
    expectedVersionId: z.uuid(),
    introduction: z.string().trim().min(1).max(2000),
    tasks: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().trim().min(1).max(200),
            verified: z.boolean(),
            steps: z.array(stepSchema).min(1).max(24),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type EditUserManualRequest = z.infer<typeof editUserManualSchema>;
export const userManualResponseSchema = z.object({
  title: z.string().optional(),
  id: z.uuid(),
  code: z.string(),
  snapshotId: z.uuid(),
  isCurrent: z.boolean(),
  introduction: z.string(),
  version: z.object({
    id: z.uuid(),
    versionNumber: z.number().int(),
    status: z.enum(ARTIFACT_VERSION_STATUSES),
  }),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      routePath: z.string(),
      generatedFileId: z.uuid(),
      roles: z.array(z.string()),
      verified: z.boolean(),
      captures: z
        .array(
          z.object({
            id: z.uuid(),
            bundleId: z.uuid(),
            role: z.string(),
            status: z.enum(['CAPTURED', 'FAILED', 'SKIPPED']),
            reason: z.string().nullable(),
            sha256: z.string().nullable(),
            width: z.number().int().nullable(),
            height: z.number().int().nullable(),
            profile: z.literal('EMPTY_DATABASE_DESKTOP_V1'),
          }),
        )
        .optional(),
      steps: z.array(stepSchema),
    }),
  ),
  history: z.array(
    z.object({
      id: z.uuid(),
      versionNumber: z.number().int(),
      status: z.enum(ARTIFACT_VERSION_STATUSES),
    }),
  ),
});
export type UserManualResponse = z.infer<typeof userManualResponseSchema>;
export const userManualJobSchema = z.object({
  captureRequested: z.boolean().optional(),
  id: z.uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED']),
  errorMessage: z.string().nullable(),
});
export const userManualStateSchema = z.object({
  job: userManualJobSchema.nullable(),
  manual: userManualResponseSchema.nullable(),
});
export type UserManualState = z.infer<typeof userManualStateSchema>;
