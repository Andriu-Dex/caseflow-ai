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
  id: z.uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  errorMessage: z.string().nullable(),
});
export const userManualStateSchema = z.object({
  job: userManualJobSchema.nullable(),
  manual: userManualResponseSchema.nullable(),
});
export type UserManualState = z.infer<typeof userManualStateSchema>;
