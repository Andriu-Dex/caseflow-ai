import { z } from 'zod';

// ADR-019: deployment of a READY snapshot (local Docker + Cloudflare Tunnel).
export const DEPLOYMENT_STATUSES = ['STARTING', 'RUNNING', 'STOPPED', 'FAILED'] as const;

const tunnelToken = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-.=]{20,4096}$/, 'El token del túnel no tiene un formato válido.')
  .optional();

export const startDeploymentRequestSchema = z
  .object({
    snapshotId: z.uuid(),
    initialPassword: z
      .string()
      .min(12, 'La contraseña inicial debe tener al menos 12 caracteres.')
      .max(128),
    tunnelToken,
  })
  .strict();
export type StartDeploymentRequest = z.output<typeof startDeploymentRequestSchema>;

export const resumeDeploymentRequestSchema = z.object({ tunnelToken }).strict();
export type ResumeDeploymentRequest = z.output<typeof resumeDeploymentRequestSchema>;

export const deploymentResponseSchema = z.object({
  id: z.uuid(),
  snapshotId: z.uuid(),
  status: z.enum(DEPLOYMENT_STATUSES),
  tunnelMode: z.enum(['QUICK', 'NAMED']),
  publicUrl: z.string().nullable(),
  accounts: z.array(z.object({ role: z.string(), identifier: z.string() })),
  errorMessage: z.string().nullable(),
  createdByUserId: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeploymentResponse = z.infer<typeof deploymentResponseSchema>;
export const deploymentListResponseSchema = z.object({ items: z.array(deploymentResponseSchema) });
