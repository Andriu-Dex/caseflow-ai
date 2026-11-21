import { describe, expect, it } from 'vitest';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { generateProject } from '../code-generation/engine/project-generator';
import { constructionPreview } from './construction-preview';

const plan = implementationPlanContentSchema.parse({
  designBaselineId: '11111111-1111-4111-8111-111111111111',
  authentication: { required: false },
  modules: [
    { localId: 'sales', name: 'Sales', description: 'Ventas' },
    { localId: 'stock', name: 'Stock', description: 'Inventario' },
  ],
  entities: [
    {
      localId: 'order',
      name: 'Order',
      moduleLocalId: 'sales',
      fields: [{ name: 'total', type: 'DECIMAL' }],
      operations: ['LIST', 'CREATE'],
    },
  ],
  customEndpoints: [
    { moduleLocalId: 'sales', method: 'POST', path: '/orders/:id/confirm', summary: 'Confirmar' },
  ],
  routes: [
    {
      path: '/orders',
      screenName: 'Pedidos',
      moduleLocalId: 'sales',
      kind: 'LIST',
      entityLocalId: 'order',
    },
  ],
});
const preview = constructionPreview(
  plan,
  generateProject({ plan, template: CASEFLOW_WEB_TS_V1, projectName: 'Demo', slug: 'demo' }),
);

describe('constructionPreview', () => {
  it('describes the containers of the published demonstration and of the local Compose file', () => {
    const published = preview.containers.filter((item) => item.environment === 'DEPLOYMENT');
    expect(published.map((item) => item.name)).toEqual(['aplicación', 'base de datos', 'túnel']);
    expect(published[0]!.modules).toEqual(['Sales', 'Stock']);
    expect(published[0]!.services.map((service) => service.port)).toEqual([3000, 3001]);
    expect(published[1]!.responsibility).toContain('1 tabla');
    expect(
      preview.containers.filter((item) => item.environment === 'LOCAL').map((item) => item.name),
    ).toEqual(['web', 'api', 'migrate', 'postgres']);
  });

  it('lists every file with its purpose, module and the route it implements', () => {
    const page = preview.files.find((file) => file.path === 'apps/web/app/orders/page.tsx')!;
    expect(page).toMatchObject({
      purpose: 'Pantalla «Pedidos»',
      moduleLocalId: 'sales',
      routePath: '/orders',
    });
    expect(preview.files.find((file) => file.path === 'prisma/schema.prisma')!.purpose).toBe(
      'Esquema de la base de datos',
    );
    expect(preview.files.map((file) => file.path)).toEqual(
      [...preview.files.map((file) => file.path)].sort((a, b) => a.localeCompare(b)),
    );
    const [sales, stock] = preview.modules;
    expect(sales).toMatchObject({ localId: 'sales', entities: 1, routes: 1, endpoints: 1 });
    expect(sales!.files).toBeGreaterThan(0);
    expect(stock).toMatchObject({ localId: 'stock', entities: 0, routes: 0, endpoints: 0 });
  });
});
