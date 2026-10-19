import { PlanGenerationError } from '../naming';
import { apiClientFiles } from './api-client.templates';
import { backendFiles, type EndpointImplementations } from './backend.templates';
import { contractsFiles } from './contracts.templates';
import { frontendFiles } from './frontend.templates';
import { rootFiles } from './root.templates';
import type { GeneratedProjectFile, GenerationContext } from './types';

// Deterministic Implementation Plan -> complete CASEFLOW_WEB_TS_V1 project
// (spec §153 layout). Same plan and inputs always yield the same files, so a
// regeneration is reproducible and diffable. The only non-template input is
// `implementations`: AI-assisted bodies for custom business endpoints, which
// the caller validates before passing them in.
export function generateProject(
  ctx: GenerationContext,
  implementations: EndpointImplementations = {},
): GeneratedProjectFile[] {
  const files = [
    ...rootFiles(ctx),
    ...contractsFiles(ctx),
    ...apiClientFiles(ctx),
    ...backendFiles(ctx, implementations),
    ...frontendFiles(ctx),
  ];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path))
      throw new PlanGenerationError(`El plan genera dos archivos en la misma ruta: ${f.path}.`);
    seen.add(f.path);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// "Tienda Demo 2" -> "tienda-demo-2" (npm package name for the workspace).
export function projectSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'generated-app';
}
