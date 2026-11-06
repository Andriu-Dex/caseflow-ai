import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import ts from 'typescript';
import type { TargetTemplateVersion } from '@caseflow-ai/domain';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { actionMarker, pagePath } from '../code-generation/engine/frontend.templates';
import { hasOnlyThrowingPaths } from './business-flow';

// Deterministic checks and packaging of a generated project (spec §175, §177).
// Pure functions: no I/O, so every rule is unit-testable.

export interface ProjectFile {
  path: string;
  content: string;
  kind: 'SOURCE' | 'TEST' | 'CONFIG' | 'DOCUMENTATION';
}

export const sha256 = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex');

// Later rounds win: each patch replaces the whole file it targets.
export function applyPatches(
  files: readonly ProjectFile[],
  patches: readonly { path: string; content: string }[],
): ProjectFile[] {
  const patched = new Map(patches.map((p) => [p.path, p.content]));
  return files.map((f) => (patched.has(f.path) ? { ...f, content: patched.get(f.path)! } : f));
}

const WORKSPACE_SCOPE = '@app/';

// Template layout, pinned toolchain and dependency compliance (DEC-100): every
// manifest entry is a workspace package or an allowed package at its exact version.
export function structuralProblems(
  files: readonly ProjectFile[],
  template: TargetTemplateVersion,
  allowed: readonly { name: string; version: string }[],
  plan?: ImplementationPlanContent,
): string[] {
  const problems: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const path of template.requiredPaths)
    if (!byPath.has(path)) problems.push(`Falta el archivo obligatorio «${path}».`);
  const versions = new Map(allowed.map((d) => [d.name, d.version]));
  for (const file of files) {
    if (file.path !== 'package.json' && !file.path.endsWith('/package.json')) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(file.content) as Record<string, unknown>;
    } catch {
      problems.push(`«${file.path}» no es JSON válido.`);
      continue;
    }
    if (
      file.path === 'package.json' &&
      manifest.packageManager !== template.toolchain.packageManager
    )
      problems.push(`«package.json» debe fijar ${template.toolchain.packageManager}.`);
    for (const field of ['dependencies', 'devDependencies'] as const)
      for (const [name, version] of Object.entries(
        (manifest[field] ?? {}) as Record<string, string>,
      )) {
        if (name.startsWith(WORKSPACE_SCOPE) && version === 'workspace:*') continue;
        if (versions.get(name) !== version)
          problems.push(`«${file.path}» usa «${name}@${version}», fuera del catálogo aprobado.`);
      }
  }
  if (template.version >= 2) {
    const manifest = byPath.get('docs/design-fidelity.json');
    if (!manifest) problems.push('Falta el manifiesto de fidelidad del diseño aprobado.');
    else {
      try {
        const value = JSON.parse(manifest.content) as {
          records?: { routePath: string; outputSha256: string }[];
          schemaVersion?: number;
          scope?: string;
          baselineId?: string;
          assets?: { path: string; sha256: string }[];
        };
        if (
          value.schemaVersion !== 1 ||
          value.scope !== 'STRUCTURAL_PRESENTATION' ||
          !Array.isArray(value.records) ||
          !Array.isArray(value.assets)
        )
          throw new Error('Invalid manifest.');
        const expectedAssets = files.filter(
          (item) =>
            item.path === 'apps/web/app/layout.tsx' ||
            item.path === 'apps/web/app/globals.css' ||
            item.path.startsWith('apps/web/components/'),
        );
        if (
          value.assets.length !== expectedAssets.length ||
          expectedAssets.some(
            (item) => value.assets!.filter((asset) => asset.path === item.path).length !== 1,
          )
        )
          problems.push(
            'El manifiesto no cubre exactamente los componentes compartidos de la presentación.',
          );
        if (
          plan &&
          (value.baselineId !== plan.designBaselineId ||
            value.records.length !== plan.routes.length ||
            plan.routes.some(
              (route) =>
                value.records!.filter((record) => record.routePath === route.path).length !== 1,
            ))
        )
          problems.push(
            'El manifiesto no cubre exactamente las rutas y el diseño aprobado del plan.',
          );
        for (const asset of value.assets) {
          const source = byPath.get(asset.path);
          if (!source || sha256(source.content) !== asset.sha256)
            problems.push(
              `La presentación compartida «${asset.path}» cambió después de registrar el diseño.`,
            );
        }
        for (const record of value.records) {
          const page = byPath.get(pagePath(record.routePath));
          if (!page || sha256(page.content) !== record.outputSha256)
            problems.push(
              `La composición de ${record.routePath} no coincide con la registrada; revise los cambios antes de entregar.`,
            );
        }
      } catch {
        problems.push('El manifiesto de fidelidad del diseño no es válido.');
      }
    }
    // A successful compile cannot turn an explicit unimplemented business
    // action into a functional delivery, including after automatic repair.
    for (const file of files.filter(
      (item) => item.kind === 'SOURCE' && item.path.startsWith('apps/api/'),
    )) {
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (
          file.path.endsWith('-actions.service.ts') &&
          ts.isMethodDeclaration(node) &&
          node.body &&
          hasOnlyThrowingPaths(node.body.statements)
        )
          problems.push(
            `«${file.path}» contiene una acción que rechaza todos los casos sin implementar su flujo.`,
          );
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'NotImplementedException'
        )
          problems.push(`«${file.path}» contiene una acción de negocio sin implementar.`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return problems;
}

// Plan coverage (DEC-121): every planned entity has its Prisma model, every
// route its page and every screen action its control, also after auto-repair.
export function planCoverageProblems(
  files: readonly ProjectFile[],
  plan: Pick<ImplementationPlanContent, 'entities' | 'routes'>,
): string[] {
  const problems: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const schema = byPath.get('prisma/schema.prisma') ?? '';
  for (const entity of plan.entities)
    if (!new RegExp(`^model ${entity.name} \\{`, 'm').test(schema))
      problems.push(
        `La entidad «${entity.name}» del plan no tiene su modelo en el esquema de Prisma.`,
      );
  for (const route of plan.routes) {
    const page = byPath.get(pagePath(route.path));
    if (page === undefined) {
      problems.push(`La ruta ${route.path} del plan no tiene su página.`);
      continue;
    }
    for (const action of route.actions)
      if (!page.includes(actionMarker(action.label)))
        problems.push(
          `La acción «${action.label}» de la ruta ${route.path} no tiene un control en su página.`,
        );
  }
  return problems;
}

// Construction traceability (DEC-106): every source and test file must be
// linked to the approved artifacts it implements.
export function traceabilityProblems(
  files: readonly ProjectFile[],
  linkedPaths: ReadonlySet<string>,
): string[] {
  return files
    .filter((f) => (f.kind === 'SOURCE' || f.kind === 'TEST') && !linkedPaths.has(f.path))
    .map((f) => `«${f.path}» no tiene trazabilidad a un artefacto aprobado.`);
}

export const manifestHash = (files: readonly { path: string; content: string }[]) =>
  sha256(
    [...files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `${f.path} ${sha256(f.content)}\n`)
      .join(''),
  );

// Fixed timestamps: the same files always produce the same bytes.
const ZIP_DATE = new Date('2000-01-01T00:00:00Z');

export async function buildArchive(
  rootFolder: string,
  files: readonly { path: string; content: string }[],
): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path)))
    // Implicit folder entries would carry the current time.
    zip.file(`${rootFolder}/${file.path}`, file.content, { date: ZIP_DATE, createFolders: false });
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
  });
}

