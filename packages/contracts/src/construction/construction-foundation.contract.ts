import { z } from 'zod';

// Construction Foundation (spec §151-155). Mirrors the target-template model
// in @caseflow-ai/domain; this package stays dependency-free apart from zod.

export const DEPENDENCY_LAYERS = ['FRONTEND', 'BACKEND', 'SHARED'] as const;
export const DEPENDENCY_CATEGORIES = [
  'FRAMEWORK',
  'UI',
  'FORMS',
  'SERVER_STATE',
  'PERSISTENCE',
  'VALIDATION',
  'TESTING',
  'TOOLING',
] as const;
export const DEPENDENCY_PROPOSAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const DEPENDENCY_PROPOSAL_DECISIONS = ['APPROVED', 'REJECTED'] as const;

const catalogDependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  category: z.enum(DEPENDENCY_CATEGORIES),
  layer: z.enum(DEPENDENCY_LAYERS),
  dev: z.boolean(),
});

export const designSystemProfileResponseSchema = z.object({
  identifier: z.string(),
  version: z.number().int(),
  uiLibrary: z.string(),
  styling: z.string(),
  icons: z.string(),
  forms: z.string(),
  serverState: z.string(),
  navigation: z.string(),
  tables: z.string(),
  dialogs: z.string(),
  feedback: z.string(),
});
export type DesignSystemProfileResponse = z.infer<typeof designSystemProfileResponseSchema>;

export const targetTemplateResponseSchema = z.object({
  identifier: z.string(),
  version: z.number().int(),
  name: z.string(),
  language: z.string(),
  architecture: z.string(),
  apiStyle: z.string(),
  frontend: z.string(),
  backend: z.string(),
  persistence: z.string(),
  workspace: z.string(),
  designSystemProfile: designSystemProfileResponseSchema,
  dependencies: z.array(catalogDependencySchema),
  validationStages: z.array(z.string()),
});
export type TargetTemplateResponse = z.infer<typeof targetTemplateResponseSchema>;
export const targetTemplateListResponseSchema = z.object({
  items: z.array(targetTemplateResponseSchema),
});

// npm package name rules (lowercase, optional @scope/, url-safe characters).
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

export const createDependencyProposalRequestSchema = z
  .object({
    targetTemplateIdentifier: z.string().min(1).max(100),
    targetTemplateVersion: z.number().int().min(1),
    packageName: z
      .string()
      .trim()
      .max(214)
      .regex(NPM_PACKAGE_NAME, 'El nombre del paquete no es válido.'),
    version: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, 'Indique una versión exacta, por ejemplo 1.2.3.'),
    layer: z.enum(DEPENDENCY_LAYERS),
    dev: z.boolean().default(false),
    justification: z
      .string()
      .trim()
      .min(10, 'Explique por qué se necesita la dependencia.')
      .max(2000),
  })
  .strict();
export type CreateDependencyProposalRequest = z.output<
  typeof createDependencyProposalRequestSchema
>;

export const decideDependencyProposalRequestSchema = z
  .object({
    decision: z.enum(DEPENDENCY_PROPOSAL_DECISIONS),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type DecideDependencyProposalRequest = z.output<
  typeof decideDependencyProposalRequestSchema
>;

export const dependencyProposalResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  targetTemplateIdentifier: z.string(),
  targetTemplateVersion: z.number().int(),
  packageName: z.string(),
  version: z.string(),
  layer: z.enum(DEPENDENCY_LAYERS),
  dev: z.boolean(),
  justification: z.string(),
  status: z.enum(DEPENDENCY_PROPOSAL_STATUSES),
  requestedByUserId: z.uuid().nullable(),
  decidedByUserId: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type DependencyProposalResponse = z.infer<typeof dependencyProposalResponseSchema>;
export const dependencyProposalListResponseSchema = z.object({
  items: z.array(dependencyProposalResponseSchema),
});
