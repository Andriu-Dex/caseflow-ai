import { demoDataFiles } from './demo-data.templates';
import { localAuthFiles } from './local-auth.templates';
import { PlanGenerationError } from '../naming';
import { apiClientFiles } from './api-client.templates';
import { backendFiles, type EndpointImplementations } from './backend.templates';
import { contractsFiles } from './contracts.templates';
import { dockerFiles } from './docker.templates';
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
  for (const entity of ctx.plan.entities) {
    if (
      entity.fields.some((field) => field.name === 'versionLabel') &&
      entity.operations.some((operation) => ['CREATE', 'UPDATE', 'DELETE'].includes(operation)) &&
      !entity.lifecycle
    ) {
      throw new PlanGenerationError(
        `La entidad versionada «${entity.name}» necesita un ciclo de vida explícito en una nueva versión del plan.`,
      );
    }
    if (
      (entity.lifecycle || entity.compositionOwnerRelation) &&
      ctx.plan.authentication.local?.userEntityLocalId === entity.localId
    ) {
      throw new PlanGenerationError(
        'El ciclo de vida de identidad debe implementarse mediante sus operaciones de dominio.',
      );
    }
  }
  for (const route of ctx.plan.routes) {
    if (
      route.path.endsWith('/publish') &&
      route.actions.some(
        (action) => action.operation && ['CREATE', 'UPDATE', 'DELETE'].includes(action.operation),
      )
    ) {
      throw new PlanGenerationError(
        `La publicación «${route.path}» requiere un endpoint de dominio explícito; no puede implementarse mediante CRUD.`,
      );
    }
  }
  const files = [
    ...rootFiles(ctx),
    ...dockerFiles(ctx),
    ...contractsFiles(ctx),
    ...apiClientFiles(ctx),
    ...backendFiles(ctx, implementations),
    ...frontendFiles(ctx),
    ...demoDataFiles(ctx),
  ];
  for (const adapted of localAuthFiles(ctx)) {
    const existing = files.findIndex((item) => item.path === adapted.path);
    if (existing >= 0) files[existing] = adapted;
    else files.push(adapted);
  }
  if (ctx.plan.authentication.local) {
    for (let index = files.length - 1; index >= 0; index--)
      if (files[index]!.path.startsWith('apps/api/src/auth/dev-')) files.splice(index, 1);
  }
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