const IMPORT_SPECIFIER =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export const importSpecifiers = (content: string) =>
  new Set([...content.matchAll(IMPORT_SPECIFIER)].map((m) => (m[1] ?? m[2] ?? m[3])!));

const FORBIDDEN_IN_REPAIR = [
  { pattern: /\bchild_process\b/, reason: 'ejecuta procesos' },
  { pattern: /\beval\s*\(|\bnew\s+Function\s*\(/, reason: 'evalúa código dinámico' },
  { pattern: /\$queryRawUnsafe|\$executeRawUnsafe/, reason: 'usa SQL crudo sin parámetros' },
];

// A repair may only rewrite source files named in the diagnosis, and may not
// bring in any module the project does not already use: no new dependencies,
// no weakened tests, no configuration changes (AGENTS.md §27).
export function reviewRepairPatch(
  patch: { path: string; content: string },
  candidates: ReadonlyMap<string, ProjectFile>,
  knownImports: ReadonlySet<string>,
): string | null {
  const original = candidates.get(patch.path);
  if (!original || original.kind !== 'SOURCE')
    return `«${patch.path}» no es un archivo fuente del diagnóstico`;
  if (!patch.content.trim()) return `«${patch.path}» quedaría vacío`;
  const added = [...importSpecifiers(patch.content)].filter((s) => !knownImports.has(s));
  if (added.length) return `«${patch.path}» introduce módulos nuevos (${added.join(', ')})`;
  const forbidden = FORBIDDEN_IN_REPAIR.find(({ pattern }) => pattern.test(patch.content));
  return forbidden ? `«${patch.path}» ${forbidden.reason}` : null;
}

// Source files the failure output points at (tools print paths relative to
// the workspace or to the app/package directory).
export function diagnosedFiles(
  files: readonly ProjectFile[],
  output: string,
  limit = 5,
): ProjectFile[] {
  return files
    .filter((f) => f.kind === 'SOURCE')
    .filter((f) => {
      const segments = f.path.split('/');
      return (
        output.includes(f.path) ||
        (segments.length > 3 && output.includes(segments.slice(2).join('/')))
      );
    })
    .slice(0, limit);
}

const FIRST_RUN_OWN_SECRET = /(^|_)(SECRET|PASSWORD|SALT)($|_)/;

// First-run contract of the exported project (ADR-012): what `pnpm run setup` and the
// README promise must hold in the files themselves. Static on purpose: the sandbox does
// not run Docker, so these checks catch configuration drift, not a live database.
export function firstRunProblems(files: readonly ProjectFile[]): string[] {
  const problems: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const need = (path: string) => {
    const content = byPath.get(path);
    if (content === undefined) problems.push(`Primera ejecución: falta «${path}».`);
    return content;
  };

  let scripts: Record<string, string>;
  try {
    scripts = (JSON.parse(need('package.json') ?? '{}').scripts ?? {}) as Record<string, string>;
  } catch {
    return problems; // reported by structuralProblems
  }
  if (!scripts.setup)
    problems.push('Primera ejecución: «package.json» no define el script «setup».');
  need('scripts/setup.mjs');
  need('docker/Dockerfile');
  need('docker/docker-compose.app.yml');

  const env = new Map<string, string>();
  for (const line of (need('.env.example') ?? '').split(/\r?\n/)) {
    const [, name, value] = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line) ?? [];
    if (!name || value === undefined) continue;
    env.set(name, value);
    if (value === '')
      problems.push(`Primera ejecución: «.env.example» deja vacía la variable ${name}.`);
    else if (FIRST_RUN_OWN_SECRET.test(name) && !value.startsWith('dev-only-'))
      problems.push(`Primera ejecución: ${name} debe ser un valor de ejemplo «dev-only-…».`);
  }
  if (env.get('DEV_LOGIN') === 'true')
    problems.push('Primera ejecución: «.env.example» no puede activar DEV_LOGIN por defecto.');
  const port = env.get('POSTGRES_PORT');
  if (!port) problems.push('Primera ejecución: «.env.example» no define POSTGRES_PORT.');
  const url = env.get('DATABASE_URL');
  if (url && (!url.includes('@127.0.0.1:') || (port && !url.includes(`:${port}/`))))
    problems.push(
      'Primera ejecución: DATABASE_URL debe usar 127.0.0.1 y el puerto de POSTGRES_PORT.',
    );

  const compose = need('docker/docker-compose.yml');
  if (compose !== undefined) {
    if (!/^name: \S+/m.test(compose))
      problems.push('Primera ejecución: el compose no tiene nombre de proyecto.');
    if (!compose.includes('healthcheck:'))
      problems.push('Primera ejecución: el compose no define healthcheck.');
    if (!compose.includes('127.0.0.1:${POSTGRES_PORT'))
      problems.push('Primera ejecución: el compose debe publicar POSTGRES_PORT solo en 127.0.0.1.');
  }

  for (const [, script = ''] of (need('README.md') ?? '').matchAll(/pnpm run ([\w:-]+)/g))
    if (!scripts[script])
      problems.push(`Primera ejecución: el README usa «pnpm run ${script}», que no existe.`);
  return [...new Set(problems)];
}
