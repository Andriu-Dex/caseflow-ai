import { describe, expect, it } from 'vitest';
import {
  implementationPlanContentSchema,
  type ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { planTraceLinks } from './trace-links';
import type { GeneratedProjectFile } from './types';

const PLAN_VERSION = '22222222-2222-4222-8222-222222222222';
const UI_VERSION = '33333333-3333-4333-8333-333333333333';

const plan: ImplementationPlanContent = implementationPlanContentSchema.parse({
  designBaselineId: '11111111-1111-4111-8111-111111111111',
  authentication: { required: false, roles: [] },
  modules: [
    { localId: 'sales', name: 'Sales', description: 'Pedidos', relatedSourceCodes: ['GP-001'] },
  ],
  entities: [
    {
      localId: 'order',
      name: 'Order',
      moduleLocalId: 'sales',
      fields: [{ name: 'total', type: 'DECIMAL' }],
      operations: ['LIST'],
      relatedSourceCodes: ['UI-001', 'MC-009'],
    },
  ],
});

const file = (path: string, kind: GeneratedProjectFile['kind'], planElements: string[]) =>
  ({ path, content: '', origin: 'TEMPLATE', kind, planElements }) as GeneratedProjectFile;

describe('planTraceLinks', () => {
  const frozen = new Map([['UI-001', UI_VERSION]]);

  it('links each file to the plan version and to the frozen versions its elements cite', () => {
    const links = planTraceLinks(
      [file('apps/api/src/orders/orders.service.ts', 'SOURCE', ['entity:order'])],
      plan,
      PLAN_VERSION,
      frozen,
    );
    expect(links).toEqual([
      expect.objectContaining({ sourceArtifactVersionId: PLAN_VERSION, linkType: 'IMPLEMENTS' }),
      expect.objectContaining({ sourceArtifactVersionId: UI_VERSION, planElement: 'entity:order' }),
    ]);
  });

  it('ignores cited codes the baseline did not freeze and types links by file kind', () => {
    const links = planTraceLinks(
      [file('a.spec.ts', 'TEST', ['entity:order']), file('package.json', 'CONFIG', [])],
      plan,
      PLAN_VERSION,
      new Map(),
    );
    expect(links).toEqual([
      {
        path: 'a.spec.ts',
        sourceArtifactVersionId: PLAN_VERSION,
        planElement: 'entity:order',
        linkType: 'TESTS',
      },
      {
        path: 'package.json',
        sourceArtifactVersionId: PLAN_VERSION,
        planElement: 'project',
        linkType: 'CONFIGURES',
      },
    ]);
  });

  it('links theme files to the frozen theme version (DEC-118)', () => {
    const themeVersion = '44444444-4444-4444-8444-444444444444';
    const links = planTraceLinks(
      [file('apps/web/app/globals.css', 'SOURCE', ['design-theme:TEM-001'])],
      plan,
      PLAN_VERSION,
      new Map([['TEM-001', themeVersion]]),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        sourceArtifactVersionId: themeVersion,
        planElement: 'design-theme:TEM-001',
      }),
    );
  });

  it('never duplicates a link', () => {
    const links = planTraceLinks(
      [file('x.ts', 'SOURCE', ['entity:order', 'entity:order'])],
      plan,
      PLAN_VERSION,
      frozen,
    );
    expect(links).toHaveLength(2);
  });
});
