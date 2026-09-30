// Generated-project target templates (spec §151-155, DEC-085/DEC-093/DEC-100).
//
// Templates are versioned constants in code rather than editable rows: V1 ships
// exactly one template that no user can change, so git is the single source of
// truth and every environment has the same definition. A version is immutable
// once released — a change to the stack, catalog or commands is a new entry in
// TARGET_TEMPLATES with a higher `version`, never an edit of an existing one.
// Only project-scoped human exceptions to a catalog (DependencyProposal) live
// in the database.

export const DEPENDENCY_LAYERS = ['FRONTEND', 'BACKEND', 'SHARED'] as const;
export type DependencyLayer = (typeof DEPENDENCY_LAYERS)[number];

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
export type DependencyCategory = (typeof DEPENDENCY_CATEGORIES)[number];

export const VALIDATION_STAGES = ['INSTALL', 'LINT', 'TYPECHECK', 'TEST', 'BUILD'] as const;
export type ValidationStage = (typeof VALIDATION_STAGES)[number];

export interface CatalogDependency {
  readonly name: string;
  // Exact version: generated manifests pin it, so a sandbox run is reproducible.
  readonly version: string;
  readonly category: DependencyCategory;
  readonly layer: DependencyLayer;
  readonly dev: boolean;
}

// argv, never a shell string: the sandbox runs these verbatim without a shell,
// which keeps its command allowlist exact (AGENTS.md §26).
export interface ValidationCommand {
  readonly stage: ValidationStage;
  readonly argv: readonly string[];
}

export interface DesignSystemProfile {
  readonly identifier: string;
  readonly version: number;
  readonly uiLibrary: string;
  readonly styling: string;
  readonly icons: string;
  readonly forms: string;
  readonly serverState: string;
  readonly navigation: string;
  readonly tables: string;
  readonly dialogs: string;
  readonly feedback: string;
}

// Package-manager settings the generated workspace needs to install with the
// same toolchain CASEFlow AI is verified on.
export interface ToolchainSettings {
  readonly node: string;
  readonly packageManager: string;
  // Install scripts: true = may run (engines, native binaries); false = explicitly
  // skipped (e.g. telemetry). pnpm fails on any dependency left undecided.
  readonly allowBuilds: Readonly<Record<string, boolean>>;
  // Pinned releases newer than pnpm's minimum release age.
  readonly minimumReleaseAgeExclude: readonly string[];
}

export interface TargetTemplateVersion {
  readonly identifier: string;
  readonly version: number;
  readonly name: string;
  readonly language: string;
  readonly architecture: string;
  readonly apiStyle: string;
  readonly frontend: string;
  readonly backend: string;
  readonly persistence: string;
  readonly workspace: string;
  readonly designSystemProfile: DesignSystemProfile;
  readonly dependencies: readonly CatalogDependency[];
  readonly validationCommands: readonly ValidationCommand[];
  readonly toolchain: ToolchainSettings;
}

export const CASEFLOW_STANDARD_WEB_V1: DesignSystemProfile = Object.freeze({
  identifier: 'CASEFLOW_STANDARD_WEB_V1',
  version: 1,
  uiLibrary: 'shadcn/ui (Radix primitives)',
  styling: 'Tailwind CSS',
  icons: 'Lucide',
  forms: 'React Hook Form + Zod',
  serverState: 'TanStack Query',
  navigation: 'Responsive sidebar layout with a top bar; collapses to a drawer on mobile',
  tables: 'Reusable data table with sorting, empty and loading states',
  dialogs: 'Accessible modal dialogs for create/edit/confirm',
  feedback: 'Toast notifications for success/error; inline field validation messages',
});

const dep = (
  name: string,
  version: string,
  category: DependencyCategory,
  layer: DependencyLayer,
  dev = false,
): CatalogDependency => Object.freeze({ name, version, category, layer, dev });

