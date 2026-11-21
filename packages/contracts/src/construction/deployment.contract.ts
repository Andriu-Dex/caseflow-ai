import { z } from 'zod';

// ADR-019: deployment of a READY snapshot (local Docker + Cloudflare Tunnel).
export const DEPLOYMENT_STATUSES = ['STARTING', 'RUNNING', 'STOPPED', 'FAILED', 'REMOVED'] as const;

const tunnelToken = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-.=]{20,4096}$/, 'El token del túnel no tiene un formato válido.')
  .optional();

// The address set for a named tunnel in the person's Cloudflare account, shown
// as the demonstration link; CASEFlow cannot read it from the token.
const tunnelUrl = z
  .url({ protocol: /^https$/, error: 'Indique una dirección que empiece por https://.' })
  .max(200)
  .optional();
const tunnelUrlNeedsToken = (
  value: { tunnelToken?: string; tunnelUrl?: string },
  ctx: z.RefinementCtx,
) => {
  if (value.tunnelUrl && !value.tunnelToken)
    ctx.addIssue({
      code: 'custom',
      path: ['tunnelUrl'],
      message: 'La dirección fija solo se usa con el token de un túnel propio.',
    });
};

export const startDeploymentRequestSchema = z
  .object({
    snapshotId: z.uuid(),
    initialPassword: z
      .string()
      .min(12, 'La contraseña inicial debe tener al menos 12 caracteres.')
      .max(128),
    tunnelToken,
    tunnelUrl,
  })
  .strict()
  .superRefine(tunnelUrlNeedsToken);
export type StartDeploymentRequest = z.output<typeof startDeploymentRequestSchema>;

export const resumeDeploymentRequestSchema = z
  .object({ tunnelToken, tunnelUrl })
  .strict()
  .superRefine(tunnelUrlNeedsToken);
export type ResumeDeploymentRequest = z.output<typeof resumeDeploymentRequestSchema>;

export const deploymentResponseSchema = z.object({
  id: z.uuid(),
  snapshotId: z.uuid(),
  status: z.enum(DEPLOYMENT_STATUSES),
  tunnelMode: z.enum(['QUICK', 'NAMED']),
  publicUrl: z.string().nullable(),
  // name: the person the account belongs to, when the project says it.
  accounts: z.array(
    z.object({ role: z.string(), identifier: z.string(), name: z.string().optional() }),
  ),
  errorMessage: z.string().nullable(),
  createdByUserId: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeploymentResponse = z.infer<typeof deploymentResponseSchema>;
export const deploymentListResponseSchema = z.object({ items: z.array(deploymentResponseSchema) });

// The containers a running demonstration needs, as Docker reports them now.
export const DEPLOYMENT_CONTAINER_ROLES = ['APPLICATION', 'DATABASE', 'TUNNEL'] as const;
export const DEPLOYMENT_CONTAINER_STATES = ['RUNNING', 'STOPPED', 'MISSING'] as const;
export const deploymentHealthResponseSchema = z.object({
  containers: z.array(
    z.object({
      role: z.enum(DEPLOYMENT_CONTAINER_ROLES),
      state: z.enum(DEPLOYMENT_CONTAINER_STATES),
    }),
  ),
  checkedAt: z.iso.datetime(),
});
export type DeploymentHealthResponse = z.infer<typeof deploymentHealthResponseSchema>;
