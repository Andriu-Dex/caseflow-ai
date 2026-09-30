import { z } from 'zod';

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PROJECT_ROLES = ['OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
  }),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const inviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']), // Will be reused for both but typically scoped by endpoint
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
