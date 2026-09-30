import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { findCatalogDependency, type TargetTemplateVersion } from '@caseflow-ai/domain';
import { PlanGenerationError } from '../naming';

export type FileOrigin = 'TEMPLATE' | 'DETERMINISTIC' | 'AI_ASSISTED';
export type FileKind = 'SOURCE' | 'TEST' | 'CONFIG' | 'DOCUMENTATION';

// One file of the generated project. `planElements` names what in the
// Implementation Plan the file implements (e.g. "entity:order",
// "route:/orders") — the basis of construction traceability (DEC-106).
export interface GeneratedProjectFile {
  path: string;
  content: string;
  origin: FileOrigin;
  kind: FileKind;
  planElements: string[];
}

export interface GenerationContext {
  plan: ImplementationPlanContent;
  template: TargetTemplateVersion;
  projectName: string;
  // npm-safe workspace name, e.g. "tienda-demo".
  slug: string;
}

// Workspace package scope; internal packages are @app/contracts and @app/api-client.
export const SCOPE = '@app';

// Every dependency a generated manifest declares must come from the
// template's Approved Dependency Catalog (DEC-100); this is the only way the
// templates read a version, so an unapproved package cannot slip in.
export function catalogVersion(template: TargetTemplateVersion, name: string): string {
  const dependency = findCatalogDependency(template, name);
  if (!dependency)
    throw new PlanGenerationError(
      `La plantilla ${template.identifier} no aprueba el paquete «${name}».`,
    );
  return dependency.version;
}

export function dependencies(
  template: TargetTemplateVersion,
  names: string[],
  workspace: string[] = [],
): Record<string, string> {
  const entries: [string, string][] = [
    ...workspace.map((name): [string, string] => [name, 'workspace:*']),
    ...names.map((name): [string, string] => [name, catalogVersion(template, name)]),
  ];
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function file(
  path: string,
  content: string,
  options: { origin?: FileOrigin; kind?: FileKind; planElements?: string[] } = {},
): GeneratedProjectFile {
  return {
    path,
    content: content.endsWith('\n') ? content : `${content}\n`,
    origin: options.origin ?? 'TEMPLATE',
    kind: options.kind ?? 'SOURCE',
    planElements: options.planElements ?? [],
  };
}
