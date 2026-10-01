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

  it('never puts secrets in .env.example', () => {
    const env = paths.get('.env.example')!.content;
    expect(env).toContain('JWT_SECRET=change-me');
    expect(env).not.toMatch(/sk-|password=(?!app)/i);
  });
});

describe('projectSlug', () => {
  it('builds an npm-safe workspace name', () => {
    expect(projectSlug('Tienda Demo Ñandú 2')).toBe('tienda-demo-nandu-2');
    expect(projectSlug('***')).toBe('generated-app');
  });
});