// Versions match the ones CASEFlow AI itself runs on, so the combination is
// known to install and build together.
const CASEFLOW_WEB_TS_V1_DEPENDENCIES: readonly CatalogDependency[] = Object.freeze([
  dep('typescript', '5.9.3', 'TOOLING', 'SHARED', true),
  dep('@types/node', '24.13.4', 'TOOLING', 'SHARED', true),
  dep('eslint', '10.10.0', 'TOOLING', 'SHARED', true),
  dep('@eslint/js', '10.0.1', 'TOOLING', 'SHARED', true),
  dep('typescript-eslint', '8.70.0', 'TOOLING', 'SHARED', true),
  dep('prettier', '3.9.6', 'TOOLING', 'SHARED', true),
  dep('vitest', '5.0.1', 'TESTING', 'SHARED', true),
  dep('zod', '4.6.5', 'VALIDATION', 'SHARED'),

  dep('next', '16.3.5', 'FRAMEWORK', 'FRONTEND'),
  dep('react', '19.3.0', 'FRAMEWORK', 'FRONTEND'),
  dep('react-dom', '19.3.0', 'FRAMEWORK', 'FRONTEND'),
  dep('@types/react', '19.3.0', 'TOOLING', 'FRONTEND', true),
  dep('@types/react-dom', '19.3.0', 'TOOLING', 'FRONTEND', true),
  dep('tailwindcss', '4.3.3', 'UI', 'FRONTEND', true),
  dep('@tailwindcss/postcss', '4.3.3', 'UI', 'FRONTEND', true),
  dep('radix-ui', '1.6.7', 'UI', 'FRONTEND'),
  dep('class-variance-authority', '0.7.1', 'UI', 'FRONTEND'),
  dep('clsx', '2.1.1', 'UI', 'FRONTEND'),
  dep('tailwind-merge', '3.7.0', 'UI', 'FRONTEND'),
  dep('lucide-react', '0.545.0', 'UI', 'FRONTEND'),
  dep('sonner', '2.0.8', 'UI', 'FRONTEND'),
  dep('react-hook-form', '7.89.0', 'FORMS', 'FRONTEND'),
  dep('@hookform/resolvers', '5.9.1', 'FORMS', 'FRONTEND'),
  dep('@tanstack/react-query', '5.62.7', 'SERVER_STATE', 'FRONTEND'),
  dep('@testing-library/react', '16.1.0', 'TESTING', 'FRONTEND', true),
  dep('@testing-library/jest-dom', '6.6.3', 'TESTING', 'FRONTEND', true),
  dep('@vitejs/plugin-react', '4.3.4', 'TESTING', 'FRONTEND', true),
  dep('jsdom', '25.0.1', 'TESTING', 'FRONTEND', true),
  dep('@playwright/test', '1.55.0', 'TESTING', 'FRONTEND', true),

  dep('@nestjs/common', '11.2.3', 'FRAMEWORK', 'BACKEND'),
  dep('@nestjs/core', '11.2.3', 'FRAMEWORK', 'BACKEND'),
  dep('@nestjs/platform-express', '11.2.3', 'FRAMEWORK', 'BACKEND'),
  dep('@nestjs/swagger', '11.4.7', 'FRAMEWORK', 'BACKEND'),
  dep('reflect-metadata', '0.2.2', 'FRAMEWORK', 'BACKEND'),
  dep('rxjs', '7.8.2', 'FRAMEWORK', 'BACKEND'),
  dep('@prisma/client', '7.10.0', 'PERSISTENCE', 'BACKEND'),
  dep('@prisma/adapter-pg', '7.10.0', 'PERSISTENCE', 'BACKEND'),
  dep('prisma', '7.10.0', 'PERSISTENCE', 'BACKEND', true),
  dep('@nestjs/testing', '11.2.3', 'TESTING', 'BACKEND', true),
  dep('supertest', '7.2.2', 'TESTING', 'BACKEND', true),
  dep('@types/supertest', '7.2.1', 'TESTING', 'BACKEND', true),
  dep('@types/express', '5.0.6', 'TOOLING', 'BACKEND', true),
  dep('unplugin-swc', '1.6.0', 'TESTING', 'BACKEND', true),
  dep('@swc/core', '1.16.2', 'TESTING', 'BACKEND', true),
]);

export const CASEFLOW_WEB_TS_V1: TargetTemplateVersion = Object.freeze({
  identifier: 'CASEFLOW_WEB_TS_V1',
  version: 1,
  name: 'CASEFlow Web TypeScript',
  language: 'TypeScript',
  architecture: 'Modular monolith',
  apiStyle: 'REST + OpenAPI',
  frontend: 'Next.js + React',
  backend: 'NestJS',
  persistence: 'Prisma + PostgreSQL',
  workspace: 'pnpm workspaces',
  designSystemProfile: CASEFLOW_STANDARD_WEB_V1,
  dependencies: CASEFLOW_WEB_TS_V1_DEPENDENCIES,
  validationCommands: Object.freeze(
    (
      [
        ['INSTALL', ['pnpm', 'install']],
        ['LINT', ['pnpm', 'run', 'lint']],
        ['TYPECHECK', ['pnpm', 'run', 'typecheck']],
        ['TEST', ['pnpm', 'run', 'test']],
        ['BUILD', ['pnpm', 'run', 'build']],
      ] as const
    ).map(([stage, argv]) => Object.freeze({ stage, argv: Object.freeze([...argv]) })),
  ),
  toolchain: Object.freeze({
    node: '>=24 <25',
    packageManager: 'pnpm@11.27.0',
    allowBuilds: Object.freeze({
      '@prisma/engines': true,
      prisma: true,
      '@swc/core': true,
      esbuild: true,
      '@scarf/scarf': false,
    }),
    minimumReleaseAgeExclude: Object.freeze([
      '@vitest/mocker@5.0.1',
      '@vitest/spy@5.0.1',
      'vitest@5.0.1',
    ]),
  }),
});

export const TARGET_TEMPLATES: readonly TargetTemplateVersion[] = Object.freeze([
  CASEFLOW_WEB_TS_V1,
]);

// The latest version of a template, or a specific one when `version` is given.
export function findTargetTemplate(
  identifier: string,
  version?: number,
): TargetTemplateVersion | undefined {
  const versions = TARGET_TEMPLATES.filter((t) => t.identifier === identifier);
  if (version !== undefined) return versions.find((t) => t.version === version);
  return versions.reduce<TargetTemplateVersion | undefined>(
    (latest, t) => (!latest || t.version > latest.version ? t : latest),
    undefined,
  );
}

export function findCatalogDependency(
  template: TargetTemplateVersion,
  name: string,
): CatalogDependency | undefined {
  return template.dependencies.find((d) => d.name === name);
}
