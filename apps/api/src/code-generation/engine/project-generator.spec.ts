import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CASEFLOW_WEB_TS_V1, findCatalogDependency } from '@caseflow-ai/domain';
import {
  implementationPlanContentSchema,
  type ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { generateProject, projectSlug } from './project-generator';
import { catalogVersion, type GenerationContext } from './types';

const basePlan = (overrides: Record<string, unknown> = {}): ImplementationPlanContent =>
  implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: true, roles: ['ADMIN', 'SELLER'] },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
    entities: [
      {
        localId: 'customer',
        name: 'Customer',
        moduleLocalId: 'sales',
        fields: [{ name: 'fullName', type: 'STRING' }],
        operations: ['LIST', 'CREATE'],
      },
      {
        localId: 'order',
        name: 'Order',
        moduleLocalId: 'sales',
        fields: [
          { name: 'status', type: 'ENUM', enumValues: ['DRAFT', 'CONFIRMED'] },
          { name: 'orderedOn', type: 'DATE' },
        ],
        relations: [
          {
            name: 'customer',
            kind: 'MANY_TO_ONE',
            targetEntityLocalId: 'customer',
            required: true,
          },
        ],
        operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
        writeRoles: ['SELLER'],
      },
    ],
    customEndpoints: [
      {
        moduleLocalId: 'sales',
        method: 'POST',
        path: '/orders/:orderId/confirm',
        summary: 'Confirmar pedido',
        entityLocalId: 'order',
        roles: ['SELLER'],
      },
    ],
    routes: [
      {
        path: '/orders',
        screenName: 'Pedidos',
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'order',
      },
      {
        path: '/orders/[orderId]',
        screenName: 'Pedido',
        moduleLocalId: 'sales',
        kind: 'DETAIL',
        entityLocalId: 'order',
      },
      {
        path: '/orders/new',
        screenName: 'Nuevo pedido',
        moduleLocalId: 'sales',
        kind: 'FORM',
        entityLocalId: 'order',
      },
    ],
    tests: [{ moduleLocalId: 'sales', kind: 'E2E', description: 'Crear pedido' }],
    ...overrides,
  });

const ctx = (plan = basePlan()): GenerationContext => ({
  plan,
  template: CASEFLOW_WEB_TS_V1,
  projectName: 'Tienda Demo',
  slug: 'tienda-demo',
});
const byPath = (files: ReturnType<typeof generateProject>) =>
  new Map(files.map((f) => [f.path, f]));

describe('generateProject', () => {
  const files = generateProject(ctx());
  const paths = byPath(files);

  it('lays out the CASEFLOW_WEB_TS_V1 monorepo (spec §153)', () => {
    for (const path of [
      'package.json',
      'pnpm-workspace.yaml',
      '.env.example',
      'README.md',
      'docker/docker-compose.yml',
      'scripts/setup.mjs',
      'prisma/schema.prisma',
      'packages/contracts/src/index.ts',
      'packages/api-client/src/index.ts',
      'packages/api-client/openapi.json',
      'apps/api/src/app.module.ts',
      'apps/api/src/sales/sales.module.ts',
      'apps/api/src/sales/order.controller.ts',
      'apps/api/src/sales/order.service.spec.ts',
      'apps/web/app/layout.tsx',
      'apps/web/app/orders/page.tsx',
      'apps/web/app/orders/[orderId]/page.tsx',
      'apps/web/app/orders/new/page.tsx',
    ])
      expect(paths.has(path), path).toBe(true);
  });

  // Regression: found by the real sandbox lint stage on a plan without routes.
  it('emits a home page without unused imports when the plan has no routes', () => {
    const home = byPath(generateProject(ctx(basePlan({ routes: [] })), {})).get(
      'apps/web/app/page.tsx',
    )!;
    expect(home.content).not.toContain('next/link');
    expect(home.content).toContain('aún no define pantallas');
  });

  // Regression: found by following the exported README on a fresh copy.
  it('builds internal packages before dev and names the first migration', () => {
    const root = JSON.parse(paths.get('package.json')!.content);
    expect(root.scripts.dev).toMatch(/^pnpm run build:packages && /);
    const api = JSON.parse(paths.get('apps/api/package.json')!.content);
    expect(api.scripts['db:migrate']).toBe('prisma migrate dev --name init');
  });

  it('is deterministic and never emits two files at the same path', () => {
    expect(generateProject(ctx())).toEqual(files);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
  });

  it('declares only catalog dependencies, pinned to their exact catalog version (DEC-100)', () => {
    const manifests = files.filter((f) => f.path.endsWith('package.json'));
    expect(manifests.length).toBe(5);
    for (const manifest of manifests) {
      const pkg = JSON.parse(manifest.content) as Record<string, Record<string, string>>;
      for (const deps of [pkg.dependencies ?? {}, pkg.devDependencies ?? {}])
        for (const [name, version] of Object.entries(deps)) {
          if (version === 'workspace:*') {
            expect(name.startsWith('@app/'), name).toBe(true);
            continue;
          }
          expect(findCatalogDependency(CASEFLOW_WEB_TS_V1, name), name).toBeDefined();
          expect(version).toBe(catalogVersion(CASEFLOW_WEB_TS_V1, name));
        }
    }
  });

  it('writes the toolchain settings pnpm needs to install non-interactively', () => {
    const workspace = paths.get('pnpm-workspace.yaml')!.content;
    expect(workspace).toContain("'@prisma/engines': true");
    expect(workspace).toContain("'@scarf/scarf': false");
    expect(JSON.parse(paths.get('package.json')!.content).packageManager).toBe('pnpm@11.27.0');
  });

  it('exposes only the CRUD operations the plan approved, guarded by the planned roles', () => {
    const customer = paths.get('apps/api/src/sales/customer.controller.ts')!.content;
    expect(customer).toContain('@Get()');
    expect(customer).toContain('@Post()');
    expect(customer).not.toContain('@Delete');
    expect(customer).not.toContain('@Patch');
    const order = paths.get('apps/api/src/sales/order.controller.ts')!.content;
    expect(order).toContain("@Roles('SELLER')");
    expect(paths.get('apps/api/src/app.module.ts')!.content).toContain('APP_GUARD');
  });

  it('answers 501 for business actions without generated logic instead of faking success', () => {
    const service = paths.get('apps/api/src/sales/sales-actions.service.ts')!;
    expect(service.origin).toBe('DETERMINISTIC');
    expect(service.content).toContain('NotImplementedException');
  });

  it('uses provided business logic and marks that file as AI-assisted', () => {
    const withLogic = byPath(
      generateProject(ctx(), {
        'POST /orders/:orderId/confirm':
          "return this.prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });",
      }),
    );
    const service = withLogic.get('apps/api/src/sales/sales-actions.service.ts')!;
    expect(service.origin).toBe('AI_ASSISTED');
    expect(service.content).toContain("data: { status: 'CONFIRMED' }");
    expect(service.content).not.toContain('NotImplementedException');
    // orderId is used; the request body is not, so it is marked as used for the lint.
    expect(service.content).toContain('void [body];');
    expect(service.content).not.toContain('void [orderId');
  });

  it('leaves out authentication entirely when the plan does not require it', () => {
    const open = byPath(
      generateProject(
        ctx(
          basePlan({
            authentication: { required: false, roles: [] },
            entities: basePlan().entities.map((e) => ({ ...e, writeRoles: [] })),
            customEndpoints: [],
          }),
        ),
      ),
    );
    expect([...open.keys()].some((p) => p.includes('/auth/'))).toBe(false);
    expect(open.get('apps/api/src/app.module.ts')!.content).not.toContain('APP_GUARD');
    expect(open.get('apps/web/app/access/page.tsx')).toBeUndefined();
  });

  it('traces generated files back to the plan elements they implement (DEC-106)', () => {
    expect(paths.get('apps/api/src/sales/order.controller.ts')!.planElements).toEqual([
      'module:sales',
      'entity:order',
    ]);
    expect(paths.get('apps/web/app/orders/new/page.tsx')!.planElements).toContain(
      'route:/orders/new',
    );
    expect(paths.get('apps/api/src/sales/order.service.spec.ts')!.kind).toBe('TEST');
  });

  // DEC-118: the frozen theme becomes Tailwind variables; BOTH adds a toggle.
  it('paints the frontend with the frozen theme and adds a toggle for BOTH', () => {
    const light = {
      background: '#ffffff',
      foreground: '#0f172a',
      primary: '#4338ca',
      primaryForeground: '#ffffff',
      secondary: '#e2e8f0',
      secondaryForeground: '#1e293b',
      accent: '#ccfbf1',
      accentForeground: '#134e4a',
      muted: '#f1f5f9',
      mutedForeground: '#475569',
      destructive: '#b91c1c',
      destructiveForeground: '#ffffff',
      border: '#cbd5e1',
    };
    const dark = { ...light, background: '#0f172a', foreground: '#f8fafc' };
    const themed = byPath(
      generateProject({
        ...ctx(),
        theme: { code: 'TEM-001', content: { name: 'Océano', mode: 'BOTH', light, dark } },
      }),
    );
    const css = themed.get('apps/web/app/globals.css')!;
    expect(css.content).toContain('--color-primary-foreground: #ffffff;');
    expect(css.content).toMatch(/\.dark \{\n {2}--color-background: #0f172a;/);
    expect(css.planElements).toEqual(['design-theme:TEM-001']);
    expect(themed.get('apps/web/components/theme-toggle.tsx')).toBeDefined();
    expect(themed.get('apps/web/components/theme-toggle.spec.tsx')!.kind).toBe('TEST');
    expect(themed.get('apps/web/app/layout.tsx')!.content).toContain('<ThemeToggle />');

    const lightOnly = byPath(
      generateProject({
        ...ctx(),
        theme: { code: 'TEM-001', content: { name: 'Claro', mode: 'LIGHT', light } },
      }),
    );
    expect(lightOnly.get('apps/web/app/globals.css')!.content).not.toContain('.dark');
    expect(lightOnly.get('apps/web/components/theme-toggle.tsx')).toBeUndefined();
    expect(lightOnly.get('apps/web/app/layout.tsx')!.content).not.toContain('ThemeToggle');

    // Without a theme the standard design is emitted unchanged.
    expect(paths.get('apps/web/app/globals.css')!.content).toContain(
      '--color-primary: oklch(0.51 0.2 268);',
    );
  });

  it('ships only example secrets and never leaves a variable empty in .env.example', () => {
    const env = paths.get('.env.example')!.content;
    expect(env).toContain('JWT_SECRET=dev-only-jwt-secret');
    expect(env).toContain('POSTGRES_PORT=5433');
    expect(env).not.toMatch(/sk-/i);
    expect(env).not.toMatch(/^[A-Z][A-Z0-9_]*=$/m);
    for (const [, name, value] of env.matchAll(
      /^([A-Z0-9_]*(?:SECRET|PASSWORD)[A-Z0-9_]*)=(.*)$/gm,
    ))
      expect(value, name).toMatch(/^dev-only-/);
  });

  // Regression: a colleague's first run failed with P1000 against a shared 5432/volume.
  it('isolates the local database per project and exposes it on a configurable local port', () => {
    const compose = paths.get('docker/docker-compose.yml')!.content;
    expect(compose).toMatch(/^name: tienda-demo$/m);
    expect(compose).toContain("'127.0.0.1:${POSTGRES_PORT:-5433}:5432'");
    expect(compose).toContain('healthcheck:');
    const root = JSON.parse(paths.get('package.json')!.content);
    expect(root.scripts.setup).toBe('node scripts/setup.mjs');
    expect(root.scripts['db:up']).toContain('--env-file .env');
    expect(JSON.parse(paths.get('apps/api/package.json')!.content).scripts['db:deploy']).toBe(
      'prisma migrate deploy',
    );
  });

  it('runs the whole application in Docker without Node on the machine', () => {
    const compose = paths.get('docker/docker-compose.app.yml')!.content;
    expect(compose).toMatch(/^name: tienda-demo-app$/m);
    for (const service of ['postgres', 'migrate', 'api', 'web'])
      expect(compose).toMatch(new RegExp(`^  ${service}:$`, 'm'));
    expect(compose).toContain('service_completed_successfully');
    expect(compose).toContain('JWT_SECRET: ${JWT_SECRET:-dev-only-jwt-secret}');
    expect(compose).toContain("'127.0.0.1:${WEB_PORT:-3000}:3000'");
    const dockerfile = paths.get('docker/Dockerfile')!.content;
    expect(dockerfile).toContain('FROM node:24-slim AS workspace');
    for (const target of ['api', 'migrate', 'web']) expect(dockerfile).toContain(`AS ${target}`);
    expect(dockerfile).toContain('migrate diff --from-empty');
    expect(paths.get('.dockerignore')!.content).toContain('.env');
    const readme = paths.get('README.md')!.content;
    expect(readme).toContain(
      'docker compose --project-directory . -f docker/docker-compose.app.yml up --build',
    );
    expect(readme).toContain('dev-token.js');
  });

  it('documents the four-command first run in the README', () => {
    const readme = paths.get('README.md')!.content;
    for (const command of ['corepack enable', 'pnpm install', 'pnpm run setup', 'pnpm run dev'])
      expect(readme).toContain(command);
    expect(readme).not.toContain('cp .env.example');
    expect(readme).toContain('setup -- --reset');
  });
});

describe('generated scripts/setup.mjs', () => {
  type Setup = {
    isOwnSecret: (name: string) => boolean;
    needsGeneration: (name: string, value: string) => boolean;
    buildEnv: (
      example: string,
      options: { port: number; makeSecret?: () => string },
    ) => { text: string; generated: string[]; pending: string[]; values: Record<string, string> };
    findFreePort: (
      start: number,
      isFree?: (port: number) => Promise<boolean>,
      tries?: number,
    ) => Promise<number>;
    explainFailure: (output: string) => string[];
  };

  const load = async (): Promise<Setup> => {
    const dir = mkdtempSync(join(tmpdir(), 'setup-script-'));
    const target = join(dir, 'setup.mjs');
    writeFileSync(target, byPath(generateProject(ctx())).get('scripts/setup.mjs')!.content);
    return (await import(pathToFileURL(target).href)) as Setup;
  };

  const example = [
    'POSTGRES_USER=app',
    'POSTGRES_PASSWORD=dev-only-postgres-password',
    'POSTGRES_DB=app',
    'POSTGRES_PORT=5433',
    'DATABASE_URL=postgresql://app:dev-only-postgres-password@127.0.0.1:5433/app',
    'JWT_SECRET=dev-only-jwt-secret',
    'STRIPE_API_KEY=replace-with-your-value',
    '# OPTIONAL_KEY=',
  ].join('\n');

  it('generates own secrets, keeps the connection string consistent and reports what is pending', async () => {
    const { buildEnv } = await load();
    let n = 0;
    const built = buildEnv(example, { port: 5434, makeSecret: () => `s3cret${++n}` });
    expect(built.generated).toEqual(['POSTGRES_PASSWORD', 'JWT_SECRET']);
    expect(built.values.POSTGRES_PORT).toBe('5434');
    expect(built.values.DATABASE_URL).toBe('postgresql://app:s3cret1@127.0.0.1:5434/app');
    expect(built.text).toContain('JWT_SECRET=s3cret2');
    expect(built.text).toContain('# OPTIONAL_KEY=');
    expect(built.pending).toEqual(['STRIPE_API_KEY']);
  });

  it('only replaces secrets that are empty or still the example value', async () => {
    const { needsGeneration, isOwnSecret } = await load();
    expect(needsGeneration('JWT_SECRET', '')).toBe(true);
    expect(needsGeneration('JWT_SECRET', 'dev-only-jwt-secret')).toBe(true);
    expect(needsGeneration('JWT_SECRET', 'already-chosen')).toBe(false);
    expect(needsGeneration('STRIPE_API_KEY', '')).toBe(false);
    expect(isOwnSecret('SESSION_SECRET')).toBe(true);
    expect(isOwnSecret('SECRETARY')).toBe(false);
  });

  it('skips busy ports and gives up after the allowed tries', async () => {
    const { findFreePort } = await load();
    expect(await findFreePort(5433, async (p) => p >= 5435)).toBe(5435);
    await expect(findFreePort(5433, async () => false, 3)).rejects.toThrow(/5433 y el 5435/);
  });

  it('explains the failures seen on first runs', async () => {
    const { explainFailure } = await load();
    expect(explainFailure('Error: P1000: Authentication failed')[0]).toContain('--reset');
    expect(explainFailure('Bind for 0.0.0.0:5433 failed: port is already allocated')[0]).toContain(
      'POSTGRES_PORT',
    );
    expect(explainFailure('error during connect: docker daemon')[0]).toContain('Docker Desktop');
    expect(explainFailure('spawn x/schema-engine-windows.exe ENOENT')[0]).toContain(
      'C:\\proyectos\\mi-app',
    );
    expect(explainFailure('everything fine')).toEqual([]);
  });
});

describe('projectSlug', () => {
  it('builds an npm-safe workspace name', () => {
    expect(projectSlug('Tienda Demo Ñandú 2')).toBe('tienda-demo-nandu-2');
    expect(projectSlug('***')).toBe('generated-app');
  });
});

describe('screen actions (DEC-121)', () => {
  const plan = basePlan({
    routes: [
      {
        path: '/orders',
        screenName: 'Pedidos',
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'order',
        actions: [
          { label: 'Registrar pedido', operation: 'CREATE' },
          { label: 'Editar', operation: 'UPDATE' },
          { label: 'Confirmar', endpoint: 'POST /orders/:orderId/confirm' },
        ],
      },
      {
        path: '/orders/[orderId]',
        screenName: 'Pedido',
        moduleLocalId: 'sales',
        kind: 'DETAIL',
        entityLocalId: 'order',
        actions: [
          { label: 'Ver pedido', operation: 'GET' },
          { label: 'Eliminar', operation: 'DELETE' },
        ],
      },
      {
        path: '/orders/new',
        screenName: 'Nuevo pedido',
        moduleLocalId: 'sales',
        kind: 'FORM',
        entityLocalId: 'order',
        actions: [{ label: 'Registrar pedido', operation: 'CREATE' }],
      },
    ],
  });
  const pages = byPath(generateProject(ctx(plan)));
  const page = (path: string) => pages.get(path)!.content;

  it('renders a control for every planned action', () => {
    const list = page('apps/web/app/orders/page.tsx');
    expect(list).toContain('<Link href="/orders/new" data-action={"Registrar pedido"}>');
    expect(list).toContain('href={`/orders/new?id=${row.id}`} data-action={"Editar"}');
    expect(list).toContain(
      'data-action={"Confirmar"} run={() => api.postOrdersConfirm({ orderId: row.id }, {})}',
    );
    expect(list).not.toContain('<Button>Nuevo</Button>');
    const detail = page('apps/web/app/orders/[orderId]/page.tsx');
    expect(detail).toContain('<h1 className="text-xl font-semibold" data-action={"Ver pedido"}>');
    expect(detail).toContain(
      'data-action={"Eliminar"} run={() => api.deleteOrder(orderId)} onDone={() => router.push(\'/orders\')}',
    );
    expect(page('apps/web/app/orders/new/page.tsx')).toContain(
      '<Button type="submit" disabled={isSubmitting} data-action={"Registrar pedido"}>',
    );
  });

  it('takes endpoint parameters from the page URL, adds extra submits and runs queries with no screen', () => {
    const more = byPath(
      generateProject(
        ctx(
          basePlan({
            routes: [
              {
                path: '/orders/[orderid]/review',
                screenName: 'Revisar pedido',
                moduleLocalId: 'sales',
                kind: 'FORM',
                entityLocalId: 'order',
                actions: [
                  { label: 'Guardar', operation: 'UPDATE' },
                  { label: 'Guardar borrador', operation: 'UPDATE' },
                  { label: 'Confirmar', endpoint: 'POST /orders/:orderId/confirm' },
                ],
              },
              {
                path: '/reports',
                screenName: 'Reporte',
                moduleLocalId: 'sales',
                kind: 'CUSTOM',
                entityLocalId: 'order',
                actions: [{ label: 'Consultar pedidos', operation: 'GET' }],
              },
            ],
          }),
        ),
      ),
    );
    const review = more.get('apps/web/app/orders/[orderid]/review/page.tsx')!.content;
    expect(review).toContain('const { orderid } = useParams<{ orderid: string }>();');
    expect(review).toContain('run={() => api.postOrdersConfirm({ orderId: orderid }, {})}');
    expect(review).toContain(
      'variant="outline" disabled={isSubmitting} data-action={"Guardar borrador"}',
    );
    // No list or detail screen for orders: consulting runs the query.
    expect(more.get('apps/web/app/reports/page.tsx')!.content).toContain(
      'data-action={"Consultar pedidos"} run={() => api.listOrders()}',
    );
  });

  it('opens the form in edit mode when the entity can be read and updated', () => {
    const form = page('apps/web/app/orders/new/page.tsx');
    expect(form).toContain("new URLSearchParams(window.location.search).get('id')");
    expect(form).toContain('api.updateOrder(editId,');
  });
});

describe('forms and pages for every field type', () => {
  const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
    name,
    type,
    ...extra,
  });
  const plan = basePlan({
    entities: [
      {
        localId: 'catalog',
        name: 'Catalog',
        moduleLocalId: 'sales',
        fields: [field('title', 'STRING')],
        operations: ['LIST'],
      },
      {
        localId: 'hidden',
        name: 'Hidden',
        moduleLocalId: 'sales',
        fields: [field('label', 'STRING')],
        operations: ['CREATE'],
      },
      {
        localId: 'thing',
        name: 'Thing',
        moduleLocalId: 'sales',
        fields: [
          field('notes', 'TEXT', { required: false }),
          field('detail', 'TEXT'),
          field('count', 'INT'),
          field('active', 'BOOLEAN'),
          field('dueOn', 'DATE', { required: false }),
          field('startsAt', 'DATETIME'),
          field('kind', 'ENUM', { enumValues: ['A', 'B'], required: false }),
          field('level', 'ENUM', { enumValues: ['LOW', 'HIGH'] }),
          field('price', 'DECIMAL'),
          field('code', 'STRING', { required: false }),
        ],
        relations: [
          { name: 'catalog', kind: 'MANY_TO_ONE', targetEntityLocalId: 'catalog', required: false },
          { name: 'hidden', kind: 'MANY_TO_ONE', targetEntityLocalId: 'hidden', required: true },
        ],
        operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
      },
    ],
    customEndpoints: [],
    routes: [
      {
        path: '/things',
        screenName: 'Cosas',
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'thing',
      },
      {
        path: '/things/new',
        screenName: 'Nueva cosa',
        moduleLocalId: 'sales',
        kind: 'FORM',
        entityLocalId: 'thing',
      },
      {
        path: '/hidden/new',
        screenName: 'Nuevo oculto',
        moduleLocalId: 'sales',
        kind: 'FORM',
        entityLocalId: 'hidden',
      },
      { path: '/', screenName: 'Inicio', moduleLocalId: 'sales', kind: 'CUSTOM' },
    ],
    tests: [
      { moduleLocalId: 'sales', kind: 'E2E', description: 'Crear cosa' },
      { moduleLocalId: 'sales', kind: 'UNIT', description: 'Reglas' },
    ],
  });
  const generated = byPath(generateProject(ctx(plan)));
  const form = generated.get('apps/web/app/things/new/page.tsx')!.content;

  it('renders a control for each field type, optional or not', () => {
    expect(form).toContain('<textarea id="notes"');
    expect(form).toContain('type="number" step="1"');
    expect(form).toContain('type="checkbox"');
    expect(form).toContain('type="date"');
    expect(form).toContain('type="datetime-local"');
    expect(form).toContain('inputMode="decimal"');
    // An optional list starts with an empty choice; a required one does not.
    expect(form).toContain('<option value="">—</option>');
    expect(form).toContain('<option value="LOW">');
    expect(form).toContain('(opcional)');
  });

  it('lists the related records to choose from, or asks for the identifier when it cannot', () => {
    expect(form).toContain('catalogOptions');
    expect(form).toContain('placeholder="Identificador"');
  });

  it('edits an existing record and offers only the form the entity needs', () => {
    expect(form).toContain('api.updateThing(editId,');
    const create = generated.get('apps/web/app/hidden/new/page.tsx')!.content;
    expect(create).not.toContain('updateHidden');
    expect(create).toContain('api.createHidden(');
  });

  it('serves the home page and adds the end-to-end script only when the plan has such tests', () => {
    expect(generated.get('apps/web/app/page.tsx')!.content).toContain('Inicio');
    const web = JSON.parse(generated.get('apps/web/package.json')!.content);
    expect(JSON.stringify(web)).toContain('playwright');
    const without = byPath(generateProject(ctx(basePlan({ tests: [] }))));
    expect(without.get('apps/web/package.json')!.content).not.toContain('playwright');
  });
});
